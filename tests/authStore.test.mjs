import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createAuthStore } from "../src/lib/authStore.mjs";
import {
  buildWebhookMessageInput,
  createThinkingDataWebhookResponse,
  normalizeWebhookItems,
} from "../src/lib/thinkingdataWebhook.mjs";
import { handleWebhookMessages } from "../src/lib/webhookMessages.mjs";
import {
  normalizeWebhookPushRequest,
  sendWebhookPush,
} from "../src/lib/webhookPush.mjs";
import {
  buildOneSignalClickMessageInput,
  buildOneSignalEventMessageInput,
} from "../src/lib/onesignalWebhook.mjs";
import {
  buildOneSignalNotificationPayload,
  handleOneSignalPushProxy,
  sendOneSignalNotification,
} from "../src/lib/onesignalPushProxy.mjs";

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

test("createEventConfiguration stores an event configuration snapshot", async () => {
  await withStore(async (store, dbPath) => {
    const user = await store.registerUser({
      name: "Event Designer",
      email: "events@example.com",
      password: "StrongPass123",
    });

    const configuration = await store.createEventConfiguration({
      userId: user.id,
      source: "events_configuration_page",
      events: [
        {
          event_name: "activity_attend",
          event_display_name: "参加活动",
          occurrence_probability: 100,
          next_event: "gold_get",
          conversion_rate: 100,
          properties: {
            activity_type: "周年庆活动",
            reward_amount: 88,
          },
        },
      ],
    });

    assert.ok(configuration.id);
    assert.equal(configuration.userId, user.id);
    assert.equal(configuration.source, "events_configuration_page");
    assert.equal(configuration.eventCount, 1);
    assert.equal(configuration.events[0].event_name, "activity_attend");
    assert.equal(configuration.events[0].properties.reward_amount, 88);

    const rows = await querySqlite(
      dbPath,
      "select user_id, source, event_count, config_payload from event_configurations"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].source, "events_configuration_page");
    assert.equal(rows[0].event_count, 1);
    assert.equal(JSON.parse(rows[0].config_payload).events[0].event_name, "activity_attend");
  });
});

