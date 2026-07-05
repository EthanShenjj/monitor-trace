type AmplitudeClient = {
  track?: (eventName: string, eventProperties?: Record<string, unknown>) => unknown;
  setUserId?: (userId: string) => unknown;
  identify?: (identify: unknown) => unknown;
};

type AmplitudeWindow = Window & {
  amplitude?: AmplitudeClient;
  __authExperimentEventQueue?: QueuedAuthExperimentEvent[];
  __authCopyExperimentVariant?: AuthCopyExperimentVariant;
  __authExperimentUserId?: string;
};

export type AuthExperimentMode = "login" | "register";
export type AuthCopyExperimentVariant = "control" | "treatment";

export type AuthExperimentProperties = {
  auth_mode?: AuthExperimentMode;
  page_path?: string;
  experiment_key?: string;
  experiment_variant?: AuthCopyExperimentVariant;
  [key: string]: unknown;
};

type QueuedAuthExperimentEvent = {
  eventName: string;
  properties: Record<string, unknown>;
};

const authAnalyticsEndpoint = "/api/analytics/amplitude";
const deviceIdStorageKey = "auth-copy-experiment-device-id";

function getAmplitudeWindow() {
  return window as AmplitudeWindow;
}

function createId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDeviceId() {
  const storedDeviceId = window.localStorage.getItem(deviceIdStorageKey);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = createId("device");
  window.localStorage.setItem(deviceIdStorageKey, deviceId);
  return deviceId;
}

function sendToAmplitude(eventName: string, eventProperties: Record<string, unknown>) {
  const amplitude = getAmplitudeWindow().amplitude;

  if (typeof amplitude?.track !== "function") {
    return false;
  }

  amplitude.track(eventName, eventProperties);
  return true;
}

function sendToAnalyticsRoute(eventName: string, eventProperties: Record<string, unknown>) {
  const amplitudeWindow = getAmplitudeWindow();
  const payload = JSON.stringify({
    eventName,
    properties: eventProperties,
    deviceId: getDeviceId(),
    userId: amplitudeWindow.__authExperimentUserId,
    insertId: createId("event"),
    time: Date.now(),
  });

  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });

    if (navigator.sendBeacon(authAnalyticsEndpoint, blob)) {
      return true;
    }
  }

  fetch(authAnalyticsEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});

  return true;
}

function cleanEventProperties(properties: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function trackAmplitudeEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
) {
  if (typeof window === "undefined") {
    return;
  }

  const eventProperties = cleanEventProperties(properties);
  const amplitudeWindow = getAmplitudeWindow();

  if (!sendToAnalyticsRoute(eventName, eventProperties) && !sendToAmplitude(eventName, eventProperties)) {
    amplitudeWindow.__authExperimentEventQueue = amplitudeWindow.__authExperimentEventQueue || [];
    amplitudeWindow.__authExperimentEventQueue.push({ eventName, properties: eventProperties });
  }
}

export function trackAuthExperimentEvent(
  eventName: string,
  properties: AuthExperimentProperties
) {
  if (typeof window === "undefined") {
    return;
  }

  const eventProperties = {
    experiment_surface: "auth",
    ...properties,
  };

  trackAmplitudeEvent(eventName, eventProperties);

  window.dispatchEvent(
    new CustomEvent("auth-experiment:event", {
      detail: {
        eventName,
        properties: cleanEventProperties(eventProperties),
      },
    })
  );
}

export function flushQueuedAuthExperimentEvents() {
  if (typeof window === "undefined") {
    return;
  }

  const amplitudeWindow = getAmplitudeWindow();
  const queue = amplitudeWindow.__authExperimentEventQueue;

  if (!queue?.length) {
    return;
  }

  amplitudeWindow.__authExperimentEventQueue = queue.filter(
    (event) => !sendToAmplitude(event.eventName, event.properties)
  );
}

export function identifyAmplitudeUser(userId: unknown) {
  if (typeof window === "undefined" || typeof userId !== "string" || userId.length === 0) {
    return;
  }

  const amplitude = getAmplitudeWindow().amplitude;
  getAmplitudeWindow().__authExperimentUserId = userId;

  if (typeof amplitude?.setUserId === "function") {
    amplitude.setUserId(userId);
  }

  flushQueuedAuthExperimentEvents();
}

export function identifyAuthExperimentUser(userId: unknown) {
  identifyAmplitudeUser(userId);
}

export const AUTH_COPY_EXPERIMENT_KEY = "test";
export const AUTH_COPY_VARIANT_STORAGE_KEY = "auth-copy-variant";

export function normalizeAuthCopyExperimentVariant(
  variant: unknown
): AuthCopyExperimentVariant | null {
  return variant === "control" || variant === "treatment" ? variant : null;
}

export function resolveAuthCopyExperimentVariant(): AuthCopyExperimentVariant {
  if (typeof window === "undefined") {
    return "control";
  }

  const amplitudeWindow = getAmplitudeWindow();
  const searchParams = new URLSearchParams(window.location.search);
  const candidates = [
    searchParams.get("auth_copy_variant"),
    searchParams.get("authCopyVariant"),
    amplitudeWindow.__authCopyExperimentVariant,
    document.documentElement.dataset.authCopyVariant,
    document.body?.dataset.authCopyVariant,
    window.localStorage.getItem(AUTH_COPY_VARIANT_STORAGE_KEY),
  ];

  for (const candidate of candidates) {
    const variant = normalizeAuthCopyExperimentVariant(candidate);

    if (variant) {
      return variant;
    }
  }

  return "control";
}

export function persistAuthCopyExperimentVariant(variant: AuthCopyExperimentVariant) {
  if (typeof window === "undefined") {
    return;
  }

  getAmplitudeWindow().__authCopyExperimentVariant = variant;
  window.localStorage.setItem(AUTH_COPY_VARIANT_STORAGE_KEY, variant);
}
