import os
import unittest
from email import message_from_string
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, HTTPException, Request
from fastapi.templating import Jinja2Templates
from fastapi.testclient import TestClient

from sponsor_requests import (
    SPONSOR_INBOX,
    SPONSOR_OPTIONS,
    clean_sponsor_request,
    register_sponsor_routes,
    send_sponsor_request_email,
)


ROOT = Path(__file__).resolve().parent
VALID = {
    "name": "Ada Lovelace",
    "brand": "Analytical Engines",
    "email": "ada@example.com",
    "sponsorship": "Championship",
    "budget": "a few hundred",
    "note": "We would like to talk about a season.",
}


class CleanSponsorRequestTests(unittest.TestCase):
    def test_keeps_only_stored_fields(self):
        payload = {**VALID, "extra": "ignore me", "email": "  Ada@Example.com  "}
        doc = clean_sponsor_request(payload)
        self.assertEqual(
            set(doc),
            {"name", "brand", "email", "sponsorship", "budget", "note"},
        )
        self.assertEqual(doc["email"], "Ada@Example.com")
        self.assertNotIn("extra", doc)

    def test_budget_is_optional(self):
        without = {key: value for key, value in VALID.items() if key != "budget"}
        self.assertEqual(clean_sponsor_request(without)["budget"], "")
        blank = {**VALID, "budget": "   "}
        self.assertEqual(clean_sponsor_request(blank)["budget"], "")

    def test_other_is_allowed(self):
        doc = clean_sponsor_request({**VALID, "sponsorship": "Other"})
        self.assertEqual(doc["sponsorship"], "Other")

    def test_options_match_the_public_page(self):
        self.assertEqual(
            SPONSOR_OPTIONS,
            (
                "Branded race",
                "Winner moment",
                "Giveaway",
                "Live race",
                "Championship",
                "Other",
            ),
        )
        self.assertNotIn("Your ball", SPONSOR_OPTIONS)

    def test_rejects_unknown_sponsorship(self):
        with self.assertRaises(ValueError):
            clean_sponsor_request({**VALID, "sponsorship": "pins"})
        with self.assertRaises(ValueError):
            clean_sponsor_request({**VALID, "sponsorship": "Your ball"})

    def test_rejects_bad_email_and_blank_required_fields(self):
        with self.assertRaisesRegex(ValueError, "email"):
            clean_sponsor_request({**VALID, "email": "not-an-email"})
        with self.assertRaisesRegex(ValueError, "name"):
            clean_sponsor_request({**VALID, "name": "   "})
        with self.assertRaisesRegex(ValueError, "note"):
            clean_sponsor_request({**VALID, "note": ""})
        with self.assertRaises(ValueError):
            clean_sponsor_request(["not", "a", "dict"])

    def test_note_keeps_line_breaks_and_rejects_overlong_text(self):
        doc = clean_sponsor_request({**VALID, "note": "  line one\r\nline two  "})
        self.assertEqual(doc["note"], "line one\nline two")
        with self.assertRaisesRegex(ValueError, "too long"):
            clean_sponsor_request({**VALID, "note": "x" * 2001})

    def test_public_page_uses_the_agreed_copy(self):
        page = (ROOT.parent / "ui" / "src" / "components" / "sponcerpage.tsx").read_text()
        for snippet in (
            "Sponsor the Race",
            "Put your brand on a race people actually play.",
            "What you can sponsor",
            "Your name on a race, or a series of races.",
            "A weekly championship can also put your brand over the on-demand races.",
            "Why it works",
            "On-demand means they can play your race again",
            "Talk to us",
            "Send request",
            "We will reply by email.",
            "/api/sponsor-requests",
        ):
            self.assertIn(snippet, page)
        lowered = page.lower()
        for banned in (
            "docs.google.com/forms",
            "apply now",
            "weekly broadcast",
            "on-demand per player",
            "your ball",
            "on purpose",
            "offline",
            "pins",
        ):
            self.assertNotIn(banned, lowered)

    def test_race_desk_list_is_private(self):
        main = (ROOT / "main.py").read_text()
        module = (ROOT / "sponsor_requests.py").read_text()
        self.assertIn("register_sponsor_routes(", main)
        self.assertIn("require_login=require_login", main)
        self.assertNotIn('@app.get("/api/sponsor-requests")', main)
        self.assertNotIn('@app.get("/api/sponsor-requests")', module)
        start = module.index("async def create_sponsor_request")
        middle = module.index("async def sponsor_requests_page")
        create_handler = module[start:middle]
        list_handler = module[middle:]
        self.assertIn("clean_sponsor_request", create_handler)
        self.assertIn("sponsor_requests.insert_one", create_handler)
        self.assertIn("deliver", create_handler)
        self.assertIn("require_login", list_handler)
        self.assertEqual(SPONSOR_INBOX, "hello@pinballrace.com")
        self.assertIn("smtp.sendmail(user, [SPONSOR_INBOX]", module)
        self.assertIn("private, no-store", list_handler)
        for name in (
            "dashboard.html",
            "lp.html",
            "analytics.html",
            "past_winners.html",
            "nonlivegames.html",
            "championships.html",
            "email_all.html",
            "sponsor_requests.html",
        ):
            self.assertIn('href="/sponsor-requests"', (ROOT / "templates" / name).read_text())


