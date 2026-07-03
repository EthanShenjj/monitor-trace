import { NextResponse } from "next/server";

const amplitudeHttpApiEndpoint =
  process.env.AMPLITUDE_HTTP_API_ENDPOINT || "https://api2.amplitude.com/2/httpapi";

type AnalyticsPayload = {
  eventName?: unknown;
  properties?: unknown;
  deviceId?: unknown;
  userId?: unknown;
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

export async function POST(request: Request) {
  const apiKey = process.env.AMPLITUDE_API_KEY || process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, skipped: "missing_amplitude_api_key" },
      { status: 202 }
    );
  }

  let payload: AnalyticsPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = asString(payload.eventName);
  const deviceId = asString(payload.deviceId);
  const userId = asString(payload.userId);

  if (!eventType || (!deviceId && !userId)) {
    return NextResponse.json(
      { error: "eventName and either deviceId or userId are required" },
      { status: 400 }
    );
  }

  const event = {
    device_id: deviceId || undefined,
    user_id: userId || undefined,
    event_type: eventType,
    event_properties: asRecord(payload.properties),
    insert_id: asString(payload.insertId) || undefined,
    time: typeof payload.time === "number" ? payload.time : Date.now(),
    platform: "Web",
    user_agent: request.headers.get("user-agent") || undefined,
  };

  const amplitudeResponse = await fetch(amplitudeHttpApiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      events: [event],
    }),
  });

  if (!amplitudeResponse.ok) {
    const details = await amplitudeResponse.text();

    return NextResponse.json(
      { error: "Amplitude upload failed", details },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
