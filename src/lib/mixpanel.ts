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

type RuntimeAnalyticsConfig = {
  mixpanelToken?: string;
  recordSessionsPercent?: number;
};

const mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const replaySampleRate = process.env.NEXT_PUBLIC_MIXPANEL_RECORD_SESSIONS_PERCENT;
const anonymousDistinctIdKey = "monitor_mixpanel_distinct_id";
const identifiedDistinctIdKey = "monitor_mixpanel_user_id";
let isInitialized = false;
let initPromise: Promise<boolean> | null = null;
let runtimeConfigPromise: Promise<RuntimeAnalyticsConfig> | null = null;

function cleanProperties(properties: MixpanelProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getReplaySampleRate(value: unknown = replaySampleRate) {
  if (typeof value !== "string" && typeof value !== "number") {
    return 100;
  }

  const parsedRate = Number(value);

  if (!Number.isFinite(parsedRate)) {
    return 100;
  }

  return Math.min(100, Math.max(0, parsedRate));
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStoredDistinctId() {
  if (typeof window === "undefined") {
    return null;
  }

  const identifiedId = window.localStorage.getItem(identifiedDistinctIdKey);

  if (identifiedId) {
    return identifiedId;
  }

  const anonymousId = window.localStorage.getItem(anonymousDistinctIdKey);

  if (anonymousId) {
    return anonymousId;
  }

  const nextAnonymousId = createClientId();
  window.localStorage.setItem(anonymousDistinctIdKey, nextAnonymousId);
  return nextAnonymousId;
}

function getClientProperties() {
  if (typeof window === "undefined") {
    return {};
  }

  return cleanProperties({
    current_url: window.location.href,
    page_path: window.location.pathname,
    referrer: document.referrer,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
  });
}

function createInsertId(eventName: string) {
  return `${eventName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getRuntimeConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch("/api/analytics/config", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          return {};
        }

        const payload = (await response.json()) as {
          mixpanelToken?: unknown;
          recordSessionsPercent?: unknown;
        };
        const runtimeToken = asNonEmptyString(payload.mixpanelToken);

        return {
          mixpanelToken: runtimeToken || undefined,
          recordSessionsPercent: getReplaySampleRate(payload.recordSessionsPercent),
        };
      })
      .catch(() => ({}));
  }

  return runtimeConfigPromise;
}

export async function initMixpanel() {
  if (typeof window === "undefined") {
    return false;
  }

  if (isInitialized) {
    return true;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const runtimeConfig = await getRuntimeConfig();
      const token = asNonEmptyString(mixpanelToken) || runtimeConfig.mixpanelToken;

      if (!token) {
        return false;
      }

      mixpanel.init(token, {
        debug: process.env.NODE_ENV !== "production",
        track_pageview: false,
        persistence: "localStorage",
        record_sessions_percent: runtimeConfig.recordSessionsPercent ?? getReplaySampleRate(),
        record_mask_all_text: true,
        record_mask_all_inputs: true,
      });
      mixpanel.register({
        app_name: "ai_trace_monitor",
        platform: "web",
      });
      isInitialized = true;
      return true;
    })();
  }

  return initPromise;
}

export async function trackMixpanelEvent(eventName: string, properties: MixpanelProperties = {}) {
  if (typeof window === "undefined") {
    return false;
  }

  void initMixpanel();

  const distinctId = getStoredDistinctId();

  if (!distinctId) {
    return false;
  }

  try {
    const response = await fetch("/api/analytics/mixpanel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        properties: {
          ...getClientProperties(),
          ...cleanProperties(properties),
        },
        distinctId,
        insertId: createInsertId(eventName),
        time: Math.floor(Date.now() / 1000),
      }),
      keepalive: true,
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { ok?: unknown };
    return payload.ok === true;
  } catch {
    return false;
  }
}

export async function identifyMixpanelUser(userId: unknown, profile: MixpanelUserProfile = {}) {
  if (typeof userId !== "string" || userId.length === 0 || typeof window === "undefined") {
    return false;
  }

  window.localStorage.setItem(identifiedDistinctIdKey, userId);

  if (!(await initMixpanel())) {
    return true;
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

  return true;
}

export async function resetMixpanel() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(identifiedDistinctIdKey);
  }

  if (await initMixpanel()) {
    mixpanel.reset();
  }

  return true;
}