test("ensureUserForSession creates a local session user for serverless API stores", async () => {
  await withStore(async (store, dbPath) => {
    const sessionUser = await store.ensureUserForSession("session-user-123");
    const repeated = await store.ensureUserForSession("session-user-123");

    assert.equal(sessionUser.id, "session-user-123");
    assert.equal(repeated.id, sessionUser.id);
    assert.equal(repeated.email, sessionUser.email);

    const payment = await store.createPayment({
      userId: sessionUser.id,
      amount: 97.94,
      currency: "USD",
      paymentMethod: "simulated",
      source: "dashboard_payment_form",
      amountEntryMethod: "random",
    });

    assert.equal(payment.userId, sessionUser.id);
    assert.equal(payment.amountCents, 9794);

    const rows = await querySqlite(
      dbPath,
      "select id, email from users where id = 'session-user-123'"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "session-session-user-123@monitor-trace.local");
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

test("ThinkingData webhook helpers normalize batched AE messages", async () => {
  const body = [
    {
      push_id: "accountid123987001",
      custom_params: {
        gameuid: "123acb001",
        name: "张三",
      },
      params: {
        title: "每日活动",
        content: "你好张三，快来参加活动吧！",
      },
      "#ops_receipt_properties": {
        ops_project_id: 1,
        ops_task_id: "0050",
        ops_task_instance_id: "0050_2023-01-01",
        ops_task_exec_detail_id: "17795",
        ops_request_id: "f7b66eb7-3363-4a46-a402-601a64b45f76",
        ops_push_language: "default",
      },
    },
  ];

  const items = normalizeWebhookItems(body);
  const input = buildWebhookMessageInput(items[0], 1);

  assert.equal(items.length, 1);
  assert.equal(input.provider, "thinkingdata_ae");
  assert.equal(input.externalId, "f7b66eb7-3363-4a46-a402-601a64b45f76:17795");
  assert.equal(input.eventType, "ae_ops_task_webhook_push");
  assert.equal(input.title, "每日活动");
  assert.equal(input.body, "你好张三，快来参加活动吧！");
  assert.equal(input.analytics.pushId, "accountid123987001");
  assert.equal(input.analytics.opsTaskId, "0050");
  assert.equal(input.analytics.opsRequestId, "f7b66eb7-3363-4a46-a402-601a64b45f76");
  assert.equal(input.rawPayload["#ops_receipt_properties"].ops_task_exec_detail_id, "17795");
});

test("ThinkingData webhook response follows return_code and fail_list contract", () => {
  assert.deepEqual(
    createThinkingDataWebhookResponse({
      storedCount: 2,
      duplicateCount: 0,
      failList: [{ index: 3, message: "push id not found" }],
    }),
    {
      return_code: 0,
      return_message: "success",
      data: {
        fail_list: [{ index: 3, message: "push id not found" }],
      },
    }
  );

  assert.deepEqual(
    createThinkingDataWebhookResponse({
      storedCount: 0,
      duplicateCount: 0,
      failList: [{ index: 1, message: "failed" }],
    }),
    {
      return_code: 1,
      return_message: "failed",
      data: {
        fail_list: [{ index: 1, message: "failed" }],
      },
    }
  );
});

test("webhook handler acknowledges valid Hermes messages when persistence fails", async () => {
  const warnings = [];
  const response = await handleWebhookMessages({
    body: [
      {
        push_id: "accountid123987001",
        params: {
          title: "每日活动",
          content: "你好张三，快来参加活动吧！",
        },
        "#ops_receipt_properties": {
          ops_task_id: "0050",
          ops_request_id: "f7b66eb7-3363-4a46-a402-601a64b45f76",
          ops_task_exec_detail_id: "17795",
        },
      },
    ],
    async createWebhookMessage() {
      throw new Error("database is unavailable");
    },
    logger: {
      warn(message, details) {
        warnings.push({ message, details });
      },
    },
  });

  assert.deepEqual(response, {
    return_code: 0,
    return_message: "success",
    data: {
      fail_list: [],
    },
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].details.error, "database is unavailable");
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

test("webhook push helpers validate requests and use POST JSON delivery", async () => {
  assert.throws(
    () =>
      normalizeWebhookPushRequest({
        targetUrl: "ftp://example.com/webhook",
        payload: {},
      }),
    /HTTP or HTTPS/
  );

  let capturedRequest;
  const result = await sendWebhookPush(
    {
      name: "Billing alert",
      targetUrl: "https://example.com/webhook",
      headers: {
        "X-Test": "ok",
        "Content-Length": "999",
      },
      payload: {
        event: "invoice.failed",
      },
    },
    {
      fetcher: async (url, options) => {
        capturedRequest = { url, options };
        return {
          ok: true,
          status: 202,
          statusText: "Accepted",
          text: async () => '{"accepted":true}',
        };
      },
    }
  );

  assert.equal(capturedRequest.url, "https://example.com/webhook");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.headers["X-Test"], "ok");
  assert.equal(capturedRequest.options.headers["Content-Length"], undefined);
  assert.equal(capturedRequest.options.body, '{"event":"invoice.failed"}');
  assert.equal(result.status, "succeeded");
  assert.equal(result.statusCode, 202);
  assert.equal(result.responseBody, '{"accepted":true}');
});

test("recordWebhookPushAttempt stores outbound webhook delivery history", async () => {
  await withStore(async (store, dbPath) => {
    const user = await store.registerUser({
      name: "Webhook Operator",
      email: "webhooks@example.com",
      password: "StrongPass123",
    });

    const attempt = await store.recordWebhookPushAttempt({
      userId: user.id,
      name: "Trace alert",
      targetUrl: "https://example.com/webhook",
      headers: {
        "Content-Type": "application/json",
      },
      payload: {
        event: "trace.alert",
      },
      status: "succeeded",
      statusCode: 204,
      responseBody: "",
      durationMs: 12,
      source: "webhook_push_page",
    });

    assert.ok(attempt.id);
    assert.equal(attempt.userId, user.id);
    assert.equal(attempt.targetUrl, "https://example.com/webhook");
    assert.equal(attempt.headers["Content-Type"], "application/json");
    assert.equal(attempt.payload.event, "trace.alert");
    assert.equal(attempt.status, "succeeded");
    assert.equal(attempt.statusCode, 204);
    assert.equal(attempt.durationMs, 12);

    const listed = await store.listWebhookPushAttempts({ userId: user.id });
    assert.equal(listed.attempts.length, 1);
    assert.equal(listed.attempts[0].id, attempt.id);
    assert.equal(listed.attempts[0].payload.event, "trace.alert");

    const rows = await querySqlite(
      dbPath,
      "select user_id, name, target_url, status, status_code, duration_ms from webhook_push_attempts"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    assert.equal(rows[0].name, "Trace alert");
    assert.equal(rows[0].target_url, "https://example.com/webhook");
    assert.equal(rows[0].status, "succeeded");
    assert.equal(rows[0].status_code, 204);
    assert.equal(rows[0].duration_ms, 12);
  });
});

test("message relay configs and attempts can be managed", async () => {
  await withStore(async (store) => {
    const savedConfig = await store.upsertMessageRelayConfig({
      platform: "onesignal",
      name: "OneSignal production",
      appId: "app-123",
      defaultLaunchUrl: "https://example.com/messages",
      enabled: true,
    });

    assert.equal(savedConfig.platform, "onesignal");
    assert.equal(savedConfig.name, "OneSignal production");
    assert.equal(savedConfig.appId, "app-123");
    assert.equal(savedConfig.defaultLaunchUrl, "https://example.com/messages");
    assert.equal(savedConfig.enabled, true);

    const updatedConfig = await store.upsertMessageRelayConfig({
      platform: "onesignal",
      name: "OneSignal paused",
      appId: "app-456",
      enabled: false,
    });

    assert.equal(updatedConfig.id, savedConfig.id);
    assert.equal(updatedConfig.name, "OneSignal paused");
    assert.equal(updatedConfig.appId, "app-456");
    assert.equal(updatedConfig.enabled, false);

    const firstAttempt = await store.recordMessageRelayAttempt({
      platform: "onesignal",
      source: "hermes",
      inboundPayload: [{ push_id: "user-1" }],
      outboundPayload: [{ include_aliases: { external_id: ["user-1"] } }],
      response: { return_code: 0 },
      status: "succeeded",
      statusCode: 200,
      durationMs: 32,
    });
    const secondAttempt = await store.recordMessageRelayAttempt({
      platform: "onesignal",
      source: "hermes",
      inboundPayload: [{ push_id: "missing-user" }],
      outboundPayload: [],
      response: { return_code: 1 },
      status: "failed",
      statusCode: 502,
      errorMessage: "push_id or external_id is required",
    });

    assert.equal(firstAttempt.status, "succeeded");
    assert.equal(secondAttempt.errorMessage, "push_id or external_id is required");

    const allAttempts = await store.listMessageRelayAttempts({ platform: "onesignal" });
    assert.equal(allAttempts.attempts.length, 2);

    const failedAttempts = await store.listMessageRelayAttempts({
      platform: "onesignal",
      status: "failed",
    });
    assert.equal(failedAttempts.attempts.length, 1);
    assert.equal(failedAttempts.attempts[0].id, secondAttempt.id);

    const acceptedCallback = await store.recordMessageRelayCallback({
      platform: "onesignal",
      source: "onesignal_event_stream",
      eventType: "message.push.received",
      eventId: "evt_123",
      messageId: "msg_123",
      subscriptionId: "sub_123",
      externalId: "user-1",
      requestHeaders: {
        "content-type": "application/json",
      },
      requestBody: {
        event: {
          kind: "message.push.received",
          id: "evt_123",
        },
      },
      response: {
        received: true,
        duplicate: false,
        message_id: "local_msg_123",
      },
      responseHeaders: {
        "cache-control": "no-store, max-age=0",
      },
      status: "accepted",
      statusCode: 201,
      durationMs: 9,
    });
    await store.recordMessageRelayCallback({
      platform: "onesignal",
      source: "onesignal_event_stream",
      eventType: "message.push.clicked",
      requestBody: {
        event: "message.push.clicked",
      },
      response: {
        received: false,
        error: "OneSignal message id or event id is required",
      },
      status: "rejected",
      statusCode: 400,
      errorMessage: "OneSignal message id or event id is required",
    });

    assert.equal(acceptedCallback.eventType, "message.push.received");
    assert.equal(acceptedCallback.eventId, "evt_123");
    assert.equal(acceptedCallback.requestBody.event.kind, "message.push.received");
    assert.equal(acceptedCallback.response.received, true);

    const allCallbacks = await store.listMessageRelayCallbacks({ platform: "onesignal" });
    assert.equal(allCallbacks.callbacks.length, 2);

    const rejectedCallbacks = await store.listMessageRelayCallbacks({
      platform: "onesignal",
      status: "rejected",
    });
    assert.equal(rejectedCallbacks.callbacks.length, 1);
    assert.equal(rejectedCallbacks.callbacks[0].statusCode, 400);
  });
});

test("OneSignal push proxy converts Hermes webhook arrays to Create Message payloads", () => {
  const payload = buildOneSignalNotificationPayload(
    {
      push_id: "accountid123987001",
      params: {
        title: "每日活动",
        content: "你好张三，快来参加活动吧！",
        url: "https://monitor-trace.vercel.app/messages",
      },
      custom_params: {
        campaign: "daily",
      },
      "#ops_receipt_properties": {
        ops_task_id: "0050",
        ops_request_id: "f7b66eb7-3363-4a46-a402-601a64b45f76",
      },
    },
    {
      appId: "dbb8017a-3495-402d-9094-e408bd1d6e27",
    }
  );

  assert.equal(payload.app_id, "dbb8017a-3495-402d-9094-e408bd1d6e27");
  assert.equal(payload.target_channel, "push");
  assert.deepEqual(payload.include_aliases.external_id, ["accountid123987001"]);
  assert.equal(payload.headings.en, "每日活动");
  assert.equal(payload.contents.en, "你好张三，快来参加活动吧！");
  assert.equal(payload.url, "https://monitor-trace.vercel.app/messages");
  assert.equal(payload.data.campaign, "daily");
  assert.equal(payload.data.ops_task_id, "0050");
  assert.equal(payload.data.ops_request_id, "f7b66eb7-3363-4a46-a402-601a64b45f76");
  assert.equal(payload.data["#ops_receipt_properties"].ops_task_id, "0050");
});

test("OneSignal push proxy uses title as fallback content for Hermes tests", () => {
  const payload = buildOneSignalNotificationPayload(
    {
      push_id: "accountid123987001",
      params: {
        title: "测试标题",
      },
    },
    {
      appId: "dbb8017a-3495-402d-9094-e408bd1d6e27",
    }
  );

  assert.equal(payload.headings.en, "测试标题");
  assert.equal(payload.contents.en, "测试标题");
});

test("OneSignal push proxy sends Authorization header and reports partial failures", async () => {
  const requests = [];
  const response = await handleOneSignalPushProxy({
    body: [
      {
        push_id: "user-1",
        params: {
          title: "Hello",
          content: "World",
        },
      },
      {
        push_id: "user-2",
        params: {
          content: "Missing title",
        },
      },
    ],
    appId: "app-123",
    apiKey: "rest-key-456",
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => '{"id":"notif_123"}',
      };
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.onesignal.com/notifications?c=push");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Key rest-key-456");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(requests[0].options.body).include_aliases.external_id[0], "user-1");
  assert.equal(response.return_code, 0);
  assert.equal(response.data.success_list.length, 1);
  assert.deepEqual(response.data.fail_list, [
    {
      index: 2,
      message: "params.title is required",
    },
  ]);
});

test("OneSignal notification sender requires REST API key", async () => {
  await assert.rejects(
    sendOneSignalNotification(
      {
        app_id: "app-123",
        target_channel: "push",
        include_aliases: {
          external_id: ["user-1"],
        },
        headings: {
          en: "Hello",
        },
        contents: {
          en: "World",
        },
      },
      {
        apiKey: "",
        fetcher: async () => {
          throw new Error("fetch should not run");
        },
      }
    ),
    /ONESIGNAL_REST_API_KEY/
  );
});

test("OneSignal click webhook helper normalizes notification.clicked payloads", async () => {
  const input = buildOneSignalClickMessageInput({
    event: "notification.clicked",
    notificationId: "notif_123",
    heading: "Daily reward",
    content: "Open the app to claim coins",
    actionId: "claim",
    subscriptionId: "sub_456",
    url: "https://example.com/rewards",
    additionalData: {
      user_id: "user_789",
      campaign_id: "camp_101",
    },
  });

  assert.equal(input.provider, "onesignal");
  assert.equal(input.externalId, "notif_123:claim:sub_456");
  assert.equal(input.eventType, "notification.clicked");
  assert.equal(input.title, "Daily reward");
  assert.match(input.body, /Open the app to claim coins/);
  assert.match(input.body, /Action: claim/);
  assert.equal(input.analytics.notificationId, "notif_123");
  assert.equal(input.analytics.actionId, "claim");
  assert.equal(input.analytics.subscriptionId, "sub_456");
  assert.equal(input.analytics.userId, "user_789");
  assert.equal(input.analytics.campaignId, "camp_101");
});

test("OneSignal click webhook messages are stored and deduplicated", async () => {
  await withStore(async (store) => {
    const input = buildOneSignalClickMessageInput({
      event: "notification.clicked",
      notificationId: "notif_abc",
      heading: "Welcome back",
      content: "Tap to continue",
      subscriptionId: "sub_def",
    });

    const created = await store.createWebhookMessage(input);
    const duplicate = await store.createWebhookMessage(input);

    assert.equal(created.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.message.id, created.message.id);
    assert.equal(created.message.provider, "onesignal");
    assert.equal(created.message.eventType, "notification.clicked");
    assert.equal(created.message.externalId, "notif_abc:body:sub_def");
  });
});

test("OneSignal event stream helper normalizes push sent and failed payloads", () => {
  const sent = buildOneSignalEventMessageInput({
    event: {
      id: "event_sent_123",
      kind: "message.push.sent",
      datetime: "2026-08-28T04:00:00.000Z",
      subscription_id: "sub_123",
      external_id: "user_123",
      subscription_device_type: "Chrome",
    },
    message: {
      id: "msg_123",
      title: {
        en: "Daily reward",
      },
      contents: {
        en: "Open the app",
      },
    },
  });

  assert.equal(sent.provider, "onesignal");
  assert.equal(sent.eventType, "message.push.sent");
  assert.equal(sent.externalId, "event_sent_123");
  assert.equal(sent.title, "Daily reward");
  assert.match(sent.body, /Open the app/);
  assert.match(sent.body, /User: user_123/);
  assert.equal(sent.analytics.notificationId, "msg_123");
  assert.equal(sent.analytics.subscriptionId, "sub_123");
  assert.equal(sent.analytics.userId, "user_123");
  assert.equal(sent.analytics.deviceType, "Chrome");

  const failed = buildOneSignalEventMessageInput({
    "event.kind": "message.push.failed",
    "event.id": "event_failed_123",
    "message.id": "msg_failed",
    "event.data.failure_reason": "Invalid subscription",
  });

  assert.equal(failed.eventType, "message.push.failed");
  assert.equal(failed.externalId, "event_failed_123");
  assert.match(failed.body, /Failure reason: Invalid subscription/);
  assert.equal(failed.analytics.failureReason, "Invalid subscription");
});

test("OneSignal event stream helper accepts ThinkingData track-shaped push callbacks", () => {
  const input = buildOneSignalEventMessageInput({
    "#type": "track",
    "#account_id": "user_123",
    "#distinct_id": "",
    "#event_name": "te_ops_onesignal_push_click",
    "#time": "2026-08-28 18:30:00.000",
    properties: {
      "#data_source": "Third_Party",
      "#data_source_detail": "onesignal",
      "#ops_receipt_properties": {
        ops_project_id: "1",
        ops_request_id: "request_uuid",
        ops_task_id: "task_uuid",
        ops_task_instance_id: "instance_uuid",
        ops_exp_group_id: "group_a",
      },
      onesignal_event_id: "evt_001",
      onesignal_message_id: "0f82021c-e508-4184-963b-1868e2c3cd55",
      onesignal_app_id: "dbb8017a-3495-402d-9094-e408bd1d6e27",
      push_provider: "onesignal",
    },
  });

  assert.equal(input.provider, "onesignal");
  assert.equal(input.eventType, "message.push.clicked");
  assert.equal(input.externalId, "evt_001");
  assert.equal(input.analytics.eventId, "evt_001");
  assert.equal(input.analytics.notificationId, "0f82021c-e508-4184-963b-1868e2c3cd55");
  assert.equal(input.analytics.userId, "user_123");
  assert.match(input.body, /User: user_123/);
  assert.match(input.body, /Ops request: request_uuid/);
});

test("OneSignal event stream helper accepts nested TA OneSignal callback schema", () => {
  const input = buildOneSignalEventMessageInput({
    schema: "ta_onesignal_push_event_v1",
    event: {
      provider: "onesignal",
      kind: "message.push.clicked",
      id: "evt_nested_001",
      timestamp: "1787900000",
      datetime: "2026-08-28T10:30:00.000Z",
      app_id: "dbb8017a-3495-402d-9094-e408bd1d6e27",
    },
    message: {
      id: "msg_nested_001",
      name: "Hermes campaign",
      title: "Nested title",
      contents: "Nested content",
      url: "https://monitor-trace.vercel.app/relay",
    },
    recipient: {
      account_id: "account_123",
      distinct_id: "sub_123",
      external_id: "external_123",
      onesignal_id: "os_123",
      subscription_id: "sub_456",
      subscription_device_type: "Chrome",
    },
    context: {
      push_id: "account_123",
      receipt_schema: "ta_receipt_v1",
      ops_receipt_properties: {
        ops_project_id: "1",
        ops_request_id: "request_nested",
      },
    },
  });

  assert.equal(input.eventType, "message.push.clicked");
  assert.equal(input.externalId, "evt_nested_001");
  assert.equal(input.analytics.eventId, "evt_nested_001");
  assert.equal(input.analytics.notificationId, "msg_nested_001");
  assert.equal(input.analytics.userId, "account_123");
  assert.equal(input.analytics.subscriptionId, "sub_456");
  assert.equal(input.analytics.deviceType, "Chrome");
  assert.match(input.body, /Nested content/);
  assert.match(input.body, /Ops request: request_nested/);
});

test("OneSignal helper rejects unsupported events", () => {
  assert.throws(
    () =>
      buildOneSignalEventMessageInput({
        event: "message.email.sent",
        notificationId: "notif_123",
      }),
    /push sent, received, clicked, and failed/
  );
});
