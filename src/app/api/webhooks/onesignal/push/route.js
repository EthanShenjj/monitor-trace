import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import {
  buildOneSignalNotificationPayload,
  handleOneSignalPushProxy,
  normalizeOneSignalProxyItems,
} from "@/lib/onesignalPushProxy.mjs";

export const dynamic = "force-dynamic";

function buildOutboundPreview(body, options) {
  try {
    return normalizeOneSignalProxyItems(body).map((item) =>
      buildOneSignalNotificationPayload(item, options)
    );
  } catch {
    return [];
  }
}

function hasOneSignalBusinessErrors(response) {
  const successList = response?.data?.success_list || [];

  return successList.some((item) => {
    const errors = item?.onesignal_response?.errors;

    return Array.isArray(errors) && errors.length > 0;
  });
}

function getRelayStatus(response, httpStatus) {
  if (httpStatus === 401) {
    return "unauthorized";
  }
  if (response?.return_code !== 0) {
    return "failed";
  }
  if ((response?.data?.fail_list || []).length > 0 || hasOneSignalBusinessErrors(response)) {
    return "partial_failed";
  }

  return "succeeded";
}

async function recordRelayAttempt({
  body,
  outboundPayload,
  response,
  status,
  statusCode,
  errorMessage,
  startedAt,
}) {
  try {
    await authStore.recordMessageRelayAttempt({
      platform: "onesignal",
      source: "hermes",
      inboundPayload: body,
      outboundPayload,
      response,
      status,
      statusCode,
      responseBody: JSON.stringify(response || {}),
      errorMessage,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    // Relay delivery should not fail only because local observability storage failed.
  }
}

export async function POST(request) {
  const startedAt = Date.now();

  let body;

  try {
    body = await request.json();
  } catch {
    const response = {
      return_code: 1,
      return_message: "Invalid JSON body",
      data: {
        fail_list: [],
      },
    };

    await recordRelayAttempt({
      body: {},
      outboundPayload: [],
      response,
      status: "failed",
      statusCode: 400,
      errorMessage: "Invalid JSON body",
      startedAt,
    });

    return NextResponse.json(response, { status: 400 });
  }

  const config = await authStore.getMessageRelayConfig("onesignal");
  const appId =
    config?.appId ||
    process.env.ONESIGNAL_APP_ID ||
    process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
    "dbb8017a-3495-402d-9094-e408bd1d6e27";
  const defaultUrl = config?.defaultLaunchUrl || process.env.ONESIGNAL_DEFAULT_LAUNCH_URL;
  const outboundPayload = buildOutboundPreview(body, {
    appId,
    defaultUrl,
  });

  if (config && !config.enabled) {
    const response = {
      return_code: 1,
      return_message: "OneSignal relay is disabled",
      data: {
        fail_list: [],
      },
    };

    await recordRelayAttempt({
      body,
      outboundPayload,
      response,
      status: "failed",
      statusCode: 503,
      errorMessage: response.return_message,
      startedAt,
    });

    return NextResponse.json(response, { status: 503 });
  }

  const response = await handleOneSignalPushProxy({
    body,
    appId,
    apiKey: process.env.ONESIGNAL_REST_API_KEY,
    defaultUrl,
  });
  const statusCode = response.return_code === 0 ? 200 : 502;

  await recordRelayAttempt({
    body,
    outboundPayload,
    response,
    status: getRelayStatus(response, statusCode),
    statusCode,
    errorMessage: response.return_code === 0 ? null : response.return_message,
    startedAt,
  });

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
