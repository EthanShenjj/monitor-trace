"use client";

import { adaptInAppMessage, contentUI, type DisplayHandle } from "td-content-ui-js";
import { getThinkingDataConnection } from "@/lib/thinkingdata";

type TriggerResult = {
  appId: string;
  taskId: string;
  channelMsgType?: string;
  content?: { inAppMessage?: unknown };
};

type StrategySDK = {
  init: (options: Record<string, unknown>) => Promise<void>;
};

type RemoteConfigSDK = {
  setLogPrintListener: (listener: (message: string) => void) => void;
  fetch: (appId: string, templateCode: string) => void;
};

declare global {
  interface Window {
    TDStrategy?: StrategySDK;
    TDRemoteConfig?: RemoteConfigSDK;
  }
}

export type MessageStatus = {
  state: "idle" | "loading" | "waiting" | "connected" | "error";
  deviceId: string;
  appId: string;
  serverUrl: string;
  debug: boolean;
  lastFetchAt: string | null;
  lastMessageAt: string | null;
  lastTaskId: string;
  error: string;
};

let status: MessageStatus = {
  state: "idle", deviceId: "", appId: "", serverUrl: "", debug: false,
  lastFetchAt: null, lastMessageAt: null, lastTaskId: "", error: "",
};
const subscribers = new Set<() => void>();
const scripts = new Map<string, Promise<void>>();
const activeMessages = new Map<string, DisplayHandle>();
let initialization: Promise<void> | null = null;

export function getThinkingDataMessageStatus() { return status; }

export function subscribeThinkingDataMessages(listener: () => void) {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

function updateStatus(patch: Partial<MessageStatus>) {
  status = { ...status, ...patch };
  for (const listener of subscribers) listener();
}

function loadScript(src: string, isLoaded: () => boolean) {
  if (isLoaded()) return Promise.resolve();
  const pending = scripts.get(src);
  if (pending) return pending;
  const task = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error(`SDK 加载超时：${src}`)), 10000);
    script.onload = () => finish(isLoaded() ? undefined : new Error(`SDK 未导出所需接口：${src}`));
    script.onerror = () => finish(new Error(`SDK 加载失败：${src}`));
    script.src = src;
    document.head.appendChild(script);
  }).catch((error) => { scripts.delete(src); throw error; });
  scripts.set(src, task);
  return task;
}

function showMessage(result: TriggerResult) {
  const message = result.content?.inAppMessage;
  if (!message || activeMessages.has(result.taskId)) return;
  try {
    const config = typeof message === "string" ? JSON.parse(message) : message;
    const platforms = config?.display?.platforms;
    if (Array.isArray(platforms) && !platforms.includes("web")) return;
    const suppressionKey = `monitor_inapp_suppressed:${result.appId}:${status.deviceId}:${result.taskId}`;
    const today = new Date().toLocaleDateString("en-CA");
    if (!status.debug && window.localStorage.getItem(suppressionKey) === today) return;
    const handle = contentUI.show(adaptInAppMessage(config), {
      actionHandlers: {
        suppressToday: () => window.localStorage.setItem(suppressionKey, today),
      },
      onShown: () => updateStatus({
        lastTaskId: result.taskId, lastMessageAt: new Date().toISOString(), error: "",
      }),
      onClose: () => { activeMessages.delete(result.taskId); },
      onError: (error) => updateStatus({ error: error.message }),
    }, { strategy: "queue" });
    activeMessages.set(result.taskId, handle);
    void handle.ready.then((ready) => {
      if (ready.status !== "shown") activeMessages.delete(result.taskId);
    });
  } catch (error) {
    updateStatus({ error: error instanceof Error ? error.message : String(error) });
  }
}

export function refreshThinkingDataMessages() {
  if (status.appId) window.TDRemoteConfig?.fetch(status.appId, "td_strategy");
}

export function initThinkingDataMessages() {
  if (typeof window === "undefined") return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    updateStatus({ state: "loading", error: "" });
    const connection = await getThinkingDataConnection();
    if (!connection) throw new Error("ThinkingData 初始化失败");
    const { appId, serverUrl, debug, client } = connection;
    updateStatus({ appId, serverUrl, debug, deviceId: client.getDeviceId() });
    if (!debug) {
      updateStatus({ state: "idle" });
      return;
    }
    await loadScript("/vendor/tdremoteconfig-1.3.0.umd.min.js", () => Boolean(window.TDRemoteConfig));
    await loadScript("/vendor/tdstrategy-1.3.0.umd.min.js", () => Boolean(window.TDStrategy));

    // A same-origin probe exposes network and upstream errors before the SDK starts polling.
    const response = await fetch(`${serverUrl}/v1/remote-config/config?appid=${encodeURIComponent(appId)}`, {
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `SDK 接收地址连接失败（${response.status}）`);
    }
    const fetchTimeout = setTimeout(() => {
      if (!status.lastFetchAt) {
        updateStatus({ state: "error", error: "测试任务拉取超时，请检查接收地址和后台 Debug 设备配置。" });
      }
    }, 20000);
    // v1.3's fetch listener only targets the default template, not td_strategy.
    // Its public log listener reports validated fetch outcomes for diagnostics.
    window.TDRemoteConfig!.setLogPrintListener((message) => {
      if (message.includes("get remote config success")) {
        clearTimeout(fetchTimeout);
        updateStatus({ state: "connected", lastFetchAt: new Date().toISOString(), error: "" });
      } else if (message.includes("get remote config fail")) {
        updateStatus({ state: "error", error: message });
      }
    });
    await window.TDStrategy!.init({
      appId, serverUrl, enableLog: debug, debugMode: debug ? "debug" : "none",
      triggerListener: showMessage,
    });
    if (status.state !== "connected") updateStatus({ state: "waiting" });
  })().catch((error) => {
    updateStatus({ state: "error", error: error instanceof Error ? error.message : String(error) });
    initialization = null;
  });
  return initialization;
}
