# growth_client.py
#
# Talks to the player API growth admin routes. The player API is the only
# place growth settings are stored. This module never writes Mongo collections
# and never sends email.
#
# Routes (already live on the player service):
#   GET  /admin/growth
#   POST /admin/growth/settings
#   POST /admin/growth/revoke     { username }
#   POST /admin/growth/clawback   { username, date, amount }
#   GET  /admin/growth/invites?username=

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")

# Preferred key is the first alias. If the player API already stored a
# different alias, we read and write that one so we do not invent a second name.
FIELDS: List[Dict[str, Any]] = [
    {
        "id": "play_ledger",
        "kind": "switch",
        "label": "Play ledger",
        "help": "Counts plays and enforces the daily play limit.",
        "aliases": ["playLedgerEnabled", "playLedger", "growth_play_ledger", "growthPlayLedger"],
        "default": False,
    },
    {
        "id": "invites",
        "kind": "switch",
        "label": "Invites",
        "help": "Lets a player invite someone else to their first race.",
        "aliases": ["invitesEnabled", "growth_invites", "growthInvites", "invites"],
        "default": False,
    },
    {
        "id": "challenges",
        "kind": "switch",
        "label": "Challenges",
        "help": "Card 1 bets between players.",
        "aliases": ["challengesEnabled", "growth_challenges", "growthChallenges", "challenges"],
        "default": False,
    },
    {
        "id": "share_day",
        "kind": "switch",
        "label": "Share day",
        "help": "Extra play for sharing on the chosen day.",
        "aliases": ["shareDayEnabled", "growth_share_day", "growthShareDay", "shareDay"],
        "default": False,
    },
    {
        "id": "friends",
        "kind": "switch",
        "label": "Friends",
        "help": "Follow and friends.",
        "aliases": ["friendsEnabled", "growth_friends", "growthFriends", "followsEnabled", "friends"],
        "default": False,
    },
    {
        "id": "email_capture",
        "kind": "switch",
        "label": "Email capture",
        "help": "Asks for an email address in exchange for a free race. Saving does not send email.",
        "aliases": ["emailCaptureEnabled", "growth_email_capture", "growthEmailCapture", "emailCapture"],
        "default": False,
    },
    {
        "id": "world_share",
        "kind": "switch",
        "label": "World share",
        "help": "Card 2 world-share credits.",
        "aliases": ["worldShareEnabled", "growth_world_share", "growthWorldShare", "worldShare"],
        "default": False,
    },
    {
        "id": "daily_play_limit",
        "kind": "number",
        "label": "Daily play limit",
        "help": "Base plays each player gets per UK day.",
        "aliases": ["dailyPlayLimit", "daily_play_limit"],
        "default": 5,
        "min": 0,
        "max": 100,
    },
    {
        "id": "bonus_play_cap",
        "kind": "number",
        "label": "Bonus play cap per day",
        "help": "Cap on earned extra plays. Extras expire at UK midnight.",
        "aliases": ["bonusPlayCapPerDay", "bonusPlayCap", "bonus_play_cap_per_day"],
        "default": 5,
        "min": 0,
        "max": 100,
    },
    {
        "id": "welcome_bonus",
        "kind": "number",
        "label": "Welcome bonus plays",
        "help": "Plays given when an invited player finishes their first race.",
        "aliases": ["welcomeBonusPlays", "welcome_bonus_plays"],
        "default": 1,
        "min": 0,
        "max": 100,
    },
    {
        "id": "challenge_ttl",
        "kind": "number",
        "label": "Bet time-to-live (days)",
        "help": "How many days an open challenge stays open.",
        "aliases": ["challengeTtlDays", "challenge_ttl_days"],
        "default": 7,
        "min": 1,
        "max": 365,
    },
    {
        "id": "world_share_cap",
        "kind": "number",
        "label": "World-share spend cap",
        "help": "Free world-share spends per UK day.",
        "aliases": ["worldShareSpendCap", "world_share_spend_cap"],
        "default": 3,
        "min": 0,
        "max": 100,
    },
    {
        "id": "share_day_mode",
        "kind": "choice",
        "label": "Share day mode",
        "help": "How a player proves they shared.",
        "aliases": ["shareDayMode", "share_day_mode"],
        "default": "share_or_copy",
        "choices": [
            ("share_or_copy", "Share sheet or copied link"),
            ("share_sheet", "Share sheet only"),
            ("copy_confirmed", "Copied link only"),
        ],
    },
    {
        "id": "share_day_weekday",
        "kind": "weekday",
        "label": "Share day weekday",
        "help": "Optional. Leave blank to allow any weekday.",
        "aliases": ["shareDayWeekday", "share_day_weekday"],
        "default": "",
    },
    {
        "id": "share_day_date",
        "kind": "date",
        "label": "Share day date",
        "help": "Optional. Leave blank if it is not a single calendar date.",
        "aliases": ["shareDayDate", "share_day_date"],
        "default": "",
    },
]

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

