const MAX_PAYLOAD_BYTES = 200000;
const MAX_RESPONSE_CHARS = 12000;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BLOCKED_HEADER_NAMES = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "set-cookie",
  "transfer-encoding",
]);

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const clean = String(value).trim();
  return clean.length > 0 ? clean : null;
}

function normalizeTargetUrl(value) {
  const clean = toNullableString(value);

  if (!clean) {
    throw new Error("Target URL is required");
  }

  let url;

  try {
    url = new URL(clean);
  } catch {
    throw new Error("Target URL is invalid");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Target URL must use HTTP or HTTPS");
  }

  return url.toString();
}

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("Headers must be an object");
  }

  const normalized = {};

  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName || "").trim();
    const lowerName = name.toLowerCase();

    if (!name) {
      continue;
    }
    if (!HEADER_NAME_PATTERN.test(name)) {
      throw new Error(`Header name is invalid: ${name}`);
    }
    if (BLOCKED_HEADER_NAMES.has(lowerName)) {
      continue;
    }
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    normalized[name] = String(rawValue).slice(0, 1000);
  }

  if (!Object.keys(normalized).some((name) => name.toLowerCase() === "content-type")) {
    normalized["Content-Type"] = "application/json";
  }

  return normalized;
}

function normalizePayload(payload) {
  if (payload === undefined) {
    throw new Error("Payload is required");
  }

  const body = JSON.stringify(payload);

  if (!body) {
    throw new Error("Payload must be JSON serializable");
  }
  if (Buffer.byteLength(body, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error("Payload is too large");
  }

  return { payload, body };
}

function inferName(inputName, targetUrl) {
  const cleanName = toNullableString(inputName);

  if (cleanName) {
    return cleanName.slice(0, 120);
  }

  return new URL(targetUrl).hostname || "Webhook push";
}

export function normalizeWebhookPushRequest(input = {}) {
  const targetUrl = normalizeTargetUrl(input.targetUrl || input.url);
  const headers = normalizeHeaders(input.headers);
  const { payload, body } = normalizePayload(input.payload);
  const name = inferName(input.name, targetUrl);
  const source = toNullableString(input.source) || "webhook_push_page";

  return {
    name,
    targetUrl,
    headers,
    payload,
    body,
    source,
  };
}

export async function sendWebhookPush(input, { fetcher = fetch } = {}) {
  const request = normalizeWebhookPushRequest(input);
  const startedAt = Date.now();

  try {
    const response = await fetcher(request.targetUrl, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });
    const responseBody = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
    const durationMs = Date.now() - startedAt;

    return {
      ...request,
      status: response.ok ? "succeeded" : "failed",
      statusCode: response.status,
      responseBody,
      errorMessage: response.ok ? null : response.statusText || "Webhook endpoint returned an error",
      durationMs,
    };
  } catch (error) {
    return {
      ...request,
      status: "failed",
      statusCode: null,
      responseBody: null,
      errorMessage: error?.message || "Webhook request failed",
      durationMs: Date.now() - startedAt,
    };
  }
}
