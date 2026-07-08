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
      path.join(process.cwd(), ".data", "auth.sqlite"),
    sessionSecret:
      process.env.AUTH_SESSION_SECRET ||
      "monitor-trace-local-development-secret",
  });
}

export const authStore = getDefaultAuthStore();
