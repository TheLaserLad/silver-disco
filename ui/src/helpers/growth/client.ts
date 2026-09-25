/**
 * Player-API growth routes already live on :8080. Flags default off.
 * Reads are once per page load. Writes happen only after a player acts
 * on a screen that the matching flag has turned on.
 *
 *   GET  /play_ledger
 *   GET  /invite
 *   POST /invite/land          { code }     public, no-ops when invites are off
 *   GET  /friends
 *   GET  /friends/suggestions
 *   POST /friends/follow       { userId }
 *   POST /friends/unfollow     { userId }
 *   GET  /share_day
 *   POST /share_day/unlock     { action, mode }
 *   GET  /challenges/:id       public, no-ops when challenges are off
 *   POST /challenges/:id/play  { userId, ball_id, challengeId }
 */

import {
  CHALLENGE_FLAG_PROBE,
  EMPTY_GROWTH,
  type GrowthSnapshot,
  growthSnapshotFromPayloads,
} from "./flags";

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    return await readBody(res);
  } catch {
    return null;
  }
}

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await readBody(res);
  } catch {
    return null;
  }
}

let snapshotInflight: Promise<GrowthSnapshot> | null = null;
let snapshotServer = "";

/** One parallel read of the growth screens. Failures become "hidden". */
export function loadGrowthSnapshot(serverUrl: string | undefined): Promise<GrowthSnapshot> {
  if (!serverUrl) return Promise.resolve(EMPTY_GROWTH);
  if (snapshotInflight && snapshotServer === serverUrl) return snapshotInflight;
  snapshotServer = serverUrl;
  const root = serverUrl.replace(/\/$/, "");
  snapshotInflight = (async () => {
    const [playLedger, invite, friends, suggestions, shareDay, challengeFlag] = await Promise.all([
      getJson(`${root}/play_ledger`),
      getJson(`${root}/invite`),
      getJson(`${root}/friends`),
      getJson(`${root}/friends/suggestions`),
      getJson(`${root}/share_day`),
      getJson(`${root}/challenges/${CHALLENGE_FLAG_PROBE}`),
    ]);
    return growthSnapshotFromPayloads({
      playLedger,
      invite,
      friends,
      suggestions,
      shareDay,
      challengeFlag,
    });
  })();
  return snapshotInflight;
}

export function resetGrowthSnapshotCache(): void {
  snapshotInflight = null;
  snapshotServer = "";
}

export function landInvite(serverUrl: string, code: string): Promise<unknown> {
  return postJson(`${serverUrl.replace(/\/$/, "")}/invite/land`, { code });
}

export function followPlayer(serverUrl: string, userId: string): Promise<unknown> {
  return postJson(`${serverUrl.replace(/\/$/, "")}/friends/follow`, { userId });
}

export function unfollowPlayer(serverUrl: string, userId: string): Promise<unknown> {
  return postJson(`${serverUrl.replace(/\/$/, "")}/friends/unfollow`, { userId });
}

export function unlockShareDay(serverUrl: string, action: "share" | "copy", mode: string | null): Promise<unknown> {
  return postJson(`${serverUrl.replace(/\/$/, "")}/share_day/unlock`, {
    action,
    mode: mode || "share_or_copy",
  });
}

export function fetchChallenge(serverUrl: string, id: string): Promise<unknown> {
  return getJson(`${serverUrl.replace(/\/$/, "")}/challenges/${encodeURIComponent(id)}`);
}
