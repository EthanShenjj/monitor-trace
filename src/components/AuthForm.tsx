"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  fetchAuthCopyExperimentVariant,
  getStoredAuthCopyExperimentVariant,
} from "@/lib/authCopyExperiment";
import {
  AUTH_COPY_EXPERIMENT_KEY,
  type AuthCopyExperimentVariant,
  flushQueuedAuthExperimentEvents,
  identifyAuthExperimentUser,
  normalizeAuthCopyExperimentVariant,
  persistAuthCopyExperimentVariant,
  resolveAuthCopyExperimentVariant,
  trackAuthExperimentEvent,
} from "@/lib/amplitude";

type AuthMode = "login" | "register";
type AuthCopy = {
  heading: string;
  description: string;
  primaryAction: string;
  submittingAction: string;
  switchPrefix: string;
  switchAction: string;
};

const authCopyByVariant: Record<AuthCopyExperimentVariant, Record<AuthMode, AuthCopy>> = {
  control: {
    login: {
      heading: "登录",
      description: "登录后查看 AI Trace 监控数据。",
      primaryAction: "登录",
      submittingAction: "处理中...",
      switchPrefix: "还没有账号？",
      switchAction: "去注册",
    },
    register: {
      heading: "创建账号",
      description: "注册后即可进入监控后台。",
      primaryAction: "注册并进入",
      submittingAction: "处理中...",
      switchPrefix: "已有账号？",
      switchAction: "去登录",
    },
  },
  treatment: {
    login: {
      heading: "回到 AI 监控工作台",
      description: "继续查看链路、延迟和异常趋势，快速定位线上问题。",
      primaryAction: "查看监控数据",
      submittingAction: "正在进入...",
      switchPrefix: "第一次使用 AI Trace？",
      switchAction: "创建监控账号",
    },
    register: {
      heading: "开始监控 AI 调用",
      description: "几分钟内看清请求链路、模型响应和失败原因。",
      primaryAction: "开始追踪",
      submittingAction: "正在创建...",
      switchPrefix: "已有监控账号？",
      switchAction: "直接登录",
    },
  },
};

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyExperimentState, setCopyExperimentState] = useState<{
    variant: AuthCopyExperimentVariant;
    isReady: boolean;
  }>({
    variant: "control",
    isReady: false,
  });
  const isRegister = mode === "register";
  const copyVariant = copyExperimentState.variant;
  const copy = authCopyByVariant[copyVariant][mode];
  const switchHref = `${isRegister ? "/login" : "/register"}${
    copyVariant === "treatment" ? "?auth_copy_variant=treatment" : ""
  }`;

  useEffect(() => {
    let isMounted = true;

    function setVariant(variant: AuthCopyExperimentVariant) {
      if (!isMounted) {
        return;
      }

      setCopyExperimentState((previousState) => {
        if (previousState.variant === variant && previousState.isReady) {
          return previousState;
        }

        return { variant, isReady: true };
      });
    }

    function applyResolvedVariant() {
      setVariant(resolveAuthCopyExperimentVariant());
    }

    function handleVariantEvent(event: Event) {
      const variant = normalizeAuthCopyExperimentVariant(
        (event as CustomEvent<{ variant?: unknown }>).detail?.variant
      );

      if (!variant) {
        return;
      }

      persistAuthCopyExperimentVariant(variant);
      setVariant(variant);
    }

    applyResolvedVariant();
    const searchParams = new URLSearchParams(window.location.search);
    const forcedVariant = normalizeAuthCopyExperimentVariant(
      searchParams.get("auth_copy_variant") || searchParams.get("authCopyVariant")
    );
    const storedVariant = getStoredAuthCopyExperimentVariant();

    if (storedVariant) {
      setVariant(storedVariant);
    }

    if (forcedVariant) {
      persistAuthCopyExperimentVariant(forcedVariant);
      setVariant(forcedVariant);
    } else {
      fetchAuthCopyExperimentVariant().then((variant) => {
        persistAuthCopyExperimentVariant(variant);
        setVariant(variant);
      });
    }

    const observer = new MutationObserver(applyResolvedVariant);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-auth-copy-variant"],
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-auth-copy-variant"],
      });
    }

    window.addEventListener("auth-copy-experiment:variant", handleVariantEvent);

    return () => {
      isMounted = false;
      observer.disconnect();
      window.removeEventListener("auth-copy-experiment:variant", handleVariantEvent);
    };
  }, []);

  useEffect(() => {
    if (!copyExperimentState.isReady) {
      return;
    }

    const experimentProperties = {
      auth_mode: mode,
      page_path: pathname,
      experiment_key: AUTH_COPY_EXPERIMENT_KEY,
      experiment_variant: copyVariant,
    };

    trackAuthExperimentEvent("Auth Copy Experiment Exposed", experimentProperties);
    trackAuthExperimentEvent("Auth Page Viewed", experimentProperties);

    const flushInterval = window.setInterval(flushQueuedAuthExperimentEvents, 500);
    const flushTimeout = window.setTimeout(() => window.clearInterval(flushInterval), 10000);

    return () => {
      window.clearInterval(flushInterval);
      window.clearTimeout(flushTimeout);
    };
  }, [copyExperimentState.isReady, copyVariant, mode, pathname]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const experimentProperties = {
      auth_mode: mode,
      page_path: pathname,
      experiment_key: AUTH_COPY_EXPERIMENT_KEY,
      experiment_variant: copyVariant,
    };

    trackAuthExperimentEvent("Auth Form Submitted", {
      ...experimentProperties,
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
          ...experimentProperties,
          status_code: response.status,
          error_message: payload?.error || "请求失败，请稍后重试",
        });
        throw new Error(payload?.error || "请求失败，请稍后重试");
      }

      identifyAuthExperimentUser(payload?.user?.id);
      trackAuthExperimentEvent("Auth Conversion", {
        ...experimentProperties,
        conversion_type: mode,
      });
      trackAuthExperimentEvent(isRegister ? "User Registered" : "User Logged In", {
        ...experimentProperties,
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
      data-auth-copy-experiment={AUTH_COPY_EXPERIMENT_KEY}
      data-auth-copy-variant={copyVariant}
      data-auth-copy-ready={copyExperimentState.isReady}
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
            {copy.heading}
          </h2>
          <p style={{ color: "var(--text-secondary)" }}>
            {copy.description}
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
            {isSubmitting ? copy.submittingAction : copy.primaryAction}
          </button>
        </form>

        <p style={{ color: "var(--text-secondary)", marginTop: "1.25rem", fontSize: "0.875rem" }}>
          {copy.switchPrefix}{" "}
          <Link
            href={switchHref}
            className="accent-gradient"
            data-auth-secondary-action={isRegister ? "login" : "register"}
            style={{ fontWeight: 600 }}
          >
            {copy.switchAction}
          </Link>
        </p>
      </div>
    </div>
  );
}
