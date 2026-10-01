import { BLOCKED_PHRASES, BLOCKED_WORDS } from "./blockedWords";

/** Player-facing strings. Keep in step with DRAFT-COPY. */
export const CHAT_COPY = {
  tooLong: "Keep it under 160 characters.",
  rateLimited: "Slow down a second…",
  blocked: "Message blocked.",
  sendFailed: "Couldn’t send — try again.",
  notSignedIn: "Sign in to chat.",
  linksBlocked: "Links aren’t allowed in chat.",
  mutedComposer: "You’re muted in chat. You can still play.",
  bannedPanel: "You’re banned from chat. You can still race.",
  bannedShort: "Chat unavailable.",
  alreadyReported: "Already reported.",
  empty: "Say something…",
} as const;

export const CHAT_LIMITS = {
  maxLength: 160,
  minGapMs: 3000,
  maxPerMinute: 5,
  historyOnOpen: 50,
  deskRecent: 100,
  retainMessages: 500,
} as const;

export const GLOBAL_ROOM = "global";

export type ChatErrorCode =
  | "empty"
  | "too_long"
  | "rate_limited"
  | "blocked"
  | "links"
  | "send_failed"
  | "not_signed_in"
  | "muted"
  | "banned"
  | "own_message"
  | "not_found";

export type RuleFailure = { ok: false; code: ChatErrorCode; message: string };
export type RuleOk = { ok: true; text: string };

const LINK_RE = /https?:\/\//i;

export function containsRawLink(text: string): boolean {
  return LINK_RE.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive. Phrases match anywhere. Words match as whole tokens so
 * "class" does not trip a shorter block.
 */
export function findBlockedTerm(text: string): string | null {
  const hay = text.toLowerCase();
  for (const phrase of BLOCKED_PHRASES) {
    if (phrase && hay.includes(phrase.toLowerCase())) return phrase;
  }
  for (const word of BLOCKED_WORDS) {
    if (!word) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}([^a-z0-9]|$)`, "i");
    if (re.test(text)) return word;
  }
  return null;
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Length, links, and the word filter. Rate limit and sanctions are separate. */
export function validateMessageText(raw: unknown): RuleOk | RuleFailure {
  if (typeof raw !== "string") {
    return { ok: false, code: "empty", message: CHAT_COPY.empty };
  }
  const text = raw.trim();
  if (!text) {
    return { ok: false, code: "empty", message: CHAT_COPY.empty };
  }
  if (codePointLength(text) > CHAT_LIMITS.maxLength) {
    return { ok: false, code: "too_long", message: CHAT_COPY.tooLong };
  }
  if (containsRawLink(text)) {
    return { ok: false, code: "links", message: CHAT_COPY.linksBlocked };
  }
  if (findBlockedTerm(text)) {
    return { ok: false, code: "blocked", message: CHAT_COPY.blocked };
  }
  return { ok: true, text };
}

export type RateBuckets = Map<string, number[]>;

/**
 * 1 message / 3s, and at most 5 in a rolling minute.
 * Call only for attempts that should consume a slot (accepted or abusive).
 */
export function takeSendSlot(
  userId: string,
  now: number,
  buckets: RateBuckets
): boolean {
  const windowStart = now - 60_000;
  const recent = (buckets.get(userId) || []).filter((stamp) => stamp > windowStart);
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < CHAT_LIMITS.minGapMs) {
    buckets.set(userId, recent);
    return false;
  }
  if (recent.length >= CHAT_LIMITS.maxPerMinute) {
    buckets.set(userId, recent);
    return false;
  }
  recent.push(now);
  buckets.set(userId, recent);
  return true;
}

export type SanctionKind = "mute" | "ban";

export type SanctionLike = {
  type: SanctionKind;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function isSanctionActive(sanction: SanctionLike, now = new Date()): boolean {
  if (sanction.revokedAt) return false;
  if (sanction.expiresAt == null || sanction.expiresAt === "") return true;
  const expiry = new Date(sanction.expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return expiry > now.getTime();
}

function createdMs(sanction: SanctionLike): number {
  if (!sanction.createdAt) return 0;
  const time = new Date(sanction.createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Newest active ban wins over any mute. Chat-only; does not affect racing. */
export function dominantSanction<T extends SanctionLike>(
  list: T[],
  now = new Date()
): T | null {
  const active = list.filter((item) => isSanctionActive(item, now));
  const newest = (type: SanctionKind) =>
    active
      .filter((item) => item.type === type)
      .sort((a, b) => createdMs(b) - createdMs(a))[0] || null;
  return newest("ban") || newest("mute");
}

export const MUTE_DURATIONS = ["1h", "24h", "7d", "indefinite"] as const;
export type MuteDuration = (typeof MUTE_DURATIONS)[number];

export function expiryForDuration(duration: string, now = new Date()): Date | null | undefined {
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "24h"
        ? 24 * 60 * 60 * 1000
        : duration === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : duration === "indefinite"
            ? null
            : undefined;
  if (ms === undefined) return undefined;
  if (ms === null) return null;
  return new Date(now.getTime() + ms);
}
