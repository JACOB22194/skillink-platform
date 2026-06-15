"""
auth.py — JWT Tokens & Role Guards
====================================
This file handles two things:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1. JWT TOKENS — What they are and why
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JWT = JSON Web Token.

Think of it like a signed ID card:
  - You log in with email + password
  - The server creates a token that says:
      "This is user #5, they are a freelancer, valid for 30 minutes"
  - The token is SIGNED with a secret key, so nobody can fake it
  - For every future request, the frontend sends this token
  - The server reads it and knows exactly who is calling

Two types of tokens:
  - access_token  → short lived (30 min), used for API calls
  - refresh_token → long lived (7 days), used ONLY to get a new access token

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 2. RBAC — Role-Based Access Control
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Some endpoints are only for admins.
Some are only for freelancers.

Role guards check this automatically and return 403 Forbidden
if the user has the wrong role — before your code even runs.
"""

from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
import os
import time as _time
import secrets as _secrets

from db import get_db
import models

# ── Read settings from .env ────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set. "
        "Add it to your .env file before starting the server."
    )
ALGORITHM                    = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES  = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS    = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS",   "7"))

# This tells FastAPI: "look for the token in the Authorization: Bearer header"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATE TOKENS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_access_token(user_id: int, role: str) -> str:
    """Creates a short-lived token (30 minutes by default)."""
    return jwt.encode(
        {
            "sub":  str(user_id),   # "sub" = who this token belongs to
            "role": role,
            "type": "access",
            "exp":  datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_refresh_token(user_id: int, role: str) -> str:
    """Creates a long-lived token (7 days by default)."""
    return jwt.encode(
        {
            "sub":  str(user_id),
            "role": role,
            "type": "refresh",
            "exp":  datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """
    Reads a token and returns its data.
    Raises 401 error if the token is expired, tampered with, or invalid.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired or the token is invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET THE CURRENT LOGGED-IN USER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_current_user(
    token: str     = Depends(oauth2_scheme),
    db:    Session = Depends(get_db),
) -> models.User:
    """
    FastAPI dependency — automatically reads the Bearer token
    from the request header and returns the matching User from the database.

    How to use it in any endpoint:
        @router.get("/something")
        def my_endpoint(me: models.User = Depends(get_current_user)):
            return {"your email is": me.email}
    """
    payload = decode_token(token)

    # Make sure it's an access token, not a refresh token
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=401,
            detail="Please use an access token, not a refresh token.",
        )

    # Load the user from the database
    user = db.query(models.User).filter(
        models.User.id == int(payload["sub"])
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    if user.status == models.UserStatus.suspended:
        raise HTTPException(
            status_code=403,
            detail="Your account has been suspended. Contact support.",
        )

    return user


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ROLE GUARDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def require_role(*allowed_roles: str):
    """
    Blocks anyone whose role is NOT in the allowed list.

    How to use it:
        # Only admins:
        @router.get("/admin/stats")
        def stats(me: models.User = Depends(require_role("admin"))):
            ...

        # Freelancers or admins:
        @router.post("/portfolio")
        def upload(me: models.User = Depends(require_role("freelancer", "admin"))):
            ...
    """
    def _check(me: models.User = Depends(get_current_user)) -> models.User:
        if me.role.value not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {' or '.join(allowed_roles)}.",
            )
        return me
    return _check


# Shortcuts — use these directly instead of typing require_role() every time
require_admin      = require_role("admin")
require_client     = require_role("client", "admin")
require_freelancer = require_role("freelancer", "admin")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WEBSOCKET ONE-TIME TICKETS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_ws_tickets: dict = {}  # ticket_str → (user_id, expires_at)

def issue_ws_ticket(user_id: int) -> str:
    """Creates a 30-second one-time ticket for WebSocket authentication."""
    now = _time.time()
    stale = [k for k, (_, exp) in list(_ws_tickets.items()) if exp < now]
    for k in stale:
        _ws_tickets.pop(k, None)
    ticket = _secrets.token_urlsafe(32)
    _ws_tickets[ticket] = (user_id, now + 30)
    return ticket

def consume_ws_ticket(ticket: str):
    """Validates and consumes a one-time ticket. Returns user_id or None."""
    entry = _ws_tickets.pop(ticket, None)
    if not entry:
        return None
    user_id, exp = entry
    return user_id if _time.time() <= exp else None