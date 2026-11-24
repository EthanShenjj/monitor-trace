import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";
import { messageStore } from "@/lib/messageStore.mjs";

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
  const status = searchParams.get("status") === "unread" ? "unread" : "all";
  const limit = searchParams.get("limit") || 100;
  let result;
  try {
    result = await messageStore.listWebhookMessages({ userId: user.id, status, limit });
  } catch {
    return NextResponse.json(
      { error: "Message storage is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ ...result, recipient: { id: user.id, email: user.email } }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
