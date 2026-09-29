import { Request, Response } from "express";
import verifyJwt from "../../helpers/auth/verifyJwt";
import User from "../../models/User";
import {
  applyPasswordChange,
  hasStoredPassword,
} from "../../helpers/auth/applyPasswordChange";

type PasswordUser = {
  password?: string;
  save: () => Promise<unknown>;
};

/**
 * Same session cookie as GET /api/user/me. The password hash is never copied
 * onto the response, and failures are logged without the request body.
 */
async function requireUser(
  req: Request,
  res: Response
): Promise<PasswordUser | null> {
  const token = req.cookies?.["token"];
  if (!token) {
    res.status(401).json({ error: "Sign in to change your password." });
    return null;
  }

  const decoded = await verifyJwt(token);
  const payload = decoded as unknown as { _id?: unknown } | null;
  const userId = typeof payload?._id === "string" ? payload._id : null;
  if (!userId) {
    res.status(403).json({ error: "Sign in to change your password." });
    return null;
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return null;
  }

  return user;
}

function readPasswordField(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[key];
  if (value == null) return "";
  if (typeof value !== "string") return null;
  return value;
}

export async function getPasswordStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json({ hasPassword: hasStoredPassword(user.password) });
  } catch {
    console.error("Password status failed");
    res.status(500).json({ error: "Could not load security settings." });
  }
}

export async function changePassword(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const currentPassword = readPasswordField(req.body, "currentPassword");
    const newPassword = readPasswordField(req.body, "newPassword");
    const confirmPassword = readPasswordField(req.body, "confirmPassword");
    if (
      currentPassword === null ||
      newPassword === null ||
      confirmPassword === null
    ) {
      res.status(400).json({ error: "Enter a new password." });
      return;
    }

    const hadPassword = hasStoredPassword(user.password);
    const result = await applyPasswordChange({
      hasPassword: hadPassword,
      storedHash: user.password,
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    user.password = result.hash;
    await user.save();

    res.json({
      message: hadPassword
        ? "Your password has been updated."
        : "Your password has been saved.",
      hasPassword: true,
    });
  } catch {
    console.error("Password update failed");
    res.status(500).json({ error: "Could not update your password. Try again." });
  }
}
