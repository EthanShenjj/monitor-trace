import {
  Experiment,
  type ExperimentClient,
  type ExperimentUser,
  type Exposure,
} from "@amplitude/experiment-js-client";
import {
  AUTH_COPY_EXPERIMENT_KEY,
  AUTH_COPY_VARIANT_STORAGE_KEY,
  type AuthCopyExperimentVariant,
  normalizeAuthCopyExperimentVariant,
  persistAuthCopyExperimentVariant,
  trackAuthExperimentEvent,
} from "@/lib/amplitude";

const deploymentKey = process.env.NEXT_PUBLIC_AMPLITUDE_EXPERIMENT_DEPLOYMENT_KEY;
const deviceIdStorageKey = "auth-copy-experiment-device-id";

let experimentClient: ExperimentClient | null = null;
let variantPromise: Promise<AuthCopyExperimentVariant> | null = null;

function createDeviceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDeviceId() {
  const storedDeviceId = window.localStorage.getItem(deviceIdStorageKey);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = createDeviceId();
  window.localStorage.setItem(deviceIdStorageKey, deviceId);
  return deviceId;
}

function getExperimentUser(): ExperimentUser {
  return {
    device_id: getDeviceId(),
    language: navigator.language,
    platform: "Web",
    user_agent: navigator.userAgent,
  };
}

function trackExposure(exposure: Exposure) {
  trackAuthExperimentEvent("$exposure", {
    experiment_key: exposure.experiment_key || AUTH_COPY_EXPERIMENT_KEY,
    experiment_variant: normalizeAuthCopyExperimentVariant(exposure.variant) || "control",
    flag_key: exposure.flag_key,
    variant: exposure.variant,
  });
}

function getExperimentClient() {
  if (!deploymentKey) {
    return null;
  }

  if (!experimentClient) {
    experimentClient = Experiment.initialize(deploymentKey, {
      automaticExposureTracking: true,
      exposureTrackingProvider: {
        track: trackExposure,
      },
      fetchTimeoutMillis: 3000,
      pollOnStart: false,
      retryFetchOnFailure: false,
    });
  }

  return experimentClient;
}

export function getStoredAuthCopyExperimentVariant() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeAuthCopyExperimentVariant(
    window.localStorage.getItem(AUTH_COPY_VARIANT_STORAGE_KEY)
  );
}

export function fetchAuthCopyExperimentVariant() {
  if (typeof window === "undefined") {
    return Promise.resolve<AuthCopyExperimentVariant>("control");
  }

  const client = getExperimentClient();

  if (!client) {
    return Promise.resolve<AuthCopyExperimentVariant>("control");
  }

  if (!variantPromise) {
    variantPromise = client
      .start(getExperimentUser())
      .then(() => {
        const variant = normalizeAuthCopyExperimentVariant(
          client.variant(AUTH_COPY_EXPERIMENT_KEY, { value: "control" }).value
        );

        if (!variant) {
          return "control";
        }

        persistAuthCopyExperimentVariant(variant);
        return variant;
      })
      .catch(() => "control");
  }

  return variantPromise;
}
