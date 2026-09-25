/**
 * Growth flags from the live player API (pinballrace.com:8080).
 * Every switch defaults off. If a payload is missing, not JSON, or not
 * explicitly enabled, the matching screen stays hidden.
 *
 * Alias names match the race-desk Growth page, which reads the same settings.
 */

export const FLAG_ALIASES = {
  play_ledger: ["playLedgerEnabled", "playLedger", "growth_play_ledger", "growthPlayLedger"],
  invites: ["invitesEnabled", "growth_invites", "growthInvites", "invites"],
  challenges: ["challengesEnabled", "growth_challenges", "growthChallenges", "challenges"],
  share_day: ["shareDayEnabled", "growth_share_day", "growthShareDay", "shareDay"],
  friends: ["friendsEnabled", "growth_friends", "growthFriends", "followsEnabled", "friends"],
} as const;

export type GrowthFlag = keyof typeof FLAG_ALIASES;

export interface GrowthPerson {
  id: string;
  username: string;
}

export interface GrowthChallenge {
  id: string;
  title: string;
  detail: string;
}

export interface GrowthSnapshot {
  playLedger: {
    enabled: boolean;
    playsLeft: number | null;
    limit: number | null;
    outOfPlays: boolean;
  };
  invites: {
    enabled: boolean;
    code: string | null;
    link: string | null;
    inviterName: string | null;
  };
  challenges: {
    enabled: boolean;
    items: GrowthChallenge[];
  };
  friends: {
    enabled: boolean;
    people: GrowthPerson[];
    activeToday: GrowthPerson[];
    followingIds: string[];
  };
  shareDay: {
    enabled: boolean;
    url: string | null;
    unlocked: boolean;
    mode: string | null;
  };
}

export const EMPTY_GROWTH: GrowthSnapshot = {
  playLedger: { enabled: false, playsLeft: null, limit: null, outOfPlays: false },
  invites: { enabled: false, code: null, link: null, inviterName: null },
  challenges: { enabled: false, items: [] },
  friends: { enabled: false, people: [], activeToday: [], followingIds: [] },
  shareDay: { enabled: false, url: null, unlocked: false, mode: null },
};

/** Id used only to read the challenges switch. It is not a real challenge. */
export const CHALLENGE_FLAG_PROBE = "growth-flag-check";

/** Set by /c/:id so a later home visit can open that race only if challenges are on. */
export const CHALLENGE_RETURN_KEY = "pinballrace.challenge";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function flagNames(flag: GrowthFlag): Set<string> {
  return new Set([flag, `growth_${flag}`, ...FLAG_ALIASES[flag]]);
}

function explicitSwitch(record: Record<string, unknown>, flag: GrowthFlag): boolean | null {
  const settings = asRecord(record.settings);
  const pools = settings ? [record, settings] : [record];
  for (const pool of pools) {
    for (const key of FLAG_ALIASES[flag]) {
      if (pool[key] === false) return false;
    }
  }
  for (const pool of pools) {
    for (const key of FLAG_ALIASES[flag]) {
      if (pool[key] === true) return true;
    }
  }
  return null;
}

/**
 * True only when this payload is about `flag` and that switch is on.
 * An explicit off alias wins over a wrapper `enabled: true`, so a settings
 * body cannot turn the ball picker or a growth screen on while the switch is off.
 * A play-ledger body with enabled:true must not turn challenges on.
 */
export function featureEnabled(payload: unknown, flag: GrowthFlag): boolean {
  const record = asRecord(payload);
  if (!record) return false;
  const flagName = typeof record.flag === "string" ? record.flag : "";
  if (flagName && !flagNames(flag).has(flagName)) return false;
  const explicit = explicitSwitch(record, flag);
  if (explicit !== null) return explicit;
  if (record.enabled === false) return false;
  if (record.enabled === true) return true;
  return false;
}

