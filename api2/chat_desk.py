# chat_desk.py
#
# Race-desk moderation for the site-wide chat room.
# Chat mute / ban never blocks racing. Desk login is the existing session_id
# cookie (same db.sessions gate as the rest of admin.pinballrace.com).
#
# Collections are shared with the Node player API:
#   chat_messages, chat_reports, chat_sanctions
# Keep field names aligned with api/models/Chat*.ts.
#
# When NODE_API_URL and CHAT_DESK_KEY are set, a successful mute/ban/unmute/unban
# asks Node to push the new status down the /chat socket. Players also poll
# /chat/status, so the room still updates if that ping is skipped.

import asyncio
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pinballrace_com")
mongo = AsyncIOMotorClient(MONGO_URI)
db = mongo[DB_NAME]
templates = Jinja2Templates(directory="templates")

_indexed = False

DURATIONS = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "indefinite": None,
}


async def ensure_indexes() -> None:
    global _indexed
    if _indexed:
        return
    await db.chat_messages.create_index([("room", 1), ("createdAt", -1)])
    await db.chat_reports.create_index([("messageId", 1), ("reporterId", 1)], unique=True)
    await db.chat_reports.create_index([("status", 1), ("createdAt", -1)])
    await db.chat_sanctions.create_index([("userId", 1), ("type", 1), ("revokedAt", 1)])
    _indexed = True


async def require_admin(request: Request) -> str:
    """Same desk session as main.py require_login. Duplicated to avoid a cycle."""
    sid = request.cookies.get("session_id")
    if not sid:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await db.sessions.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    expires = session.get("expires_at")
    if expires and expires < datetime.utcnow():
        await db.sessions.delete_one({"_id": sid})
        raise HTTPException(status_code=401, detail="Session expired")
    return session["username"]


def _login():
    return RedirectResponse("/login", status_code=303)


def _back(notice: str = "", error: str = "", q: str = "") -> RedirectResponse:
    params = {}
    if notice:
        params["notice"] = notice
    if error:
        params["error"] = error
    if q:
        params["q"] = q
    query = urllib.parse.urlencode(params)
    return RedirectResponse("/chat" + (f"?{query}" if query else ""), status_code=303)


def _fmt(value) -> str:
    if not value:
        return "until lifted"
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M UTC")
    return str(value)


def _active_clause(now: datetime) -> dict:
    return {
        "revokedAt": None,
        "$or": [{"expiresAt": None}, {"expiresAt": {"$gt": now}}],
    }


