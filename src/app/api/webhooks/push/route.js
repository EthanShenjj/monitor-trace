import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";
import { trackServerThinkingDataEvent } from "@/lib/serverAnalytics.mjs";
import { sendWebhookPush } from "@/lib/webhookPush.mjs";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = authStore.verifySessionToken(token);

  if (!session) {
    return null;
  }

  return authStore.ensureUserForSession(session.userId);
}

export async function GET(request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || 50;
  const result = await authStore.listWebhookPushAttempts({ userId: user.id, limit });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await sendWebhookPush({
      name: body?.name,
      targetUrl: body?.targetUrl,
      headers: body?.headers,
      payload: body?.payload,
      source: body?.source,
    });
    const attempt = await authStore.recordWebhookPushAttempt({
      userId: user.id,
      name: result.name,
      targetUrl: result.targetUrl,
      headers: result.headers,
      payload: result.payload,
      status: result.status,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
      source: result.source,
    });

    await trackServerThinkingDataEvent(
      "webhook_push_sent",
      {
        platform: "web",
        webhook_name: attempt.name,
        target_host: new URL(attempt.targetUrl).hostname,
        push_status: attempt.status,
        status_code: attempt.statusCode,
        duration_ms: attempt.durationMs,
        source: attempt.source,
      },
      { accountId: user.id }
    );

    return NextResponse.json({ attempt }, { status: result.status === "succeeded" ? 201 : 502 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to push webhook" },
      { status: 400 }
    );
  }
}
