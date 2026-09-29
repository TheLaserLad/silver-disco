"""Public sponsorship requests for the race desk.

The public site posts a request here. It is stored for the login-gated
race desk list and is not emailed.
"""

from __future__ import annotations

import re

SPONSOR_OPTIONS = (
    "Branded race",
    "Your ball",
    "Winner moment",
    "Giveaway",
    "Live race",
    "Championship",
    "Other",
)

_LIMITS = {
    "name": 120,
    "brand": 160,
    "email": 200,
    "budget": 80,
    "note": 2000,
}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_REQUIRED = {
    "name": "Enter your name.",
    "brand": "Enter a brand or company.",
    "email": "Enter an email address.",
    "note": "Add a note.",
}

_LABELS = {
    "name": "Name",
    "brand": "Brand or company",
    "email": "Email",
    "budget": "Rough budget",
    "note": "Note",
}


def _clean_text(value, field: str, required: bool) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError(f"{_LABELS[field]} must be text.")
    value = value.replace("\x00", "")
    if field == "note":
        text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    else:
        text = " ".join(value.split())
    if len(text) > _LIMITS[field]:
        raise ValueError(f"{_LABELS[field]} is too long.")
    if required and not text:
        raise ValueError(_REQUIRED[field])
    return text


def clean_sponsor_request(payload: dict) -> dict:
    """Return the fields worth storing, or raise ValueError with a safe message."""
    if not isinstance(payload, dict):
        raise ValueError("We could not read that request.")

    sponsorship = payload.get("sponsorship")
    if not isinstance(sponsorship, str) or sponsorship not in SPONSOR_OPTIONS:
        raise ValueError("Choose what you want to sponsor.")

    email = _clean_text(payload.get("email"), "email", True)
    if not _EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address.")

    return {
        "name": _clean_text(payload.get("name"), "name", True),
        "brand": _clean_text(payload.get("brand"), "brand", True),
        "email": email,
        "sponsorship": sponsorship,
        "budget": _clean_text(payload.get("budget", ""), "budget", False),
        "note": _clean_text(payload.get("note"), "note", True),
    }
