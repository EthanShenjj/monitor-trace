import { NextResponse } from "next/server";

type MixpanelEventPayload = {
  eventName?: unknown;
  properties?: unknown;
  distinctId?: unknown;
  insertId?: unknown;
  time?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function encodeMixpanelData(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export async function POST(request: Request) {
  const token = process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

  if (!token) {
    return NextResponse.json(
      { ok: false, skipped: "missing_mixpanel_project_token" },
      { status: 202 }
    );
  }

  let payload: MixpanelEventPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventName = asString(payload.eventName);
  const distinctId = asString(payload.distinctId);

  if (!eventName || !distinctId) {
    return NextResponse.json(
      { error: "eventName and distinctId are required" },
      { status: 400 }
    );
  }

  const event = {
    event: eventName,
    properties: {
      ...asRecord(payload.properties),
      token,
      distinct_id: distinctId,
      $insert_id: asString(payload.insertId) || undefined,
      time: typeof payload.time === "number" ? payload.time : Math.floor(Date.now() / 1000),
      mp_lib: "web",
      tracking_source: "vercel_server_proxy",
      user_agent: request.headers.get("user-agent") || undefined,
    },
  };

  const body = new URLSearchParams({
    data: encodeMixpanelData(event),
  });
  const apiHost = process.env.MIXPANEL_API_HOST || "https://api-js.mixpanel.com";
  const response = await fetch(`${apiHost}/track/?verbose=1&ip=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Mixpanel upload failed" },
      { status: 502 }
    );
  }

  const result = (await response.json()) as { status?: unknown; error?: unknown };

  if (result.status !== 1) {
    return NextResponse.json(
      { error: "Mixpanel rejected event", details: result.error || "unknown" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
