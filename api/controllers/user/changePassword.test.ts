import test from "node:test";
import assert from "node:assert/strict";
import { hash } from "bcrypt";
import { Request, Response } from "express";
import createJwt from "../../helpers/auth/createJwt";
import User from "../../models/User";
import { BCRYPT_COST } from "../../helpers/auth/applyPasswordChange";
import { changePassword, getPasswordStatus } from "./changePassword";

process.env.JWT_SECRET_KEY = "test-secret-for-password-change";

type FakeUser = {
  password?: string;
  save: () => Promise<void>;
};

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  cookies: Record<string, string>,
  body?: unknown
) {
  const res = mockRes();
  await handler(
    { cookies, body } as Request,
    res as unknown as Response
  );
  return res;
}

test("password status and updates require the player session cookie", async () => {
  const status = await call(getPasswordStatus, {});
  assert.equal(status.statusCode, 401);
  assert.deepEqual(status.body, { error: "Sign in to change your password." });

  const update = await call(changePassword, {}, {
    newPassword: "new-password-1",
    confirmPassword: "new-password-1",
  });
  assert.equal(update.statusCode, 401);
});

test("an OAuth account can set a password and the response hides the hash", async () => {
  const user: FakeUser = {
    password: undefined,
    save: async () => undefined,
  };
  const original = User.findById;
  User.findById = (async () => user) as unknown as typeof User.findById;
  const logs: string[] = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    const token = await createJwt("oauth-user");
    const plaintext = "first-password";
    const status = await call(getPasswordStatus, { token });
    assert.deepEqual(status.body, { hasPassword: false });

    const saved = await call(changePassword, { token }, {
      newPassword: plaintext,
      confirmPassword: plaintext,
    });

    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.body, {
      message: "Your password has been saved.",
      hasPassword: true,
    });
    assert.equal(typeof user.password, "string");
    assert.match(user.password || "", new RegExp(`^\\$2[ab]\\$${BCRYPT_COST}\\$`));
    const serialized = JSON.stringify(saved.body);
    assert.equal(serialized.includes(plaintext), false);
    assert.equal(serialized.includes(user.password || "missing-hash"), false);
    assert.equal(logs.some((line) => line.includes(plaintext)), false);

    const next = await call(getPasswordStatus, { token });
    assert.deepEqual(next.body, { hasPassword: true });
  } finally {
    User.findById = original;
    console.error = originalError;
    console.log = originalLog;
  }
});

test("a password account rejects the wrong current password and keeps the hash", async () => {
  const existing = await hash("current-password-1", BCRYPT_COST);
  let saves = 0;
  const user: FakeUser = {
    password: existing,
    save: async () => {
      saves += 1;
    },
  };
  const original = User.findById;
  User.findById = (async () => user) as unknown as typeof User.findById;

  try {
    const token = await createJwt("password-user");
    const wrong = await call(changePassword, { token }, {
      currentPassword: "wrong-password",
      newPassword: "new-password-1",
      confirmPassword: "new-password-1",
    });
    assert.equal(wrong.statusCode, 400);
    assert.deepEqual(wrong.body, { error: "Current password is incorrect." });
    assert.equal(user.password, existing);
    assert.equal(saves, 0);

    const changed = await call(changePassword, { token }, {
      currentPassword: "current-password-1",
      newPassword: "new-password-1",
      confirmPassword: "new-password-1",
    });
    assert.equal(changed.statusCode, 200);
    assert.deepEqual(changed.body, {
      message: "Your password has been updated.",
      hasPassword: true,
    });
    assert.equal(saves, 1);
    assert.notEqual(user.password, existing);
    assert.equal(JSON.stringify(changed.body).includes(user.password || ""), false);
  } finally {
    User.findById = original;
  }
});

test("non-string password fields are rejected and not hashed", async () => {
  let saves = 0;
  const user: FakeUser = {
    password: undefined,
    save: async () => {
      saves += 1;
    },
  };
  const original = User.findById;
  User.findById = (async () => user) as unknown as typeof User.findById;

  try {
    const token = await createJwt("oauth-user");
    const saved = await call(changePassword, { token }, {
      newPassword: 12345678,
      confirmPassword: 12345678,
    });
    assert.equal(saved.statusCode, 400);
    assert.deepEqual(saved.body, { error: "Enter a new password." });
    assert.equal(user.password, undefined);
    assert.equal(saves, 0);
  } finally {
    User.findById = original;
  }
});
