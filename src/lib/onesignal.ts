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
    requestPermission?: () => Promise<boolean> | boolean;
  };
  User?: {
    PushSubscription?: {
      id?: string | null;
      optedIn?: boolean;
      optIn?: () => Promise<void> | void;
      optOut?: () => Promise<void> | void;
    };
  };
};

type OneSignalWindow = Window & {
  OneSignalDeferred?: Array<(oneSignal: OneSignalSdk) => void | Promise<void>>;
  __monitorTraceOneSignalInitPromise?: Promise<OneSignalSdk | null>;
};

export type OneSignalPushState =
  | "unsupported"
  | "missing_app_id"
  | "blocked"
  | "subscribed"
  | "ready";

export type OneSignalSubscriptionStatus = {
  state: OneSignalPushState;
  permission: NotificationPermission | "unsupported";
  subscriptionId: string | null;
  optedIn: boolean;
};

export const defaultOneSignalAppId = "dbb8017a-3495-402d-9094-e408bd1d6e27";
export const oneSignalAppId =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || defaultOneSignalAppId;

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

export async function initOneSignal() {
  if (!isPushSupported() || !isOneSignalConfigured()) {
    return null;
  }

  const oneSignalWindow = getOneSignalWindow();

  if (!oneSignalWindow.__monitorTraceOneSignalInitPromise) {
    oneSignalWindow.OneSignalDeferred = oneSignalWindow.OneSignalDeferred || [];
    oneSignalWindow.__monitorTraceOneSignalInitPromise = new Promise((resolve) => {
      oneSignalWindow.OneSignalDeferred?.push(async (oneSignal) => {
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
          resolve(oneSignal);
        } catch {
          resolve(null);
        }
      });
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

export async function requestOneSignalPushPermission() {
  const oneSignal = await initOneSignal();

  if (!oneSignal?.Notifications?.requestPermission) {
    return false;
  }

  try {
    const granted = await oneSignal.Notifications.requestPermission();

    if (granted && oneSignal.User?.PushSubscription?.optIn) {
      await oneSignal.User.PushSubscription.optIn();
    }

    return Boolean(granted);
  } catch {
    return false;
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
