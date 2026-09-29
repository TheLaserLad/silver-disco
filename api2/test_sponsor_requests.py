import unittest
from pathlib import Path

from sponsor_requests import SPONSOR_OPTIONS, clean_sponsor_request


ROOT = Path(__file__).resolve().parent
VALID = {
    "name": "Ada Lovelace",
    "brand": "Analytical Engines",
    "email": "ada@example.com",
    "sponsorship": "Your ball",
    "budget": "a few hundred",
    "note": "We would like ball 7 in our colours.",
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
                "Your ball",
                "Winner moment",
                "Giveaway",
                "Live race",
                "Championship",
                "Other",
            ),
        )

    def test_rejects_unknown_sponsorship(self):
        with self.assertRaises(ValueError):
            clean_sponsor_request({**VALID, "sponsorship": "pins"})

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
            "One of the numbered balls in your colours",
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
            "offline",
            "pins",
        ):
            self.assertNotIn(banned, lowered)

    def test_race_desk_list_is_private(self):
        main = (ROOT / "main.py").read_text()
        self.assertIn('@app.post("/api/sponsor-requests")', main)
        self.assertNotIn('@app.get("/api/sponsor-requests")', main)
        start = main.index("async def create_sponsor_request")
        middle = main.index("async def sponsor_requests_page")
        end = main.index("@app.get(\"/api/admin/download-database\")")
        create_handler = main[start:middle]
        list_handler = main[middle:end]
        self.assertIn("clean_sponsor_request", create_handler)
        self.assertIn("sponsor_requests.insert_one", create_handler)
        self.assertNotIn("smtp", create_handler.lower())
        self.assertIn("require_login", list_handler)
        self.assertIn("private, no-store", list_handler)
        self.assertIn('href="/sponsor-requests"', (ROOT / "templates" / "sponsor_requests.html").read_text())
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


if __name__ == "__main__":
    unittest.main()
