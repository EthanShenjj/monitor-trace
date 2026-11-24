"use client";

import type { MixpanelProperties } from "@/lib/mixpanel";

type ThinkingDataBrowser = {
  init: (config: object) => void;
  setSuperProperties: (properties: object) => void;
  track: (
    eventName: string,
    eventProperties?: object,
    eventTime?: Date,
    callback?: (error?: unknown) => void
  ) => void;
  login: (accountId: string) => void;
  logout: (isChangeId?: boolean) => void;
  userSet: (userProperties: object, callback?: (error?: unknown) => void) => void;
  getDeviceId: () => string;
};

type RuntimeAnalyticsConfig = {
  thinkingDataAppId?: string;
  thinkingDataServerUrl?: string;
  mixpanelToken?: string;
  recordSessionsPercent?: number;
  thinkingDataTestAppId?: string;
  thinkingDataTestServerUrl?: string;
};

type ThinkingDataUserProfile = {
  createdAt?: unknown;
};

const defaultAppId = "267ce4dd64dd4e4583646a62a46a2bf2";
const defaultServerUrl = "https://web-ta-demo.thinkingdata.cn/";
const appIdFromEnv = process.env.NEXT_PUBLIC_THINKINGDATA_APP_ID;
const serverUrlFromEnv = process.env.NEXT_PUBLIC_THINKINGDATA_SERVER_URL;
const configLoadedKey = "monitor_thinkingdata_config_loaded";
const replaySampledKey = "monitor_thinkingdata_replay_sampled";

let isInitialized = false;
let initPromise: Promise<boolean> | null = null;
let runtimeConfigPromise: Promise<RuntimeAnalyticsConfig> | null = null;
let thinkingDataClient: ThinkingDataBrowser | null = null;
let activeConnection: { appId: string; serverUrl: string; debug: boolean } | null = null;

const debugStorageKey = "monitor_thinkingdata_debug";

export function isThinkingDataDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const parameter = new URLSearchParams(window.location.search).get("td_debug");
    if (parameter === "1" || parameter === "0") {
      window.sessionStorage.setItem(debugStorageKey, parameter);
    }
    return window.sessionStorage.getItem(debugStorageKey) === "1";
  } catch {
    return false;
  }
}

export function setThinkingDataDebugEnabled(enabled: boolean) {
  window.sessionStorage.setItem(debugStorageKey, enabled ? "1" : "0");
  const url = new URL(window.location.href);
  url.searchParams.set("td_debug", enabled ? "1" : "0");
  window.location.assign(url.href);
}

function cleanProperties(properties: MixpanelProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getReplaySampleRate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return 100;
  }

  const parsedRate = Number(value);

  if (!Number.isFinite(parsedRate)) {
    return 100;
  }

  return Math.min(100, Math.max(0, parsedRate));
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

function getSessionReplaySample(sampleRatePercent: number) {
  if (typeof window === "undefined") {
    return false;
  }

  const storedValue = window.sessionStorage.getItem(replaySampledKey);

  if (storedValue === "true") {
    return true;
  }

  if (storedValue === "false") {
    return false;
  }

  const isSampled = Math.random() * 100 < sampleRatePercent;
  window.sessionStorage.setItem(replaySampledKey, String(isSampled));
  return isSampled;
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
          thinkingDataAppId?: unknown;
          thinkingDataServerUrl?: unknown;
          mixpanelToken?: unknown;
          recordSessionsPercent?: unknown;
          thinkingDataTestAppId?: unknown;
          thinkingDataTestServerUrl?: unknown;
        };

        return {
          thinkingDataAppId: asNonEmptyString(payload.thinkingDataAppId) || undefined,
          thinkingDataServerUrl: asNonEmptyString(payload.thinkingDataServerUrl) || undefined,
          mixpanelToken: asNonEmptyString(payload.mixpanelToken) || undefined,
          recordSessionsPercent: getReplaySampleRate(payload.recordSessionsPercent),
          thinkingDataTestAppId: asNonEmptyString(payload.thinkingDataTestAppId) || undefined,
          thinkingDataTestServerUrl: asNonEmptyString(payload.thinkingDataTestServerUrl) || undefined,
        };
      })
      .catch(() => ({}));
  }

  return runtimeConfigPromise;
}

