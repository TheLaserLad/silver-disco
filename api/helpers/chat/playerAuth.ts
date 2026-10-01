import { Request } from "express";
import { JwtPayload } from "jsonwebtoken";
import verifyJwt from "../auth/verifyJwt";
import User from "../../models/User";

export type ChatPlayer = {
  id: string;
  username: string;
};

export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key !== "token") continue;
    const value = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Same session the rest of the player API uses: HS256 JWT in the `token`
 * cookie (payload `{ _id }`), or a Bearer token carrying that same JWT.
 * Guests (no / invalid token) get null. This does not accept the race-desk
 * session.
 */
export async function playerFromToken(token: string | undefined | null): Promise<ChatPlayer | null> {
  if (!token) return null;
  try {
    const decoded = await verifyJwt(token);
    if (!decoded) return null;
    const payload = decoded as JwtPayload & { _id?: string };
    const id = payload._id ? String(payload._id) : "";
    if (!id) return null;
    const user = await User.findById(id).select("username").lean();
    if (!user) return null;
    const username = (user.username || "").trim() || "Player";
    return { id, username };
  } catch {
    return null;
  }
}

export async function playerFromRequest(req: Request): Promise<ChatPlayer | null> {
  const cookieToken = typeof req.cookies?.token === "string" ? req.cookies.token : undefined;
  const header = req.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  return playerFromToken(cookieToken || bearer);
}
