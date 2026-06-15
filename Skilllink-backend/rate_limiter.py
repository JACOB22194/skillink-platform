"""
rate_limiter.py — sliding-window rate limiting middleware

Buckets:
  - Auth routes (login / register / verify-mfa): 10 req / 60 s  (brute-force protection, IP-keyed)
  - Authenticated requests:                      300 req / 60 s  (per JWT user-id)
  - Unauthenticated non-auth requests:           120 req / 60 s  (IP-keyed fallback)

Using user-id as the key for authenticated requests avoids the Docker bridge problem
where all containers share the same source IP (172.18.0.x).
"""

import os
import time
from collections import defaultdict, deque
from threading import Lock

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_AUTH_PREFIXES   = ("/auth/login", "/auth/register", "/auth/verify-mfa")
_AUTH_LIMIT      = 10    # requests per window
_AUTH_WINDOW     = 60    # seconds

_USER_LIMIT      = 300   # requests per window (per authenticated user)
_USER_WINDOW     = 60    # seconds

_GLOBAL_LIMIT    = 120   # requests per window (unauthenticated, IP-keyed)
_GLOBAL_WINDOW   = 60    # seconds

_ALGORITHM       = "HS256"

_lock: Lock = Lock()
_buckets: dict[str, deque] = defaultdict(deque)


def _is_allowed(key: str, limit: int, window: int) -> tuple[bool, int]:
    """Sliding-window counter. Returns (allowed, retry_after_seconds)."""
    now    = time.monotonic()
    cutoff = now - window
    with _lock:
        q = _buckets[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            retry_after = int(q[0] - cutoff) + 1
            return False, retry_after
        q.append(now)
        return True, 0


def _extract_user_id(request: Request) -> str | None:
    """Try to extract the user sub from a Bearer JWT without raising."""
    secret = os.getenv("SECRET_KEY")
    if not secret:
        return None
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):]
    try:
        payload = jwt.decode(token, secret, algorithms=[_ALGORITHM])
        sub = payload.get("sub")
        return str(sub) if sub is not None else None
    except JWTError:
        return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Add to FastAPI via app.add_middleware(RateLimitMiddleware)."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Auth endpoints — always IP-keyed (brute-force protection)
        if any(path.startswith(p) for p in _AUTH_PREFIXES):
            client_ip = (
                request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                or (request.client.host if request.client else "unknown")
            )
            key, limit, window = f"auth:{client_ip}", _AUTH_LIMIT, _AUTH_WINDOW

        else:
            user_id = _extract_user_id(request)
            if user_id:
                # Authenticated — one bucket per user regardless of IP
                key, limit, window = f"user:{user_id}", _USER_LIMIT, _USER_WINDOW
            else:
                # Unauthenticated — fall back to IP
                client_ip = (
                    request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
                    or (request.client.host if request.client else "unknown")
                )
                key, limit, window = f"global:{client_ip}", _GLOBAL_LIMIT, _GLOBAL_WINDOW

        allowed, retry_after = _is_allowed(key, limit, window)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
