import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";

/**
 * Race-desk calls (api2) present a shared key. Fail closed when CHAT_DESK_KEY
 * is unset so these routes are not open on a fresh boot.
 */
export function deskKeyMatches(presented: string | undefined): boolean {
  const expected = process.env.CHAT_DESK_KEY || "";
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireDeskKey(req: Request, res: Response, next: NextFunction): void {
  const presented = req.get("x-chat-desk-key") || undefined;
  if (!deskKeyMatches(presented)) {
    res.status(401).json({ error: "Desk authentication required." });
    return;
  }
  next();
}
