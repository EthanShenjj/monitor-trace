"use client";

import mixpanel from "mixpanel-browser";

type MixpanelPropertyValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

export type MixpanelProperties = Record<string, MixpanelPropertyValue | null | undefined>;

type MixpanelUserProfile = {
  name?: unknown;
  email?: unknown;
  createdAt?: unknown;
};

const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
let isInitialized = false;

function cleanProperties(properties: MixpanelProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function initMixpanel() {
  if (typeof window === "undefined" || !mixpanelToken) {
    return false;
  }

  if (!isInitialized) {
    mixpanel.init(mixpanelToken, {
      debug: process.env.NODE_ENV !== "production",
      track_pageview: false,
      persistence: "localStorage",
    });
    mixpanel.register({
      app_name: "ai_trace_monitor",
      platform: "web",
    });
    isInitialized = true;
  }

  return true;
}

export function trackMixpanelEvent(eventName: string, properties: MixpanelProperties = {}) {
  if (!initMixpanel()) {
    return;
  }

  mixpanel.track(eventName, cleanProperties(properties), {
    send_immediately: true,
    transport: "sendBeacon",
  });
}

export function identifyMixpanelUser(userId: unknown, profile: MixpanelUserProfile = {}) {
  if (typeof userId !== "string" || userId.length === 0 || !initMixpanel()) {
    return;
  }

  mixpanel.identify(userId);
  mixpanel.register({ user_id: userId });

  const profileProperties = cleanProperties({
    $name: typeof profile.name === "string" ? profile.name : undefined,
    $email: typeof profile.email === "string" ? profile.email : undefined,
    created_at: typeof profile.createdAt === "string" ? profile.createdAt : undefined,
  });

  if (Object.keys(profileProperties).length > 0) {
    mixpanel.people.set(profileProperties);
  }
}

export function resetMixpanel() {
  if (!initMixpanel()) {
    return;
  }

  mixpanel.reset();
}
