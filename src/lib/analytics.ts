"use client";

import {
  identifyMixpanelUser,
  resetMixpanel,
  trackMixpanelEvent,
  type MixpanelProperties,
} from "@/lib/mixpanel";
import {
  identifyThinkingDataUser,
  resetThinkingData,
  trackThinkingDataEvent,
} from "@/lib/thinkingdata";

export type AnalyticsProperties = MixpanelProperties;

type AnalyticsUserProfile = {
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
};

export async function trackAnalyticsEvent(
  eventName: string,
  properties: AnalyticsProperties = {}
) {
  const results = await Promise.allSettled([
    trackMixpanelEvent(eventName, properties),
    trackThinkingDataEvent(eventName, properties),
  ]);

  return results.some((result) => result.status === "fulfilled" && result.value);
}

export async function identifyAnalyticsUser(
  userId: unknown,
  profile: AnalyticsUserProfile = {}
) {
  const results = await Promise.allSettled([
    identifyMixpanelUser(userId, profile),
    identifyThinkingDataUser(userId, profile),
  ]);

  return results.some((result) => result.status === "fulfilled" && result.value);
}

export async function resetAnalytics() {
  const results = await Promise.allSettled([resetMixpanel(), resetThinkingData()]);

  return results.some((result) => result.status === "fulfilled" && result.value);
}
