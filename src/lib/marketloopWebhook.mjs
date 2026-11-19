import { timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 64_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesSecret(value, secret) {
  const received = Buffer.from(value || "");
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function buildMessageInput(payload, idempotencyKey) {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("Request body must be a MarketLoop event object with data");
  }
  if (typeof payload.id !== "string" || !payload.id.trim() || payload.id.length > 160) {
    throw new Error("Event id must be a non-empty string of at most 160 characters");
  }
  if (idempotencyKey !== null && idempotencyKey !== payload.id) {
    throw new Error("Idempotency-Key must match the event id");
  }
  if (typeof payload.channelId !== "string" || !payload.channelId.trim()) {
    throw new Error("channelId is required");
  }
  if (typeof payload.timestamp !== "string" || !Number.isFinite(Date.parse(payload.timestamp))) {
    throw new Error("timestamp must be a valid date string");
  }

  let title;
  let body;

  if (payload.type === "marketloop.message") {
    if (typeof payload.workspaceId !== "string" || !payload.workspaceId.trim()) {
      throw new Error("workspaceId is required for marketloop.message");
    }
    if (typeof payload.data.subject !== "string" || typeof payload.data.body !== "string") {
      throw new Error("marketloop.message requires data.subject and data.body strings");
    }
    title = payload.data.subject.trim() || "MarketLoop message";
    body = payload.data.body || title;
  } else if (payload.type === "marketloop.webhook.test") {
    if (typeof payload.data.message !== "string" || !payload.data.message.trim()) {
      throw new Error("marketloop.webhook.test requires a data.message string");
    }
    title = "MarketLoop Webhook 测试";
    body = payload.data.message;
  } else {
    throw new Error("Unsupported MarketLoop event type");
  }

  return {
    provider: "marketloop",
    externalId: payload.id,
    eventType: payload.type,
    title,
    body,
    rawPayload: payload,
  };
}

export async function handleMarketLoopWebhookRequest(request, { createWebhookMessage, secret = "" }) {
  if (secret) {
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (
      !matchesSecret(bearerToken, secret) &&
      !matchesSecret(request.headers.get("x-webhook-secret"), secret)
    ) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Unable to read request body" }, 400);
  }
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return json({ error: "Request body exceeds 64 KB" }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  let input;
  try {
    input = buildMessageInput(payload, request.headers.get("idempotency-key"));
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  try {
    const { message, duplicate } = await createWebhookMessage(input);
    return json({
      success: true,
      event_id: payload.id,
      message_id: message.id,
      duplicate,
    });
  } catch {
    // MarketLoop treats any 2xx response as accepted; acknowledge only stored messages.
    return json({ error: "Unable to store MarketLoop message" }, 503);
  }
}
