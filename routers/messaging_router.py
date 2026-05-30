"""
routers/messaging_router.py — Messaging (REST) + WebSocket Chat
================================================================
This router replaces the messaging section that was inside ai_router.py
and ADDS a proper WebSocket endpoint for real-time chat.

IMPORTANT — Route ordering fix:
  GET /messages/inbox  MUST be registered BEFORE  GET /messages/{other_user_id}
  otherwise FastAPI matches "inbox" as an integer path parameter and crashes.
  This router handles that correctly.

REST ENDPOINTS:
  POST   /messages                        → send a message (persists + notifies)
  GET    /messages/inbox                  → inbox grouped by conversation partner
  GET    /messages/unread-count           → fast unread badge count
  GET    /messages/{other_user_id}        → full conversation (auto-marks read)
  PATCH  /messages/{other_user_id}/read   → explicitly mark conversation as read
  DELETE /messages/{message_id}           → soft-delete own sent message

WEBSOCKET:
  WS /ws/chat
    → Authenticated via ?token=<access_token> query param (browsers can't
       set Authorization headers on WebSocket connections).
    → After connecting the client can send and receive JSON envelopes:

    CLIENT → SERVER:
      { "type": "ping" }
      { "type": "chat_message", "payload": { "receiver_id": 2, "content": "Hi!" } }
      { "type": "mark_read",    "payload": { "other_user_id": 2 } }

    SERVER → CLIENT:
      { "type": "pong" }
      { "type": "chat_message", "payload": <ChatMessageResponse> }
      { "type": "notification",  "payload": <NotificationResponse> }
      { "type": "error",         "payload": { "detail": "..." } }

NOTIFICATION INTEGRATION:
  Every time a message is sent (REST or WS), a Notification row is created
  for the receiver. If the receiver is connected via WebSocket they get it
  instantly; otherwise they'll see it in GET /notifications.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from db import get_db, SessionLocal
import models
import schema
from auth import get_current_user, decode_token, consume_ws_ticket
from services.notification_service import ws_manager, notify

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Messaging & Chat"])


# ════════════════════════════════════════════════════════════════════
#  REST ENDPOINTS
# ════════════════════════════════════════════════════════════════════

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /messages  — Send a message
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/messages",
    response_model=schema.ChatMessageResponse,
    status_code=201,
    summary="Send a message to another user",
    description="""
Both users must be active. You cannot message yourself.

