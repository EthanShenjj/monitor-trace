"use client";

type OneSignalSdk = {
  init: (options: {
    appId: string;
    allowLocalhostAsSecureOrigin?: boolean;
    notifyButton?: { enable: boolean };
    serviceWorkerPath?: string;
    serviceWorkerParam?: { scope: string };
  }) => Promise<void> | void;
  login?: (externalId: string) => Promise<void> | void;
  logout?: () => Promise<void> | void;
  Notifications?: {
    permission?: boolean;
    requestPermission?: (options?: { fallbackToSettings?: boolean }) => Promise<boolean | void> | boolean | void;
    isPushSupported?: () => Promise<boolean> | boolean;
  };
  User?: {
    PushSubscription?: {
      id?: string | null;
      token?: string | null;
      optedIn?: boolean;
      optIn?: () => Promise<void> | void;
      optOut?: () => Promise<void> | void;
      addEventListener?: (
        eventName: "change",
        listener: (event: {
          current?: { id?: string | null; token?: string | null; optedIn?: boolean };
        }) => void
      ) => void;
      removeEventListener?: (
        eventName: "change",
        listener: (event: {
          current?: { id?: string | null; token?: string | null; optedIn?: boolean };
        }) => void
      ) => void;
    };
  };
};

type OneSignalWindow = Window & {
  OneSignalDeferred?: Array<(oneSignal: OneSignalSdk) => void | Promise<void>>;
  __monitorTraceOneSignalLoadPromise?: Promise<boolean>;
  __monitorTraceOneSignalInitPromise?: Promise<OneSignalSdk | null>;
  __monitorTraceOneSignalLastError?: string | null;
  OneSignal?: OneSignalSdk;
};

export type OneSignalPushState =
  | "unsupported"
  | "missing_app_id"
  | "blocked"
  | "subscribed"
  | "sdk_unavailable"
  | "ready";

export type OneSignalSubscriptionStatus = {
  state: OneSignalPushState;
  permission: NotificationPermission | "unsupported";
  subscriptionId: string | null;
  optedIn: boolean;
  error?: string | null;
};

export type OneSignalPermissionResult = {
  ok: boolean;
  status: OneSignalSubscriptionStatus;
  error?: string | null;
};

export const defaultOneSignalAppId = "dbb8017a-3495-402d-9094-e408bd1d6e27";
export const oneSignalAppId =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || defaultOneSignalAppId;
const ONE_SIGNAL_SCRIPT_SRC = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const ONE_SIGNAL_INIT_TIMEOUT_MS = 8000;
const ONE_SIGNAL_PERMISSION_TIMEOUT_MS = 30000;

function getOneSignalWindow() {
  return window as OneSignalWindow;
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isOneSignalConfigured() {
  return oneSignalAppId.trim().length > 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function hasActiveOneSignalSubscription(oneSignal: OneSignalSdk) {
  const pushSubscription = oneSignal.User?.PushSubscription;

  return Boolean(pushSubscription?.id && pushSubscription.optedIn);
}

function waitForActiveOneSignalSubscription(oneSignal: OneSignalSdk, timeoutMs: number) {
  if (hasActiveOneSignalSubscription(oneSignal)) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const pushSubscription = oneSignal.User?.PushSubscription;
    const startedAt = Date.now();

    const cleanup = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      pushSubscription?.removeEventListener?.("change", onChange);
    };

    const finish = (value: boolean) => {
      cleanup();
      resolve(value);
    };

    const check = () => {
      if (hasActiveOneSignalSubscription(oneSignal)) {
        finish(true);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        finish(false);
      }
    };

    const onChange = (event: { current?: { id?: string | null; token?: string | null; optedIn?: boolean } }) => {
      if ((event.current?.id || event.current?.token) && event.current.optedIn) {
        finish(true);
      }
    };

    const intervalId = window.setInterval(check, 500);
    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);

    pushSubscription?.addEventListener?.("change", onChange);
    check();
  });
}

function loadOneSignalSdkScript() {
  const oneSignalWindow = getOneSignalWindow();

  if (oneSignalWindow.OneSignal) {
    return Promise.resolve(true);
  }

  if (!oneSignalWindow.__monitorTraceOneSignalLoadPromise) {
    oneSignalWindow.OneSignalDeferred = oneSignalWindow.OneSignalDeferred || [];
    oneSignalWindow.__monitorTraceOneSignalLoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");

      script.src = ONE_SIGNAL_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        oneSignalWindow.__monitorTraceOneSignalLoadPromise = undefined;
        oneSignalWindow.__monitorTraceOneSignalLastError = "OneSignal SDK script failed to load";
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  return oneSignalWindow.__monitorTraceOneSignalLoadPromise;
}

export async function initOneSignal() {
  if (!isPushSupported() || !isOneSignalConfigured()) {
    return null;
  }

  const oneSignalWindow = getOneSignalWindow();

  if (!oneSignalWindow.__monitorTraceOneSignalInitPromise) {
    oneSignalWindow.OneSignalDeferred = oneSignalWindow.OneSignalDeferred || [];
    oneSignalWindow.__monitorTraceOneSignalInitPromise = new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          oneSignalWindow.__monitorTraceOneSignalInitPromise = undefined;
          oneSignalWindow.__monitorTraceOneSignalLastError = "OneSignal SDK initialization timed out";
          resolve(null);
        }
      }, ONE_SIGNAL_INIT_TIMEOUT_MS);
      const initialize = async (oneSignal: OneSignalSdk) => {
        if (settled) {
          return;
        }

        try {
          await oneSignal.init({
            appId: oneSignalAppId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: {
              enable: false,
            },
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerParam: {
              scope: "/",
            },
          });
          settled = true;
          window.clearTimeout(timeoutId);
          oneSignalWindow.__monitorTraceOneSignalLastError = null;
          resolve(oneSignal);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "OneSignal SDK initialization failed";

          if (errorMessage.toLowerCase().includes("already initialized")) {
            settled = true;
            window.clearTimeout(timeoutId);
            oneSignalWindow.__monitorTraceOneSignalLastError = null;
            resolve(oneSignal);
            return;
          }

          settled = true;
          window.clearTimeout(timeoutId);
          oneSignalWindow.__monitorTraceOneSignalInitPromise = undefined;
          oneSignalWindow.__monitorTraceOneSignalLastError = errorMessage;
          resolve(null);
        }
      };

      if (oneSignalWindow.OneSignal) {
        void initialize(oneSignalWindow.OneSignal);
        return;
      }

      oneSignalWindow.OneSignalDeferred?.push(initialize);
      void loadOneSignalSdkScript();
    });
  }

  return oneSignalWindow.__monitorTraceOneSignalInitPromise;
}

