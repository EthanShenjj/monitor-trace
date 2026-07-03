"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  flushQueuedAuthExperimentEvents,
  identifyAuthExperimentUser,
  trackAuthExperimentEvent,
} from "@/lib/amplitude";

type AuthMode = "login" | "register";

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  useEffect(() => {
    trackAuthExperimentEvent("Auth Page Viewed", {
      auth_mode: mode,
      page_path: pathname,
    });
    const flushInterval = window.setInterval(flushQueuedAuthExperimentEvents, 500);
    const flushTimeout = window.setTimeout(() => window.clearInterval(flushInterval), 10000);

    return () => {
      window.clearInterval(flushInterval);
      window.clearTimeout(flushTimeout);
    };
  }, [mode, pathname]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    trackAuthExperimentEvent("Auth Form Submitted", {
      auth_mode: mode,
      page_path: pathname,
    });

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: isRegister ? name : undefined,
          email,
          password,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        trackAuthExperimentEvent("Auth Form Failed", {
          auth_mode: mode,
          page_path: pathname,
          status_code: response.status,
          error_message: payload?.error || "请求失败，请稍后重试",
        });
        throw new Error(payload?.error || "请求失败，请稍后重试");
      }

      identifyAuthExperimentUser(payload?.user?.id);
      trackAuthExperimentEvent("Auth Conversion", {
        auth_mode: mode,
        page_path: pathname,
        conversion_type: mode,
      });
      trackAuthExperimentEvent(isRegister ? "User Registered" : "User Logged In", {
        auth_mode: mode,
        page_path: pathname,
      });

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="animate-fade-in"
      data-experiment-surface="auth"
      data-auth-mode={mode}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        className="glass-panel"
        data-auth-panel
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "2rem",
          background: "var(--bg-secondary)",
        }}
      >
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
              }}
            />
            <h1 className="text-gradient" style={{ fontSize: "1.5rem" }}>
              AI Trace
            </h1>
          </div>
          <h2 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            {isRegister ? "创建账号" : "登录"}
          </h2>
          <p style={{ color: "var(--text-secondary)" }}>
            {isRegister ? "注册后即可进入监控后台。" : "登录后查看 AI Trace 监控数据。"}
          </p>
        </div>

        <form
          data-auth-form={mode}
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {isRegister && (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>姓名</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
                className="input-field"
              />
            </label>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="input-field"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete={isRegister ? "new-password" : "current-password"}
              className="input-field"
            />
          </label>

          {error && (
            <p
              role="alert"
              style={{
                color: "var(--status-error)",
                background: "var(--status-error-bg)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </p>
          )}

          <button
            className="btn btn-primary"
            data-auth-primary-action={mode}
            type="submit"
            disabled={isSubmitting}
            style={{ height: "44px" }}
          >
            {isSubmitting ? "处理中..." : isRegister ? "注册并进入" : "登录"}
          </button>
        </form>

        <p style={{ color: "var(--text-secondary)", marginTop: "1.25rem", fontSize: "0.875rem" }}>
          {isRegister ? "已有账号？" : "还没有账号？"}{" "}
          <Link
            href={isRegister ? "/login" : "/register"}
            className="accent-gradient"
            data-auth-secondary-action={isRegister ? "login" : "register"}
            style={{ fontWeight: 600 }}
          >
            {isRegister ? "去登录" : "去注册"}
          </Link>
        </p>
      </div>
    </div>
  );
}
