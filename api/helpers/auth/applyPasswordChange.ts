import { compare, hash } from "bcrypt";

/** Same cost demo signup uses when it stores users.password. */
export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt only hashes the first 72 bytes. Reject longer input so the saved secret matches what was typed. */
export const MAX_PASSWORD_LENGTH = 72;

export function hasStoredPassword(password: unknown): boolean {
  return typeof password === "string" && password.length > 0;
}

export type PasswordChangeInput = {
  hasPassword: boolean;
  storedHash?: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type PasswordChangeResult =
  | { ok: true; hash: string }
  | { ok: false; status: number; error: string };

/**
 * Decide whether a signed-in player may set or replace their password.
 * Callers must not log the input or the returned hash.
 */
export async function applyPasswordChange(
  input: PasswordChangeInput
): Promise<PasswordChangeResult> {
  const { newPassword, confirmPassword } = input;

  if (!newPassword) {
    return { ok: false, status: 400, error: "Enter a new password." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return {
      ok: false,
      status: 400,
      error: "New password and confirmation do not match.",
    };
  }

  if (input.hasPassword) {
    if (!input.currentPassword) {
      return { ok: false, status: 400, error: "Enter your current password." };
    }
    let matches = false;
    if (input.storedHash) {
      try {
        matches = await compare(input.currentPassword, input.storedHash);
      } catch {
        matches = false;
      }
    }
    if (!matches) {
      return { ok: false, status: 400, error: "Current password is incorrect." };
    }
  }

  return { ok: true, hash: await hash(newPassword, BCRYPT_COST) };
}
