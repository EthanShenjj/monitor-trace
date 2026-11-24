import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAuthStore } from "../src/lib/authStore.mjs";
import { handleMarketLoopWebhookRequest as handleRequest } from "../src/lib/marketloopWebhook.mjs";

const secret = "receiver-secret-example";
const recipientUserId = "monitor-admin-id";
const recipients = { "customer-example": recipientUserId, "admin-account": recipientUserId };
function handleMarketLoopWebhookRequest(request, options = {}) {
  return handleRequest(request, { secret, recipients, ...options });
}

const delivery = {
  id: "decision-example:webhook",
  type: "marketloop.message",
  workspaceId: "workspace-example",
  channelId: "channel-example",
  timestamp: "2026-11-19T08:00:00.000Z",
  data: {
    customerId: "customer-example",
    policyId: "policy-example",
    subject: "欢迎回来",
    body: "你的专属消息已送达。",
  },
};

const channelTest = {
  id: "webhook-test-example",
  type: "marketloop.webhook.test",
  channelId: "channel-example",
  timestamp: "2026-11-19T08:00:00.000Z",
  data: { message: "MarketLoop Webhook 测试请求", recipientAccountId: "admin-account" },
};

function request(payload, headers = {}) {
  return new Request("https://monitor-trace.example/api/webhooks/marketloop", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, ...headers },
    body: JSON.stringify(payload),
  });
}

async function withStore(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "monitor-marketloop-"));
  const store = createAuthStore({
    dbPath: path.join(dir, "auth.sqlite"),
    sessionSecret: "marketloop-webhook-test-session-secret",
  });
  try {
    await run(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("MarketLoop deliveries retain content and original payload in the message center", async () => {
  await withStore(async (store) => {
    const response = await handleMarketLoopWebhookRequest(
      request(delivery, { "Idempotency-Key": delivery.id }),
      store
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.event_id, delivery.id);
    assert.equal(result.duplicate, false);

    const { messages, unreadCount } = await store.listWebhookMessages({ userId: recipientUserId });
    assert.equal(messages.length, 1);
    assert.equal(unreadCount, 1);
    assert.equal(result.message_id, messages[0].id);
    assert.equal(messages[0].provider, "marketloop");
    assert.equal(messages[0].eventType, delivery.type);
    assert.equal(messages[0].title, delivery.data.subject);
    assert.equal(messages[0].body, delivery.data.body);
    assert.deepEqual(messages[0].rawPayload, delivery);
  });
});

test("MarketLoop channel tests work without a workspace or customer", async () => {
  await withStore(async (store) => {
    const response = await handleMarketLoopWebhookRequest(request(channelTest), store);
    assert.equal(response.status, 200);
    const { messages } = await store.listWebhookMessages({ userId: recipientUserId });
    assert.equal(messages[0].eventType, "marketloop.webhook.test");
    assert.equal(messages[0].body, channelTest.data.message);
    assert.deepEqual(messages[0].rawPayload, channelTest);
  });
});

test("repeated MarketLoop event IDs acknowledge the original stored message", async () => {
  await withStore(async (store) => {
    const first = await (await handleMarketLoopWebhookRequest(request(delivery), store)).json();
    const repeated = await handleMarketLoopWebhookRequest(
      request(delivery, { "Idempotency-Key": delivery.id }), store
    );
    assert.equal(repeated.status, 200);
    const result = await repeated.json();
    assert.equal(result.duplicate, true);
    assert.equal(result.message_id, first.message_id);
    assert.equal((await store.listWebhookMessages({ userId: recipientUserId })).messages.length, 1);
  });
});

test("MarketLoop receiver accepts either configured authentication Header", async () => {
  const secret = "receiver-secret-example";
  for (const headers of [
    { Authorization: `Bearer ${secret}` },
    { Authorization: "", "X-Webhook-Secret": secret },
  ]) {
    const response = await handleMarketLoopWebhookRequest(request(channelTest, headers), {
      secret,
      async createWebhookMessage() {
        return { message: { id: "stored-test" }, duplicate: false };
      },
    });
    assert.equal(response.status, 200);
  }
});

test("missing or incorrect credentials cannot store a message", async () => {
  for (const headers of [{ Authorization: "" }, { Authorization: "Bearer incorrect" }, { Authorization: "", "X-Webhook-Secret": "incorrect" }]) {
    let stored = false;
    const response = await handleMarketLoopWebhookRequest(request(channelTest, headers), {
      secret: "receiver-secret-example",
      async createWebhookMessage() { stored = true; },
    });
    assert.equal(response.status, 401);
    assert.equal(stored, false);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
});

test("invalid MarketLoop payloads and mismatched idempotency keys cannot store messages", async () => {
  const invalid = [
    null, [], [delivery], {},
    { ...delivery, id: "" },
    { ...delivery, id: "x".repeat(161) },
    { ...delivery, channelId: "" },
    { ...delivery, timestamp: "invalid-date" },
    { ...delivery, workspaceId: undefined },
    { ...delivery, data: null },
    { ...delivery, data: { subject: "Missing body" } },
    { ...delivery, type: "other.event" },
    { ...channelTest, data: { message: "" } },
  ].map(payload => request(payload));
  invalid.push(request(delivery, { "Idempotency-Key": "another-event" }));

  for (const input of invalid) {
    let stored = false;
    const response = await handleMarketLoopWebhookRequest(input, {
      async createWebhookMessage() { stored = true; },
    });
    assert.equal(response.status, 400);
    assert.equal(stored, false);
  }
});

test("malformed JSON and oversized UTF-8 bodies are rejected before storage", async () => {
  const malformed = new Request("https://monitor-trace.example/api/webhooks/marketloop", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: "{invalid",
  });
  const oversized = request({ ...delivery, data: { ...delivery.data, body: "中".repeat(22_000) } });
  for (const [input, status] of [[malformed, 400], [oversized, 413]]) {
    let stored = false;
    const response = await handleMarketLoopWebhookRequest(input, {
      async createWebhookMessage() { stored = true; },
    });
    assert.equal(response.status, status);
    assert.equal(stored, false);
  }
});

test("storage failures return non-2xx so MarketLoop does not record acceptance", async () => {
  const response = await handleMarketLoopWebhookRequest(request(delivery), {
    async createWebhookMessage() { throw new Error("Private database error"); },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Unable to store MarketLoop message" });
});