export async function identifyOneSignalUser(userId: unknown) {
  if (typeof userId !== "string" || userId.length === 0) {
    return false;
  }

  const oneSignal = await initOneSignal();

  if (typeof oneSignal?.login !== "function") {
    return false;
  }

  try {
    await oneSignal.login(userId);
    return true;
  } catch {
    return false;
  }
}

export async function resetOneSignalUser() {
  const oneSignal = await initOneSignal();

  if (typeof oneSignal?.logout !== "function") {
    return false;
  }

  try {
    await oneSignal.logout();
    return true;
  } catch {
    return false;
  }
}

export async function requestOneSignalPushPermission(): Promise<OneSignalPermissionResult> {
  if (!isPushSupported()) {
    return {
      ok: false,
      status: {
        state: "unsupported",
        permission: "unsupported",
        subscriptionId: null,
        optedIn: false,
      },
      error: "This browser does not support web push notifications",
    };
  }

  if (!isOneSignalConfigured()) {
    return {
      ok: false,
      status: {
        state: "missing_app_id",
        permission: Notification.permission,
        subscriptionId: null,
        optedIn: false,
      },
      error: "OneSignal app id is not configured",
    };
  }

  try {
    if (Notification.permission === "default") {
      await withTimeout(
        Promise.resolve(Notification.requestPermission()),
        ONE_SIGNAL_PERMISSION_TIMEOUT_MS,
        "Browser notification prompt did not open"
      );
    }
  } catch (error) {
    const status = await getOneSignalSubscriptionStatus();

    return {
      ok: false,
      status,
      error: error instanceof Error ? error.message : "Browser did not complete notification permission",
    };
  }

  if (Notification.permission !== "granted") {
    const status = await getOneSignalSubscriptionStatus();

    return {
      ok: false,
      status,
      error:
        Notification.permission === "denied"
          ? "Notifications are blocked. Allow them in site permissions."
          : "Browser notification permission was not granted",
    };
  }

  const oneSignal = await initOneSignal();

  if (!oneSignal) {
    return {
      ok: false,
      status: {
        state: "sdk_unavailable",
        permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        subscriptionId: null,
        optedIn: false,
        error: getOneSignalWindow().__monitorTraceOneSignalLastError || "OneSignal SDK did not load",
      },
      error: getOneSignalWindow().__monitorTraceOneSignalLastError || "OneSignal SDK did not load",
    };
  }

  try {
    if (Notification.permission === "granted" && oneSignal.User?.PushSubscription?.optIn) {
      let optInError: string | null = null;

      Promise.resolve(oneSignal.User.PushSubscription.optIn()).catch((error) => {
        optInError = error instanceof Error ? error.message : "OneSignal push subscription failed";
      });

      const becameSubscribed = await waitForActiveOneSignalSubscription(
        oneSignal,
        ONE_SIGNAL_PERMISSION_TIMEOUT_MS
      );

      if (!becameSubscribed && optInError) {
        throw new Error(optInError);
      }
    }

    const status = await getOneSignalSubscriptionStatus();

    return {
      ok: status.state === "subscribed",
      status,
      error:
        status.state === "subscribed"
          ? null
          : status.error || "Push subscription was not enabled",
    };
  } catch (error) {
    const status = await getOneSignalSubscriptionStatus();

    return {
      ok: false,
      status,
      error: error instanceof Error ? error.message : "Browser did not complete push permission",
    };
  }
}

export async function getOneSignalSubscriptionStatus(): Promise<OneSignalSubscriptionStatus> {
  if (!isPushSupported()) {
    return {
      state: "unsupported",
      permission: "unsupported",
      subscriptionId: null,
      optedIn: false,
    };
  }

  if (!isOneSignalConfigured()) {
    return {
      state: "missing_app_id",
      permission: Notification.permission,
      subscriptionId: null,
      optedIn: false,
    };
  }

  if (Notification.permission === "denied") {
    return {
      state: "blocked",
      permission: Notification.permission,
      subscriptionId: null,
      optedIn: false,
    };
  }

  const oneSignal = await initOneSignal();
  if (!oneSignal) {
    return {
      state: "sdk_unavailable",
      permission: Notification.permission,
      subscriptionId: null,
      optedIn: false,
      error: getOneSignalWindow().__monitorTraceOneSignalLastError || "OneSignal SDK did not load",
    };
  }

  const pushSubscription = oneSignal?.User?.PushSubscription;
  const subscriptionId = pushSubscription?.id || null;
  const optedIn = Boolean(pushSubscription?.optedIn);

  return {
    state: subscriptionId && optedIn ? "subscribed" : "ready",
    permission: Notification.permission,
    subscriptionId,
    optedIn,
  };
}
