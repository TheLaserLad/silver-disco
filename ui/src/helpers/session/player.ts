/**
 * Who is signed in, for the on-demand ball picker and the profile page.
 *
 * The live player API on :8080 does not mount GET /api/user/me (it 404s).
 * Google sign-in does set a readable `userId` cookie and GET /get_profile
 * is the route that actually exists. Ball pick and profile must not wait
 * on the missing /me route, and a failed lookup must not hide Log out.
 */

export interface SessionPlayer {
  _id: string;
  username?: string;
  email?: string;
  pfp?: string;
  connectedAccounts?: {
    google?: boolean;
    tiktok?: boolean;
    twitch?: boolean;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.$oid === "string" && record.$oid.trim()) return record.$oid.trim();
  return null;
}

function connectedFrom(value: unknown): SessionPlayer["connectedAccounts"] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    google: record.google === true,
    tiktok: record.tiktok === true,
    twitch: record.twitch === true,
  };
}

/** Google (and the other OAuth redirects) set this. It is not httpOnly. */
export function readUserIdCookie(cookieHeader?: string): string | null {
  const raw = cookieHeader ?? (typeof document !== "undefined" ? document.cookie : "");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith("userId=")) continue;
    try {
      const value = decodeURIComponent(trimmed.slice("userId=".length)).trim();
      return value || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Accept `{ user }`, a bare user document, or nothing. Flag payloads are not users. */
export function playerFromPayload(payload: unknown): SessionPlayer | null {
  const record = asRecord(payload);
  if (!record) return null;
  const nested = asRecord(record.user);
  const source = nested ?? record;
  const id = idOf(source._id) || idOf(source.id) || idOf(source.userId);
  if (!id) return null;
  if (typeof source.flag === "string" && source.flag.startsWith("growth_")) return null;
  return {
    _id: id,
    ...(typeof source.username === "string" && source.username.trim() ? { username: source.username.trim() } : {}),
    ...(typeof source.email === "string" && source.email.trim() ? { email: source.email.trim() } : {}),
    ...(typeof source.pfp === "string" && source.pfp.trim() ? { pfp: source.pfp.trim() } : {}),
    ...(connectedFrom(source.connectedAccounts) ? { connectedAccounts: connectedFrom(source.connectedAccounts) } : {}),
  };
}

function prefer(primary: SessionPlayer | null, fallback: SessionPlayer | null): SessionPlayer | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    _id: primary._id || fallback._id,
    username: primary.username || fallback.username,
    email: primary.email || fallback.email,
    pfp: primary.pfp || fallback.pfp,
    connectedAccounts: primary.connectedAccounts || fallback.connectedAccounts,
  };
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function loadSignedInPlayer(
  serverUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
  cookieHeader?: string,
): Promise<SessionPlayer | null> {
  const cookieId = readUserIdCookie(cookieHeader);
  const cookiePlayer = cookieId ? { _id: cookieId } : null;
  if (!serverUrl) return cookiePlayer;

  const root = serverUrl.replace(/\/$/, "");
  const load = async (path: string) => {
    try {
      const res = await fetchImpl(`${root}${path}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      return playerFromPayload(await readJson(res));
    } catch {
      return null;
    }
  };

  const [fromProfile, fromMe] = await Promise.all([
    load("/get_profile"),
    load("/api/user/me"),
  ]);
  return prefer(prefer(fromMe, fromProfile), cookiePlayer);
}
