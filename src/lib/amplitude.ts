type AmplitudeClient = {
  track?: (eventName: string, eventProperties?: Record<string, unknown>) => unknown;
  setUserId?: (userId: string) => unknown;
  identify?: (identify: unknown) => unknown;
};

type AmplitudeWindow = Window & {
  amplitude?: AmplitudeClient;
  __authExperimentEventQueue?: QueuedAuthExperimentEvent[];
};

export type AuthExperimentMode = "login" | "register";

export type AuthExperimentProperties = {
  auth_mode: AuthExperimentMode;
  page_path?: string;
  [key: string]: unknown;
};

type QueuedAuthExperimentEvent = {
  eventName: string;
  properties: Record<string, unknown>;
};

function getAmplitudeWindow() {
  return window as AmplitudeWindow;
}

function sendToAmplitude(eventName: string, eventProperties: Record<string, unknown>) {
  const amplitude = getAmplitudeWindow().amplitude;

  if (typeof amplitude?.track !== "function") {
    return false;
  }

  amplitude.track(eventName, eventProperties);
  return true;
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
  const amplitudeWindow = getAmplitudeWindow();

  if (!sendToAmplitude(eventName, eventProperties)) {
    amplitudeWindow.__authExperimentEventQueue = amplitudeWindow.__authExperimentEventQueue || [];
    amplitudeWindow.__authExperimentEventQueue.push({ eventName, properties: eventProperties });
  }

  window.dispatchEvent(
    new CustomEvent("auth-experiment:event", {
      detail: {
        eventName,
        properties: eventProperties,
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

export function identifyAuthExperimentUser(userId: unknown) {
  if (typeof window === "undefined" || typeof userId !== "string" || userId.length === 0) {
    return;
  }

  const amplitude = getAmplitudeWindow().amplitude;

  if (typeof amplitude?.setUserId === "function") {
    amplitude.setUserId(userId);
  }

  flushQueuedAuthExperimentEvents();
}
