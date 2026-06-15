"""
services/notification_service.py — Centralised Notification & WebSocket Push
==============================================================================

This module does two things for every event on the platform:

  1. PERSIST → writes a row to the `notifications` table so the user can
               see all their past notifications in GET /notifications.

  2. PUSH    → if the user is connected via WebSocket right now, delivers
               the notification in real-time (best-effort, no retry).

HOW TO USE IT (from any router):

    from services.notification_service import notify

    # Inside an endpoint, after committing the DB change:
    notify(
        db        = db,
        user_id   = freelancer_user_id,
        type      = models.NotificationType.contract,
        title     = "New contract created",
        body      = f"Your proposal was accepted. Contract #{contract_id} is now active.",
        entity_id = contract_id,
    )

WEBSOCKET REGISTRY:
    The `ws_manager` object maintains an in-memory dict of
    { user_id → list[WebSocket] } so one user can have multiple
    browser tabs open simultaneously.

    It is imported by the websocket router AND by this service,
    meaning the same registry object is shared across the process.
"""

import asyncio
import json
import logging
from typing import Dict, List

from fastapi import WebSocket
from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  WebSocket Connection Manager
# ─────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    """
    Thread-safe in-memory registry of active WebSocket connections.

    Each user can have multiple connections (different tabs / devices).
    Connection lifecycle:
      connect()    → called when a WS handshake completes
      disconnect() → called on close or error
      send()       → push a JSON payload to ALL connections of a user
    """

    def __init__(self):
        # user_id → list of active WebSocket objects
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(ws)
        logger.info("WS connected: user_id=%s  total_connections=%s",
                    user_id, len(self._connections[user_id]))

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        if user_id in self._connections:
            try:
                self._connections[user_id].remove(ws)
            except ValueError:
                pass
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.info("WS disconnected: user_id=%s", user_id)

    async def send(self, user_id: int, payload: dict) -> None:
        """
        Push a JSON payload to every open WebSocket for this user.
        Silently drops if the user has no connections.
        """
        connections = self._connections.get(user_id, [])
        dead: List[WebSocket] = []

        for ws in connections:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception as exc:
                logger.debug("WS send failed for user_id=%s: %s", user_id, exc)
                dead.append(ws)

        # Clean up dead connections
        for ws in dead:
            self.disconnect(user_id, ws)

    async def disconnect_all(self) -> None:
        """Close every open WebSocket concurrently using asyncio.gather.

        Sequential await would be O(n) wall-clock time; gather keeps shutdown
        within the container orchestrator's SIGTERM grace period regardless of
        connection count. Errors are logged as warnings, not silently swallowed.
        """
        tasks = [
            ws.close(code=1001)
            for connections in self._connections.values()
            for ws in connections
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for exc in results:
            if isinstance(exc, Exception):
                logger.warning("Failed to close WS during shutdown: %s", exc)
        self._connections.clear()

    def is_connected(self, user_id: int) -> bool:
        return bool(self._connections.get(user_id))

    @property
    def online_user_ids(self) -> List[int]:
        return list(self._connections.keys())


# Singleton — imported everywhere that needs to push or check WS connections
ws_manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────────────────────
#  notify() — the one function every router calls
# ─────────────────────────────────────────────────────────────────────────────

def notify(
    db:        Session,
    user_id:   int,
    type:      models.NotificationType,
    title:     str,
    body:      str  = None,
    entity_id: int  = None,
) -> models.Notification:
    """
    1. Writes the notification to the DB (always).
    2. Schedules a best-effort WebSocket push (if user is online).

    Returns the newly-created Notification ORM object.

    This function is synchronous so it can be called from regular
    (non-async) FastAPI endpoints. The WS push is scheduled via
    asyncio.ensure_future() so it runs in the same event loop without
    blocking the HTTP response.

    IMPORTANT: call this AFTER db.commit() so the notification row
    gets its auto-generated notification_id.
    """

    # Step 1 — persist
    notification = models.Notification(
        user_id   = user_id,
        type      = type,
        title     = title,
        body      = body,
        entity_id = entity_id,
        is_read   = False,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    # Step 2 — push over WS (best-effort)
    if ws_manager.is_connected(user_id):
        payload = {
            "type": "notification",
            "payload": {
                "notification_id": notification.notification_id,
                "type":            notification.type.value,
                "title":           notification.title,
                "body":            notification.body,
                "entity_id":       notification.entity_id,
                "is_read":         False,
                "created_at":      notification.created_at.isoformat(),
            },
        }
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(ws_manager.send(user_id, payload))
            else:
                loop.run_until_complete(ws_manager.send(user_id, payload))
        except RuntimeError:
            # No event loop in this thread — skip push (polling will catch it)
            logger.debug("No event loop for WS push to user_id=%s", user_id)

    return notification