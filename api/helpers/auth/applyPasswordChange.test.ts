import test from "node:test";
import assert from "node:assert/strict";
import { compare, hash } from "bcrypt";
import {
  BCRYPT_COST,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  applyPasswordChange,
  hasStoredPassword,
} from "./applyPasswordChange";

const NEW_PASSWORD = "new-password-1";
const CURRENT_PASSWORD = "current-password-1";

test("hasStoredPassword is false for missing passwords", () => {
  assert.equal(hasStoredPassword(undefined), false);
  assert.equal(hasStoredPassword(null), false);
  assert.equal(hasStoredPassword(""), false);
  assert.equal(hasStoredPassword(NEW_PASSWORD), true);
});

test("an account with no password can set one without the current password", async () => {
  const result = await applyPasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.hash, new RegExp(`^\\$2[ab]\\$${BCRYPT_COST}\\$`));
  assert.notEqual(result.hash, NEW_PASSWORD);
  assert.equal(await compare(NEW_PASSWORD, result.hash), true);
  assert.equal(JSON.stringify(result).includes(NEW_PASSWORD), false);
});

test("after a first password is saved, a later change requires the current one", async () => {
  const first = await applyPasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: CURRENT_PASSWORD,
    confirmPassword: CURRENT_PASSWORD,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const wrong = await applyPasswordChange({
    hasPassword: true,
    storedHash: first.hash,
    currentPassword: "not-the-password",
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.deepEqual(wrong, {
    ok: false,
    status: 400,
    error: "Current password is incorrect.",
  });

  const missing = await applyPasswordChange({
    hasPassword: true,
    storedHash: first.hash,
    currentPassword: "",
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.deepEqual(missing, {
    ok: false,
    status: 400,
    error: "Enter your current password.",
  });

  const changed = await applyPasswordChange({
    hasPassword: true,
    storedHash: first.hash,
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.equal(await compare(CURRENT_PASSWORD, changed.hash), false);
  assert.equal(await compare(NEW_PASSWORD, changed.hash), true);
});

test("new password and confirmation must match", async () => {
  const result = await applyPasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: NEW_PASSWORD,
    confirmPassword: "different-password",
  });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "New password and confirmation do not match.",
  });
});

test("passwords shorter than the minimum are rejected", async () => {
  const result = await applyPasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: "short",
    confirmPassword: "short",
  });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  });
});

test("passwords longer than bcrypt's limit are rejected", async () => {
  const tooLong = "a".repeat(MAX_PASSWORD_LENGTH + 1);
  const result = await applyPasswordChange({
    hasPassword: false,
    currentPassword: "",
    newPassword: tooLong,
    confirmPassword: tooLong,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.match(result.error, /72 characters or fewer/);
});

test("a broken stored hash fails as an incorrect current password", async () => {
  const result = await applyPasswordChange({
    hasPassword: true,
    storedHash: "not-a-bcrypt-hash",
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Current password is incorrect.",
  });
});

test("login can read a hash produced here", async () => {
  const stored = await hash(CURRENT_PASSWORD, BCRYPT_COST);
  const result = await applyPasswordChange({
    hasPassword: true,
    storedHash: stored,
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.equal(result.ok, true);
});
