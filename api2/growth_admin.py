# growth_admin.py
#
# Growth page for the race desk (admin.pinballrace.com).
#
# Settings live on the player API (GET/POST /admin/growth…). This page does not
# write a second settings store and it does not send email. Switches stay off
# unless an admin turns one on and saves.
#
# The HTML page uses the same race-desk session as Dashboard (cookie session_id,
# Mongo collection sessions, MONGO_URI). That login is not Node's adminToken.
# Node authenticateAdmin will reject it. Calls to 127.0.0.1:8080 send
# PLAYER_API_ADMIN_TOKEN only. Growth collection names are not invented here.

import asyncio
import inspect
import os
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from motor.motor_asyncio import AsyncIOMotorClient

from growth_client import (
    PlayerApiError,
    build_settings_update,
    clawback_body,
    extract_forced,
    extract_settings,
    parse_form,
    post_settings,
    present_invites,
    present_panel,
    request_with_tokens,
    revoke_body,
    safe_operator_error,
)

load_dotenv()

router = APIRouter()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pinballrace_com")

mongo = AsyncIOMotorClient(MONGO_URI)
db = mongo[DB_NAME]

templates = Jinja2Templates(directory="templates")

NOTICES = {
    "saved": "Saved. The switches are exactly as you left them. No email was sent.",
    "revoked": "Invite privileges revoked for that player. The account was not deleted, and no email was sent.",
    "clawed": "Unused bonus plays clawed back. No email was sent.",
}


def _base_url() -> str:
    raw = os.getenv("PLAYER_API_BASE_URL", "http://127.0.0.1:8080").strip()
    if not raw:
        raw = "http://127.0.0.1:8080"
    if not (raw.startswith("http://") or raw.startswith("https://")):
        raise PlayerApiError("PLAYER_API_BASE_URL must start with http:// or https://")
    return raw.rstrip("/")


async def require_admin(request: Request) -> str:
    """Race-desk session only. A Node adminToken cookie is not accepted here."""
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


def _admin_token() -> str:
    """Player-API adminToken. Never the race-desk session cookie."""
    token = os.getenv("PLAYER_API_ADMIN_TOKEN", "").strip()
    if not token:
        raise PlayerApiError(
            "This race-desk login does not sign into the player service. "
            "Set PLAYER_API_ADMIN_TOKEN in the race-desk environment to the player API adminToken cookie. "
            "Nothing was changed."
        )
    if any(char in token for char in "\r\n;"):
        raise PlayerApiError(
            "PLAYER_API_ADMIN_TOKEN cannot contain a cookie separator. Nothing was changed."
        )
    return token


async def _player_call(
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
) -> Any:
    token = _admin_token()

    def run() -> Any:
        result, _used = request_with_tokens(_base_url(), [token], method, path, body)
        return result

    return await asyncio.to_thread(run)


async def _load_raw() -> Dict[str, Any]:
    data = await _player_call("GET", "/admin/growth")
    if not isinstance(data, dict):
        raise PlayerApiError("Player API returned an unexpected growth document")
    return data


def _clean_username(value: str) -> str:
    text = (value or "").strip()
    if not text or len(text) > 80:
        return ""
    if any(char in text for char in "\r\n\t"):
        return ""
    return text


def _template_response(request: Request, name: str, context: Dict[str, Any]):
    """Match whichever Starlette this process has.

    The live race desk calls TemplateResponse(name, context). Newer Starlette
    wants TemplateResponse(request, name, context). Championship pages use the
    older call, so this stays compatible with that server and with a newer one.
    """
    context = dict(context)
    context.setdefault("request", request)
    first = next(iter(inspect.signature(templates.TemplateResponse).parameters))
    if first == "request":
        return templates.TemplateResponse(request, name, context)
    return templates.TemplateResponse(name, context)


def _render(
    request: Request,
    username: str,
    panel: Dict[str, Any],
    error: str = "",
    notice: str = "",
    lookup: str = "",
    graph: Optional[Dict[str, Any]] = None,
    graph_error: str = "",
):
    return _template_response(
        request,
        "growth.html",
        {
            "username": username,
            "switches": panel["switches"],
            "numbers": panel["numbers"],
            "top_inviters": panel["top_inviters"],
            "counters": panel["counters"],
            "actions": panel["actions"],
            "any_forced": panel["any_forced"],
            "loaded": panel.get("loaded", True),
            "error": error,
            "notice": notice,
            "lookup": lookup,
            "graph": graph,
            "graph_error": graph_error,
        },
    )


async def _guard(request: Request):
    try:
        return await require_admin(request)
    except HTTPException:
        return None