Automatically creates a **notification** for the receiver.
If the receiver is online via WebSocket, the message is delivered instantly.
""",
)
def send_message(
    body: schema.MessageCreate,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if body.receiver_id == me.id:
        raise HTTPException(400, "You cannot send a message to yourself.")

    receiver = db.query(models.User).filter(
        models.User.id     == body.receiver_id,
        models.User.status == models.UserStatus.active,
    ).first()
    if not receiver:
        raise HTTPException(404, "Recipient not found or is suspended.")

    msg = models.Message(
        sender_id   = me.id,
        receiver_id = body.receiver_id,
        content     = body.content,
        is_read     = False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Notify receiver
    preview      = body.content[:60] + ("..." if len(body.content) > 60 else "")
    sender_name  = (((me.first_name or "") + " " + (me.last_name or "")).strip()) or me.email
    notify(
        db        = db,
        user_id   = body.receiver_id,
        type      = models.NotificationType.message,
        title     = f"New message from {sender_name}",
        body      = preview,
        entity_id = me.id,
    )

    # Also push the message itself over WS if receiver is online
    if ws_manager.is_connected(body.receiver_id):
        import asyncio, json as _json
        ws_payload = {
            "type": "chat_message",
            "payload": {
                "message_id":  msg.message_id,
                "sender_id":   msg.sender_id,
                "receiver_id": msg.receiver_id,
                "content":     msg.content,
                "is_read":     False,
                "sent_at":     msg.sent_at.isoformat(),
            },
        }
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(ws_manager.send(body.receiver_id, ws_payload))
        except Exception:
            pass

    return msg


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /messages/inbox  ← MUST be before /{other_user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/messages/inbox",
    response_model=list[schema.ConversationSummary],
    summary="Inbox — list all conversations",
    description="Returns one summary per conversation partner, sorted newest-first.",
)
def get_inbox(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    all_messages = (
        db.query(models.Message)
        .filter(
            or_(
                models.Message.sender_id   == me.id,
                models.Message.receiver_id == me.id,
            )
        )
        .order_by(models.Message.sent_at.desc())
        .all()
    )

    seen_partners: dict = {}
    summaries = []

    for msg in all_messages:
        other_id = msg.receiver_id if msg.sender_id == me.id else msg.sender_id
        if other_id in seen_partners:
            continue

        seen_partners[other_id] = True
        other_user = db.query(models.User).filter(models.User.id == other_id).first()

        unread_count = (
            db.query(models.Message)
            .filter(
                models.Message.sender_id   == other_id,
                models.Message.receiver_id == me.id,
                models.Message.is_read     == False,  # noqa: E712
            )
            .count()
        )

        if other_user:
            fn = other_user.first_name or ""
            ln = other_user.last_name  or ""
            display = (fn + " " + ln).strip() or other_user.email
            avatar  = other_user.avatar_url
        else:
            display = "Unknown"
            avatar  = None

        summaries.append(schema.ConversationSummary(
            other_user_id    = other_id,
            other_user_email = other_user.email if other_user else "Unknown",
            display_name     = display,
            avatar_url       = avatar,
            last_message     = msg.content[:80] + ("..." if len(msg.content) > 80 else ""),
            last_message_at  = msg.sent_at,
            unread_count     = unread_count,
        ))

    return summaries


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /messages/unread-count  ← MUST be before /{other_user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/messages/unread-count",
    summary="Total unread message count (for notification badge)",
    description="Returns a single integer — the total number of unread messages in your inbox.",
)
def get_unread_count(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    count = (
        db.query(models.Message)
        .filter(
            models.Message.receiver_id == me.id,
            models.Message.is_read     == False,  # noqa: E712
        )
        .count()
    )
    return {"unread_count": count}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /messages/{other_user_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/messages/{other_user_id}",
    response_model=list[schema.ChatMessageResponse],
    summary="Get full conversation with a user",
    description="""
