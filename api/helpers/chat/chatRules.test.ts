import assert from "assert";
import { describe, it } from "node:test";
import {
  CHAT_COPY,
  CHAT_LIMITS,
  containsRawLink,
  dominantSanction,
  expiryForDuration,
  findBlockedTerm,
  isSanctionActive,
  takeSendSlot,
  validateMessageText,
} from "./chatRules";

describe("global chat rules", () => {
  it("rejects raw http and https links and keeps ordinary text", () => {
    assert.strictEqual(containsRawLink("see https://pinballrace.com"), true);
    assert.strictEqual(containsRawLink("HTTP://example.com/x"), true);
    assert.strictEqual(containsRawLink("talk about http later"), false);
    assert.strictEqual(containsRawLink("nice race"), false);

    const blocked = validateMessageText("clip at https://example.com");
    assert.strictEqual(blocked.ok, false);
    if (!blocked.ok) {
      assert.strictEqual(blocked.code, "links");
      assert.strictEqual(blocked.message, CHAT_COPY.linksBlocked);
    }
  });

  it("rejects the block list as whole words, case-insensitive", () => {
    assert.ok(findBlockedTerm("this is Shit"));
    assert.strictEqual(findBlockedTerm("classic race"), null);
    assert.strictEqual(findBlockedTerm("assignment"), null);

    const blocked = validateMessageText("oh fuck off");
    assert.strictEqual(blocked.ok, false);
    if (!blocked.ok) {
      assert.strictEqual(blocked.code, "blocked");
      assert.strictEqual(blocked.message, CHAT_COPY.blocked);
    }
  });

  it("caps length at 160 code points", () => {
    const ok = validateMessageText("a".repeat(CHAT_LIMITS.maxLength));
    assert.strictEqual(ok.ok, true);
    const tooLong = validateMessageText("a".repeat(CHAT_LIMITS.maxLength + 1));
    assert.strictEqual(tooLong.ok, false);
    if (!tooLong.ok) assert.strictEqual(tooLong.message, CHAT_COPY.tooLong);

    const emoji = "🎲".repeat(CHAT_LIMITS.maxLength);
    assert.strictEqual(validateMessageText(emoji).ok, true);
  });

  it("enforces 1 message / 3s and 5 / minute", () => {
    const buckets = new Map<string, number[]>();
    const start = 1_000_000;
    assert.strictEqual(takeSendSlot("u", start, buckets), true);
    assert.strictEqual(takeSendSlot("u", start + 1000, buckets), false);
    assert.strictEqual(takeSendSlot("u", start + 3000, buckets), true);
    assert.strictEqual(takeSendSlot("u", start + 6000, buckets), true);
    assert.strictEqual(takeSendSlot("u", start + 9000, buckets), true);
    assert.strictEqual(takeSendSlot("u", start + 12000, buckets), true);
    assert.strictEqual(takeSendSlot("u", start + 15000, buckets), false);
    assert.strictEqual(takeSendSlot("other", start + 15000, buckets), true);
  });

  it("lets a ban override a mute, and ignores expired or revoked rows", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const mute = { type: "mute" as const, expiresAt: null, revokedAt: null };
    const ban = {
      type: "ban" as const,
      expiresAt: null,
      revokedAt: null,
    };
    assert.strictEqual(dominantSanction([mute, ban], now)?.type, "ban");
    assert.strictEqual(
      isSanctionActive({ type: "mute", expiresAt: "2026-10-01T11:00:00Z", revokedAt: null }, now),
      false
    );
    assert.strictEqual(
      isSanctionActive({ type: "mute", expiresAt: null, revokedAt: now.toISOString() }, now),
      false
    );
    assert.strictEqual(dominantSanction([mute], now)?.type, "mute");
  });

  it("maps desk mute durations", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const hour = expiryForDuration("1h", now);
    assert.ok(hour instanceof Date);
    assert.strictEqual(hour!.getTime() - now.getTime(), 60 * 60 * 1000);
    assert.strictEqual(expiryForDuration("indefinite", now), null);
    assert.strictEqual(expiryForDuration("nope", now), undefined);
  });
});