@router.get("/growth", response_class=HTMLResponse)
async def growth_page(request: Request):
    username = await _guard(request)
    if not username:
        return RedirectResponse("/login", status_code=302)
    notice_code = request.query_params.get("notice", "")
    notice = NOTICES.get(notice_code, "")
    lookup = _clean_username(request.query_params.get("lookup", ""))
    error = ""
    try:
        raw = await _load_raw()
        panel = present_panel(raw)
        panel["loaded"] = True
    except PlayerApiError as exc:
        error = safe_operator_error(exc)
        panel = present_panel({})
        panel["loaded"] = False
    except Exception as exc:
        error = safe_operator_error(exc)
        panel = present_panel({})
        panel["loaded"] = False
    graph = None
    graph_error = ""
    if lookup:
        try:
            invited = await _player_call("GET", _invite_path(lookup))
            graph = present_invites(invited, lookup)
        except PlayerApiError as exc:
            graph_error = safe_operator_error(exc)
        except Exception as exc:
            graph_error = safe_operator_error(exc)
    return _render(
        request,
        username,
        panel,
        error=error,
        notice=notice,
        lookup=lookup,
        graph=graph,
        graph_error=graph_error,
    )


def _invite_path(username: str) -> str:
    return "/admin/growth/invites?" + urlencode({"username": username})


@router.post("/growth/settings")
async def growth_save(request: Request):
    username = await _guard(request)
    if not username:
        return RedirectResponse("/login", status_code=302)
    form = await request.form()
    submitted = {key: form.get(key) for key in form.keys()}
    parsed, errors = parse_form(submitted)
    try:
        raw = await _load_raw()
    except PlayerApiError as exc:
        panel = present_panel({}, overrides=parsed)
        panel["loaded"] = False
        return _render(request, username, panel, error=safe_operator_error(exc))
    except Exception as exc:
        panel = present_panel({}, overrides=parsed)
        panel["loaded"] = False
        return _render(request, username, panel, error=safe_operator_error(exc))
    if errors:
        panel = present_panel(raw, overrides=parsed)
        return _render(request, username, panel, error=" ".join(errors))
    previous, style = extract_settings(raw)
    forced = extract_forced(raw, previous)
    updated = build_settings_update(previous, parsed, forced)
    try:
        token = _admin_token()

        def run():
            return post_settings(_base_url(), [token], updated, style)

        await asyncio.to_thread(run)
    except PlayerApiError as exc:
        panel = present_panel(raw, overrides=parsed)
        return _render(request, username, panel, error=safe_operator_error(exc))
    except Exception as exc:
        panel = present_panel(raw, overrides=parsed)
        return _render(request, username, panel, error=safe_operator_error(exc))
    return RedirectResponse("/growth?notice=saved", status_code=303)


@router.post("/growth/revoke")
async def growth_revoke(request: Request):
    username = await _guard(request)
    if not username:
        return RedirectResponse("/login", status_code=302)
    form = await request.form()
    target = _clean_username(str(form.get("username") or ""))
    if not target:
        return await _tool_error(request, username, "Enter the player username to revoke.")
    try:
        await _player_call("POST", "/admin/growth/revoke", revoke_body(target))
    except PlayerApiError as exc:
        return await _tool_error(request, username, safe_operator_error(exc))
    except Exception as exc:
        return await _tool_error(request, username, safe_operator_error(exc))
    return RedirectResponse("/growth?notice=revoked", status_code=303)


@router.post("/growth/clawback")
async def growth_clawback(request: Request):
    username = await _guard(request)
    if not username:
        return RedirectResponse("/login", status_code=302)
    form = await request.form()
    target = _clean_username(str(form.get("username") or ""))
    date = str(form.get("date") or "").strip()
    amount_raw = str(form.get("amount") or "").strip()
    if not target:
        return await _tool_error(request, username, "Enter the player username to claw back.")
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return await _tool_error(request, username, "Enter the UK date as a calendar date.")
    try:
        amount = int(amount_raw)
    except ValueError:
        return await _tool_error(request, username, "Enter a whole number of plays to claw back.")
    if amount < 1 or amount > 10000:
        return await _tool_error(request, username, "Clawback amount must be between 1 and 10000.")
    try:
        await _player_call("POST", "/admin/growth/clawback", clawback_body(target, date, amount))
    except PlayerApiError as exc:
        return await _tool_error(request, username, safe_operator_error(exc))
    except Exception as exc:
        return await _tool_error(request, username, safe_operator_error(exc))
    return RedirectResponse("/growth?notice=clawed", status_code=303)


async def _tool_error(request: Request, username: str, message: str):
    try:
        raw = await _load_raw()
        panel = present_panel(raw)
    except Exception:
        panel = present_panel({})
        panel["loaded"] = False
    return _render(request, username, panel, error=message)
