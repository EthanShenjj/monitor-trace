"use client";

import { useEffect, useState } from "react";
import { isThinkingDataDebugEnabled, setThinkingDataDebugEnabled } from "@/lib/thinkingdata";
import {
  getThinkingDataMessageStatus, initThinkingDataMessages, refreshThinkingDataMessages,
  subscribeThinkingDataMessages,
} from "@/lib/thinkingdataMessages";

const stateLabels = {
  idle: "尚未连接", loading: "正在连接", waiting: "已初始化，等待拉取任务",
  connected: "已连接", error: "连接失败",
};

export default function ClientMessagesPage() {
  const [status, setStatus] = useState(getThinkingDataMessageStatus);
  const [debug, setDebug] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => {
    const unsubscribe = subscribeThinkingDataMessages(() => setStatus(getThinkingDataMessageStatus()));
    const timer = setTimeout(() => {
      setStatus(getThinkingDataMessageStatus());
      setDebug(isThinkingDataDebugEnabled());
    }, 0);
    void initThinkingDataMessages();
    return () => { clearTimeout(timer); unsubscribe(); };
  }, []);

  async function copyDeviceId() {
    try {
      await navigator.clipboard.writeText(status.deviceId);
      setCopyMessage("设备 ID 已复制");
    } catch {
      setCopyMessage("复制失败，请选中下方设备 ID 手动复制");
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>客户端弹窗测试</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        将此浏览器的设备 ID 添加到 Hermes 的测试设备中，开启测试模式，再发送测试消息。
      </p>
      <section className="glass-panel" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <span className={`badge ${status.state === "error" ? "badge-error" : status.state === "connected" ? "badge-success" : "badge-neutral"}`}>
            {stateLabels[status.state]}
          </span>
          <span>{debug ? "当前浏览器已开启测试模式" : "当前浏览器使用正式模式"}</span>
        </div>
        <label htmlFor="thinkingdata-device-id" style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}>
          测试设备 ID（#device_id）
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <input id="thinkingdata-device-id" className="input-field" readOnly value={status.deviceId} placeholder="正在获取设备 ID…" style={{ flex: "1 1 300px", fontFamily: "monospace" }} />
          <button type="button" className="btn btn-outline" disabled={!status.deviceId} onClick={() => void copyDeviceId()}>复制设备 ID</button>
        </div>
        <p role="status" style={{ minHeight: "1.5rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>{copyMessage}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: "0.75rem", margin: "1rem 0", overflowWrap: "anywhere" }}>
          <dt>App ID</dt><dd style={{ margin: 0 }}>{status.appId || "—"}</dd>
          <dt>最近拉取</dt><dd style={{ margin: 0 }}>{status.lastFetchAt ? new Date(status.lastFetchAt).toLocaleTimeString() : "尚未收到配置"}</dd>
          <dt>最近弹窗</dt><dd style={{ margin: 0 }}>{status.lastMessageAt ? new Date(status.lastMessageAt).toLocaleTimeString() : "尚未收到消息"}</dd>
          <dt>任务 ID</dt><dd style={{ margin: 0 }}>{status.lastTaskId || "—"}</dd>
        </dl>
        {status.error && <p role="alert" style={{ color: "var(--status-error)", margin: "1rem 0" }}>{status.error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <button type="button" className="btn btn-primary" onClick={() => setThinkingDataDebugEnabled(!debug)}>
            {debug ? "退出测试模式并刷新" : "开启测试模式并刷新"}
          </button>
          <button type="button" className="btn btn-outline" disabled={status.state !== "connected" && status.state !== "waiting"} onClick={refreshThinkingDataMessages}>立即拉取</button>
          {status.state === "error" && <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>重新连接</button>}
        </div>
      </section>
      <section className="glass-panel" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>发送测试</h2>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 2 }}>
          <li>复制设备 ID，在 Hermes「客户端通道 → 发送测试 → ＋设备」中添加。</li>
          <li>开启测试模式，等待连接成功。</li>
          <li>选择该设备，设置弹窗内容并发送测试。</li>
          <li>保持本产品页面打开；测试模式下 SDK 每 5 秒检查测试任务，也可以点击「立即拉取」。</li>
        </ol>
      </section>
    </div>
  );
}
