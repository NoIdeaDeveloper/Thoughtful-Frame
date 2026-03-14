import secrets
import time
from fastapi import Request, HTTPException

from backend.config import APP_PASSWORD

# In-memory session store: token -> expiry timestamp
_sessions: dict[str, float] = {}

SESSION_COOKIE = "tf_session"
SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 days


def create_session() -> str:
    # Prune expired sessions before inserting a new one
    now = time.time()
    expired = [t for t, exp in _sessions.items() if exp <= now]
    for t in expired:
        del _sessions[t]
    token = secrets.token_hex(32)
    _sessions[token] = now + SESSION_TTL_SECONDS
    return token


def validate_session(token: str | None) -> bool:
    if not token:
        return False
    expiry = _sessions.get(token)
    if expiry is None:
        return False
    if time.time() > expiry:
        _sessions.pop(token, None)
        return False
    return True


def delete_session(token: str | None) -> None:
    if token:
        _sessions.pop(token, None)


def require_auth(request: Request) -> None:
    """FastAPI dependency — raises 401 if auth is enabled and request has no valid session."""
    if not APP_PASSWORD:
        return  # Auth disabled
    token = request.cookies.get(SESSION_COOKIE)
    if not validate_session(token):
        raise HTTPException(status_code=401, detail="Unauthorized")
