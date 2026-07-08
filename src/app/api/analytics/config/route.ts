import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getReplaySampleRate() {
  const rawRate = process.env.NEXT_PUBLIC_MIXPANEL_RECORD_SESSIONS_PERCENT;

  if (!rawRate) {
    return 100;
  }

  const parsedRate = Number(rawRate);

  if (!Number.isFinite(parsedRate)) {
    return 100;
  }

  return Math.min(100, Math.max(0, parsedRate));
}

export async function GET() {
  return NextResponse.json(
    {
      mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || null,
      recordSessionsPercent: getReplaySampleRate(),
      thinkingDataAppId:
        process.env.NEXT_PUBLIC_THINKINGDATA_APP_ID ||
        process.env.THINKINGDATA_APP_ID ||
        null,
      thinkingDataServerUrl:
        process.env.NEXT_PUBLIC_THINKINGDATA_SERVER_URL ||
        process.env.THINKINGDATA_SERVER_URL ||
        "https://ta-preview.thinkingdata.cn",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
