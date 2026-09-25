import assert from "node:assert/strict";
import test from "node:test";
import { loadSignedInPlayer, playerFromPayload, readUserIdCookie } from "./player.ts";

test("reads the Google userId cookie and ignores other cookies", () => {
  assert.equal(readUserIdCookie("token=abc; userId=507f1f77bcf86cd799439011"), "507f1f77bcf86cd799439011");
  assert.equal(readUserIdCookie("theme=dark"), null);
  assert.equal(readUserIdCookie(""), null);
});

test("reads a user document or a { user } envelope, not a growth flag body", () => {
  assert.equal(playerFromPayload(null), null);
  assert.equal(playerFromPayload({ msg: "No token found" }), null);
  assert.equal(playerFromPayload({ enabled: false, flag: "growth_challenges", found: false }), null);
  const bare = playerFromPayload({ _id: "u1", username: "Wander Rings", email: "g@example.com" });
  assert.equal(bare?._id, "u1");
  assert.equal(bare?.username, "Wander Rings");
  const wrapped = playerFromPayload({
    user: { _id: "u2", username: "ada", connectedAccounts: { google: true } },
  });
  assert.equal(wrapped?._id, "u2");
  assert.equal(wrapped?.connectedAccounts?.google, true);
});

test("a missing /api/user/me still yields the signed-in player", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/user/me")) {
      return new Response("<pre>Cannot GET /api/user/me</pre>", { status: 404, headers: { "Content-Type": "text/html" } });
    }
    if (url.endsWith("/get_profile")) {
      return new Response(JSON.stringify({ user: { _id: "u9", username: "Wander Rings", pfp: "https://example.com/a.png" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("nope", { status: 500 });
  };

  const player = await loadSignedInPlayer("https://pinballrace.com:8080", fetchImpl, "userId=from-cookie");
  assert.equal(player?._id, "u9");
  assert.equal(player?.username, "Wander Rings");
});

test("when both profile routes fail, the userId cookie still unlocks ball pick", async () => {
  const fetchImpl: typeof fetch = async () => new Response("nope", { status: 404 });
  const player = await loadSignedInPlayer("https://pinballrace.com:8080", fetchImpl, "userId=cookie-id");
  assert.deepEqual(player, { _id: "cookie-id" });
});
