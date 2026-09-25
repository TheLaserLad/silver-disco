# Plain unittest for the growth page client. No Mongo and no player API required.
# Run from api2/:  python3 -m unittest test_growth_client.py

import json
import os
import threading
import unittest
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from zoneinfo import ZoneInfo

from growth_client import (
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

UK = ZoneInfo("Europe/London")


def _defaults_form():
    parsed, errors = parse_form({})
    return parsed, errors


class DefaultsTest(unittest.TestCase):
    def test_switches_default_off_and_numbers_match_spec(self):
        panel = present_panel({}, today=datetime(2026, 9, 25, 12, tzinfo=UK))
        self.assertTrue(all(field["value"] is False for field in panel["switches"]))
        numbers = {field["id"]: field["value"] for field in panel["numbers"]}
        self.assertEqual(numbers["daily_play_limit"], 5)
        self.assertEqual(numbers["bonus_play_cap"], 5)
        self.assertEqual(numbers["welcome_bonus"], 1)
        self.assertEqual(numbers["challenge_ttl"], 7)
        self.assertEqual(numbers["world_share_cap"], 3)
        self.assertEqual(numbers["share_day_mode"], "share_or_copy")
        self.assertEqual(numbers["share_day_weekday"], "")
        self.assertEqual(numbers["share_day_date"], "")
        self.assertEqual(len(panel["counters"]["days"]), 7)
        self.assertEqual(panel["counters"]["days"][-1]["date"], "2026-09-25")
        self.assertEqual(panel["counters"]["today"]["invite_land"], 0)
        self.assertEqual(panel["counters"]["week"]["challenge_create"], 0)

    def test_save_of_defaults_does_not_turn_anything_on(self):
        parsed, errors = _defaults_form()
        self.assertEqual(errors, [])
        updated = build_settings_update({}, parsed, {})
        self.assertEqual(updated, {})
        self.assertNotIn("sendEmail", updated)
        self.assertNotIn("emailPlayers", updated)

    def test_unchecked_switch_turns_off_even_if_it_was_on(self):
        parsed, _errors = parse_form({})
        updated = build_settings_update({"invitesEnabled": True, "dailyPlayLimit": 5}, parsed, {})
        self.assertIs(updated["invitesEnabled"], False)

    def test_only_the_ticked_switch_is_added(self):
        parsed, _errors = parse_form({"invites": "1"})
        updated = build_settings_update({}, parsed, {})
        self.assertEqual(updated, {"invitesEnabled": True})

    def test_existing_alias_is_reused_and_unknown_keys_stay(self):
        parsed, _errors = parse_form({"invites": "1", "daily_play_limit": "5"})
        updated = build_settings_update(
            {"growth_invites": 0, "mystery": "keep", "dailyPlayLimit": 5},
            parsed,
            {},
        )
        self.assertEqual(updated["growth_invites"], 1)
        self.assertNotIn("invitesEnabled", updated)
        self.assertEqual(updated["mystery"], "keep")
        self.assertEqual(updated["dailyPlayLimit"], 5)

    def test_env_forced_value_is_not_overwritten(self):
        payload = {
            "settings": {"dailyPlayLimit": 9, "invitesEnabled": False},
            "envForced": {"dailyPlayLimit": "GROWTH_DAILY_PLAY_LIMIT"},
        }
        panel = present_panel(payload)
        daily = next(field for field in panel["numbers"] if field["id"] == "daily_play_limit")
        self.assertTrue(daily["forced"])
        self.assertIn("GROWTH_DAILY_PLAY_LIMIT", daily["forced_note"])
        self.assertEqual(daily["value"], 9)
        parsed, _errors = parse_form({"daily_play_limit": "1", "invites": "1"})
        previous, style = extract_settings(payload)
        self.assertEqual(style, "nested")
        updated = build_settings_update(previous, parsed, extract_forced(payload, previous))
        self.assertEqual(updated["dailyPlayLimit"], 9)
        self.assertIs(updated["invitesEnabled"], True)

    def test_forced_switch_stays_on_when_the_checkbox_is_omitted(self):
        previous = {"invitesEnabled": True}
        forced = {"invitesEnabled": "server environment"}
        parsed, _errors = parse_form({})
        updated = build_settings_update(previous, parsed, forced)
        self.assertIs(updated["invitesEnabled"], True)

    def test_counters_and_invites_and_actions(self):
        payload = {
            "settings": {"playLedgerEnabled": False},
            "topInviters": [{"username": "ada", "firstRaces": 2}],
            "counters": {
                "today": {"invite_land": 1},
                "week": {"invite_signup": 4},
                "last7": [{"date": "2026-09-25", "invite_land": 1, "bonus_extra": 3}],
            },
            "recentActions": [
                {"at": "2026-09-25T10:00:00Z", "action": "revoke", "username": "bob", "detail": "invites"}
            ],
        }
        panel = present_panel(payload, today=datetime(2026, 9, 25, 12, tzinfo=UK))
        self.assertEqual(panel["top_inviters"], [{"username": "ada", "first_races": 2}])
        self.assertEqual(panel["counters"]["today"]["invite_land"], 1)
        self.assertEqual(panel["counters"]["today"]["invite_signup"], 0)
        self.assertEqual(panel["counters"]["week"]["invite_signup"], 4)
        self.assertEqual(panel["counters"]["days"][0]["counts"]["bonus_extra"], 3)
        self.assertEqual(panel["actions"][0]["action"], "revoke")
        graph = present_invites(
            {"invites": [{"username": "bea", "status": "first_race"}]},
            "ada",
        )
        self.assertEqual(graph["rows"][0]["status"], "First race")

    def test_bad_numbers_are_rejected(self):
        _parsed, errors = parse_form({"daily_play_limit": "nope", "challenge_ttl": "0"})
        self.assertTrue(errors)

    def test_tool_bodies_do_not_grow_extra_fields(self):
        self.assertEqual(revoke_body("ada"), {"username": "ada"})
        self.assertEqual(
            clawback_body("ada", "2026-09-25", 2),
            {"username": "ada", "date": "2026-09-25", "amount": 2},
        )

    def test_mongo_uri_is_not_shown_to_the_operator(self):
        message = safe_operator_error(RuntimeError("failed mongodb://admin:secret@db/pinball"))
        self.assertNotIn("secret", message)
        self.assertNotIn("mongodb://", message)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, content_type="application/json"):
        raw = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length)

    def do_GET(self):
        cookie = self.headers.get("Cookie") or ""
        self.server.seen.append(("GET", self.path, cookie))
        if "email" in self.path:
            self._send(500, json.dumps({"error": "email was called"}))
            return
        if "adminToken=good" not in cookie:
            self._send(500, "<pre>User not authenticated.</pre>", "text/html")
            return
        if self.path.startswith("/admin/growth/invites"):
            self._send(200, json.dumps({"invites": [{"username": "bea", "status": "landed"}]}))
            return
        self._send(200, json.dumps({"settings": {"invitesEnabled": False, "dailyPlayLimit": 5}}))

    def do_POST(self):
        raw = self._read()
        cookie = self.headers.get("Cookie") or ""
        self.server.seen.append(("POST", self.path, cookie, raw))
        if "email" in self.path:
            self._send(500, json.dumps({"error": "email was called"}))
            return
        if "adminToken=good" not in cookie:
            self._send(500, "<pre>User not authenticated.</pre>", "text/html")
            return
        if self.path == "/admin/growth/settings":
            data = json.loads(raw.decode() or "{}")
            if "settings" in data:
                self._send(400, json.dumps({"error": "use a flat settings document"}))
                return
            self._send(200, json.dumps({"ok": True}))
            return
        self._send(200, json.dumps({"ok": True, "path": self.path}))

    def log_message(self, fmt, *args):
        return


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.server.seen = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base = f"http://{host}:{port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=3)

    def test_auth_fallback_then_flat_save_without_email(self):
        result, token = request_with_tokens(self.base, ["bad", "good"], "GET", "/admin/growth")
        self.assertEqual(token, "good")
        self.assertIn("settings", result)
        self.assertEqual(len(self.server.seen), 2)

        saved, used = post_settings(
            self.base,
            ["bad", "good"],
            {"invitesEnabled": False, "dailyPlayLimit": 5},
            "try-nested",
        )
        self.assertEqual(used, "good")
        self.assertEqual(saved, {"ok": True})
        posts = [item for item in self.server.seen if item[0] == "POST"]
        self.assertTrue(posts)
        self.assertTrue(all(item[1] == "/admin/growth/settings" for item in posts))
        self.assertNotIn("email", " ".join(item[1] for item in self.server.seen))
        flat = json.loads(posts[-1][3].decode())
        self.assertNotIn("settings", flat)
        self.assertIs(flat["invitesEnabled"], False)
        self.assertNotIn("sendEmail", flat)

        revoke, _token = request_with_tokens(
            self.base, ["good"], "POST", "/admin/growth/revoke", revoke_body("ada")
        )
        self.assertTrue(revoke["ok"])
        body = json.loads(self.server.seen[-1][3].decode())
        self.assertEqual(body, {"username": "ada"})


