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
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function syncStatus() {
      setIsLoading(true);
      setFeedback(null);
      await identifyOneSignalUser(userId);
      const nextStatus = await getOneSignalSubscriptionStatus();

      if (isActive) {
        setStatus(nextStatus);
        setFeedback(nextStatus.error || null);
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
      setFeedback(getTitle(status, locale));
      return;
    }

    setIsLoading(true);
    setFeedback(locale === "zh" ? "等待浏览器授权" : "Waiting for permission");
    const result = await requestOneSignalPushPermission();
    if (result.ok) {
      await identifyOneSignalUser(userId);
    }
    setStatus(result.status);
    setFeedback(
      result.ok
        ? locale === "zh"
          ? "推送订阅成功"
          : "Push subscribed"
        : result.error || result.status.error || (locale === "zh" ? "推送未启用" : "Push not enabled")
    );
    setIsLoading(false);
  };

  const isDisabled =
    isLoading ||
    status.state === "unsupported" ||
    status.state === "missing_app_id" ||
    status.state === "blocked" ||
    status.state === "subscribed";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={handleClick}
        disabled={isDisabled}
        title={feedback || getTitle(status, locale)}
        style={{ padding: "0.5rem 1rem", whiteSpace: "nowrap" }}
      >
        {isLoading ? (locale === "zh" ? "推送检测中" : "Checking push") : getButtonLabel(status, locale)}
      </button>
      {feedback ? (
        <span
          style={{
            color: status.state === "subscribed" ? "var(--status-success)" : "var(--text-secondary)",
            fontSize: "0.75rem",
            lineHeight: 1.2,
            maxWidth: "12rem",
            textAlign: "right",
          }}
        >
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
