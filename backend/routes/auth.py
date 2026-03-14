from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel

from backend.config import APP_PASSWORD
from backend.auth import SESSION_COOKIE, SESSION_TTL_SECONDS, create_session, delete_session

router = APIRouter()


class LoginRequest(BaseModel):
    password: str


@router.post("/auth/login")
async def login(body: LoginRequest, response: Response):
    if not APP_PASSWORD:
        return {"ok": True}  # Auth disabled — always succeed
    if body.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect password")
    token = create_session()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="strict",
        path="/",
    )
    return {"ok": True}


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    delete_session(token)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"ok": True}