async def _notify(user_id: str) -> None:
    base = os.getenv("NODE_API_URL", "").rstrip("/")
    key = os.getenv("CHAT_DESK_KEY", "")
    if not base or not key or not user_id:
        return

    payload = json.dumps({"userId": user_id}).encode()

    def _send() -> None:
        req = urllib.request.Request(
            base + "/chat/desk/refresh",
            data=payload,
            headers={"Content-Type": "application/json", "x-chat-desk-key": key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                resp.read()
        except Exception:
            return

    await asyncio.to_thread(_send)


async def _find_user(username: str):
    name = (username or "").strip()
    if not name:
        return None
    return await db.users.find_one(
        {"username": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"username": 1},
    )


async def _apply(user: dict, kind: str, expires_at, actor: str, report_id: str = "") -> None:
    now = datetime.utcnow()
    user_id = str(user["_id"])
    await db.chat_sanctions.update_many(
        {"userId": user_id, "type": kind, "revokedAt": None},
        {"$set": {"revokedAt": now, "revokedBy": actor}},
    )
    await db.chat_sanctions.insert_one(
        {
            "userId": user_id,
            "username": user.get("username") or "Player",
            "type": kind,
            "expiresAt": expires_at,
            "createdAt": now,
            "createdBy": actor,
            "revokedAt": None,
            "revokedBy": None,
            "reportId": report_id or None,
        }
    )
    if report_id:
        try:
            oid = ObjectId(report_id)
        except (InvalidId, TypeError):
            oid = None
        if oid is not None:
            await db.chat_reports.update_one(
                {"_id": oid, "status": "open"},
                {
                    "$set": {
                        "status": "actioned",
                        "resolution": kind,
                        "resolvedAt": now,
                        "resolvedBy": actor,
                    }
                },
            )
    await _notify(user_id)


async def _lift(username: str, kind: str, actor: str) -> Optional[str]:
    user = await _find_user(username)
    if not user:
        return None
    user_id = str(user["_id"])
    await db.chat_sanctions.update_many(
        {"userId": user_id, "type": kind, "revokedAt": None},
        {"$set": {"revokedAt": datetime.utcnow(), "revokedBy": actor}},
    )
    await _notify(user_id)
    return user.get("username") or username


@router.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request, q: str = "", notice: str = "", error: str = ""):
    try:
        username = await require_admin(request)
    except HTTPException:
        return _login()

    try:
        await ensure_indexes()
    except Exception:
        # The page can still render; indexes are created on the next successful boot.
        pass

    now = datetime.utcnow()
    messages = await db.chat_messages.find({"room": "global"}).sort("createdAt", -1).limit(100).to_list(100)
    messages.reverse()
    reports = await db.chat_reports.find({"status": "open"}).sort("createdAt", -1).limit(100).to_list(100)
    sanctions = await db.chat_sanctions.find(_active_clause(now)).sort("createdAt", -1).limit(200).to_list(200)

    matches = []
    query = (q or "").strip()
    if query:
        found = await db.users.find(
            {"username": {"$regex": re.escape(query), "$options": "i"}},
            {"username": 1},
        ).limit(8).to_list(8)
        for user in found:
            user_id = str(user["_id"])
            rows = await db.chat_sanctions.find({**_active_clause(now), "userId": user_id}).to_list(10)
            kinds = sorted({row.get("type") for row in rows if row.get("type")})
            matches.append(
                {
                    "id": user_id,
                    "username": user.get("username") or "Player",
                    "state": ", ".join(kinds) if kinds else "clear",
                }
            )

    def pack_message(doc):
        return {
            "username": doc.get("username") or "Player",
            "text": doc.get("text") or "",
            "when": _fmt(doc.get("createdAt")),
        }

    def pack_report(doc):
        return {
            "id": str(doc["_id"]),
            "reportedUsername": doc.get("reportedUsername") or "Player",
            "reporterUsername": doc.get("reporterUsername") or "Player",
            "text": doc.get("textSnapshot") or "",
            "when": _fmt(doc.get("createdAt")),
        }

    def pack_sanction(doc):
        return {
            "username": doc.get("username") or "Player",
            "type": doc.get("type") or "",
            "until": _fmt(doc.get("expiresAt")) if doc.get("type") == "mute" else "until unbanned",
            "by": doc.get("createdBy") or "",
        }

    return templates.TemplateResponse(
        "chat.html",
        {
            "request": request,
            "username": username,
            "messages": [pack_message(doc) for doc in messages],
            "reports": [pack_report(doc) for doc in reports],
            "sanctions": [pack_sanction(doc) for doc in sanctions],
            "matches": matches,
            "q": query,
            "notice": notice,
            "error": error,
        },
    )


@router.post("/chat/mute")
async def chat_mute(
    request: Request,
    username: str = Form(...),
    duration: str = Form("24h"),
    report_id: str = Form(""),
    q: str = Form(""),
):
    try:
        actor = await require_admin(request)
    except HTTPException:
        return _login()
    if duration not in DURATIONS:
        return _back(error="Duration must be 1h, 24h, 7d, or indefinite.", q=q)
    user = await _find_user(username)
    if not user:
        return _back(error="Player not found.", q=q)
    delta = DURATIONS[duration]
    expires_at = datetime.utcnow() + delta if delta else None
    await _apply(user, "mute", expires_at, actor, report_id.strip())
    return _back(notice=f"Muted {user.get('username')} in chat.", q=q)


@router.post("/chat/ban")
async def chat_ban(
    request: Request,
    username: str = Form(...),
    report_id: str = Form(""),
    q: str = Form(""),
):
    try:
        actor = await require_admin(request)
    except HTTPException:
        return _login()
    user = await _find_user(username)
    if not user:
        return _back(error="Player not found.", q=q)
    await _apply(user, "ban", None, actor, report_id.strip())
    return _back(notice=f"Banned {user.get('username')} from chat. They can still race.", q=q)


@router.post("/chat/unmute")
async def chat_unmute(request: Request, username: str = Form(...), q: str = Form("")):
    try:
        actor = await require_admin(request)
    except HTTPException:
        return _login()
    name = await _lift(username, "mute", actor)
    if not name:
        return _back(error="Player not found.", q=q)
    return _back(notice=f"Unmuted {name}.", q=q)


@router.post("/chat/unban")
async def chat_unban(request: Request, username: str = Form(...), q: str = Form("")):
    try:
        actor = await require_admin(request)
    except HTTPException:
        return _login()
    name = await _lift(username, "ban", actor)
    if not name:
        return _back(error="Player not found.", q=q)
    return _back(notice=f"Unbanned {name}.", q=q)


@router.post("/chat/reports/dismiss")
async def chat_dismiss(request: Request, report_id: str = Form(...)):
    try:
        actor = await require_admin(request)
    except HTTPException:
        return _login()
    try:
        oid = ObjectId(report_id)
    except (InvalidId, TypeError):
        return _back(error="Open report not found.")
    result = await db.chat_reports.update_one(
        {"_id": oid, "status": "open"},
        {
            "$set": {
                "status": "dismissed",
                "resolution": "dismiss",
                "resolvedAt": datetime.utcnow(),
                "resolvedBy": actor,
            }
        },
    )
    if result.matched_count == 0:
        return _back(error="Open report not found.")
    return _back(notice="Report dismissed.")