async function getThinkingDataClient() {
  if (!thinkingDataClient) {
    const thinkingDataModule = await import("thinkingdata-browser");
    thinkingDataClient = thinkingDataModule.default as ThinkingDataBrowser;
  }

  return thinkingDataClient;
}

function trackDiagnosticEvent(
  client: ThinkingDataBrowser,
  eventName: string,
  properties: MixpanelProperties
) {
  try {
    client.track(eventName, cleanProperties(properties));
  } catch {
    // Diagnostics must never affect product flows.
  }
}

export async function initThinkingData() {
  if (typeof window === "undefined") {
    return false;
  }

  if (isInitialized) {
    return true;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const runtimeConfig = await getRuntimeConfig();
      const debug = isThinkingDataDebugEnabled();
      const appId = debug
        ? runtimeConfig.thinkingDataTestAppId
        : asNonEmptyString(appIdFromEnv) || runtimeConfig.thinkingDataAppId || defaultAppId;
      const configuredServerUrl = debug ? runtimeConfig.thinkingDataTestServerUrl :
        asNonEmptyString(serverUrlFromEnv) ||
        runtimeConfig.thinkingDataServerUrl ||
        defaultServerUrl;

      if (!appId || !configuredServerUrl) {
        throw new Error("测试环境未配置 App ID 或 SDK 接收地址，请配置 THINKINGDATA_TEST_APP_ID 和 THINKINGDATA_TEST_SERVER_URL。");
      }
      const serverUrl = new URL(configuredServerUrl, window.location.origin).href.replace(/\/$/, "");

      const client = await getThinkingDataClient();

      client.init({
        appId,
        serverUrl,
        mode: debug ? "debug" : "normal",
        disableRConfig: true,
        send_method: "ajax",
        autoTrack: {
          pageShow: false,
          pageHide: false,
          pageView: false,
          pageClick: false,
        },
        showLog: process.env.NODE_ENV !== "production",
      });
      client.setSuperProperties({
        app_name: "ai_trace_monitor",
        platform: "web",
      });
      isInitialized = true;
      activeConnection = { appId, serverUrl, debug };

      if (window.sessionStorage.getItem(configLoadedKey) !== "true") {
        window.sessionStorage.setItem(configLoadedKey, "true");
        const replaySampleRate = runtimeConfig.recordSessionsPercent ?? 100;

        trackDiagnosticEvent(client, "analytics_config_loaded", {
          platform: "web",
          thinkingdata_configured: true,
          mixpanel_configured: Boolean(asNonEmptyString(process.env.NEXT_PUBLIC_MIXPANEL_TOKEN) || runtimeConfig.mixpanelToken),
          replay_sample_rate_percent: replaySampleRate,
        });
        trackDiagnosticEvent(client, "session_replay_sampled", {
          platform: "web",
          provider: "mixpanel",
          sample_rate_percent: replaySampleRate,
          is_sampled: getSessionReplaySample(replaySampleRate),
        });
      }

      return true;
    })();
  }

  return initPromise;
}

export async function getThinkingDataConnection() {
  if (!(await initThinkingData()) || !activeConnection) return null;
  return { ...activeConnection, client: await getThinkingDataClient() };
}

export async function trackThinkingDataEvent(
  eventName: string,
  properties: MixpanelProperties = {}
) {
  if (typeof window === "undefined") {
    return false;
  }

  if (!(await initThinkingData())) {
    return false;
  }

  try {
    const client = await getThinkingDataClient();

    client.track(eventName, {
      ...getClientProperties(),
      ...cleanProperties(properties),
    });
    return true;
  } catch {
    return false;
  }
}

export async function identifyThinkingDataUser(
  userId: unknown,
  profile: ThinkingDataUserProfile = {}
) {
  if (typeof userId !== "string" || userId.length === 0 || typeof window === "undefined") {
    return false;
  }

  if (!(await initThinkingData())) {
    return false;
  }

  try {
    const client = await getThinkingDataClient();

    client.login(userId);

    const profileProperties = cleanProperties({
      created_at: typeof profile.createdAt === "string" ? profile.createdAt : undefined,
    });

    if (Object.keys(profileProperties).length > 0) {
      client.userSet(profileProperties);
    }

    return true;
  } catch {
    return false;
  }
}

export async function resetThinkingData() {
  if (!(await initThinkingData())) {
    return true;
  }

  try {
    const client = await getThinkingDataClient();

    client.logout();
    return true;
  } catch {
    return false;
  }
}
