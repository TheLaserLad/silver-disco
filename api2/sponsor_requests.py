"""Public sponsorship requests for the race desk.

The public site posts a request here. It is stored for the login-gated
race desk list and emailed only to hello@pinballrace.com, using the same
SMTP settings as the race desk's Email All tool.
"""

from __future__ import annotations

import asyncio
import os
import re
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

# The only address a sponsorship request is sent to.
SPONSOR_INBOX = "hello@pinballrace.com"

SPONSOR_OPTIONS = (
    "Branded race",
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


def sponsor_email_content(doc: dict) -> tuple[str, str, str]:
    """Subject, body, and Reply-To for the one inbox message."""
    subject = f"Sponsorship request from {doc['brand']}".replace("\r", " ").replace("\n", " ")
    budget = doc.get("budget") or "Not given"
    body = (
        "A sponsorship request came in from the public Sponsor the Race page.\n\n"
        f"Name: {doc['name']}\n"
        f"Brand or company: {doc['brand']}\n"
        f"Email: {doc['email']}\n"
        f"What they want to sponsor: {doc['sponsorship']}\n"
        f"Rough budget: {budget}\n\n"
        f"Note:\n{doc['note']}\n"
    )
    reply_to = str(doc.get("email", "")).replace("\r", "").replace("\n", "")
    return subject, body, reply_to


def send_sponsor_request_email(doc: dict) -> None:
    """Email this request to hello@pinballrace.com and nowhere else."""
    subject, body, reply_to = sponsor_email_content(doc)
    _smtp_send_to_inbox(subject, body, reply_to)


def _smtp_send_to_inbox(subject: str, body: str, reply_to: str) -> None:
    """Send one plain-text message with the SMTP settings Email All already uses.

    SMTP_USER and SMTP_PASS have to be set on the race-desk process. SMTP_HOST
    defaults to smtp.gmail.com and SMTP_PORT to 587. This function never takes
    a recipient argument: the envelope recipient is the inbox constant.
    """
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    if not user or not password:
        raise RuntimeError("SMTP_USER and SMTP_PASS are required to email a sponsorship request.")
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = user
    message["To"] = SPONSOR_INBOX
    if reply_to:
        message["Reply-To"] = reply_to
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.sendmail(user, [SPONSOR_INBOX], message.as_string())


def register_sponsor_routes(app: FastAPI, *, db, require_login, templates, format_timestamp, mailer=None) -> None:
    """Attach the public save route and the private race-desk list."""
    deliver = mailer or send_sponsor_request_email

    @app.post("/api/sponsor-requests")
    async def create_sponsor_request(request: Request):
        """Save a sponsorship request and email it to the race inbox."""
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="We could not read that request.")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="We could not read that request.")
        try:
            doc = clean_sponsor_request(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        doc["createdAt"] = int(datetime.now(timezone.utc).timestamp() * 1000)
        try:
            await db.sponsor_requests.insert_one(doc)
        except Exception:
            raise HTTPException(status_code=500, detail="Could not save the request.")
        message = {key: doc[key] for key in ("name", "brand", "email", "sponsorship", "budget", "note")}
        try:
            await asyncio.to_thread(deliver, message)
        except Exception:
            raise HTTPException(status_code=500, detail="Could not send the request.")
        return JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})

    @app.get("/sponsor-requests", response_class=HTMLResponse)
    async def sponsor_requests_page(request: Request):
        try:
            username = await require_login(request)
        except HTTPException:
            return RedirectResponse("/login")
        raw = await db.sponsor_requests.find(
            {},
            {"_id": 0},
        ).sort("createdAt", -1).limit(200).to_list(length=200)
        rows = []
        for row in raw:
            rows.append({
                "name": row.get("name", ""),
                "brand": row.get("brand", ""),
                "email": row.get("email", ""),
                "sponsorship": row.get("sponsorship", ""),
                "budget": row.get("budget", ""),
                "note": row.get("note", ""),
                "createdAt_formatted": format_timestamp(row.get("createdAt") or 0),
            })
        response = templates.TemplateResponse("sponsor_requests.html", {
            "request": request,
            "username": username,
            "requests": rows,
        })
        response.headers["Cache-Control"] = "private, no-store"
        return response
