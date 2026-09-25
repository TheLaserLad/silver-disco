import { Request, Response } from "express";
import User from "../../models/User";
import { decode, type JwtPayload } from "jsonwebtoken";

export async function getProfile(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.token;
  if (!token || typeof token !== "string") {
    res.status(401).json({ msg: "No token found" });
    return;
  }

  // decode() returns the payload `{ _id, iat, exp }`, not the id string.
  // Looking the user up by the whole payload always missed and the profile
  // page rendered "No user data found."
  const decoded = decode(token) as (JwtPayload & { _id?: unknown }) | string | null;
  const userId = decoded && typeof decoded === "object" ? decoded._id : null;
  if (typeof userId !== "string" || !userId) {
    res.status(403).json({ msg: "Invalid token" });
    return;
  }

  const user = await User.findOne({ _id: userId })
    .select("-csrfToken")
    .select("-clientToken")
    .select("-refreshToken")
    .select("-consented");

  if (!user) {
    res.status(404).json({ msg: "User not found" });
    return;
  }

  res.json({ user });
}
