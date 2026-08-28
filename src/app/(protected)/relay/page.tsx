"use client";

import { useApp } from "@/context/AppContext";
import { useEffect, useMemo, useState } from "react";

type RelayStatus = "all" | "succeeded" | "partial_failed" | "failed" | "unauthorized";
type CallbackStatus = "all" | "accepted" | "duplicate" | "rejected";

type RelayConfig = {
  id: string | null;
  platform: "onesignal";
  name: string;
  appId: string | null;
  defaultLaunchUrl: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type RelayAttempt = {
  id: string;
  platform: "onesignal";
  source: string;
  inboundPayload: unknown;
  outboundPayload: unknown;
  response: unknown;
  status: Exclude<RelayStatus, "all">;
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
};

type RelayCallback = {
  id: string;
  platform: "onesignal";
  source: string;
  eventType: string;
  eventId: string | null;
  messageId: string | null;
  subscriptionId: string | null;
  externalId: string | null;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  response: unknown;
  responseHeaders: Record<string, unknown>;
  status: Exclude<CallbackStatus, "all">;
  statusCode: number | null;
  duplicate: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
};

const productionEndpoint = "https://monitor-trace.vercel.app/api/webhooks/onesignal/push";
const eventStreamEndpoint = "https://monitor-trace.vercel.app/webhooks/onesignal/events";

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: RelayStatus, locale: string) {
  const labels = {
    all: locale === "zh" ? "全部" : "All",
    succeeded: locale === "zh" ? "成功" : "Succeeded",
    partial_failed: locale === "zh" ? "部分失败" : "Partial failed",
    failed: locale === "zh" ? "失败" : "Failed",
    unauthorized: locale === "zh" ? "未授权" : "Unauthorized",
  };

  return labels[status];
}

function statusClassName(status: RelayAttempt["status"]) {
  if (status === "succeeded") {
    return "badge badge-success";
  }
  if (status === "partial_failed") {
    return "badge badge-neutral";
  }

  return "badge badge-error";
}

function callbackStatusLabel(status: CallbackStatus, locale: string) {
  const labels = {
    all: locale === "zh" ? "全部" : "All",
    accepted: locale === "zh" ? "已接收" : "Accepted",
    duplicate: locale === "zh" ? "重复" : "Duplicate",
    rejected: locale === "zh" ? "拒收" : "Rejected",
  };

  return labels[status];
}

function callbackStatusClassName(status: RelayCallback["status"]) {
  if (status === "accepted") {
    return "badge badge-success";
  }
  if (status === "duplicate") {
    return "badge badge-neutral";
  }

  return "badge badge-error";
}

function eventTypeLabel(eventType: string, locale: string) {
  const labels: Record<string, string> = {
    "message.push.sent": locale === "zh" ? "已发送" : "Sent",
    "message.push.received": locale === "zh" ? "已触达" : "Received",
    "message.push.clicked": locale === "zh" ? "已点击" : "Clicked",
    "message.push.failed": locale === "zh" ? "失败" : "Failed",
    "notification.clicked": locale === "zh" ? "已点击" : "Clicked",
  };

  return labels[eventType] || eventType;
}

