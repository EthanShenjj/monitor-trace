import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import { buildOneSignalClickMessageInput } from "@/lib/onesignalWebhook.mjs";
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

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      {
        received: false,
        error: "Content-Type must be application/json",
      },
      { status: 415 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        received: false,
        error: "Invalid JSON body",
      },
      { status: 400 }
    );
  }

  try {
    const input = buildOneSignalClickMessageInput(body, getRequestHeaders(request));
    const { message, duplicate } = await authStore.createWebhookMessage(input);

    await trackServerThinkingDataEvent(
      "onesignal_notification_clicked",
      {
        provider: message.provider,
        event_type: message.eventType,
        message_status: message.readAt ? "read" : "unread",
        duplicate,
        notification_id: input.analytics.notificationId,
        action_id: input.analytics.actionId,
        subscription_id: input.analytics.subscriptionId,
        click_url: input.analytics.url,
        campaign_id: input.analytics.campaignId,
      },
      {
        accountId: input.analytics.userId,
        distinctId: input.analytics.subscriptionId,
      }
    );

    return jsonResponse(
      {
        received: true,
        duplicate,
        message_id: message.id,
      },
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    return jsonResponse(
      {
        received: false,
        error: error?.message || "Unable to process OneSignal click event",
      },
      { status: 400 }
    );
  }
}
