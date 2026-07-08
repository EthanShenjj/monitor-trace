"use client";

import { useApp } from "@/context/AppContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useEffect, useMemo, useState } from "react";

type WebhookMessage = {
  id: string;
  provider: string;
  externalId: string | null;
  eventType: string;
  title: string;
  body: string;
  rawPayload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type MessageStatus = "all" | "unread";

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatEventName(value: string) {
  return value.replace(/[_-]/g, " ");
}

export default function MessagesPage() {
  const { locale, t } = useApp();
  const [messages, setMessages] = useState<WebhookMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState<MessageStatus>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackAnalyticsEvent("message_center_viewed", {
      platform: "web",
      status_filter: status,
    });
  }, [status]);

  useEffect(() => {
    let isActive = true;

    async function loadMessages() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/messages?status=${status}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const statusCode = response.status;
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const messageError = new Error(payload?.error || "Unable to load messages");
          messageError.name = String(statusCode);
          throw messageError;
        }

        if (!isActive) {
          return;
        }

        const nextMessages = payload?.messages || [];
        setMessages(nextMessages);
        setUnreadCount(payload?.unreadCount || 0);
        setSelectedMessageId((currentId) => {
          if (currentId && nextMessages.some((message: WebhookMessage) => message.id === currentId)) {
            return currentId;
          }

          return nextMessages[0]?.id || null;
        });
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        const statusCode = loadError instanceof Error && /^\d+$/.test(loadError.name)
          ? Number(loadError.name)
          : undefined;
        const failureReason = loadError instanceof Error ? loadError.message : "Unable to load messages";

        trackAnalyticsEvent("message_load_failed", {
          platform: "web",
          status_filter: status,
          status_code: statusCode,
          failure_reason: failureReason,
        });

        if (statusCode) {
          trackAnalyticsEvent("api_request_failed", {
            platform: "web",
            api_path: "/api/messages",
            status_code: statusCode,
            feature: "message_center",
            failure_reason: failureReason,
          });
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : locale === "zh"
              ? "消息加载失败"
              : "Unable to load messages"
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadMessages();

    return () => {
      isActive = false;
    };
  }, [locale, status]);

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedMessageId) || messages[0] || null,
    [messages, selectedMessageId]
  );

  const handleSelectMessage = (message: WebhookMessage) => {
    setSelectedMessageId(message.id);
    trackAnalyticsEvent("message_opened", {
      platform: "web",
      provider: message.provider,
      event_type: message.eventType,
      message_status: message.readAt ? "read" : "unread",
    });
  };

  const handleMarkRead = async (message: WebhookMessage) => {
    if (message.readAt) {
      return;
    }

    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        credentials: "same-origin",
      });
      const statusCode = response.status;
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const markError = new Error(payload?.error || "Unable to update message");
        markError.name = String(statusCode);
        throw markError;
      }

      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === message.id ? payload.message : currentMessage
        )
      );
      setUnreadCount((currentCount) => Math.max(0, currentCount - 1));
      trackAnalyticsEvent("message_marked_read", {
        platform: "web",
        provider: message.provider,
        event_type: message.eventType,
      });
    } catch (markError) {
      const statusCode = markError instanceof Error && /^\d+$/.test(markError.name)
        ? Number(markError.name)
        : undefined;
      const failureReason = markError instanceof Error ? markError.message : "Unable to update message";

      trackAnalyticsEvent("message_mark_read_failed", {
        platform: "web",
        provider: message.provider,
        event_type: message.eventType,
        status_code: statusCode,
        failure_reason: failureReason,
      });

      if (statusCode) {
        trackAnalyticsEvent("api_request_failed", {
          platform: "web",
          api_path: "/api/messages/[id]",
          status_code: statusCode,
          feature: "message_center",
          failure_reason: failureReason,
        });
      }

      setError(
        markError instanceof Error
          ? markError.message
          : locale === "zh"
            ? "消息更新失败"
            : "Unable to update message"
      );
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{t("messages")}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {locale === "zh" ? `${unreadCount} 条未读消息` : `${unreadCount} unread messages`}
          </p>
        </div>

        <div
          style={{
            display: "inline-grid",
            gridTemplateColumns: "1fr 1fr",
            minWidth: "180px",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            background: "var(--bg-surface)",
          }}
        >
          {(["all", "unread"] as const).map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              onClick={() => setStatus(nextStatus)}
              style={{
                minHeight: "38px",
                border: 0,
                borderRight: nextStatus === "all" ? "1px solid var(--border-subtle)" : 0,
                background: status === nextStatus ? "var(--accent-glow)" : "transparent",
                color: status === nextStatus ? "var(--accent-primary)" : "var(--text-secondary)",
                font: "inherit",
                fontSize: "0.875rem",
                fontWeight: status === nextStatus ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {nextStatus === "all"
                ? locale === "zh"
                  ? "全部"
                  : "All"
                : locale === "zh"
                  ? "未读"
                  : "Unread"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="badge badge-error" role="status" style={{ width: "fit-content" }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
          alignItems: "start",
        }}
      >
        <section
          className="glass-panel"
          style={{
            minHeight: "520px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              fontSize: "0.8rem",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {locale === "zh" ? "收件箱" : "Inbox"}
          </div>
          <div style={{ overflowY: "auto", maxHeight: "620px" }}>
            {isLoading ? (
              <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                {locale === "zh" ? "加载中" : "Loading"}
              </p>
            ) : messages.length === 0 ? (
              <p style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                {locale === "zh" ? "暂无消息" : "No messages"}
              </p>
            ) : (
              messages.map((message) => {
                const isSelected = selectedMessage?.id === message.id;
                const isUnread = !message.readAt;

                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => handleSelectMessage(message)}
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
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>
                        {message.provider}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {formatDate(message.createdAt, locale)}
                      </span>
                    </span>
                    <span
                      style={{
                        color: "var(--text-primary)",
                        fontSize: "0.95rem",
                        fontWeight: isUnread ? 700 : 500,
                        lineHeight: 1.35,
                      }}
                    >
                      {message.title}
                    </span>
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.82rem",
                        lineHeight: 1.35,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {message.body}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          className="glass-panel"
          style={{
            minHeight: "520px",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {selectedMessage ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <span className="badge badge-neutral">{selectedMessage.provider}</span>
                    <span className={selectedMessage.readAt ? "badge badge-success" : "badge badge-error"}>
                      {selectedMessage.readAt
                        ? locale === "zh"
                          ? "已读"
                          : "Read"
                        : locale === "zh"
                          ? "未读"
                          : "Unread"}
                    </span>
                  </div>
                  <h2 style={{ fontSize: "1.35rem", lineHeight: 1.25 }}>{selectedMessage.title}</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    {formatEventName(selectedMessage.eventType)} · {formatDate(selectedMessage.createdAt, locale)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={Boolean(selectedMessage.readAt)}
                  onClick={() => handleMarkRead(selectedMessage)}
                >
                  {locale === "zh" ? "标记已读" : "Mark read"}
                </button>
              </div>

              <div
                style={{
                  padding: "1rem",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                  whiteSpace: "pre-wrap",
                  color: "var(--text-primary)",
                  lineHeight: 1.65,
                }}
              >
                {selectedMessage.body}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                <div
                  style={{
                    padding: "0.875rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    {locale === "zh" ? "外部 ID" : "External ID"}
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", wordBreak: "break-word" }}>
                    {selectedMessage.externalId || "-"}
                  </p>
                </div>
                <div
                  style={{
                    padding: "0.875rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    {locale === "zh" ? "读取时间" : "Read at"}
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    {selectedMessage.readAt ? formatDate(selectedMessage.readAt, locale) : "-"}
                  </p>
                </div>
              </div>

              <pre
                style={{
                  marginTop: "auto",
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
                {JSON.stringify(selectedMessage.rawPayload, null, 2)}
              </pre>
            </>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              {locale === "zh" ? "选择一条消息" : "Select a message"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
