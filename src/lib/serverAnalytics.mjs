import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const DEFAULT_THINKINGDATA_APP_ID = "267ce4dd64dd4e4583646a62a46a2bf2";
const DEFAULT_THINKINGDATA_SERVER_URL = "https://web-ta-demo.thinkingdata.cn/";

let serverSdk = null;
let serverSdkKey = "";
let thinkingDataModule = undefined;

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
    asNonEmptyString(process.env.NEXT_PUBLIC_THINKINGDATA_APP_ID) ||
    DEFAULT_THINKINGDATA_APP_ID;

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
  const ThinkingData = getThinkingDataModule();

  if (!config || !ThinkingData) {
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

function getThinkingDataModule() {
  if (thinkingDataModule !== undefined) {
    return thinkingDataModule;
  }

  try {
    thinkingDataModule = require("thinkingdata-node");
  } catch {
    thinkingDataModule = null;
  }

  return thinkingDataModule;
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
