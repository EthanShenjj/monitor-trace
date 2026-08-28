import {
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt || user.created_at,
  };
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
  const [scheme, salt, storedHash] = String(passwordHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const derived = await scrypt(password, salt, 64);
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

function validateRegistration({ name, email, password }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");

  if (!cleanName) {
    throw new Error("Name is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("A valid email is required");
  }
  if (cleanPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  return { name: cleanName, email: cleanEmail, password: cleanPassword };
}

function validatePayment({ userId, amount, currency, paymentMethod, source, amountEntryMethod }) {
  const cleanUserId = String(userId || "").trim();
  const parsedAmount = Number(amount);
  const amountCents = Math.round(parsedAmount * 100);
  const cleanCurrency = String(currency || "USD").trim().toUpperCase();
  const cleanPaymentMethod = String(paymentMethod || "simulated").trim();
  const cleanSource = String(source || "dashboard_payment_form").trim();
  const cleanAmountEntryMethod = String(amountEntryMethod || "manual").trim();

  if (!cleanUserId) {
    throw new Error("User is required");
  }
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isSafeInteger(amountCents)) {
    throw new Error("Payment amount must be greater than 0");
  }
  if (!/^[A-Z]{3}$/.test(cleanCurrency)) {
    throw new Error("Currency must be a 3-letter code");
  }
  if (!cleanPaymentMethod) {
    throw new Error("Payment method is required");
  }
  if (!cleanSource) {
    throw new Error("Payment source is required");
  }
  if (!["manual", "random"].includes(cleanAmountEntryMethod)) {
    throw new Error("Amount entry method is invalid");
  }

  return {
    userId: cleanUserId,
    amountCents,
    currency: cleanCurrency,
    paymentMethod: cleanPaymentMethod,
    source: cleanSource,
    amountEntryMethod: cleanAmountEntryMethod,
  };
}

function publicPayment(payment) {
  return {
    id: payment.id,
    userId: payment.userId || payment.user_id,
    amount: (payment.amountCents || payment.amount_cents) / 100,
    amountCents: payment.amountCents || payment.amount_cents,
    currency: payment.currency,
    paymentMethod: payment.paymentMethod || payment.payment_method,
    source: payment.source,
    amountEntryMethod: payment.amountEntryMethod || payment.amount_entry_method,
    status: payment.status,
    createdAt: payment.createdAt || payment.created_at,
  };
}

function normalizeEventConfiguration({ userId, events, source }) {
  const cleanUserId = String(userId || "").trim();
  const cleanSource = String(source || "events_configuration_page").trim();

  if (!cleanUserId) {
    throw new Error("User is required");
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("At least one event configuration is required");
  }
  if (events.length > 50) {
    throw new Error("Too many event configurations");
  }

  const payload = {
    source: cleanSource || "events_configuration_page",
    events,
  };
  const configPayload = JSON.stringify(payload);

  if (configPayload.length > 200000) {
    throw new Error("Event configuration payload is too large");
  }

  return {
    userId: cleanUserId,
    source: payload.source,
    eventCount: events.length,
    configPayload,
  };
}

function publicEventConfiguration(configuration) {
  const configPayload = configuration.configPayload || configuration.config_payload || "{}";
  let payload;

  try {
    payload = JSON.parse(configPayload);
  } catch {
    payload = { events: [] };
  }

  return {
    id: configuration.id,
    userId: configuration.userId || configuration.user_id,
    source: configuration.source,
    events: Array.isArray(payload.events) ? payload.events : [],
    eventCount: configuration.eventCount || configuration.event_count,
    createdAt: configuration.createdAt || configuration.created_at,
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const clean = String(value).trim();
  return clean.length > 0 ? clean : null;
}

function normalizeWebhookPayload(input = {}) {
  const rawPayload = input.rawPayload ?? {};
  const body =
    typeof rawPayload === "object" && rawPayload !== null && !Array.isArray(rawPayload)
      ? rawPayload
      : {};

  const provider = toNullableString(input.provider || body.provider || body.source) || "generic";
  const eventType =
    toNullableString(input.eventType || body.event_type || body.eventType || body.type) ||
    "message_received";
  const externalId = toNullableString(
    input.externalId || body.external_id || body.externalId || body.event_id || body.eventId || body.id
  );
  const title =
    toNullableString(input.title || body.title || body.subject || body.name) ||
    eventType.replace(/_/g, " ");
  const messageBody =
    toNullableString(input.body || body.body || body.message || body.text || body.content) ||
    JSON.stringify(rawPayload);

  if (provider.length > 80) {
    throw new Error("Provider is too long");
  }
  if (eventType.length > 120) {
    throw new Error("Event type is too long");
  }
  if (externalId && externalId.length > 160) {
    throw new Error("External ID is too long");
  }
  if (!title) {
    throw new Error("Message title is required");
  }
  if (!messageBody) {
    throw new Error("Message body is required");
  }

  return {
    provider,
    externalId,
    eventType,
    title: title.slice(0, 240),
    body: messageBody.slice(0, 4000),
    rawPayload: JSON.stringify(rawPayload),
  };
}

function publicWebhookMessage(message) {
  return {
    id: message.id,
    provider: message.provider,
    externalId: message.externalId || message.external_id || null,
    eventType: message.eventType || message.event_type,
    title: message.title,
    body: message.body,
    rawPayload: JSON.parse(message.rawPayload || message.raw_payload || "{}"),
    readAt: message.readAt || message.read_at || null,
    createdAt: message.createdAt || message.created_at,
  };
}

function normalizeJsonColumn(value, fallback) {
  if (value === undefined || value === null) {
    return JSON.stringify(fallback);
  }

  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }

  return JSON.stringify(value);
}

function parseJsonColumn(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function normalizeWebhookPushAttempt(input = {}) {
  const cleanUserId = toNullableString(input.userId);
  const cleanName = toNullableString(input.name) || "Webhook push";
  const cleanTargetUrl = toNullableString(input.targetUrl);
  const cleanSource = toNullableString(input.source) || "webhook_push_page";
  const cleanStatus = toNullableString(input.status) || "pending";
  const statusCode =
    input.statusCode === undefined || input.statusCode === null
      ? null
      : Number.parseInt(String(input.statusCode), 10);
  const durationMs =
    input.durationMs === undefined || input.durationMs === null
      ? null
      : Number.parseInt(String(input.durationMs), 10);
  const responseBody = input.responseBody === undefined || input.responseBody === null
    ? null
    : String(input.responseBody).slice(0, 12000);
  const errorMessage = input.errorMessage === undefined || input.errorMessage === null
    ? null
    : String(input.errorMessage).slice(0, 1000);

  if (!cleanUserId) {
    throw new Error("User is required");
  }
  if (!cleanTargetUrl) {
    throw new Error("Target URL is required");
  }
  if (cleanName.length > 120) {
    throw new Error("Webhook name is too long");
  }
  if (cleanTargetUrl.length > 2000) {
    throw new Error("Target URL is too long");
  }
  if (!["pending", "succeeded", "failed"].includes(cleanStatus)) {
    throw new Error("Webhook push status is invalid");
  }
  if (statusCode !== null && (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)) {
    throw new Error("Webhook response status code is invalid");
  }
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0)) {
    throw new Error("Webhook duration is invalid");
  }

  return {
    userId: cleanUserId,
    name: cleanName,
    targetUrl: cleanTargetUrl,
    headersJson: normalizeJsonColumn(input.headers, {}),
    payloadJson: normalizeJsonColumn(input.payload, {}),
    status: cleanStatus,
    statusCode,
    responseBody,
    errorMessage,
    durationMs,
    source: cleanSource,
  };
}

function publicWebhookPushAttempt(attempt) {
  return {
    id: attempt.id,
    userId: attempt.userId || attempt.user_id,
    name: attempt.name,
    targetUrl: attempt.targetUrl || attempt.target_url,
    headers: parseJsonColumn(attempt.headersJson || attempt.headers_json, {}),
    payload: parseJsonColumn(attempt.payloadJson || attempt.payload_json, {}),
    status: attempt.status,
    statusCode: attempt.statusCode ?? attempt.status_code ?? null,
    responseBody: attempt.responseBody || attempt.response_body || null,
    errorMessage: attempt.errorMessage || attempt.error_message || null,
    durationMs: attempt.durationMs ?? attempt.duration_ms ?? null,
    source: attempt.source,
    createdAt: attempt.createdAt || attempt.created_at,
  };
}

function normalizeMessageRelayConfig(input = {}) {
  const platform = toNullableString(input.platform || "onesignal")?.toLowerCase();
  const name = toNullableString(input.name) || "OneSignal";
  const appId = toNullableString(input.appId || input.app_id);
  const defaultLaunchUrl = toNullableString(input.defaultLaunchUrl || input.default_launch_url);
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);

  if (!platform) {
    throw new Error("Platform is required");
  }
  if (!["onesignal"].includes(platform)) {
    throw new Error("Relay platform is not supported");
  }
  if (name.length > 120) {
    throw new Error("Config name is too long");
  }
  if (appId && appId.length > 160) {
    throw new Error("OneSignal app ID is too long");
  }
  if (defaultLaunchUrl && defaultLaunchUrl.length > 2000) {
    throw new Error("Default launch URL is too long");
  }

  return {
    platform,
    name,
    appId,
    defaultLaunchUrl,
    enabled: enabled ? 1 : 0,
  };
}