/** Alias / flag name on some other endpoint's body. Ignores a bare enabled:true. */
function mentionsFlag(payload: unknown, flag: GrowthFlag): boolean {
  const record = asRecord(payload);
  if (!record) return false;
  const names = flagNames(flag);
  if (typeof record.flag === "string" && names.has(record.flag)) return record.enabled === true;
  for (const key of FLAG_ALIASES[flag]) {
    if (record[key] === true) return true;
  }
  return false;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function personFrom(value: unknown): GrowthPerson | null {
  if (typeof value === "string" && value.trim()) {
    const name = value.trim();
    return { id: name, username: name };
  }
  const record = asRecord(value);
  if (!record) return null;
  const id = firstString(record, ["userId", "user_id", "_id", "id"]);
  const username = firstString(record, ["username", "name", "displayName"]) || id;
  if (!username) return null;
  return { id: id || username, username };
}

function peopleFrom(payload: unknown, keys: string[]): GrowthPerson[] {
  if (Array.isArray(payload)) {
    return payload.map(personFrom).filter((person): person is GrowthPerson => !!person);
  }
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(personFrom).filter((person): person is GrowthPerson => !!person);
    }
  }
  return [];
}

function uniquePeople(people: GrowthPerson[]): GrowthPerson[] {
  const seen = new Set<string>();
  const out: GrowthPerson[] = [];
  for (const person of people) {
    const key = person.id || person.username;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(person);
  }
  return out;
}

function challengeFrom(value: unknown): GrowthChallenge | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = firstString(record, ["id", "_id", "challengeId", "challenge_id"]);
  if (!id || id === CHALLENGE_FLAG_PROBE) return null;
  const who = firstString(record, ["fromUsername", "challenger", "from", "username", "by"]) || "A player";
  const status = firstString(record, ["status", "state"]);
  const title = firstString(record, ["title", "name"]) || `Challenge from ${who}`;
  const detail = status ? status.replace(/_/g, " ") : "Opens one on-demand race. Pick a ball, then watch.";
  return { id, title, detail };
}

