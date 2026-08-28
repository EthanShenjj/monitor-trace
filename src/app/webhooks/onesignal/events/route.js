import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import { buildOneSignalEventMessageInput } from "@/lib/onesignalWebhook.mjs";
import { trackServerThinkingDataEvent } from "@/lib/serverAnalytics.mjs";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-OneSignal-Event",
  "Cache-Control": "no-store, max-age=0",
};

function jsonResponse(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function getRequestHeaders(request) {
  return Object.fromEntries(request.headers.entries());
}

function fallbackEventType(body, headers) {
  const event = body && typeof body === "object" && !Array.isArray(body) ? body.event : null;
  const properties =
    body && typeof body === "object" && !Array.isArray(body) && body.properties
      ? body.properties
      : null;

  if (event && typeof event === "object" && !Array.isArray(event) && event.kind) {
    return String(event.kind);
  }
  if (typeof event === "string") {
    return event;
  }

  return (
    body?.["event.kind"] ||
    body?.event_kind ||
    body?.event_type ||
    body?.eventType ||
    body?.["#event_name"] ||
    properties?.onesignal_event_kind ||
    properties?.event_kind ||
    headers["x-onesignal-event"] ||
    "unknown"
  );
}

async function recordCallback({
  body,
  duplicate = false,
  errorMessage = null,
  input = null,
  requestHeaders,
  response,
  status,
  statusCode,
  startedAt,
}) {
  try {
    await authStore.recordMessageRelayCallback({
      platform: "onesignal",
      source: "onesignal_event_stream",
      eventType: input?.eventType || fallbackEventType(body || {}, requestHeaders),
      eventId: input?.analytics?.eventId,
      messageId: input?.analytics?.notificationId,
      subscriptionId: input?.analytics?.subscriptionId,
      externalId: input?.analytics?.userId,
      requestHeaders,
      requestBody: body || {},
      response,
      responseHeaders: CORS_HEADERS,
      status,
      statusCode,
      duplicate,
      errorMessage,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    // Callback acknowledgements must not fail only because observability storage failed.
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request) {
  const startedAt = Date.now();
  const requestHeaders = getRequestHeaders(request);
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    const response = {
      received: false,
      error: "Content-Type must be application/json",
    };

    await recordCallback({
      body: {},
      errorMessage: response.error,
      requestHeaders,
      response,
      status: "rejected",
      statusCode: 415,
      startedAt,
    });

    return jsonResponse(
      response,
      { status: 415 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    const response = {
      received: false,
      error: "Invalid JSON body",
    };

    await recordCallback({
      body: {},
      errorMessage: response.error,
      requestHeaders,
      response,
      status: "rejected",
      statusCode: 400,
      startedAt,
    });

    return jsonResponse(
      response,
      { status: 400 }
    );
  }

  try {
    const input = buildOneSignalEventMessageInput(body, requestHeaders);
    const { message, duplicate } = await authStore.createWebhookMessage(input);
    const statusCode = duplicate ? 200 : 201;
    const response = {
      received: true,
      duplicate,
      message_id: message.id,
    };

    await trackServerThinkingDataEvent(
      input.eventType === "notification.clicked" || input.eventType === "message.push.clicked"
        ? "onesignal_notification_clicked"
        : "onesignal_push_event_received",
      {
        provider: message.provider,
        event_type: message.eventType,
        message_status: message.readAt ? "read" : "unread",
        duplicate,
        event_id: input.analytics.eventId,
        notification_id: input.analytics.notificationId,
        action_id: input.analytics.actionId,
        subscription_id: input.analytics.subscriptionId,
        click_url: input.analytics.url,
        campaign_id: input.analytics.campaignId,
        failure_reason: input.analytics.failureReason,
        event_datetime: input.analytics.eventDateTime,
        subscription_device_type: input.analytics.deviceType,
      },
      {
        accountId: input.analytics.userId,
        distinctId: input.analytics.subscriptionId,
      }
    );

    await recordCallback({
      body,
      duplicate,
      input,
      requestHeaders,
      response,
      status: duplicate ? "duplicate" : "accepted",
      statusCode,
      startedAt,
    });

    return jsonResponse(response, { status: statusCode });
  } catch (error) {
    const response = {
      received: false,
      error: error?.message || "Unable to process OneSignal push event",
    };

    await recordCallback({
      body,
      errorMessage: response.error,
      requestHeaders,
      response,
      status: "rejected",
      statusCode: 400,
      startedAt,
    });

    return jsonResponse(
      response,
      { status: 400 }
    );
  }
}