SHARE_MODES = ["share_or_copy", "share_sheet", "copy_confirmed"]

# Keys that belong to the admin panel envelope, not to the settings document.
ENVELOPE_KEYS = {
    "settings",
    "envForced",
    "env_forced",
    "topInviters",
    "top_inviters",
    "topInvitersThisWeek",
    "counters",
    "recentActions",
    "recent_actions",
    "adminActions",
    "ok",
    "success",
    "invites",
    "invitees",
    "graph",
}

EVENTS = [
    ("invite_land", "Invite link opened"),
    ("invite_signup", "Invite sign-up"),
    ("invite_first_race", "Invite first race"),
    ("challenge_create", "Challenge started"),
    ("challenge_play", "Challenge played"),
    ("share_day_unlock", "Share day unlock"),
    ("world_share_credit_earned", "World-share credit earned"),
    ("world_share_spend", "World-share spend"),
    ("follow", "Follows"),
    ("friend_mutual", "Mutual friends"),
]

STATUS_LABELS = {
    "landed": "Landed",
    "land": "Landed",
    "invite_land": "Landed",
    "signed_up": "Signed up",
    "signup": "Signed up",
    "signedup": "Signed up",
    "invite_signup": "Signed up",
    "first_race": "First race",
    "firstrace": "First race",
    "first race": "First race",
    "invite_first_race": "First race",
}


class PlayerApiError(Exception):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def sign_hs256(payload: Any, secret: str, ttl_seconds: int = 600, now: Optional[int] = None) -> str:
    """HS256 JWT matching the player API (jsonwebtoken, algorithm HS256)."""
    if not secret:
        raise PlayerApiError("JWT secret is empty")
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    if isinstance(payload, dict):
        now_i = int(time.time() if now is None else now)
        body_obj = dict(payload)
        body_obj.setdefault("iat", now_i)
        body_obj.setdefault("exp", now_i + int(ttl_seconds))
        body_bytes = json.dumps(body_obj, separators=(",", ":")).encode()
    elif isinstance(payload, str):
        body_bytes = json.dumps(payload).encode()
    else:
        raise TypeError("JWT payload must be an object or a string")
    body = _b64url(body_bytes)
    sig = hmac.new(secret.encode("utf-8"), f"{header}.{body}".encode("ascii"), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url(sig)}"


def decode_jwt_payload(token: str) -> Any:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Not a JWT")
    pad = "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(parts[1] + pad))


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "on", "yes"}
    return False


def _field_map() -> Dict[str, Dict[str, Any]]:
    return {field["id"]: field for field in FIELDS}


def _present_aliases(settings: Dict[str, Any], field: Dict[str, Any]) -> List[str]:
    if not isinstance(settings, dict):
        return []
    return [alias for alias in field["aliases"] if alias in settings]


