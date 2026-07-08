import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ThinkingData = require("thinkingdata-node");

const DEFAULT_THINKINGDATA_SERVER_URL = "https://receiver-ta-preview.thinkingdata.cn";

let serverSdk = null;
let serverSdkKey = "";

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function getThinkingDataConfig() {
  const appId =
    asNonEmptyString(process.env.THINKINGDATA_APP_ID) ||
    asNonEmptyString(process.env.NEXT_PUBLIC_THINKINGDATA_APP_ID);

  if (!appId) {
    return null;
  }

  return {
    appId,
    serverUrl:
      asNonEmptyString(process.env.THINKINGDATA_SERVER_URL) ||
      asNonEmptyString(process.env.NEXT_PUBLIC_THINKINGDATA_SERVER_URL) ||
      DEFAULT_THINKINGDATA_SERVER_URL,
  };
}

function getServerSdk() {
  const config = getThinkingDataConfig();

  if (!config) {
    return null;
  }

  const nextKey = `${config.appId}:${config.serverUrl}`;

  if (!serverSdk || serverSdkKey !== nextKey) {
    ThinkingData.enableLog(process.env.NODE_ENV !== "production");
    serverSdk = ThinkingData.initWithBatchMode(config.appId, config.serverUrl, {
      batchSize: 1,
      compress: false,
    });
    serverSdkKey = nextKey;
  }

  return serverSdk;
}

export async function trackServerThinkingDataEvent(
  eventName,
  properties = {},
  options = {}
) {
  const sdk = getServerSdk();

  if (!sdk) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      sdk.track({
        accountId: asNonEmptyString(options.accountId) || undefined,
        distinctId: asNonEmptyString(options.distinctId) || "server_webhook",
        event: eventName,
        time: new Date(),
        properties: cleanProperties({
          platform: "server",
          ...properties,
        }),
        callback(error) {
          resolve(!error);
        },
      });
    } catch {
      resolve(false);
    }
  });
}
