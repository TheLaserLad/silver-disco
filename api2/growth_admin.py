# growth_admin.py
#
# Growth page for the race desk (admin.pinballrace.com).
#
# Settings live on the player API (GET/POST /admin/growth…). This page does not
# write a second settings store and it does not send email. Switches stay off
# unless an admin turns one on and saves.

import asyncio
import inspect
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
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
    is_auth_error,
    parse_form,
    post_settings,
    present_invites,
    present_panel,
    request_with_tokens,
    revoke_body,
    safe_operator_error,
    sign_hs256,
)

load_dotenv()

router = APIRouter()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pinballrace_com")

mongo = AsyncIOMotorClient(MONGO_URI)
db = mongo[DB_NAME]

templates = Jinja2Templates(directory="templates")

# Short-lived player-admin cookie minted from JWT_SECRET_KEY. Never the
# growth settings themselves.
_token_cache: Dict[str, Any] = {"token": None, "until": 0.0}

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
    """Same session cookie as the rest of the race desk. No cookie, no Mongo call."""
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


def _clear_token_cache() -> None:
    _token_cache["token"] = None
    _token_cache["until"] = 0.0


async def _token_candidates() -> Tuple[List[str], bool]:
    """Return (tokens, cacheable). An explicit env token is not rewritten."""
    explicit = os.getenv("PLAYER_API_ADMIN_TOKEN", "").strip()
    if explicit:
        return [explicit], False
    now = time.time()
    cached = _token_cache.get("token")
    if cached and float(_token_cache.get("until") or 0) > now:
        return [str(cached)], True
    secret = os.getenv("JWT_SECRET_KEY", "").strip()
    if not secret:
        raise PlayerApiError(
            "The race desk has no player-API admin cookie. Set PLAYER_API_ADMIN_TOKEN, "
            "or set JWT_SECRET_KEY (the same secret the player API already uses)."
        )
    admin = await db.users.find_one({"userType": "Admin"})
    if not admin or admin.get("_id") is None:
        raise PlayerApiError(
            "No player account with type Admin was found. Set PLAYER_API_ADMIN_TOKEN "
            "to a current adminToken cookie from the player API."
        )
    user_id = str(admin["_id"])
    # Object payload matches createJwt.ts. The string payload is only a fallback
    # for the older admin check that treated the whole token body as the user id.
    return [sign_hs256({"_id": user_id}, secret), sign_hs256(user_id, secret)], True


def _remember_token(token: str, cacheable: bool) -> None:
    if cacheable and token:
        _token_cache["token"] = token
        _token_cache["until"] = time.time() + 300


async def _player_call(
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
) -> Any:
    tokens, cacheable = await _token_candidates()

    def run(these: List[str]) -> Tuple[Any, str]:
        return request_with_tokens(_base_url(), these, method, path, body)

    try:
        result, used = await asyncio.to_thread(run, tokens)
    except PlayerApiError as exc:
        if not (cacheable and is_auth_error(exc) and _token_cache.get("token")):
            raise
        _clear_token_cache()
        tokens, cacheable = await _token_candidates()
        result, used = await asyncio.to_thread(run, tokens)
    _remember_token(used, cacheable)
    return result


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
        tokens, cacheable = await _token_candidates()

        def run():
            return post_settings(_base_url(), tokens, updated, style)

        _result, used = await asyncio.to_thread(run)
        _remember_token(used, cacheable)
    except PlayerApiError as exc:
        if is_auth_error(exc):
            _clear_token_cache()
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
