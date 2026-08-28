import { NextResponse } from "next/server";
import { handleOneSignalPushProxy } from "@/lib/onesignalPushProxy.mjs";

export const dynamic = "force-dynamic";

function hasValidProxySecret(request) {
  const configuredSecret = process.env.ONESIGNAL_PROXY_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const requestUrl = new URL(request.url);
  const requestSecret =
    request.headers.get("x-webhook-secret") ||
    request.headers.get("x-onesignal-proxy-secret") ||
    requestUrl.searchParams.get("secret");

  return requestSecret === configuredSecret;
}

export async function POST(request) {
  if (!hasValidProxySecret(request)) {
    return NextResponse.json(
      {
        return_code: 1,
        return_message: "Unauthorized",
        data: {
          fail_list: [],
        },
      },
      { status: 401 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        return_code: 1,
        return_message: "Invalid JSON body",
        data: {
          fail_list: [],
        },
      },
      { status: 400 }
    );
  }

  const response = await handleOneSignalPushProxy({
    body,
    appId:
      process.env.ONESIGNAL_APP_ID ||
      process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
      "dbb8017a-3495-402d-9094-e408bd1d6e27",
    apiKey: process.env.ONESIGNAL_REST_API_KEY,
    defaultUrl: process.env.ONESIGNAL_DEFAULT_LAUNCH_URL,
  });

  return NextResponse.json(response, {
    status: response.return_code === 0 ? 200 : 502,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
