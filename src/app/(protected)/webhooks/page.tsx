"use client";

import { useApp } from "@/context/AppContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useEffect, useMemo, useState } from "react";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type WebhookPushAttempt = {
  id: string;
  name: string;
  targetUrl: string;
  headers: Record<string, string>;
  payload: JsonValue;
  status: "succeeded" | "failed" | "pending";
  statusCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  source: string;
  createdAt: string;
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function tryParseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    throw new Error(`${label} JSON is invalid`);
  }
}

function defaultPayload() {
  return JSON.stringify(
    {
      event: "trace.alert",
      timestamp: new Date().toISOString(),
      data: {
        trace_id: "tr_10928374a",
        project_name: "Customer Support Agent",
        status: "error",
      },
    },
    null,
    2
  );
}

export default function WebhooksPage() {
  const { locale, t } = useApp();
  const [name, setName] = useState("Trace alert");
  const [targetUrl, setTargetUrl] = useState("");
  const [headersText, setHeadersText] = useState(
    JSON.stringify({ "X-Webhook-Source": "monitor-trace" }, null, 2)
  );
  const [payloadText, setPayloadText] = useState(defaultPayload);
  const [attempts, setAttempts] = useState<WebhookPushAttempt[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");

  useEffect(() => {
    trackAnalyticsEvent("webhook_push_page_viewed", {
      platform: "web",
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadAttempts() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/webhooks/push", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load webhook pushes");
        }
        if (!isActive) {
          return;
        }

        const nextAttempts = payload?.attempts || [];
        setAttempts(nextAttempts);
        setSelectedAttemptId((currentId) => {
          if (currentId && nextAttempts.some((attempt: WebhookPushAttempt) => attempt.id === currentId)) {
            return currentId;
          }

          return nextAttempts[0]?.id || null;
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatusTone("error");
        setStatusMessage(
          error instanceof Error
            ? error.message
            : locale === "zh"
              ? "推送记录加载失败"
              : "Unable to load webhook pushes"
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadAttempts();

    return () => {
      isActive = false;
    };
  }, [locale]);

  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.id === selectedAttemptId) || attempts[0] || null,
    [attempts, selectedAttemptId]
  );

  const sendWebhook = async () => {
    setIsSending(true);
    setStatusMessage(null);

    let headers: JsonValue;
    let payload: JsonValue;

    try {
      headers = tryParseJson(headersText, "Headers");
      payload = tryParseJson(payloadText, "Payload");

      if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
        throw new Error("Headers JSON must be an object");
      }

      const response = await fetch("/api/webhooks/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name,
          targetUrl,
          headers,
          payload,
          source: "webhook_push_page",
        }),
      });
      const responsePayload = await response.json().catch(() => null);
      const attempt = responsePayload?.attempt as WebhookPushAttempt | undefined;

      if (attempt) {
        setAttempts((currentAttempts) => [attempt, ...currentAttempts.filter((item) => item.id !== attempt.id)].slice(0, 50));
        setSelectedAttemptId(attempt.id);
      }

      if (!response.ok || !attempt || attempt.status !== "succeeded") {
        throw new Error(attempt?.errorMessage || responsePayload?.error || "Webhook push failed");
      }

      trackAnalyticsEvent("webhook_push_sent", {
        platform: "web",
        webhook_name: attempt.name,
        status_code: attempt.statusCode,
        push_status: attempt.status,
      });
      setStatusTone("success");
      setStatusMessage(locale === "zh" ? "推送成功" : "Webhook sent");
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Webhook push failed";

      trackAnalyticsEvent("webhook_push_failed", {
        platform: "web",
        failure_reason: failureReason,
      });
      setStatusTone("error");
      setStatusMessage(locale === "zh" && failureReason === "Webhook push failed" ? "推送失败" : failureReason);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{t("webhooks")}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {locale === "zh" ? "配置目标、发送 JSON 负载并查看响应。" : "Configure targets, send JSON payloads, and inspect responses."}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={sendWebhook} disabled={isSending}>
          {isSending ? (locale === "zh" ? "发送中" : "Sending") : locale === "zh" ? "发送" : "Send"}
        </button>
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "1.5rem",
          color: statusTone === "success" ? "var(--status-success)" : "var(--status-error)",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        {statusMessage || ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "1.25rem", alignItems: "start" }}>
        <section className="glass-panel" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
              {locale === "zh" ? "名称" : "Name"}
            </span>
            <input
              className="input-field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Trace alert"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
              {locale === "zh" ? "目标 URL" : "Target URL"}
            </span>
            <input
              className="input-field"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://example.com/webhook"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
              Headers
            </span>
            <textarea
              className="input-field"
              value={headersText}
              onChange={(event) => setHeadersText(event.target.value)}
              spellCheck={false}
              style={{ minHeight: "118px", resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.55 }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
              Payload
            </span>
            <textarea
              className="input-field"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              spellCheck={false}
              style={{ minHeight: "300px", resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem", lineHeight: 1.55 }}
            />
          </label>
        </section>

        <section className="glass-panel" style={{ minHeight: "650px", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase" }}>
              {locale === "zh" ? "推送记录" : "Pushes"}
            </span>
            <span className="badge badge-neutral">{attempts.length}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", minHeight: 0 }}>
            <div style={{ borderRight: "1px solid var(--border-subtle)", overflowY: "auto" }}>
              {isLoading ? (
                <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                  {locale === "zh" ? "加载中" : "Loading"}
                </p>
              ) : attempts.length === 0 ? (
                <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                  {locale === "zh" ? "暂无记录" : "No pushes"}
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
                        minHeight: "104px",
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
                        <span className={attempt.status === "succeeded" ? "badge badge-success" : "badge badge-error"}>
                          {attempt.status === "succeeded"
                            ? locale === "zh"
                              ? "成功"
                              : "Success"
                            : locale === "zh"
                              ? "失败"
                              : "Failed"}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {formatDate(attempt.createdAt, locale)}
                        </span>
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 700, lineHeight: 1.35 }}>
                        {attempt.name}
                      </span>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", lineHeight: 1.35, wordBreak: "break-all" }}>
                        {attempt.targetUrl}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {selectedAttempt ? (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <span className={selectedAttempt.status === "succeeded" ? "badge badge-success" : "badge badge-error"}>
                      {selectedAttempt.status}
                    </span>
                    <span className="badge badge-neutral">
                      {selectedAttempt.statusCode ? `HTTP ${selectedAttempt.statusCode}` : "No status"}
                    </span>
                    <span className="badge badge-neutral">
                      {selectedAttempt.durationMs === null ? "-" : `${selectedAttempt.durationMs}ms`}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <h2 style={{ fontSize: "1.2rem", lineHeight: 1.3 }}>{selectedAttempt.name}</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", wordBreak: "break-all" }}>
                      {selectedAttempt.targetUrl}
                    </p>
                  </div>

                  {selectedAttempt.errorMessage ? (
                    <div className="badge badge-error" style={{ width: "fit-content", borderRadius: "var(--radius-sm)" }}>
                      {selectedAttempt.errorMessage}
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700 }}>Response</span>
                    <pre
                      style={{
                        minHeight: "128px",
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        fontSize: "0.78rem",
                        lineHeight: 1.55,
                      }}
                    >
                      {selectedAttempt.responseBody || "-"}
                    </pre>
                  </div>

                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700 }}>Payload</span>
                    <pre
                      style={{
                        padding: "1rem",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        overflowX: "auto",
                        fontSize: "0.78rem",
                        lineHeight: 1.55,
                      }}
                    >
                      {JSON.stringify(selectedAttempt.payload, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  {locale === "zh" ? "选择一条记录" : "Select a push"}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