class PageFilesTest(unittest.TestCase):
    def test_growth_nav_is_on_the_desk_pages(self):
        import os

        folder = os.path.join(os.path.dirname(__file__), "templates")
        for name in os.listdir(folder):
            if not name.endswith(".html") or name == "login.html":
                continue
            with open(os.path.join(folder, name), encoding="utf-8") as handle:
                text = handle.read()
            self.assertIn('href="/growth"', text, name)
        with open(os.path.join(folder, "growth.html"), encoding="utf-8") as handle:
            growth = handle.read()
        for label in (
            "Switches",
            "Numbers",
            "Top inviters this UK week",
            "Revoke invite privileges",
            "Claw back unused bonus plays",
            "Invite graph",
            "Last 7 UK days",
            "Recent admin actions",
            "Save growth settings",
        ):
            self.assertIn(label, growth)
        from growth_client import FIELDS

        labels = {field["label"] for field in FIELDS}
        for label in (
            "Play ledger",
            "Invites",
            "Challenges",
            "Share day",
            "Friends",
            "Email capture",
            "World share",
            "Daily play limit",
            "Welcome bonus plays",
        ):
            self.assertIn(label, labels)
        self.assertNotIn("mailto:", growth)
        self.assertNotIn("/api/email", growth)


class RouteTest(unittest.TestCase):
    def test_guests_are_sent_to_login_and_save_stays_off(self):
        try:
            from fastapi import FastAPI
            from fastapi.testclient import TestClient
            import growth_admin
        except ImportError as exc:
            self.skipTest(str(exc))

        app = FastAPI()
        app.include_router(growth_admin.router)
        client = TestClient(app)
        guest = client.get("/growth", follow_redirects=False)
        self.assertEqual(guest.status_code, 302)
        self.assertEqual(guest.headers["location"], "/login")
        # A Node adminToken is not the race-desk session.
        node_cookie = client.get("/growth", cookies={"adminToken": "not-a-desk-session"}, follow_redirects=False)
        self.assertEqual(node_cookie.status_code, 302)
        self.assertEqual(node_cookie.headers["location"], "/login")
        blocked = client.post("/growth/settings", data={"invites": "1"}, follow_redirects=False)
        self.assertEqual(blocked.status_code, 302)
        self.assertEqual(blocked.headers["location"], "/login")

        seen = []

        class Accept(BaseHTTPRequestHandler):
            def _send(self, code, body):
                raw = body.encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                seen.append(("GET", self.path))
                if self.path.startswith("/admin/growth/invites"):
                    self._send(200, json.dumps({"invites": [{"username": "bea", "status": "signed_up"}]}))
                    return
                self._send(
                    200,
                    json.dumps(
                        {
                            "settings": {
                                "playLedgerEnabled": False,
                                "invitesEnabled": False,
                                "challengesEnabled": False,
                                "shareDayEnabled": False,
                                "friendsEnabled": False,
                                "emailCaptureEnabled": False,
                                "worldShareEnabled": False,
                                "dailyPlayLimit": 5,
                                "bonusPlayCapPerDay": 5,
                                "welcomeBonusPlays": 1,
                                "challengeTtlDays": 7,
                                "worldShareSpendCap": 3,
                                "shareDayMode": "share_or_copy",
                            },
                            "envForced": {},
                            "topInviters": [],
                            "counters": {"today": {}, "week": {}, "last7": []},
                            "recentActions": [],
                        }
                    ),
                )

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                seen.append(("POST", self.path, raw))
                self._send(200, json.dumps({"ok": True}))

            def log_message(self, fmt, *args):
                return

        server = HTTPServer(("127.0.0.1", 0), Accept)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host, port = server.server_address
        original = growth_admin.require_admin

        async def as_gregg(_request):
            return "Gregg"

        growth_admin.require_admin = as_gregg
        old_base = os.environ.get("PLAYER_API_BASE_URL")
        old_token = os.environ.get("PLAYER_API_ADMIN_TOKEN")
        os.environ["PLAYER_API_BASE_URL"] = f"http://{host}:{port}"
        os.environ.pop("PLAYER_API_ADMIN_TOKEN", None)
        try:
            missing = client.get("/growth")
            self.assertEqual(missing.status_code, 200)
            self.assertIn("does not sign into the player service", missing.text)
            self.assertIn(">Off<", missing.text)
            self.assertEqual(seen, [])
            os.environ["PLAYER_API_ADMIN_TOKEN"] = "good"
            page = client.get("/growth")
            self.assertEqual(page.status_code, 200)
            self.assertIn("Play ledger", page.text)
            self.assertIn(">Off<", page.text)
            self.assertIn('name="play_ledger"', page.text)
            self.assertNotRegex(page.text.split("<h3>Numbers</h3>")[0], r"checked")
            self.assertIn('value="5"', page.text)
            saved = client.post("/growth/settings", data={"daily_play_limit": "5"}, follow_redirects=False)
            self.assertEqual(saved.status_code, 303)
            self.assertEqual(saved.headers["location"], "/growth?notice=saved")
            posts = [item for item in seen if item[0] == "POST"]
            self.assertEqual(len(posts), 1)
            self.assertEqual(posts[0][1], "/admin/growth/settings")
            body = json.loads(posts[0][2].decode())
            settings = body["settings"]
            for key in (
                "playLedgerEnabled",
                "invitesEnabled",
                "challengesEnabled",
                "shareDayEnabled",
                "friendsEnabled",
                "emailCaptureEnabled",
                "worldShareEnabled",
            ):
                self.assertIs(settings[key], False)
            self.assertNotIn("sendEmail", settings)
            self.assertTrue(all("email" not in item[1] for item in seen))
            looked = client.get("/growth?lookup=ada")
            self.assertEqual(looked.status_code, 200)
            self.assertIn("Signed up", looked.text)
            self.assertIn("bea", looked.text)
        finally:
            growth_admin.require_admin = original
            if old_base is None:
                os.environ.pop("PLAYER_API_BASE_URL", None)
            else:
                os.environ["PLAYER_API_BASE_URL"] = old_base
            if old_token is None:
                os.environ.pop("PLAYER_API_ADMIN_TOKEN", None)
            else:
                os.environ["PLAYER_API_ADMIN_TOKEN"] = old_token
            server.shutdown()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