class _Collection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)


class _Cursor:
    def __init__(self, docs):
        self.docs = list(docs)
        self._limit = None

    def sort(self, key, direction):
        self.docs.sort(key=lambda doc: doc.get(key) or 0, reverse=direction == -1)
        return self

    def limit(self, count):
        self._limit = count
        return self

    async def to_list(self, length=None):
        docs = self.docs if self._limit is None else self.docs[: self._limit]
        return docs


class _Templates:
    """Call style used by the rest of api2: TemplateResponse(name, context)."""

    def __init__(self, directory: str):
        self.inner = Jinja2Templates(directory=directory)

    def TemplateResponse(self, name, context, **kwargs):
        return self.inner.TemplateResponse(context["request"], name, context, **kwargs)


class SponsorRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = type("DB", (), {})()
        self.db.sponsor_requests = _Collection()
        self.sent = []

        def mailer(doc):
            self.sent.append(dict(doc))

        self.client = self._client(mailer)

    def _client(self, mailer):
        async def require_login(request: Request):
            if request.cookies.get("session_id") != "desk":
                raise HTTPException(status_code=401, detail="Authentication required")
            return "gregg"

        app = FastAPI()
        register_sponsor_routes(
            app,
            db=self.db,
            require_login=require_login,
            templates=_Templates(str(ROOT / "templates")),
            format_timestamp=lambda ts: f"ts:{ts}",
            mailer=mailer,
        )
        return TestClient(app)

    def _open_desk(self):
        self.client.cookies.set("session_id", "desk")
        return self.client.get("/sponsor-requests")

    def test_save_is_private_and_listed_only_for_the_desk(self):
        saved = self.client.post("/api/sponsor-requests", json={
            **VALID,
            "note": "Hello <script>alert(1)</script>",
        })
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json(), {"ok": True})
        self.assertEqual(saved.headers["cache-control"], "no-store")
        self.assertNotIn("email", saved.json())
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]["email"], "ada@example.com")
        self.assertNotIn("createdAt", self.sent[0])

        public = self.client.get("/api/sponsor-requests")
        self.assertEqual(public.status_code, 405)
        self.assertNotIn("Ada Lovelace", public.text)

        logged_out = self.client.get("/sponsor-requests", follow_redirects=False)
        self.assertIn(logged_out.status_code, (302, 307))
        self.assertEqual(logged_out.headers["location"], "/login")
        self.assertNotIn("Ada Lovelace", logged_out.text)

        desk = self._open_desk()
        self.assertEqual(desk.status_code, 200)
        self.assertIn("private, no-store", desk.headers["cache-control"])
        self.assertIn("Ada Lovelace", desk.text)
        self.assertIn("Analytical Engines", desk.text)
        self.assertIn("ada@example.com", desk.text)
        self.assertIn("&lt;script&gt;", desk.text)
        self.assertNotIn("<script>alert", desk.text)

    def test_invalid_request_is_not_stored_or_emailed(self):
        rejected = self.client.post("/api/sponsor-requests", json={**VALID, "email": "nope"})
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(self.db.sponsor_requests.docs, [])
        self.assertEqual(self.sent, [])

    def test_mail_failure_keeps_the_desk_copy_and_does_not_confirm(self):
        def mailer(_doc):
            raise RuntimeError("mail is down")

        client = self._client(mailer)
        saved = client.post("/api/sponsor-requests", json=VALID)
        self.assertEqual(saved.status_code, 500)
        self.assertNotEqual(saved.json().get("ok"), True)
        self.assertEqual(len(self.db.sponsor_requests.docs), 1)

    def test_newest_request_is_first_and_the_list_is_capped(self):
        for index in range(201):
            self.db.sponsor_requests.docs.append({
                **clean_sponsor_request(VALID),
                "name": f"Person {index}",
                "createdAt": index,
            })
        desk = self._open_desk()
        self.assertLess(desk.text.index("Person 200"), desk.text.index("Person 199"))
        self.assertNotIn("Person 0", desk.text)


