import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import { trackServerThinkingDataEvent } from "@/lib/serverAnalytics.mjs";

export const dynamic = "force-dynamic";

function getWebhookSecret(request) {
  const authHeader = request.headers.get("authorization") || "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.headers.get("x-webhook-secret") || "";
}

function isAuthorizedWebhook(request) {
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (!expectedSecret) {
    return { ok: false, status: 503, error: "Webhook secret is not configured" };
  }

  if (getWebhookSecret(request) !== expectedSecret) {
    return { ok: false, status: 401, error: "Invalid webhook secret" };
  }

  return { ok: true };
}

export async function POST(request) {
  const auth = isAuthorizedWebhook(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const provider =
      body?.provider ||
      body?.source ||
      request.headers.get("x-webhook-provider") ||
      "generic";
    const externalId =
      body?.external_id ||
      body?.externalId ||
      body?.event_id ||
      body?.eventId ||
      body?.id ||
      request.headers.get("x-webhook-event-id");
    const { message, duplicate } = await authStore.createWebhookMessage({
      provider,
      externalId,
      eventType: body?.event_type || body?.eventType || body?.type,
      title: body?.title || body?.subject || body?.name,
      body: body?.body || body?.message || body?.text || body?.content,
      rawPayload: body,
    });
    await trackServerThinkingDataEvent("webhook_message_received", {
      provider: message.provider,
      event_type: message.eventType,
      message_status: message.readAt ? "read" : "unread",
      duplicate,
    });

    return NextResponse.json(
      { message, duplicate },
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to store webhook message" },
      { status: 400 }
    );
  }
}