Returns all messages between you and the given user, oldest first.
Automatically marks incoming messages as read.
""",
)
def get_conversation(
    other_user_id: int,
    skip:          int = Query(0,  ge=0),
    limit:         int = Query(50, ge=1, le=200),
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    other = db.query(models.User).filter(models.User.id == other_user_id).first()
    if not other:
        raise HTTPException(404, "User not found.")

    messages = (
        db.query(models.Message)
        .filter(
            or_(
                and_(
                    models.Message.sender_id   == me.id,
                    models.Message.receiver_id == other_user_id,
                ),
                and_(
                    models.Message.sender_id   == other_user_id,
                    models.Message.receiver_id == me.id,
                ),
            )
        )
        .order_by(models.Message.sent_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Auto-mark incoming messages as read
    for msg in messages:
        if msg.receiver_id == me.id and not msg.is_read:
            msg.is_read = True
    db.commit()

    return messages


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PATCH /messages/{other_user_id}/read
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.patch(
    "/messages/{other_user_id}/read",
    response_model=schema.MessageResponse,
    summary="Mark all messages from a user as read",
)
def mark_messages_read(
    other_user_id: int,
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    updated = (
        db.query(models.Message)
        .filter(
            models.Message.sender_id   == other_user_id,
            models.Message.receiver_id == me.id,
            models.Message.is_read     == False,  # noqa: E712
        )
        .update({"is_read": True})
    )
    db.commit()
    return {"message": f"Marked {updated} message(s) as read."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /messages/{message_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/messages/{message_id}",
    response_model=schema.MessageResponse,
    summary="Delete a sent message (sender only)",
    description="You can only delete messages you sent. The message is removed from the DB.",
)
def delete_message(
    message_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    msg = db.query(models.Message).filter(
        models.Message.message_id == message_id,
        models.Message.sender_id  == me.id,
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found or you did not send it.")

    db.delete(msg)
    db.commit()
    return {"message": f"Message #{message_id} deleted."}


# ════════════════════════════════════════════════════════════════════
#  WEBSOCKET ENDPOINT
# ════════════════════════════════════════════════════════════════════

@router.websocket("/ws/chat")
async def websocket_chat(
    websocket: WebSocket,
    ticket:    str     = Query(..., description="One-time WebSocket ticket from POST /auth/ws-ticket"),
    db:        Session = Depends(get_db),
):
    """
    Real-time bidirectional chat channel.

    ──────────────────────────────────────────────────────
    AUTHENTICATION
    ──────────────────────────────────────────────────────
    Pass the JWT access token as a query parameter:
        ws://localhost:8000/ws/chat?token=<your_access_token>

    Browsers cannot set Authorization headers on WebSocket connections,
    so query-param auth is the standard pattern for WebSocket + JWT.

    ──────────────────────────────────────────────────────
    MESSAGE PROTOCOL (JSON)
    ──────────────────────────────────────────────────────
    CLIENT → SERVER:
      Keepalive:
        { "type": "ping" }

      Send a chat message:
        { "type": "chat_message", "payload": { "receiver_id": 7, "content": "Hello!" } }

      Mark conversation as read:
        { "type": "mark_read", "payload": { "other_user_id": 7 } }

    SERVER → CLIENT:
      { "type": "pong" }
      { "type": "chat_message", "payload": { ...ChatMessageResponse fields... } }
      { "type": "notification",  "payload": { ...NotificationResponse fields... } }
      { "type": "error",         "payload": { "detail": "reason" } }

    ──────────────────────────────────────────────────────
    DELIVERY GUARANTEE
    ──────────────────────────────────────────────────────
    Messages are always written to the `messages` table FIRST.
    The WebSocket push is a real-time bonus — the message is never lost
    even if delivery fails (client can poll REST endpoint to catch up).
    """

    # ── Authenticate via one-time ticket ──────────────────────────
    user_id = consume_ws_ticket(ticket)
    if user_id is None:
        await websocket.close(code=4001, reason="Invalid or expired WebSocket ticket.")
        return

    # Load user
    db_session = SessionLocal()
    try:
        user = db_session.query(models.User).filter(
            models.User.id     == user_id,
            models.User.status == models.UserStatus.active,
        ).first()
        if not user:
            await websocket.close(code=4003, reason="User not found or suspended.")
            return
    finally:
        db_session.close()

    # ── Register connection ────────────────────────────────────────
    await ws_manager.connect(user_id, websocket)

    # Send a welcome confirmation so the client knows it's live
    try:
        await websocket.send_text(json.dumps({
            "type":    "connected",
            "payload": {"user_id": user_id, "message": "WebSocket connection established."},
        }))
    except Exception:
        ws_manager.disconnect(user_id, websocket)
        return

    # ── Message loop ───────────────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()

            try:
                envelope = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type":    "error",
                    "payload": {"detail": "Invalid JSON."},
                }))
                continue

            msg_type = envelope.get("type", "")
            msg_payload = envelope.get("payload") or {}

            # ── ping ──────────────────────────────────────────────
            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            # ── chat_message ──────────────────────────────────────
            elif msg_type == "chat_message":
                await _ws_handle_chat(websocket, user_id, msg_payload)

            # ── mark_read ─────────────────────────────────────────
            elif msg_type == "mark_read":
                await _ws_handle_mark_read(websocket, user_id, msg_payload)

            else:
                await websocket.send_text(json.dumps({
                    "type":    "error",
                    "payload": {"detail": f"Unknown message type: '{msg_type}'."},
                }))

    except WebSocketDisconnect:
        logger.info("WS client disconnected: user_id=%s", user_id)
    except Exception as exc:
        logger.warning("WS error for user_id=%s: %s", user_id, exc)
    finally:
        ws_manager.disconnect(user_id, websocket)


# ─────────────────────────────────────────────────────────────────────────────
#  WebSocket helper handlers
# ─────────────────────────────────────────────────────────────────────────────

async def _ws_handle_chat(ws: WebSocket, sender_id: int, payload: dict) -> None:
    """
    Handles { "type": "chat_message", "payload": { "receiver_id": int, "content": str } }

    1. Validates payload
    2. Persists to DB
    3. Echoes message back to sender (so their UI can confirm delivery)
    4. Pushes to receiver if online
    5. Creates a notification for receiver
    """
    receiver_id = payload.get("receiver_id")
    content     = (payload.get("content") or "").strip()

    if not receiver_id or not content:
        await ws.send_text(json.dumps({
            "type":    "error",
            "payload": {"detail": "chat_message requires receiver_id and content."},
        }))
        return

    if receiver_id == sender_id:
        await ws.send_text(json.dumps({
            "type":    "error",
            "payload": {"detail": "You cannot send a message to yourself."},
        }))
        return

    db = SessionLocal()
    try:
        receiver = db.query(models.User).filter(
            models.User.id     == receiver_id,
            models.User.status == models.UserStatus.active,
        ).first()
        if not receiver:
            await ws.send_text(json.dumps({
                "type":    "error",
                "payload": {"detail": "Recipient not found or suspended."},
            }))
            return

        sender = db.query(models.User).filter(models.User.id == sender_id).first()

        msg = models.Message(
            sender_id   = sender_id,
            receiver_id = receiver_id,
            content     = content,
            is_read     = False,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        msg_data = {
            "message_id":  msg.message_id,
            "sender_id":   msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content":     msg.content,
            "is_read":     False,
            "sent_at":     msg.sent_at.isoformat(),
        }

        # Echo to sender
        await ws.send_text(json.dumps({"type": "chat_message", "payload": msg_data}))

        # Push to receiver
        await ws_manager.send(receiver_id, {"type": "chat_message", "payload": msg_data})

        # Notification for receiver
        preview = content[:60] + ("..." if len(content) > 60 else "")
        sender_email = sender.email if sender else f"User #{sender_id}"
        notify(
            db        = db,
            user_id   = receiver_id,
            type      = models.NotificationType.message,
            title     = f"New message from {sender_email}",
            body      = preview,
            entity_id = sender_id,
        )

    except Exception as exc:
        logger.error("WS chat_message error: %s", exc)
        await ws.send_text(json.dumps({
            "type":    "error",
            "payload": {"detail": "Failed to send message. Please try again."},
        }))
    finally:
        db.close()


async def _ws_handle_mark_read(ws: WebSocket, user_id: int, payload: dict) -> None:
    """
    Handles { "type": "mark_read", "payload": { "other_user_id": int } }
    Marks all unread messages from other_user_id to user_id as read.
    """
    other_user_id = payload.get("other_user_id")
    if not other_user_id:
        await ws.send_text(json.dumps({
            "type":    "error",
            "payload": {"detail": "mark_read requires other_user_id."},
        }))
        return

    db = SessionLocal()
    try:
        updated = (
            db.query(models.Message)
            .filter(
                models.Message.sender_id   == other_user_id,
                models.Message.receiver_id == user_id,
                models.Message.is_read     == False,  # noqa: E712
            )
            .update({"is_read": True})
        )
        db.commit()
        await ws.send_text(json.dumps({
            "type":    "marked_read",
            "payload": {"other_user_id": other_user_id, "marked": updated},
        }))
    except Exception as exc:
        logger.error("WS mark_read error: %s", exc)
    finally:
        db.close()