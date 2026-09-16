import { Request, Response } from "express";
import cookieDomain from "../../helpers/auth/cookieDomain";

export const logout = (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    ...cookieDomain(),
  });
  res.status(200).json({ message: "Logged out successfully" });
};