function publicMessageRelayConfig(config) {
  return {
    id: config.id,
    platform: config.platform,
    name: config.name,
    appId: config.appId || config.app_id || null,
    defaultLaunchUrl: config.defaultLaunchUrl || config.default_launch_url || null,
    enabled: Boolean(config.enabled),
    createdAt: config.createdAt || config.created_at,
    updatedAt: config.updatedAt || config.updated_at,
  };
}

function normalizeMessageRelayAttempt(input = {}) {
  const platform = toNullableString(input.platform || "onesignal")?.toLowerCase();
  const source = toNullableString(input.source) || "hermes";
  const status = toNullableString(input.status) || "pending";
  const statusCode =
    input.statusCode === undefined || input.statusCode === null
      ? null
      : Number.parseInt(String(input.statusCode), 10);
  const durationMs =
    input.durationMs === undefined || input.durationMs === null
      ? null
      : Number.parseInt(String(input.durationMs), 10);
  const responseBody = input.responseBody === undefined || input.responseBody === null
    ? null
    : String(input.responseBody).slice(0, 12000);
  const errorMessage = input.errorMessage === undefined || input.errorMessage === null
    ? null
    : String(input.errorMessage).slice(0, 1000);

  if (!platform) {
    throw new Error("Platform is required");
  }
  if (!["onesignal"].includes(platform)) {
    throw new Error("Relay platform is not supported");
  }
  if (!["pending", "succeeded", "partial_failed", "failed", "unauthorized"].includes(status)) {
    throw new Error("Relay status is invalid");
  }
  if (source.length > 80) {
    throw new Error("Relay source is too long");
  }
  if (statusCode !== null && (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)) {
    throw new Error("Relay response status code is invalid");
  }
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0)) {
    throw new Error("Relay duration is invalid");
  }

  return {
    platform,
    source,
    inboundPayloadJson: normalizeJsonColumn(input.inboundPayload, {}),
    outboundPayloadJson: normalizeJsonColumn(input.outboundPayload, {}),
    responseJson: normalizeJsonColumn(input.response, {}),
    status,
    statusCode,
    responseBody,
    errorMessage,
    durationMs,
  };
}