def _raw_value(settings: Dict[str, Any], field: Dict[str, Any]) -> Any:
    for alias in field["aliases"]:
        if isinstance(settings, dict) and alias in settings:
            return settings[alias]
    return None


def _as_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def weekday_to_form(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)):
        number = int(value)
        if 0 <= number <= 6:
            return WEEKDAYS[number]
        if 1 <= number <= 7:
            return WEEKDAYS[number - 1]
        return ""
    text = str(value).strip().lower()
    return text if text in WEEKDAYS else ""


def _weekday_for_storage(form_value: str, previous: Any) -> Any:
    if not form_value:
        return None
    index = WEEKDAYS.index(form_value)
    if isinstance(previous, bool):
        return form_value
    if isinstance(previous, (int, float)):
        # 7 only exists when Sunday is 7 (Monday = 1). Otherwise Monday = 0.
        if int(previous) == 7:
            return index + 1
        return index
    if isinstance(previous, str):
        if previous[:1].isupper():
            return form_value.capitalize()
        return form_value
    return form_value


def _choice_to_form(value: Any, field: Dict[str, Any]) -> str:
    allowed = [item[0] for item in field["choices"]]
    if value is None or value == "":
        return field["default"]
    text = str(value).strip()
    if text in allowed:
        return text
    return field["default"]


