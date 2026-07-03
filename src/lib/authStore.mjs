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
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
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
