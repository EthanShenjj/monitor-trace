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

test("createPayment stores a payment for a registered user", async () => {
  await withStore(async (store, dbPath) => {
    const user = await store.registerUser({
      name: "Nora Vale",
      email: "nora@example.com",
      password: "StrongPass123",
    });

    const payment = await store.createPayment({
      userId: user.id,
      amount: 29,
      currency: "usd",
      paymentMethod: "simulated",
      source: "dashboard_payment_form",
      amountEntryMethod: "manual",
    });

    assert.ok(payment.id);
    assert.equal(payment.userId, user.id);
    assert.equal(payment.amount, 29);
    assert.equal(payment.amountCents, 2900);
    assert.equal(payment.currency, "USD");
    assert.equal(payment.status, "succeeded");

    const rows = await querySqlite(
      dbPath,
      "select user_id, amount_cents, currency, payment_method, source, amount_entry_method, status from payments"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].amount_cents, 2900);
    assert.equal(rows[0].currency, "USD");
    assert.equal(rows[0].payment_method, "simulated");
    assert.equal(rows[0].source, "dashboard_payment_form");
    assert.equal(rows[0].amount_entry_method, "manual");
    assert.equal(rows[0].status, "succeeded");
  });
});

test("createWebhookMessage stores messages and deduplicates external IDs", async () => {
  await withStore(async (store, dbPath) => {
    const created = await store.createWebhookMessage({
      provider: "stripe",
      externalId: "evt_123",
      eventType: "payment_failed",
      title: "Payment failed",
      body: "Invoice payment failed",
      rawPayload: {
        id: "evt_123",
        type: "payment_failed",
        invoice: "in_123",
      },
    });

    assert.equal(created.duplicate, false);
    assert.ok(created.message.id);
    assert.equal(created.message.provider, "stripe");
    assert.equal(created.message.externalId, "evt_123");
    assert.equal(created.message.eventType, "payment_failed");
    assert.equal(created.message.readAt, null);
    assert.equal(created.message.rawPayload.invoice, "in_123");

    const duplicate = await store.createWebhookMessage({
      provider: "stripe",
      externalId: "evt_123",
      eventType: "payment_failed",
      title: "Duplicate event",
      body: "Should not create a second row",
      rawPayload: { id: "evt_123" },
    });

    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.message.id, created.message.id);
    assert.equal(duplicate.message.title, "Payment failed");

    const rows = await querySqlite(
      dbPath,
      "select provider, external_id, event_type, title, body, read_at from webhook_messages"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, "stripe");
    assert.equal(rows[0].external_id, "evt_123");
    assert.equal(rows[0].event_type, "payment_failed");
    assert.equal(rows[0].title, "Payment failed");
    assert.equal(rows[0].body, "Invoice payment failed");
    assert.equal(rows[0].read_at, null);
  });
});

test("listWebhookMessages and markWebhookMessageRead track unread state", async () => {
  await withStore(async (store) => {
    const first = await store.createWebhookMessage({
      provider: "github",
      externalId: "delivery-1",
      eventType: "issue_opened",
      title: "Issue opened",
      body: "A new issue was opened",
      rawPayload: { action: "opened" },
    });
    await store.createWebhookMessage({
      provider: "github",
      externalId: "delivery-2",
      eventType: "issue_closed",
      title: "Issue closed",
      body: "An issue was closed",
      rawPayload: { action: "closed" },
    });

    const beforeRead = await store.listWebhookMessages({ status: "unread" });
    assert.equal(beforeRead.unreadCount, 2);
    assert.equal(beforeRead.messages.length, 2);

    const marked = await store.markWebhookMessageRead(first.message.id);
    assert.ok(marked.readAt);

    const afterRead = await store.listWebhookMessages({ status: "unread" });
    assert.equal(afterRead.unreadCount, 1);
    assert.equal(afterRead.messages.length, 1);
    assert.equal(afterRead.messages[0].externalId, "delivery-2");
  });
});