def _date_to_form(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        day = text[:10]
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except ValueError:
            return ""
        return day
    return ""


def extract_settings(payload: Any) -> Tuple[Dict[str, Any], str]:
    """Return (settings dict, post style).

    post style is "nested", "flat", or "try-nested".
    """
    if not isinstance(payload, dict):
        return {}, "try-nested"
    nested = payload.get("settings")
    if isinstance(nested, dict):
        return dict(nested), "nested"
    flat = {key: value for key, value in payload.items() if key not in ENVELOPE_KEYS}
    known = False
    for field in FIELDS:
        if _present_aliases(flat, field):
            known = True
            break
    if known:
        return flat, "flat"
    return flat, "try-nested"


def extract_forced(payload: Any, settings: Dict[str, Any]) -> Dict[str, str]:
    raw = None
    if isinstance(payload, dict):
        raw = payload.get("envForced")
        if raw is None:
            raw = payload.get("env_forced")
    if raw is None and isinstance(settings, dict):
        raw = settings.get("envForced")
        if raw is None:
            raw = settings.get("env_forced")
    forced: Dict[str, str] = {}
    if isinstance(raw, list):
        for key in raw:
            forced[str(key)] = "server environment"
        return forced
    if not isinstance(raw, dict):
        return forced
    for key, value in raw.items():
        if value in (False, None, "", 0):
            continue
        if value is True:
            forced[str(key)] = "server environment"
        elif isinstance(value, dict):
            name = value.get("env") or value.get("key") or value.get("name") or "server environment"
            forced[str(key)] = str(name)
        else:
            forced[str(key)] = str(value)
    return forced


def field_forced_note(field: Dict[str, Any], forced: Dict[str, str]) -> str:
    for alias in field["aliases"]:
        if alias in forced:
            return forced[alias]
    return ""


def _switch_storage(previous: Any, value: bool) -> Any:
    if isinstance(previous, str):
        return "true" if value else "false"
    if isinstance(previous, (int, float)) and not isinstance(previous, bool):
        return 1 if value else 0
    return bool(value)


def _number_storage(previous: Any, value: int) -> Any:
    if isinstance(previous, float) and not isinstance(previous, bool):
        return float(value)
    return int(value)


def _is_default(field: Dict[str, Any], value: Any) -> bool:
    if field["kind"] == "switch":
        return as_bool(value) is False
    if field["kind"] == "number":
        return _as_int(value, field["default"]) == field["default"]
    if field["kind"] == "choice":
        return (value or field["default"]) == field["default"]
    if field["kind"] in {"weekday", "date"}:
        return value in (None, "")
    return False


def parse_form(form: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Turn a submitted form into field values. A missing switch means off."""
    values: Dict[str, Any] = {}
    errors: List[str] = []
    for field in FIELDS:
        raw = form.get(field["id"]) if isinstance(form, dict) else None
        if field["kind"] == "switch":
            values[field["id"]] = as_bool(raw)
            continue
        if field["kind"] == "number":
            if raw is None or str(raw).strip() == "":
                values[field["id"]] = field["default"]
                continue
            try:
                number = int(str(raw).strip())
            except ValueError:
                errors.append(f"{field['label']} must be a whole number.")
                values[field["id"]] = field["default"]
                continue
            if number < field["min"] or number > field["max"]:
                errors.append(
                    f"{field['label']} must be between {field['min']} and {field['max']}."
                )
                values[field["id"]] = field["default"]
                continue
            values[field["id"]] = number
            continue
        if field["kind"] == "choice":
            text = "" if raw is None else str(raw).strip()
            allowed = [item[0] for item in field["choices"]]
            values[field["id"]] = text if text in allowed else field["default"]
            continue
        if field["kind"] == "weekday":
            text = "" if raw is None else str(raw).strip().lower()
            if text and text not in WEEKDAYS:
                errors.append("Share day weekday is not a real weekday.")
                text = ""
            values[field["id"]] = text
            continue
        if field["kind"] == "date":
            text = "" if raw is None else str(raw).strip()
            if text:
                try:
                    datetime.strptime(text, "%Y-%m-%d")
                except ValueError:
                    errors.append("Share day date must be a real calendar date.")
                    text = ""
            values[field["id"]] = text
    return values, errors


def build_settings_update(
    previous: Dict[str, Any],
    parsed: Dict[str, Any],
    forced: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Merge the form onto the settings the player API already returned.

    Missing switches are saved as off. Keys the form does not understand are
    kept. Env-forced keys are left unchanged. Nothing here turns a switch on
    unless the form included it.
    """
    forced = forced or {}
    if not isinstance(previous, dict):
        previous = {}
    updated = {
        key: value
        for key, value in previous.items()
        if key not in {"envForced", "env_forced"}
    }
    for field in FIELDS:
        existing = _present_aliases(previous, field)
        note = field_forced_note(field, forced)
        value = parsed.get(field["id"], field["default"])
        if note:
            continue
        if not existing:
            if _is_default(field, value):
                continue
            target = field["aliases"][0]
            updated[target] = _store_new(field, value)
            continue
        for key in existing:
            updated[key] = _store_existing(field, value, previous.get(key))
    return updated


def _store_new(field: Dict[str, Any], value: Any) -> Any:
    if field["kind"] == "switch":
        return bool(value)
    if field["kind"] == "number":
        return int(value)
    if field["kind"] == "choice":
        return str(value)
    if field["kind"] == "weekday":
        return value or None
    if field["kind"] == "date":
        return value or None
    return value


def _store_existing(field: Dict[str, Any], value: Any, previous: Any) -> Any:
    if field["kind"] == "switch":
        return _switch_storage(previous, bool(value))
    if field["kind"] == "number":
        return _number_storage(previous, int(value))
    if field["kind"] == "weekday":
        return _weekday_for_storage(value or "", previous)
    if field["kind"] == "date":
        if not value:
            return None
        return str(value)
    if field["kind"] == "choice":
        return str(value)
    return value


def settings_bodies(settings: Dict[str, Any], style: str) -> List[Dict[str, Any]]:
    nested = {"settings": settings}
    if style == "flat":
        return [settings]
    if style == "nested":
        return [nested]
    return [nested, settings]


def _num_map(obj: Any) -> Dict[str, int]:
    if not isinstance(obj, dict):
        return {}
    source = obj.get("counts") if isinstance(obj.get("counts"), dict) else obj
    numbers: Dict[str, int] = {}
    for key, value in source.items():
        if key in {"date", "day", "counts", "label"}:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        numbers[str(key)] = int(value)
    return numbers


def _event_rows(maps: List[Dict[str, int]]) -> List[Dict[str, str]]:
    keys = [key for key, _label in EVENTS]
    labels = {key: label for key, label in EVENTS}
    for numbers in maps:
        for key in numbers:
            if key not in keys:
                keys.append(key)
    return [{"key": key, "label": labels.get(key, key.replace("_", " "))} for key in keys]


def _fill(numbers: Dict[str, int], keys: List[str]) -> Dict[str, int]:
    return {key: int(numbers.get(key, 0)) for key in keys}


def last_uk_dates(today: Optional[datetime] = None, count: int = 7) -> List[str]:
    if today is None:
        current = datetime.now(UK).date()
    elif isinstance(today, datetime):
        current = today.astimezone(UK).date() if today.tzinfo else today.date()
    else:
        current = today
    start = current - timedelta(days=count - 1)
    return [(start + timedelta(days=offset)).isoformat() for offset in range(count)]


def _counters(payload: Dict[str, Any], today: Optional[datetime] = None) -> Dict[str, Any]:
    raw = payload.get("counters") if isinstance(payload, dict) else None
    if not isinstance(raw, dict):
        raw = {}
    today_map = _num_map(raw.get("today") or raw.get("ukToday") or {})
    week_map = _num_map(raw.get("week") or raw.get("ukWeek") or raw.get("thisWeek") or {})
    last = raw.get("last7")
    if last is None:
        last = raw.get("last_7")
    if last is None:
        last = raw.get("last7Days")
    if last is None:
        last = raw.get("days")
    days: List[Dict[str, Any]] = []
    supplied = isinstance(last, list)
    if supplied:
        for item in last:
            if not isinstance(item, dict):
                continue
            date = str(item.get("date") or item.get("day") or "")
            days.append({"date": date, "counts": _num_map(item)})
    if not days:
        days = [{"date": day, "counts": {}} for day in last_uk_dates(today)]
    rows = _event_rows([today_map, week_map] + [day["counts"] for day in days])
    keys = [row["key"] for row in rows]
    return {
        "events": rows,
        "today": _fill(today_map, keys),
        "week": _fill(week_map, keys),
        "days": [{"date": day["date"], "counts": _fill(day["counts"], keys)} for day in days],
        "synthetic_days": not supplied or not any(day["counts"] for day in days) and not supplied,
    }


def _top_inviters(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = None
    for key in ("topInviters", "top_inviters", "topInvitersThisWeek"):
        if isinstance(payload, dict) and key in payload:
            raw = payload.get(key)
            break
    if isinstance(raw, dict):
        raw = raw.get("week") or raw.get("thisWeek") or raw.get("rows") or raw.get("users") or []
    rows = []
    if not isinstance(raw, list):
        return rows
    for item in raw:
        if not isinstance(item, dict):
            continue
        username = item.get("username") or item.get("user") or item.get("name") or ""
        count = None
        for key in ("firstRaces", "inviteFirstRaces", "first_races", "count", "invites"):
            if key in item and isinstance(item[key], (int, float)) and not isinstance(item[key], bool):
                count = int(item[key])
                break
        rows.append({"username": str(username), "first_races": 0 if count is None else count})
    return rows


def format_when(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        stamp = float(value)
        if stamp > 1_000_000_000_000:
            stamp = stamp / 1000.0
        if stamp > 1_000_000_000:
            try:
                moment = datetime.fromtimestamp(stamp, UK)
                return moment.strftime("%Y-%m-%d %H:%M UK")
            except (OverflowError, OSError, ValueError):
                return str(value)
    return str(value)


def _actions(payload: Dict[str, Any]) -> List[Dict[str, str]]:
    raw = None
    if isinstance(payload, dict):
        for key in ("recentActions", "recent_actions", "adminActions"):
            if key in payload:
                raw = payload.get(key)
                break
    rows = []
    if not isinstance(raw, list):
        return rows
    for item in raw[:50]:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "when": format_when(item.get("at") or item.get("createdAt") or item.get("time") or item.get("when") or ""),
                "action": str(item.get("action") or item.get("type") or item.get("kind") or ""),
                "username": str(item.get("username") or item.get("user") or item.get("actor") or ""),
                "detail": str(item.get("detail") or item.get("note") or item.get("message") or ""),
            }
        )
    return rows


def _display_value(field: Dict[str, Any], settings: Dict[str, Any], overrides: Dict[str, Any]) -> Any:
    if field["id"] in overrides:
        return overrides[field["id"]]
    raw = _raw_value(settings, field)
    if raw is None:
        return field["default"]
    if field["kind"] == "switch":
        return as_bool(raw)
    if field["kind"] == "number":
        return _as_int(raw, field["default"])
    if field["kind"] == "choice":
        return _choice_to_form(raw, field)
    if field["kind"] == "weekday":
        return weekday_to_form(raw)
    if field["kind"] == "date":
        return _date_to_form(raw)
    return raw


def present_panel(
    payload: Any,
    overrides: Optional[Dict[str, Any]] = None,
    today: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Operator view. Every switch defaults off when the API omits it."""
    overrides = overrides or {}
    settings, style = extract_settings(payload if isinstance(payload, dict) else {})
    forced = extract_forced(payload if isinstance(payload, dict) else {}, settings)
    fields = []
    for field in FIELDS:
        note = field_forced_note(field, forced)
        value = _display_value(field, settings, {} if note else overrides)
        choices = list(field.get("choices") or [])
        if field["kind"] == "choice" and value not in [item[0] for item in choices]:
            choices = choices + [(value, value)]
        fields.append(
            {
                "id": field["id"],
                "kind": field["kind"],
                "label": field["label"],
                "help": field["help"],
                "value": value,
                "forced": bool(note),
                "forced_note": note,
                "choices": choices,
                "min": field.get("min"),
                "max": field.get("max"),
            }
        )
    envelope = payload if isinstance(payload, dict) else {}
    counters = _counters(envelope, today=today)
    return {
        "fields": fields,
        "switches": [field for field in fields if field["kind"] == "switch"],
        "numbers": [field for field in fields if field["kind"] != "switch"],
        "top_inviters": _top_inviters(envelope),
        "counters": counters,
        "actions": _actions(envelope),
        "post_style": style,
        "any_forced": any(field["forced"] for field in fields),
        "loaded": True,
    }


def status_label(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "—"
    mapped = STATUS_LABELS.get(text.lower())
    if mapped:
        return mapped
    return text.replace("_", " ")


def present_invites(payload: Any, username: str) -> Dict[str, Any]:
    raw: Any = payload
    if isinstance(payload, dict):
        for key in ("invites", "invitees", "invited", "graph", "rows", "children"):
            if key in payload:
                raw = payload.get(key)
                break
        else:
            raw = []
        if isinstance(raw, dict):
            for key in ("invites", "invitees", "children", "rows"):
                if isinstance(raw.get(key), list):
                    raw = raw.get(key)
                    break
            else:
                raw = []
    rows = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                rows.append({"username": item, "status": "—", "when": ""})
                continue
            if not isinstance(item, dict):
                continue
            rows.append(
                {
                    "username": str(item.get("username") or item.get("invitee") or item.get("user") or ""),
                    "status": status_label(item.get("status") or item.get("state") or ""),
                    "when": format_when(item.get("at") or item.get("createdAt") or item.get("when") or ""),
                }
            )
    return {"username": username, "rows": rows}


def is_auth_error(error: PlayerApiError) -> bool:
    if error.status in (401, 403):
        return True
    if error.status == 500 and "authenticated" in str(error).lower():
        return True
    return False


def _error_from_body(body: bytes, status: int) -> str:
    text = body.decode("utf-8", errors="replace").strip()
    if not text:
        return f"Player API returned status {status}"
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = None
    if isinstance(data, dict):
        for key in ("error", "message", "detail"):
            if data.get(key):
                return str(data[key])[:500]
    start = text.lower().find("<pre>")
    end = text.lower().find("</pre>")
    if start != -1 and end != -1 and end > start:
        return text[start + 5 : end].strip()[:500]
    if text.startswith("<"):
        return f"Player API returned status {status}"
    return text[:500]


class GrowthClient:
    def __init__(self, base_url: str, token: str = "", timeout: float = 8.0):
        self.base_url = (base_url or "http://127.0.0.1:8080").rstrip("/")
        self.token = token or ""
        self.timeout = timeout

    def request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base_url + path
        data = None
        headers = {
            "Accept": "application/json",
            "User-Agent": "pinballrace-race-desk-growth",
        }
        if self.token:
            if any(char in self.token for char in "\r\n;"):
                raise PlayerApiError("The player admin token cannot contain a cookie separator.")
            headers["Cookie"] = f"adminToken={self.token}"
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read(1_000_000)
                status = getattr(resp, "status", 200)
        except urllib.error.HTTPError as exc:
            raw = exc.read(1_000_000)
            raise PlayerApiError(_error_from_body(raw, exc.code), status=exc.code)
        except urllib.error.URLError as exc:
            raise PlayerApiError(
                f"Could not reach the player API at {self.base_url}. ({exc.reason})"
            )
        if status >= 400:
            raise PlayerApiError(_error_from_body(raw, status), status=status)
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise PlayerApiError("Player API did not return JSON")


def request_with_tokens(
    base_url: str,
    tokens: List[str],
    method: str,
    path: str,
    body: Optional[Dict[str, Any]] = None,
    timeout: float = 8.0,
) -> Tuple[Any, str]:
    """Try each admin token. Only an auth failure moves on to the next token."""
    if not tokens:
        raise PlayerApiError("No player-API admin credential is configured")
    last: Optional[PlayerApiError] = None
    for index, token in enumerate(tokens):
        client = GrowthClient(base_url, token, timeout=timeout)
        try:
            return client.request(method, path, body), token
        except PlayerApiError as exc:
            last = exc
            if not is_auth_error(exc) or index == len(tokens) - 1:
                raise
    raise last or PlayerApiError("Player API request failed")


def post_settings(
    base_url: str,
    tokens: List[str],
    settings: Dict[str, Any],
    style: str,
    timeout: float = 8.0,
) -> Any:
    """Save settings. A validation error is not retried as a different write.

    When the read did not tell us nested vs flat, a 400 on the nested body
    is tried once as a flat body. Clawback and revoke never use this helper.
    """
    last: Optional[PlayerApiError] = None
    bodies = settings_bodies(settings, style)
    for index, body in enumerate(bodies):
        try:
            result, token = request_with_tokens(
                base_url, tokens, "POST", "/admin/growth/settings", body, timeout=timeout
            )
            return result, token
        except PlayerApiError as exc:
            last = exc
            if exc.status != 400 or index == len(bodies) - 1:
                raise
    raise last or PlayerApiError("Could not save growth settings")


def revoke_body(username: str) -> Dict[str, str]:
    return {"username": username}


def clawback_body(username: str, date: str, amount: int) -> Dict[str, Any]:
    return {"username": username, "date": date, "amount": int(amount)}


def safe_operator_error(exc: BaseException) -> str:
    text = str(exc)
    lowered = text.lower()
    if "mongodb://" in lowered or "mongodb+srv://" in lowered or "password" in lowered:
        return "The race desk could not reach its database."
    if isinstance(exc, PlayerApiError):
        return text[:500] or "The player API rejected the request."
    return "Something went wrong talking to the player API."