function jsonBlock(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function MessageRelayPage() {
  const { locale } = useApp();
  const [platform, setPlatform] = useState<"onesignal">("onesignal");
  const [status, setStatus] = useState<RelayStatus>("all");
  const [callbackStatus, setCallbackStatus] = useState<CallbackStatus>("all");
  const [configs, setConfigs] = useState<RelayConfig[]>([]);
  const [attempts, setAttempts] = useState<RelayAttempt[]>([]);
  const [callbacks, setCallbacks] = useState<RelayCallback[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [selectedCallbackId, setSelectedCallbackId] = useState<string | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "OneSignal",
    appId: "dbb8017a-3495-402d-9094-e408bd1d6e27",
    defaultLaunchUrl: "",
    enabled: true,
  });

  async function loadRelayData(nextStatus = status, nextCallbackStatus = callbackStatus) {
    setIsLoading(true);
    setError(null);

    try {
      const [configResponse, attemptResponse, callbackResponse] = await Promise.all([
        fetch("/api/message-relay/configs", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/message-relay/attempts?platform=${platform}&status=${nextStatus}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch(`/api/message-relay/callbacks?platform=${platform}&status=${nextCallbackStatus}`, {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);
      const configPayload = await configResponse.json().catch(() => null);
      const attemptPayload = await attemptResponse.json().catch(() => null);
      const callbackPayload = await callbackResponse.json().catch(() => null);

      if (!configResponse.ok) {
        throw new Error(configPayload?.error || "Unable to load relay config");
      }
      if (!attemptResponse.ok) {
        throw new Error(attemptPayload?.error || "Unable to load relay history");
      }
      if (!callbackResponse.ok) {
        throw new Error(callbackPayload?.error || "Unable to load relay callbacks");
      }

      const nextConfigs = configPayload?.configs || [];
      const activeConfig = nextConfigs.find((config: RelayConfig) => config.platform === platform) || nextConfigs[0];
      const nextAttempts = attemptPayload?.attempts || [];
      const nextCallbacks = callbackPayload?.callbacks || [];

      setConfigs(nextConfigs);
      setApiKeyConfigured(Boolean(configPayload?.secrets?.onesignalRestApiKeyConfigured));
      setAttempts(nextAttempts);
      setCallbacks(nextCallbacks);
      setSelectedAttemptId((currentId) => {
        if (currentId && nextAttempts.some((attempt: RelayAttempt) => attempt.id === currentId)) {
          return currentId;
        }

        return nextAttempts[0]?.id || null;
      });
      setSelectedCallbackId((currentId) => {
        if (currentId && nextCallbacks.some((callback: RelayCallback) => callback.id === currentId)) {
          return currentId;
        }

        return nextCallbacks[0]?.id || null;
      });

      if (activeConfig) {
        setForm({
          name: activeConfig.name || "OneSignal",
          appId: activeConfig.appId || "",
          defaultLaunchUrl: activeConfig.defaultLaunchUrl || "",
          enabled: activeConfig.enabled,
        });
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : locale === "zh"
            ? "中转数据加载失败"
            : "Unable to load relay data"
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadRelayData(status, callbackStatus);
    }, 0);

    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, status, callbackStatus]);

  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.id === selectedAttemptId) || attempts[0] || null,
    [attempts, selectedAttemptId]
  );
  const selectedCallback = useMemo(
    () => callbacks.find((callback) => callback.id === selectedCallbackId) || callbacks[0] || null,
    [callbacks, selectedCallbackId]
  );
  const activeConfig = useMemo(
    () => configs.find((config) => config.platform === platform) || null,
    [configs, platform]
  );
  const summary = useMemo(
    () =>
      attempts.reduce(
        (nextSummary, attempt) => {
          nextSummary.total += 1;
          nextSummary[attempt.status] += 1;
          return nextSummary;
        },
        {
          total: 0,
          succeeded: 0,
          partial_failed: 0,
          failed: 0,
          unauthorized: 0,
        }
      ),
    [attempts]
  );
  const callbackSummary = useMemo(
    () =>
      callbacks.reduce(
        (nextSummary, callback) => {
          nextSummary.total += 1;
          nextSummary[callback.status] += 1;
          return nextSummary;
        },
        {
          total: 0,
          accepted: 0,
          duplicate: 0,
          rejected: 0,
        }
      ),
    [callbacks]
  );

  async function saveConfig() {
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/message-relay/configs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          name: form.name,
          appId: form.appId,
          defaultLaunchUrl: form.defaultLaunchUrl,
          enabled: form.enabled,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save relay config");
      }

      setNotice(locale === "zh" ? "配置已保存" : "Config saved");
      await loadRelayData(status, callbackStatus);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : locale === "zh"
            ? "配置保存失败"
            : "Unable to save config"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
            {locale === "zh" ? "消息中转" : "Message relay"}
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {locale === "zh"
              ? "查看 Hermes 入站消息和目标平台转发结果"
              : "Inspect Hermes inbound messages and downstream delivery results"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as "onesignal")}
            style={{
              minHeight: "40px",
              minWidth: "150px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <option value="onesignal">OneSignal</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={() => loadRelayData(status, callbackStatus)}>
            {locale === "zh" ? "刷新" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="badge badge-error" role="status" style={{ width: "fit-content" }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="badge badge-success" role="status" style={{ width: "fit-content" }}>
          {notice}
        </div>
      ) : null}

      <section
        className="glass-panel"
        style={{
          padding: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {([
          ["total", summary.total],
          ["succeeded", summary.succeeded],
          ["partial_failed", summary.partial_failed],
          ["failed", summary.failed],
          ["unauthorized", summary.unauthorized],
        ] as const).map(([key, value]) => (
          <div
            key={key}
            style={{
              padding: "0.875rem",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
            }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.35rem" }}>
              {key === "total" ? (locale === "zh" ? "当前列表" : "Current list") : statusLabel(key, locale)}
            </p>
            <p style={{ color: "var(--text-primary)", fontSize: "1.35rem", fontWeight: 700 }}>{value}</p>
          </div>
        ))}
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 0.9fr) minmax(420px, 1.4fr)",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        <section className="glass-panel" style={{ minHeight: "640px", overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <strong>{locale === "zh" ? "中转历史" : "Relay history"}</strong>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as RelayStatus)}
              style={{
                minHeight: "36px",
                maxWidth: "150px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                padding: "0.4rem 0.6rem",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {(["all", "succeeded", "partial_failed", "failed", "unauthorized"] as const).map((nextStatus) => (
                <option key={nextStatus} value={nextStatus}>
                  {statusLabel(nextStatus, locale)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ overflowY: "auto", maxHeight: "760px" }}>
            {isLoading ? (
              <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                {locale === "zh" ? "加载中" : "Loading"}
              </p>
            ) : attempts.length === 0 ? (
              <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                {locale === "zh" ? "暂无中转记录" : "No relay records"}
              </p>
            ) : (
              attempts.map((attempt) => {
                const isSelected = selectedAttempt?.id === attempt.id;

                return (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => setSelectedAttemptId(attempt.id)}
                    style={{
                      width: "100%",
                      minHeight: "108px",
                      padding: "1rem",
                      border: 0,
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isSelected ? "var(--accent-glow)" : "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "grid",
                      gap: "0.45rem",
                    }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <span className={statusClassName(attempt.status)}>{statusLabel(attempt.status, locale)}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {formatDate(attempt.createdAt, locale)}
                      </span>
                    </span>
                    <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 650 }}>
                      Hermes {"->"} {attempt.platform}
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      HTTP {attempt.statusCode || "-"} · {attempt.durationMs ?? "-"}ms
                    </span>
                    {attempt.errorMessage ? (
                      <span style={{ color: "var(--status-error)", fontSize: "0.78rem" }}>
                        {attempt.errorMessage}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <section className="glass-panel" style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", marginBottom: "0.35rem" }}>
                  {locale === "zh" ? "平台配置" : "Platform config"}
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  {activeConfig?.updatedAt
                    ? `${locale === "zh" ? "更新于" : "Updated"} ${formatDate(activeConfig.updatedAt, locale)}`
                    : locale === "zh"
                      ? "使用环境变量默认值"
                      : "Using environment defaults"}
                </p>
              </div>
              <span className={apiKeyConfigured ? "badge badge-success" : "badge badge-error"}>
                {apiKeyConfigured
                  ? locale === "zh"
                    ? "API Key 已配置"
                    : "API key set"
                  : locale === "zh"
                    ? "缺少 API Key"
                    : "API key missing"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.875rem" }}>
              <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                {locale === "zh" ? "配置名称" : "Config name"}
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  style={{
                    minHeight: "40px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "0.55rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                OneSignal App ID
                <input
                  value={form.appId}
                  onChange={(event) => setForm((current) => ({ ...current, appId: event.target.value }))}
                  style={{
                    minHeight: "40px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "0.55rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                {locale === "zh" ? "默认打开 URL" : "Default launch URL"}
                <input
                  value={form.defaultLaunchUrl}
                  onChange={(event) => setForm((current) => ({ ...current, defaultLaunchUrl: event.target.value }))}
                  placeholder="https://monitor-trace.vercel.app/messages"
                  style={{
                    minHeight: "40px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "0.55rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
              <label style={{ display: "flex", gap: "0.55rem", alignItems: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                {locale === "zh" ? "启用 OneSignal 中转" : "Enable OneSignal relay"}
              </label>
              <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={isSaving}>
                {isSaving ? (locale === "zh" ? "保存中" : "Saving") : locale === "zh" ? "保存配置" : "Save config"}
              </button>
            </div>

            <div
              style={{
                padding: "0.875rem",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontSize: "0.82rem",
                lineHeight: 1.6,
                wordBreak: "break-all",
              }}
            >
              {productionEndpoint}
            </div>
          </section>

          <section className="glass-panel" style={{ minHeight: "420px", padding: "1.25rem", display: "grid", gap: "1rem" }}>
            {selectedAttempt ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    <span className={statusClassName(selectedAttempt.status)}>
                      {statusLabel(selectedAttempt.status, locale)}
                    </span>
                    <h2 style={{ fontSize: "1.2rem" }}>
                      {locale === "zh" ? "中转详情" : "Relay detail"}
                    </h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      HTTP {selectedAttempt.statusCode || "-"} · {selectedAttempt.durationMs ?? "-"}ms ·{" "}
                      {formatDate(selectedAttempt.createdAt, locale)}
                    </p>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "1rem" }}>
                  {[
                    [locale === "zh" ? "Hermes 入站" : "Hermes inbound", selectedAttempt.inboundPayload],
                    [locale === "zh" ? "转发 payload" : "Forwarded payload", selectedAttempt.outboundPayload],
                    [locale === "zh" ? "OneSignal 响应" : "OneSignal response", selectedAttempt.response],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ display: "grid", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.9rem" }}>{String(label)}</strong>
                      <pre
                        style={{
                          maxHeight: "260px",
                          margin: 0,
                          padding: "1rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          overflow: "auto",
                          fontSize: "0.78rem",
                          lineHeight: 1.55,
                        }}
                      >
                        {jsonBlock(value)}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ color: "var(--text-secondary)" }}>
                {locale === "zh" ? "选择一条中转记录" : "Select a relay record"}
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="glass-panel" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "1rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.3rem" }}>
              {locale === "zh" ? "实际触达 / 点击回调" : "Delivery and click callbacks"}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", wordBreak: "break-all" }}>
              {eventStreamEndpoint}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              {([
                ["total", callbackSummary.total],
                ["accepted", callbackSummary.accepted],
                ["duplicate", callbackSummary.duplicate],
                ["rejected", callbackSummary.rejected],
              ] as const).map(([key, value]) => (
                <span key={key} className={key === "rejected" ? "badge badge-error" : "badge badge-neutral"}>
                  {key === "total"
                    ? locale === "zh"
                      ? `回调 ${value}`
                      : `Callbacks ${value}`
                    : `${callbackStatusLabel(key, locale)} ${value}`}
                </span>
              ))}
            </div>
            <select
              value={callbackStatus}
              onChange={(event) => setCallbackStatus(event.target.value as CallbackStatus)}
              style={{
                minHeight: "36px",
                minWidth: "130px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                padding: "0.4rem 0.6rem",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {(["all", "accepted", "duplicate", "rejected"] as const).map((nextStatus) => (
                <option key={nextStatus} value={nextStatus}>
                  {callbackStatusLabel(nextStatus, locale)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 0.85fr) minmax(420px, 1.4fr)",
            minHeight: "540px",
          }}
        >
          <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto", maxHeight: "760px" }}>
            {isLoading ? (
              <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                {locale === "zh" ? "加载中" : "Loading"}
              </p>
            ) : callbacks.length === 0 ? (
              <div style={{ padding: "1rem", color: "var(--text-secondary)", display: "grid", gap: "0.45rem" }}>
                <strong style={{ color: "var(--text-primary)" }}>
                  {locale === "zh" ? "暂无 OneSignal 回调" : "No OneSignal callbacks yet"}
                </strong>
                <span style={{ fontSize: "0.875rem" }}>
                  {locale === "zh"
                    ? "只有 OneSignal 实际产生 sent / received / clicked / failed 事件并请求上面的 webhook 后，这里才会出现记录。"
                    : "Records appear here after OneSignal sends sent, received, clicked, or failed events to the webhook above."}
                </span>
              </div>
            ) : (
              callbacks.map((callback) => {
                const isSelected = selectedCallback?.id === callback.id;

                return (
                  <button
                    key={callback.id}
                    type="button"
                    onClick={() => setSelectedCallbackId(callback.id)}
                    style={{
                      width: "100%",
                      minHeight: "118px",
                      padding: "1rem",
                      border: 0,
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isSelected ? "var(--accent-glow)" : "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "grid",
                      gap: "0.45rem",
                    }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                      <span className={callbackStatusClassName(callback.status)}>
                        {eventTypeLabel(callback.eventType, locale)}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {formatDate(callback.createdAt, locale)}
                      </span>
                    </span>
                    <span style={{ color: "var(--text-primary)", fontSize: "0.92rem", fontWeight: 650 }}>
                      {callback.eventType}
                    </span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                      HTTP {callback.statusCode || "-"} · {callback.durationMs ?? "-"}ms ·{" "}
                      {callbackStatusLabel(callback.status, locale)}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", wordBreak: "break-all" }}>
                      {callback.externalId || callback.subscriptionId || callback.messageId || callback.eventId || "-"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div style={{ padding: "1.25rem", overflowY: "auto", display: "grid", gap: "1rem" }}>
            {selectedCallback ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    <span className={callbackStatusClassName(selectedCallback.status)}>
                      {callbackStatusLabel(selectedCallback.status, locale)}
                    </span>
                    <h3 style={{ fontSize: "1.15rem" }}>
                      {eventTypeLabel(selectedCallback.eventType, locale)}
                    </h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      HTTP {selectedCallback.statusCode || "-"} · {selectedCallback.durationMs ?? "-"}ms ·{" "}
                      {formatDate(selectedCallback.createdAt, locale)}
                    </p>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                  {[
                    [locale === "zh" ? "事件 ID" : "Event ID", selectedCallback.eventId],
                    [locale === "zh" ? "消息 ID" : "Message ID", selectedCallback.messageId],
                    [locale === "zh" ? "订阅 ID" : "Subscription ID", selectedCallback.subscriptionId],
                    [locale === "zh" ? "External ID" : "External ID", selectedCallback.externalId],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      style={{
                        padding: "0.875rem",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-secondary)",
                      }}
                    >
                      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        {String(label)}
                      </p>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", wordBreak: "break-all" }}>
                        {String(value || "-")}
                      </p>
                    </div>
                  ))}
                </div>

                {selectedCallback.errorMessage ? (
                  <div className="badge badge-error" style={{ width: "fit-content", borderRadius: "var(--radius-sm)" }}>
                    {selectedCallback.errorMessage}
                  </div>
                ) : null}

                {[
                  [locale === "zh" ? "OneSignal 请求头" : "OneSignal request headers", selectedCallback.requestHeaders],
                  [locale === "zh" ? "OneSignal 请求体" : "OneSignal request body", selectedCallback.requestBody],
                  [locale === "zh" ? "我们返回给 OneSignal" : "Response returned to OneSignal", selectedCallback.response],
                  [locale === "zh" ? "响应头" : "Response headers", selectedCallback.responseHeaders],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ display: "grid", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.9rem" }}>{String(label)}</strong>
                    <pre
                      style={{
                        maxHeight: "280px",
                        margin: 0,
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        overflow: "auto",
                        fontSize: "0.78rem",
                        lineHeight: 1.55,
                      }}
                    >
                      {jsonBlock(value)}
                    </pre>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ color: "var(--text-secondary)" }}>
                {locale === "zh" ? "选择一条 OneSignal 回调" : "Select a OneSignal callback"}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
