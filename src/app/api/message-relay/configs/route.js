import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";

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

function defaultOneSignalConfig() {
  return {
    id: null,
    platform: "onesignal",
    name: "OneSignal",
    appId:
      process.env.ONESIGNAL_APP_ID ||
      process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
      "dbb8017a-3495-402d-9094-e408bd1d6e27",
    defaultLaunchUrl: process.env.ONESIGNAL_DEFAULT_LAUNCH_URL || null,
    enabled: true,
    createdAt: null,
    updatedAt: null,
  };
}

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const config = await authStore.getMessageRelayConfig("onesignal");

  return NextResponse.json(
    {
      configs: [config || defaultOneSignalConfig()],
      secrets: {
        onesignalRestApiKeyConfigured: Boolean(process.env.ONESIGNAL_REST_API_KEY),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
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
    const config = await authStore.upsertMessageRelayConfig({
      platform: body?.platform,
      name: body?.name,
      appId: body?.appId,
      defaultLaunchUrl: body?.defaultLaunchUrl,
      enabled: body?.enabled,
    });

    return NextResponse.json(
      { config },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to save relay config" },
      { status: 400 }
    );
  }
}