class SponsorEmailTests(unittest.TestCase):
    def test_message_is_addressed_only_to_the_inbox(self):
        sent = {}

        class FakeSMTP:
            def __init__(self, host, port, timeout=None):
                sent["init"] = (host, port, timeout)

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def starttls(self):
                sent["tls"] = True

            def login(self, user, password):
                sent["login"] = (user, password)

            def sendmail(self, from_addr, to_addrs, message):
                sent["mail"] = (from_addr, to_addrs, message)

        doc = clean_sponsor_request(VALID)
        with patch.dict(os.environ, {"SMTP_USER": "desk@example.com", "SMTP_PASS": "secret", "SMTP_HOST": "smtp.example.test", "SMTP_PORT": "587"}):
            with patch("sponsor_requests.smtplib.SMTP", FakeSMTP):
                send_sponsor_request_email(doc)

        from_addr, to_addrs, raw = sent["mail"]
        parsed = message_from_string(raw)
        body = parsed.get_payload(decode=True).decode("utf-8")
        self.assertEqual(from_addr, "desk@example.com")
        self.assertEqual(to_addrs, ["hello@pinballrace.com"])
        self.assertNotIn("ada@example.com", to_addrs)
        self.assertEqual(parsed["To"], "hello@pinballrace.com")
        self.assertEqual(parsed["Reply-To"], "ada@example.com")
        self.assertEqual(parsed["Subject"], "Sponsorship request from Analytical Engines")
        self.assertIn("What they want to sponsor: Championship", body)
        self.assertEqual(sent["init"], ("smtp.example.test", 587, 20))
        self.assertTrue(sent["tls"])

    def test_missing_smtp_secret_does_not_open_a_connection(self):
        def refuse(*_args, **_kwargs):
            raise AssertionError("SMTP was contacted")

        env = os.environ.copy()
        env.pop("SMTP_USER", None)
        env.pop("SMTP_PASS", None)
        with patch.dict(os.environ, env, clear=True):
            with patch("sponsor_requests.smtplib.SMTP", refuse):
                with self.assertRaisesRegex(RuntimeError, "SMTP_USER"):
                    send_sponsor_request_email(clean_sponsor_request(VALID))

    def test_sender_cannot_be_pointed_at_another_address(self):
        source = (ROOT / "sponsor_requests.py").read_text()
        send = source[source.index("def _smtp_send_to_inbox"): source.index("def register_sponsor_routes")]
        self.assertIn("smtp.sendmail(user, [SPONSOR_INBOX]", send)
        self.assertNotIn("sendmail(user, reply_to", send)
        self.assertNotIn("sendmail(user, doc", send)
        # The helper takes no recipient, so a caller cannot redirect the envelope.
        self.assertNotIn("def _smtp_send_to_inbox(self", send)
        signature = send.split(":", 1)[0]
        self.assertNotIn("recipient", signature)
        self.assertNotIn("to_addrs", signature)


if __name__ == "__main__":
    unittest.main()
