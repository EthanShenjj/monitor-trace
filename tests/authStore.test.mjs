import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createAuthStore } from "../src/lib/authStore.mjs";

const execFileAsync = promisify(execFile);

async function withStore(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "monitor-auth-"));
  const dbPath = path.join(dir, "auth.sqlite");
  const store = createAuthStore({
    dbPath,
    sessionSecret: "test-secret-that-is-long-enough",
  });

  try {
    await run(store, dbPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function querySqlite(dbPath, sql) {
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    dbPath,
    sql,
  ]);
  return stdout.trim() ? JSON.parse(stdout) : [];
}

test("registerUser stores a salted hash instead of the plain password", async () => {
  await withStore(async (store, dbPath) => {
    const user = await store.registerUser({
      name: "Ada Lovelace",
      email: "ADA@example.com",
      password: "correct horse battery staple",
    });

    assert.equal(user.email, "ada@example.com");
    assert.equal(user.name, "Ada Lovelace");
    assert.ok(user.id);

    const raw = await readFile(dbPath);
    assert.equal(raw.includes("correct horse battery staple"), false);

    const rows = await querySqlite(
      dbPath,
      "select id, name, email, password_hash from users"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, user.id);
    assert.equal(rows[0].email, "ada@example.com");
    assert.match(rows[0].password_hash, /^scrypt:/);
    assert.notEqual(rows[0].password_hash, "correct horse battery staple");
  });
});

test("registerUser rejects duplicate email addresses", async () => {
  await withStore(async (store) => {
    await store.registerUser({
      name: "Grace Hopper",
      email: "grace@example.com",
      password: "StrongPass123",
    });

    await assert.rejects(
      store.registerUser({
        name: "Grace Hopper",
        email: "GRACE@example.com",
        password: "AnotherStrongPass123",
      }),
      /already registered/
    );
  });
});

test("authenticateUser accepts the right password and rejects the wrong one", async () => {
  await withStore(async (store) => {
    const registered = await store.registerUser({
      name: "Lin Chen",
      email: "lin@example.com",
      password: "StrongPass123",
    });

    const authed = await store.authenticateUser("LIN@example.com", "StrongPass123");
    assert.equal(authed.id, registered.id);

    await assert.rejects(
      store.authenticateUser("lin@example.com", "wrong-password"),
      /Invalid email or password/
    );
  });
});

test("session tokens round trip and fail after tampering", async () => {
  await withStore(async (store) => {
    const registered = await store.registerUser({
      name: "Mina Park",
      email: "mina@example.com",
      password: "StrongPass123",
    });

    const token = store.createSessionToken(registered.id);
    assert.equal(store.verifySessionToken(token)?.userId, registered.id);

    const tampered = token.replace(/\.[^.]+$/, ".bad-signature");
    assert.equal(store.verifySessionToken(tampered), null);
  });
});
