import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";

import { createAuthStore } from "../src/lib/authStore.mjs";
import { createMessageStore, createPostgresMessageStore } from "../src/lib/messageStore.mjs";

const input = {
  recipientUserId: "recipient-a",
  provider: "monitor_trace_test",
  externalId: "message-test-1",
  eventType: "marketloop.webhook.test",
  title: "  共享 PostgreSQL 测试  ",
  body: "两个独立客户端读取同一条消息",
  rawPayload: { id: "message-test-1", data: { message: "原始消息" } },
};

test("message inserts bind values and preserve the existing public message shape", async () => {
  const calls = [];
  const store = createPostgresMessageStore({ queryable: {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [{ id: values[0], provider: values[1], external_id: values[2], event_type: values[3], title: values[4], body: values[5], raw_payload: JSON.parse(values[6]), recipient_user_id: values[7], read_at: null, created_at: new Date("2026-11-19T08:00:00Z") }] };
    },
  } });
  const result = await store.createWebhookMessage({ ...input, body: "user's text; DROP TABLE users;" });
  assert.equal(result.duplicate, false);
  assert.equal(result.message.title, "共享 PostgreSQL 测试");
  assert.equal(result.message.body, "user's text; DROP TABLE users;");
  assert.deepEqual(result.message.rawPayload, input.rawPayload);
  assert.equal(result.message.createdAt, "2026-11-19T08:00:00.000Z");
  assert.equal(result.message.readAt, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text.includes("DROP TABLE users"), false);
  assert.equal(calls[0].values[5], "user's text; DROP TABLE users;");
});

test("Vercel cannot silently use an instance-local SQLite message database", async () => {
  let localCalls = 0;
  const store = createMessageStore({ requireShared: true, localStore: {
    async createWebhookMessage() { localCalls += 1; },
  } });
  await assert.rejects(store.createWebhookMessage(input), /PostgreSQL.*configured/i);
  await assert.rejects(store.listWebhookMessages(), /PostgreSQL.*configured/i);
  assert.equal(localCalls, 0);
});

test("local development still supports the existing SQLite store", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "monitor-message-local-"));
  try {
    const localStore = createAuthStore({ dbPath: path.join(dir, "messages.sqlite"), sessionSecret: "message-store-local-test-secret" });
    const store = createMessageStore({ localStore });
    const result = await store.createWebhookMessage(input);
    assert.equal((await store.listWebhookMessages({ userId: "recipient-a" })).messages[0].id, result.message.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PostgreSQL failures are errors and never leak connection credentials", async () => {
  const store = createPostgresMessageStore({ queryable: {
    async query() { throw new Error("password=private-database-password"); },
  } });
  await assert.rejects(store.listWebhookMessages({ userId: "recipient-a" }), error => error.status === 503 && !error.message.includes("private-database-password"));
});

test("invalid message IDs return not-found without querying PostgreSQL", async () => {
  let calls = 0;
  const store = createPostgresMessageStore({ queryable: { async query() { calls += 1; } } });
  await assert.rejects(store.markWebhookMessageRead("invalid-id", "recipient-a"), error => error.status === 404);
  assert.equal(calls, 0);
});

test("PostgreSQL configuration rejects other URL protocols", () => {
  assert.throws(() => createPostgresMessageStore({ connectionString: "https://example.invalid" }), /PostgreSQL/);
});

test("independent PostgreSQL clients share messages, concurrent deduplication, and read state", { skip: !process.env.TEST_MESSAGE_DATABASE_URL }, async t => {
  const connectionString = process.env.TEST_MESSAGE_DATABASE_URL;
  const firstPool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 8000 });
  const secondPool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 8000 });
  t.after(async () => { await Promise.all([firstPool.end(), secondPool.end()]); });
  const first = createPostgresMessageStore({ queryable: firstPool });
  const second = createPostgresMessageStore({ queryable: secondPool });
  const runId = process.env.MESSAGE_TEST_RUN_ID || randomUUID();
  const message = { ...input, externalId: runId + ":concurrent" };

  const results = await Promise.all([first.createWebhookMessage(message), second.createWebhookMessage(message)]);
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(results[0].message.id, results[1].message.id);

  const inbox = await second.listWebhookMessages({ userId: "recipient-a", status: "unread", limit: 200 });
  assert.ok(inbox.messages.some(item => item.id === results[0].message.id));
  assert.ok(inbox.unreadCount >= 1);
  const marked = await second.markWebhookMessageRead(results[0].message.id, "recipient-a");
  assert.ok(marked.readAt);
  assert.equal((await first.listWebhookMessages({ userId: "recipient-a", status: "unread", limit: 200 })).messages.some(item => item.id === marked.id), false);
  assert.equal((await first.markWebhookMessageRead(marked.id, "recipient-a")).readAt, marked.readAt);

  const freshPool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
  try {
    const reconnected = createPostgresMessageStore({ queryable: freshPool });
    const repeated = await reconnected.createWebhookMessage(message);
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.message.id, marked.id);
    assert.equal(repeated.message.readAt, marked.readAt);
  } finally {
    await freshPool.end();
  }
});
