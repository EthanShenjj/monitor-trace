import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createAuthStore } from "../src/lib/authStore.mjs";
import { createPostgresMessageStore } from "../src/lib/messageStore.mjs";
import { handleMarketLoopWebhookRequest } from "../src/lib/marketloopWebhook.mjs";

const secret = "account-isolation-test-webhook-secret";
const event = (id, account = "external-a") => ({
  id, type: "marketloop.webhook.test", channelId: "test-channel",
  timestamp: "2026-11-24T08:00:00.000Z",
  data: { message: "Private test message", recipientAccountId: account },
});
const request = payload => new Request("https://monitor.example/api/webhooks/marketloop", {
  method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(payload),
});
const storedInput = (externalId, recipientUserId) => ({
  provider: "marketloop", externalId, recipientUserId, title: "Private", body: "Private body",
});

async function withStore(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "monitor-account-isolation-"));
  const dbPath = path.join(directory, "auth.sqlite");
  try {
    await run(createAuthStore({ dbPath, sessionSecret: "private-local-session-test-secret" }), dbPath);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("each account sees only its own messages and unread count; unassigned messages stay hidden", async () => {
  await withStore(async store => {
    const a = await store.createWebhookMessage(storedInput("event-a", "user-a"));
    const b = await store.createWebhookMessage(storedInput("event-b", "user-b"));
    const legacy = await store.createWebhookMessage(storedInput("legacy"));
    for (const [userId, own] of [["user-a", a], ["user-b", b]]) {
      const inbox = await store.listWebhookMessages({ userId });
      assert.deepEqual(inbox.messages.map(message => message.id), [own.message.id]);
      assert.equal(inbox.unreadCount, 1);
    }
    await assert.rejects(store.markWebhookMessageRead(a.message.id, "user-b"), /not found/);
    await assert.rejects(store.markWebhookMessageRead(legacy.message.id, "user-a"), /not found/);
    const firstRead = await store.markWebhookMessageRead(a.message.id, "user-a");
    assert.equal((await store.markWebhookMessageRead(a.message.id, "user-a")).readAt, firstRead.readAt);
    assert.equal((await store.listWebhookMessages({ userId: "user-a", status: "unread" })).unreadCount, 0);
    assert.equal((await store.listWebhookMessages({ userId: "user-b", status: "unread" })).unreadCount, 1);
    await assert.rejects(store.listWebhookMessages(), /account ID/);
    await assert.rejects(store.markWebhookMessageRead(b.message.id), /account ID/);
  });
});

test("test account mapping is authoritative and cannot be overridden by payload user IDs", async () => {
  await withStore(async store => {
    const payload = { ...event("mapped"), recipientUserId: "user-b" };
    payload.data.userId = "user-b";
    payload.data.recipientUserId = "user-b";
    const response = await handleMarketLoopWebhookRequest(request(payload), {
      ...store, secret, recipients: { "external-a": "user-a" },
    });
    assert.equal(response.status, 200);
    assert.equal((await store.listWebhookMessages({ userId: "user-a" })).messages.length, 1);
    assert.equal((await store.listWebhookMessages({ userId: "user-b" })).messages.length, 0);
  });
});

test("missing account, unmapped account and malformed server mapping never create messages", async () => {
  const cases = [
    [undefined, { "external-a": "user-a" }, 400],
    ["external-b", { "external-a": "user-a" }, 422],
    ["constructor", { "external-a": "user-a" }, 422],
    ["external-a", undefined, 503],
    ["external-a", "{invalid", 503],
    ["external-a", "[]", 503],
    ["external-a", { "external-a": "" }, 503],
  ];
  for (const [account, recipients, status] of cases) {
    let stored = false;
    const payload = event("rejected"); payload.data.recipientAccountId = account;
    const response = await handleMarketLoopWebhookRequest(request(payload), {
      secret, recipients, async createWebhookMessage() { stored = true; },
    });
    assert.equal(response.status, status);
    assert.equal(stored, false);
  }
});

test("an unconfigured shared secret cannot open an unauthenticated private receiver", async () => {
  let stored = false;
  const response = await handleMarketLoopWebhookRequest(request(event("no-auth")), {
    recipients: { "external-a": "user-a" }, async createWebhookMessage() { stored = true; },
  });
  assert.equal(response.status, 503);
  assert.equal(stored, false);
});

test("idempotency cannot transfer messages to another account or claim legacy messages", async () => {
  await withStore(async store => {
    const first = await store.createWebhookMessage(storedInput("same-event", "user-a"));
    const duplicate = await store.createWebhookMessage(storedInput("same-event", "user-a"));
    assert.equal(duplicate.message.id, first.message.id);
    assert.equal(duplicate.duplicate, true);
    await assert.rejects(store.createWebhookMessage(storedInput("same-event", "user-b")), error => error.status === 409);
    await store.createWebhookMessage(storedInput("legacy-event"));
    await assert.rejects(store.createWebhookMessage(storedInput("legacy-event", "user-a")), error => error.status === 409);
    assert.equal((await store.listWebhookMessages({ userId: "user-b" })).unreadCount, 0);
    const response = await handleMarketLoopWebhookRequest(request(event("same-event", "external-b")), {
      ...store, secret, recipients: { "external-b": "user-b" },
    });
    assert.equal(response.status, 409);
  });
});

test("SQLite upgrade preserves existing data and quarantines its unassigned ownership", async () => {
  await withStore(async (store, dbPath) => {
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE webhook_messages (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_id TEXT, event_type TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, raw_payload TEXT NOT NULL,
      read_at TEXT, created_at TEXT NOT NULL, UNIQUE(provider, external_id)
    )`);
    db.prepare("INSERT INTO webhook_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("legacy-id", "marketloop", "old-event", "test", "Old", "Retained", "{}", null, "2026-11-20");
    db.close();
    assert.deepEqual(await store.listWebhookMessages({ userId: "user-a" }), { messages: [], unreadCount: 0 });
    const upgraded = new Database(dbPath);
    assert.equal(upgraded.prepare("SELECT body FROM webhook_messages WHERE id = ?").get("legacy-id").body, "Retained");
    assert.equal(upgraded.prepare("SELECT recipient_user_id FROM webhook_messages WHERE id = ?").get("legacy-id").recipient_user_id, null);
    upgraded.close();
  });
});

test("PostgreSQL binds the session account to list, unread count and mark-read queries", async () => {
  const calls = [];
  const store = createPostgresMessageStore({ queryable: { async query(text, values) {
    calls.push({ text, values });
    return { rows: text.startsWith("WITH") ? [{ messages: [], unread_count: 0 }] : [] };
  } } });
  await store.listWebhookMessages({ userId: "user-b", status: "unread", limit: 3 });
  assert.deepEqual(calls[0].values, ["user-b", true, 3]);
  assert.equal(calls[0].text.match(/recipient_user_id = \$1/g).length, 2);
  await assert.rejects(store.markWebhookMessageRead("00000000-0000-4000-8000-000000000001", "user-b"), error => error.status === 404);
  assert.match(calls[1].text, /WHERE id = \$1 AND recipient_user_id = \$2/);
  assert.equal(calls[1].values[1], "user-b");
  await assert.rejects(store.listWebhookMessages(), /account ID/);
  assert.equal(calls.length, 2);
});