function challengesFrom(payload: unknown): GrowthChallenge[] {
  const record = asRecord(payload);
  const pools: unknown[] = [];
  if (Array.isArray(payload)) pools.push(...payload);
  if (record) {
    for (const key of ["challenges", "inbox", "openChallenges", "open_challenges", "items"]) {
      const value = record[key];
      if (Array.isArray(value)) pools.push(...value);
    }
    const nested = challengeFrom(record.challenge);
    if (nested) pools.push(record.challenge);
  }
  const items = pools.map(challengeFrom).filter((item): item is GrowthChallenge => !!item);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function inviteLink(record: Record<string, unknown>, code: string | null): string | null {
  const link = firstString(record, ["url", "link", "shareUrl", "share_url", "inviteUrl", "invite_url"]);
  if (link) return link;
  return code ? `/r/${encodeURIComponent(code)}` : null;
}

export interface GrowthPayloads {
  playLedger: unknown;
  invite: unknown;
  friends: unknown;
  suggestions: unknown;
  shareDay: unknown;
  challengeFlag: unknown;
}

export function growthSnapshotFromPayloads(input: GrowthPayloads): GrowthSnapshot {
  const play = asRecord(input.playLedger);
  const invite = asRecord(input.invite);
  const share = asRecord(input.shareDay);

  const playOn = featureEnabled(input.playLedger, "play_ledger");
  const invitesOn = featureEnabled(input.invite, "invites");
  const friendsOn = featureEnabled(input.friends, "friends") || featureEnabled(input.suggestions, "friends");
  const shareOn = featureEnabled(input.shareDay, "share_day");
  const challengesOn = featureEnabled(input.challengeFlag, "challenges")
    || mentionsFlag(input.friends, "challenges")
    || mentionsFlag(input.playLedger, "challenges")
    || mentionsFlag(input.invite, "challenges");

  const playsLeft = play
    ? firstNumber(play, ["playsLeft", "plays_left", "remaining", "remainingPlays", "playsRemaining", "availablePlays", "left", "balance"])
    : null;
  const limit = play
    ? firstNumber(play, ["dailyPlayLimit", "daily_play_limit", "limit", "dailyLimit"])
    : null;
  const outOfPlays = playOn && (play?.outOfPlays === true || play?.out_of_plays === true || playsLeft === 0);

  const code = invitesOn && invite
    ? firstString(invite, ["code", "inviteCode", "invite_code", "referralCode", "referral_code"])
    : null;

  const people = friendsOn ? peopleFrom(input.friends, ["friends", "following", "users", "list", "people"]) : [];
  const activeToday = friendsOn
    ? peopleFrom(input.suggestions, ["activeToday", "active_today", "suggestions", "suggested", "players", "users"])
    : [];
  const followingIds = uniquePeople([
    ...people,
    ...peopleFrom(input.friends, ["followingIds", "following_ids"]),
  ]).map((person) => person.id);

  const challengePools = challengesOn
    ? [
        ...challengesFrom(input.challengeFlag),
        ...challengesFrom(input.friends),
        ...challengesFrom(input.invite),
        ...challengesFrom(input.playLedger),
      ]
    : [];
  const seenChallenges = new Set<string>();
  const items = challengePools.filter((item) => {
    if (seenChallenges.has(item.id)) return false;
    seenChallenges.add(item.id);
    return true;
  });

  return {
    playLedger: {
      enabled: playOn,
      playsLeft: playOn ? playsLeft : null,
      limit: playOn ? limit : null,
      outOfPlays,
    },
    invites: {
      enabled: invitesOn,
      code,
      link: invitesOn && invite ? inviteLink(invite, code) : null,
      inviterName: invitesOn && invite
        ? firstString(invite, ["inviter", "invitedBy", "fromUsername", "inviterName"])
        : null,
    },
    challenges: { enabled: challengesOn, items },
    friends: {
      enabled: friendsOn,
      people: uniquePeople(people),
      activeToday: uniquePeople(activeToday),
      followingIds,
    },
    shareDay: {
      enabled: shareOn,
      url: shareOn && share ? firstString(share, ["url", "shareUrl", "share_url", "link"]) : null,
      unlocked: shareOn && !!share && (share.unlocked === true || share.alreadyUnlocked === true || share.claimed === true),
      mode: shareOn && share ? firstString(share, ["shareDayMode", "share_day_mode", "mode"]) : null,
    },
  };
}

/** Open a challenge race only when that switch is on and we have an id. */
export function shouldStartChallenge(snapshot: GrowthSnapshot, id: string | null | undefined): boolean {
  return !!id && snapshot.challenges.enabled;
}

export interface RacePlayResult {
  video_link: string;
  user_ball: string;
  user_position: string;
  user_points: number;
  daily_limit?: number;
  played_today?: number;
  races_remaining?: number;
}

/** Pull an on-demand race payload out of a challenge-play response. */
export function readRaceResult(payload: unknown): RacePlayResult | null {
  const record = asRecord(payload);
  if (!record || record.enabled === false) return null;
  const candidates = [record, record.result, record.game, record.race, record.data];
  for (const candidate of candidates) {
    const row = asRecord(candidate);
    if (!row) continue;
    const link = row.video_link ?? row.videoLink ?? row.video_url;
    if (typeof link !== "string" || !link.trim()) continue;
    const points = typeof row.user_points === "number" ? row.user_points : 0;
    return {
      video_link: link,
      user_ball: typeof row.user_ball === "string" ? row.user_ball : "",
      user_position: typeof row.user_position === "string" ? row.user_position : "",
      user_points: points,
      ...(typeof row.daily_limit === "number" ? { daily_limit: row.daily_limit } : {}),
      ...(typeof row.played_today === "number" ? { played_today: row.played_today } : {}),
      ...(typeof row.races_remaining === "number" ? { races_remaining: row.races_remaining } : {}),
    };
  }
  return null;
}

export function playsLeftCopy(playsLeft: number | null, limit: number | null, outOfPlays: boolean): string | null {
  if (outOfPlays || playsLeft === 0) return "No plays left today.";
  if (playsLeft === null) return null;
  if (limit !== null && limit > 0) return `${playsLeft} of ${limit} plays left today.`;
  if (playsLeft === 1) return "1 play left today.";
  return `${playsLeft} plays left today.`;
}
