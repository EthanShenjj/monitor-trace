"use client";

import { useEffect, useState } from "react";
import {
  getOneSignalSubscriptionStatus,
  identifyOneSignalUser,
  requestOneSignalPushPermission,
  type OneSignalSubscriptionStatus,
} from "@/lib/onesignal";

type OneSignalPushButtonProps = {
  userId: string;
  locale: "zh" | "en";
};

const initialStatus: OneSignalSubscriptionStatus = {
  state: "ready",
  permission: "default",
  subscriptionId: null,
  optedIn: false,
};

function getButtonLabel(status: OneSignalSubscriptionStatus, locale: "zh" | "en") {
  if (status.state === "unsupported") {
    return locale === "zh" ? "不支持推送" : "Push unsupported";
  }

  if (status.state === "blocked") {
    return locale === "zh" ? "推送已阻止" : "Push blocked";
  }

  if (status.state === "missing_app_id") {
    return locale === "zh" ? "未配置推送" : "Push not configured";
  }

  if (status.state === "subscribed") {
    return locale === "zh" ? "推送已启用" : "Push enabled";
  }

  return locale === "zh" ? "启用推送" : "Enable push";
}

function getTitle(status: OneSignalSubscriptionStatus, locale: "zh" | "en") {
  if (status.state === "blocked") {
    return locale === "zh"
      ? "浏览器已阻止通知，请在站点权限中允许通知。"
      : "Notifications are blocked. Allow them in site permissions.";
  }

  if (status.subscriptionId) {
    return `OneSignal subscription: ${status.subscriptionId}`;
  }

  return locale === "zh"
    ? "允许浏览器通知后，OneSignal 会创建一个可测试的 Web Push 订阅。"
    : "Allow browser notifications to create a testable OneSignal Web Push subscription.";
}

export default function OneSignalPushButton({ userId, locale }: OneSignalPushButtonProps) {
  const [status, setStatus] = useState<OneSignalSubscriptionStatus>(initialStatus);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function syncStatus() {
      setIsLoading(true);
      await identifyOneSignalUser(userId);
      const nextStatus = await getOneSignalSubscriptionStatus();

      if (isActive) {
        setStatus(nextStatus);
        setIsLoading(false);
      }
    }

    syncStatus();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const handleClick = async () => {
    if (status.state === "unsupported" || status.state === "missing_app_id" || status.state === "blocked") {
      return;
    }

    setIsLoading(true);
    await identifyOneSignalUser(userId);
    await requestOneSignalPushPermission();
    setStatus(await getOneSignalSubscriptionStatus());
    setIsLoading(false);
  };

  const isDisabled =
    isLoading ||
    status.state === "unsupported" ||
    status.state === "missing_app_id" ||
    status.state === "blocked" ||
    status.state === "subscribed";

  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={handleClick}
      disabled={isDisabled}
      title={getTitle(status, locale)}
      style={{ padding: "0.5rem 1rem", whiteSpace: "nowrap" }}
    >
      {isLoading ? (locale === "zh" ? "推送检测中" : "Checking push") : getButtonLabel(status, locale)}
    </button>
  );
}