function publicMessageRelayAttempt(attempt) {
  return {
    id: attempt.id,
    platform: attempt.platform,
    source: attempt.source,
    inboundPayload: parseJsonColumn(attempt.inboundPayloadJson || attempt.inbound_payload_json, {}),
    outboundPayload: parseJsonColumn(attempt.outboundPayloadJson || attempt.outbound_payload_json, {}),
    response: parseJsonColumn(attempt.responseJson || attempt.response_json, {}),
    status: attempt.status,
    statusCode: attempt.statusCode ?? attempt.status_code ?? null,
    responseBody: attempt.responseBody || attempt.response_body || null,
    errorMessage: attempt.errorMessage || attempt.error_message || null,
    durationMs: attempt.durationMs ?? attempt.duration_ms ?? null,
    createdAt: attempt.createdAt || attempt.created_at,
  };
}

function normalizeMessageRelayCallback(input = {}) {
  const platform = toNullableString(input.platform || "onesignal")?.toLowerCase();
  const source = toNullableString(input.source) || "onesignal_event_stream";
  const eventType = toNullableString(input.eventType || input.event_type) || "unknown";
  const status = toNullableString(input.status) || "accepted";
  const statusCode =
    input.statusCode === undefined || input.statusCode === null
      ? null
      : Number.parseInt(String(input.statusCode), 10);
  const durationMs =
    input.durationMs === undefined || input.durationMs === null
      ? null
      : Number.parseInt(String(input.durationMs), 10);
  const duplicate = input.duplicate ? 1 : 0;
  const errorMessage = input.errorMessage === undefined || input.errorMessage === null
    ? null
    : String(input.errorMessage).slice(0, 1000);

  if (!platform) {
    throw new Error("Platform is required");
  }
  if (!["onesignal"].includes(platform)) {
    throw new Error("Relay platform is not supported");
  }
  if (!["accepted", "duplicate", "rejected"].includes(status)) {
    throw new Error("Relay callback status is invalid");
  }
  if (source.length > 80) {
    throw new Error("Relay callback source is too long");
  }
  if (eventType.length > 160) {
    throw new Error("Relay callback event type is too long");
  }
  if (statusCode !== null && (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)) {
    throw new Error("Relay callback status code is invalid");
  }
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0)) {
    throw new Error("Relay callback duration is invalid");
  }

  return {
    platform,
    source,
    eventType,
    eventId: toNullableString(input.eventId || input.event_id),
    messageId: toNullableString(input.messageId || input.message_id),
    subscriptionId: toNullableString(input.subscriptionId || input.subscription_id),
    externalId: toNullableString(input.externalId || input.external_id),
    requestHeadersJson: normalizeJsonColumn(input.requestHeaders, {}),
    requestBodyJson: normalizeJsonColumn(input.requestBody, {}),
    responseJson: normalizeJsonColumn(input.response, {}),
    responseHeadersJson: normalizeJsonColumn(input.responseHeaders, {}),
    status,
    statusCode,
    duplicate,
    errorMessage,
    durationMs,
  };
}

function publicMessageRelayCallback(callback) {
  return {
    id: callback.id,
    platform: callback.platform,
    source: callback.source,
    eventType: callback.eventType || callback.event_type,
    eventId: callback.eventId || callback.event_id || null,
    messageId: callback.messageId || callback.message_id || null,
    subscriptionId: callback.subscriptionId || callback.subscription_id || null,
    externalId: callback.externalId || callback.external_id || null,
    requestHeaders: parseJsonColumn(callback.requestHeadersJson || callback.request_headers_json, {}),
    requestBody: parseJsonColumn(callback.requestBodyJson || callback.request_body_json, {}),
    response: parseJsonColumn(callback.responseJson || callback.response_json, {}),
    responseHeaders: parseJsonColumn(callback.responseHeadersJson || callback.response_headers_json, {}),
    status: callback.status,
    statusCode: callback.statusCode ?? callback.status_code ?? null,
    duplicate: Boolean(callback.duplicate),
    errorMessage: callback.errorMessage || callback.error_message || null,
    durationMs: callback.durationMs ?? callback.duration_ms ?? null,
    createdAt: callback.createdAt || callback.created_at,
  };
}

export function createAuthStore({ dbPath, filePath, sessionSecret }) {
  const databasePath = dbPath || filePath;

  if (!databasePath) {
    throw new Error("dbPath is required");
  }
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("sessionSecret must be at least 16 characters");
  }

  let db;

  function getDb() {
    if (!db) {
      mkdirSync(path.dirname(databasePath), { recursive: true });
      db = new Database(databasePath);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          currency TEXT NOT NULL,
          payment_method TEXT NOT NULL,
          source TEXT NOT NULL,
          amount_entry_method TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS event_configurations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          source TEXT NOT NULL,
          config_payload TEXT NOT NULL,
          event_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS webhook_messages (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          external_id TEXT,
          event_type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          raw_payload TEXT NOT NULL,
          read_at TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(provider, external_id)
        );

        CREATE TABLE IF NOT EXISTS webhook_push_attempts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          target_url TEXT NOT NULL,
          headers_json TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          status_code INTEGER,
          response_body TEXT,
          error_message TEXT,
          duration_ms INTEGER,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS message_relay_configs (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          app_id TEXT,
          default_launch_url TEXT,
          enabled INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS message_relay_attempts (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          source TEXT NOT NULL,
          inbound_payload_json TEXT NOT NULL,
          outbound_payload_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          status TEXT NOT NULL,
          status_code INTEGER,
          response_body TEXT,
          error_message TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS message_relay_callbacks (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          source TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_id TEXT,
          message_id TEXT,
          subscription_id TEXT,
          external_id TEXT,
          request_headers_json TEXT NOT NULL,
          request_body_json TEXT NOT NULL,
          response_json TEXT NOT NULL,
          response_headers_json TEXT NOT NULL,
          status TEXT NOT NULL,
          status_code INTEGER,
          duplicate INTEGER NOT NULL,
          error_message TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL
        );
      `);
    }

    return db;
  }

  function sign(payload) {
    return createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  }

  return {
    async registerUser(input) {
      const clean = validateRegistration(input);
      const database = getDb();

      if (database.prepare("SELECT 1 FROM users WHERE email = ?").get(clean.email)) {
        throw new Error("Email is already registered");
      }

      const now = new Date().toISOString();
      const user = {
        id: randomUUID(),
        name: clean.name,
        email: clean.email,
        passwordHash: await hashPassword(clean.password),
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO users (id, name, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(user.id, user.name, user.email, user.passwordHash, user.createdAt);

      return publicUser(user);
    },

    async authenticateUser(email, password) {
      const cleanEmail = normalizeEmail(email);
      const user = getDb()
        .prepare(
          `
            SELECT id, name, email, password_hash AS passwordHash, created_at AS createdAt
            FROM users
            WHERE email = ?
          `
        )
        .get(cleanEmail);

      if (!user || !(await verifyPassword(String(password || ""), user.passwordHash))) {
        throw new Error("Invalid email or password");
      }

      return publicUser(user);
    },

    async getUserById(userId) {
      const user = getDb()
        .prepare(
          `
            SELECT id, name, email, created_at AS createdAt
            FROM users
            WHERE id = ?
          `
        )
        .get(userId);
      return user ? publicUser(user) : null;
    },

    async ensureUserForSession(userId) {
      const cleanUserId = String(userId || "").trim();

      if (!cleanUserId) {
        throw new Error("User is required");
      }

      const database = getDb();
      const existing = database
        .prepare(
          `
            SELECT id, name, email, created_at AS createdAt
            FROM users
            WHERE id = ?
          `
        )
        .get(cleanUserId);

      if (existing) {
        return publicUser(existing);
      }

      const now = new Date().toISOString();
      const user = {
        id: cleanUserId,
        name: "Session User",
        email: `session-${cleanUserId}@monitor-trace.local`,
        passwordHash: "session-placeholder",
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO users (id, name, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(user.id, user.name, user.email, user.passwordHash, user.createdAt);

      return publicUser(user);
    },

    async createPayment(input) {
      const clean = validatePayment(input);
      const database = getDb();

      if (!database.prepare("SELECT 1 FROM users WHERE id = ?").get(clean.userId)) {
        throw new Error("User not found");
      }

      const now = new Date().toISOString();
      const payment = {
        id: randomUUID(),
        userId: clean.userId,
        amountCents: clean.amountCents,
        currency: clean.currency,
        paymentMethod: clean.paymentMethod,
        source: clean.source,
        amountEntryMethod: clean.amountEntryMethod,
        status: "succeeded",
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO payments (
              id,
              user_id,
              amount_cents,
              currency,
              payment_method,
              source,
              amount_entry_method,
              status,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          payment.id,
          payment.userId,
          payment.amountCents,
          payment.currency,
          payment.paymentMethod,
          payment.source,
          payment.amountEntryMethod,
          payment.status,
          payment.createdAt
        );

      return publicPayment(payment);
    },

    async createEventConfiguration(input) {
      const clean = normalizeEventConfiguration(input);
      const database = getDb();

      if (!database.prepare("SELECT 1 FROM users WHERE id = ?").get(clean.userId)) {
        throw new Error("User not found");
      }

      const now = new Date().toISOString();
      const configuration = {
        id: randomUUID(),
        userId: clean.userId,
        source: clean.source,
        configPayload: clean.configPayload,
        eventCount: clean.eventCount,
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO event_configurations (
              id,
              user_id,
              source,
              config_payload,
              event_count,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          configuration.id,
          configuration.userId,
          configuration.source,
          configuration.configPayload,
          configuration.eventCount,
          configuration.createdAt
        );

      return publicEventConfiguration(configuration);
    },

    async createWebhookMessage(input) {
      const clean = normalizeWebhookPayload(input);
      const database = getDb();

      if (clean.externalId) {
        const existing = database
          .prepare(
            `
              SELECT id, provider, external_id, event_type, title, body, raw_payload, read_at, created_at
              FROM webhook_messages
              WHERE provider = ? AND external_id = ?
            `
          )
          .get(clean.provider, clean.externalId);

        if (existing) {
          return { message: publicWebhookMessage(existing), duplicate: true };
        }
      }

      const now = new Date().toISOString();
      const message = {
        id: randomUUID(),
        provider: clean.provider,
        externalId: clean.externalId,
        eventType: clean.eventType,
        title: clean.title,
        body: clean.body,
        rawPayload: clean.rawPayload,
        readAt: null,
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO webhook_messages (
              id,
              provider,
              external_id,
              event_type,
              title,
              body,
              raw_payload,
              read_at,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          message.id,
          message.provider,
          message.externalId,
          message.eventType,
          message.title,
          message.body,
          message.rawPayload,
          message.readAt,
          message.createdAt
        );

      return { message: publicWebhookMessage(message), duplicate: false };
    },

    async listWebhookMessages({ status = "all", limit = 100 } = {}) {
      const database = getDb();
      const cleanLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
      const whereClause = status === "unread" ? "WHERE read_at IS NULL" : "";
      const messages = database
        .prepare(
          `
            SELECT id, provider, external_id, event_type, title, body, raw_payload, read_at, created_at
            FROM webhook_messages
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .all(cleanLimit)
        .map(publicWebhookMessage);
      const unreadCount = database
        .prepare("SELECT COUNT(*) AS count FROM webhook_messages WHERE read_at IS NULL")
        .get().count;

      return { messages, unreadCount };
    },

    async markWebhookMessageRead(messageId) {
      const cleanId = toNullableString(messageId);

      if (!cleanId) {
        throw new Error("Message ID is required");
      }

      const database = getDb();
      const now = new Date().toISOString();
      const result = database
        .prepare(
          `
            UPDATE webhook_messages
            SET read_at = COALESCE(read_at, ?)
            WHERE id = ?
          `
        )
        .run(now, cleanId);

      if (result.changes === 0) {
        throw new Error("Message not found");
      }

      const message = database
        .prepare(
          `
            SELECT id, provider, external_id, event_type, title, body, raw_payload, read_at, created_at
            FROM webhook_messages
            WHERE id = ?
          `
        )
        .get(cleanId);

      return publicWebhookMessage(message);
    },

    async recordWebhookPushAttempt(input) {
      const clean = normalizeWebhookPushAttempt(input);
      const database = getDb();

      if (!database.prepare("SELECT 1 FROM users WHERE id = ?").get(clean.userId)) {
        throw new Error("User not found");
      }

      const now = new Date().toISOString();
      const attempt = {
        id: randomUUID(),
        userId: clean.userId,
        name: clean.name,
        targetUrl: clean.targetUrl,
        headersJson: clean.headersJson,
        payloadJson: clean.payloadJson,
        status: clean.status,
        statusCode: clean.statusCode,
        responseBody: clean.responseBody,
        errorMessage: clean.errorMessage,
        durationMs: clean.durationMs,
        source: clean.source,
        createdAt: now,
      };

      database
        .prepare(
          `
            INSERT INTO webhook_push_attempts (
              id,
              user_id,
              name,
              target_url,
              headers_json,
              payload_json,
              status,
              status_code,
              response_body,
              error_message,
              duration_ms,
              source,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          attempt.id,
          attempt.userId,
          attempt.name,
          attempt.targetUrl,
          attempt.headersJson,
          attempt.payloadJson,
          attempt.status,
          attempt.statusCode,
          attempt.responseBody,
          attempt.errorMessage,
          attempt.durationMs,
          attempt.source,
          attempt.createdAt
        );

      return publicWebhookPushAttempt(attempt);
    },

    async listWebhookPushAttempts({ userId, limit = 50 } = {}) {
      const cleanUserId = toNullableString(userId);

      if (!cleanUserId) {
        throw new Error("User is required");
      }

      const cleanLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 50));
      const attempts = getDb()
        .prepare(
          `
            SELECT
              id,
              user_id,
              name,
              target_url,
              headers_json,
              payload_json,
              status,
              status_code,
              response_body,
              error_message,
              duration_ms,
              source,
              created_at
            FROM webhook_push_attempts
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .all(cleanUserId, cleanLimit)
        .map(publicWebhookPushAttempt);

      return { attempts };
    },

    async getMessageRelayConfig(platform = "onesignal") {
      const cleanPlatform = toNullableString(platform)?.toLowerCase();

      if (!cleanPlatform) {
        throw new Error("Platform is required");
      }

      const config = getDb()
        .prepare(
          `
            SELECT id, platform, name, app_id, default_launch_url, enabled, created_at, updated_at
            FROM message_relay_configs
            WHERE platform = ?
          `
        )
        .get(cleanPlatform);

      return config ? publicMessageRelayConfig(config) : null;
    },

    async upsertMessageRelayConfig(input) {
      const clean = normalizeMessageRelayConfig(input);
      const database = getDb();
      const now = new Date().toISOString();
      const existing = database
        .prepare(
          `
            SELECT id
            FROM message_relay_configs
            WHERE platform = ?
          `
        )
        .get(clean.platform);
      const id = existing?.id || randomUUID();

      database
        .prepare(
          `
            INSERT INTO message_relay_configs (
              id,
              platform,
              name,
              app_id,
              default_launch_url,
              enabled,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(platform) DO UPDATE SET
              name = excluded.name,
              app_id = excluded.app_id,
              default_launch_url = excluded.default_launch_url,
              enabled = excluded.enabled,
              updated_at = excluded.updated_at
          `
        )
        .run(
          id,
          clean.platform,
          clean.name,
          clean.appId,
          clean.defaultLaunchUrl,
          clean.enabled,
          existing ? now : now,
          now
        );

      return this.getMessageRelayConfig(clean.platform);
    },

    async recordMessageRelayAttempt(input) {
      const clean = normalizeMessageRelayAttempt(input);
      const now = new Date().toISOString();
      const attempt = {
        id: randomUUID(),
        platform: clean.platform,
        source: clean.source,
        inboundPayloadJson: clean.inboundPayloadJson,
        outboundPayloadJson: clean.outboundPayloadJson,
        responseJson: clean.responseJson,
        status: clean.status,
        statusCode: clean.statusCode,
        responseBody: clean.responseBody,
        errorMessage: clean.errorMessage,
        durationMs: clean.durationMs,
        createdAt: now,
      };

      getDb()
        .prepare(
          `
            INSERT INTO message_relay_attempts (
              id,
              platform,
              source,
              inbound_payload_json,
              outbound_payload_json,
              response_json,
              status,
              status_code,
              response_body,
              error_message,
              duration_ms,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          attempt.id,
          attempt.platform,
          attempt.source,
          attempt.inboundPayloadJson,
          attempt.outboundPayloadJson,
          attempt.responseJson,
          attempt.status,
          attempt.statusCode,
          attempt.responseBody,
          attempt.errorMessage,
          attempt.durationMs,
          attempt.createdAt
        );

      return publicMessageRelayAttempt(attempt);
    },

    async listMessageRelayAttempts({ platform = "onesignal", status = "all", limit = 100 } = {}) {
      const cleanPlatform = toNullableString(platform)?.toLowerCase();

      if (!cleanPlatform) {
        throw new Error("Platform is required");
      }

      const cleanLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
      const statuses = ["succeeded", "partial_failed", "failed", "unauthorized"];
      const shouldFilterStatus = statuses.includes(status);
      const attempts = getDb()
        .prepare(
          `
            SELECT
              id,
              platform,
              source,
              inbound_payload_json,
              outbound_payload_json,
              response_json,
              status,
              status_code,
              response_body,
              error_message,
              duration_ms,
              created_at
            FROM message_relay_attempts
            WHERE platform = ?
              ${shouldFilterStatus ? "AND status = ?" : ""}
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .all(...(shouldFilterStatus ? [cleanPlatform, status, cleanLimit] : [cleanPlatform, cleanLimit]))
        .map(publicMessageRelayAttempt);

      return { attempts };
    },

    async recordMessageRelayCallback(input) {
      const clean = normalizeMessageRelayCallback(input);
      const now = new Date().toISOString();
      const callback = {
        id: randomUUID(),
        platform: clean.platform,
        source: clean.source,
        eventType: clean.eventType,
        eventId: clean.eventId,
        messageId: clean.messageId,
        subscriptionId: clean.subscriptionId,
        externalId: clean.externalId,
        requestHeadersJson: clean.requestHeadersJson,
        requestBodyJson: clean.requestBodyJson,
        responseJson: clean.responseJson,
        responseHeadersJson: clean.responseHeadersJson,
        status: clean.status,
        statusCode: clean.statusCode,
        duplicate: clean.duplicate,
        errorMessage: clean.errorMessage,
        durationMs: clean.durationMs,
        createdAt: now,
      };

      getDb()
        .prepare(
          `
            INSERT INTO message_relay_callbacks (
              id,
              platform,
              source,
              event_type,
              event_id,
              message_id,
              subscription_id,
              external_id,
              request_headers_json,
              request_body_json,
              response_json,
              response_headers_json,
              status,
              status_code,
              duplicate,
              error_message,
              duration_ms,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          callback.id,
          callback.platform,
          callback.source,
          callback.eventType,
          callback.eventId,
          callback.messageId,
          callback.subscriptionId,
          callback.externalId,
          callback.requestHeadersJson,
          callback.requestBodyJson,
          callback.responseJson,
          callback.responseHeadersJson,
          callback.status,
          callback.statusCode,
          callback.duplicate,
          callback.errorMessage,
          callback.durationMs,
          callback.createdAt
        );

      return publicMessageRelayCallback(callback);
    },

    async listMessageRelayCallbacks({
      platform = "onesignal",
      status = "all",
      eventType = "all",
      limit = 100,
    } = {}) {
      const cleanPlatform = toNullableString(platform)?.toLowerCase();

      if (!cleanPlatform) {
        throw new Error("Platform is required");
      }

      const cleanLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
      const cleanEventType = toNullableString(eventType);
      const statuses = ["accepted", "duplicate", "rejected"];
      const shouldFilterStatus = statuses.includes(status);
      const shouldFilterEventType = Boolean(cleanEventType && cleanEventType !== "all");
      const callbacks = getDb()
        .prepare(
          `
            SELECT
              id,
              platform,
              source,
              event_type,
              event_id,
              message_id,
              subscription_id,
              external_id,
              request_headers_json,
              request_body_json,
              response_json,
              response_headers_json,
              status,
              status_code,
              duplicate,
              error_message,
              duration_ms,
              created_at
            FROM message_relay_callbacks
            WHERE platform = ?
              ${shouldFilterStatus ? "AND status = ?" : ""}
              ${shouldFilterEventType ? "AND event_type = ?" : ""}
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .all(
          ...[
            cleanPlatform,
            ...(shouldFilterStatus ? [status] : []),
            ...(shouldFilterEventType ? [cleanEventType] : []),
            cleanLimit,
          ]
        )
        .map(publicMessageRelayCallback);

      return { callbacks };
    },

    createSessionToken(userId) {
      const now = Math.floor(Date.now() / 1000);
      const payload = encodeBase64Url(
        JSON.stringify({
          userId,
          iat: now,
          exp: now + SESSION_TTL_SECONDS,
        })
      );
      return `${payload}.${sign(payload)}`;
    },

    verifySessionToken(token) {
      const [payload, signature] = String(token || "").split(".");
      if (!payload || !signature || sign(payload) !== signature) {
        return null;
      }

      try {
        const session = JSON.parse(decodeBase64Url(payload));
        if (!session.userId || Number(session.exp) < Math.floor(Date.now() / 1000)) {
          return null;
        }
        return session;
      } catch {
        return null;
      }
    },
  };
}

export function getDefaultAuthStore() {
  return createAuthStore({
    dbPath:
      process.env.AUTH_DB_PATH ||
      process.env.AUTH_STORE_PATH ||
      path.join(process.env.VERCEL ? "/tmp" : process.cwd(), ".data", "auth.sqlite"),
    sessionSecret:
      process.env.AUTH_SESSION_SECRET ||
      "monitor-trace-local-development-secret",
  });
}

export const authStore = getDefaultAuthStore();
