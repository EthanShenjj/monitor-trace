import { randomUUID } from "node:crypto";
import pg from "pg";
import { authStore, normalizeWebhookPayload } from "./authStore.mjs";
import { messageRecipientId, assertSameMessageRecipient } from "./messageRecipients.mjs";

class MessageStorageError extends Error {
  constructor(message, status = 503, cause) {
    super(message, cause ? { cause } : undefined);
    this.status = status;
  }
}

function poolFor(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch {
    throw new MessageStorageError("PostgreSQL connection URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new MessageStorageError("Message storage requires a PostgreSQL URL");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    query_timeout: 7000,
    allowExitOnIdle: true,
  });
  pool.on("error", error => console.warn("PostgreSQL message connection closed", { code: error.code || "unknown" }));
  return pool;
}

function publicMessage(row) {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    rawPayload: row.raw_payload,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPostgresMessageStore({ connectionString, queryable } = {}) {
  const pool = queryable || poolFor(connectionString);
  async function query(text, values) {
    try { return await pool.query(text, values); } catch (error) {
      throw new MessageStorageError("Message storage is temporarily unavailable", 503, error);
    }
  }
  return {
    async createWebhookMessage(input) {
      const clean = normalizeWebhookPayload(input);
      const inserted = await query(
        "INSERT INTO monitor_trace.webhook_messages (id, provider, external_id, event_type, title, body, raw_payload, recipient_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT (provider, external_id) DO NOTHING RETURNING *",
        [randomUUID(), clean.provider, clean.externalId, clean.eventType, clean.title, clean.body, clean.rawPayload, clean.recipientUserId]
      );
      if (inserted.rows[0]) return { message: publicMessage(inserted.rows[0]), duplicate: false };

      // A separate statement sees a concurrently committed conflicting insert.
      const existing = await query(
        "SELECT * FROM monitor_trace.webhook_messages WHERE provider = $1 AND external_id = $2",
        [clean.provider, clean.externalId]
      );
      if (!existing.rows[0]) throw new MessageStorageError("Unable to resolve an existing message");
      assertSameMessageRecipient(existing.rows[0].recipient_user_id, clean.recipientUserId);
      return { message: publicMessage(existing.rows[0]), duplicate: true };
    },
    async listWebhookMessages({ userId, status = "all", limit = 100 } = {}) {
      const recipient = messageRecipientId(userId);
      const cleanLimit = Math.min(200, Math.max(1, Number.parseInt(String(limit), 10) || 100));
      const result = await query([
        "WITH inbox AS (",
        "  SELECT * FROM monitor_trace.webhook_messages",
        "  WHERE recipient_user_id = $1 AND ($2::boolean = false OR read_at IS NULL)",
        "  ORDER BY created_at DESC, id DESC LIMIT $3",
        ")",
        "SELECT COALESCE(jsonb_agg(to_jsonb(inbox) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS messages,",
        "  (SELECT count(*)::integer FROM monitor_trace.webhook_messages WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count",
        "FROM inbox",
      ].join("\n"), [recipient, status === "unread", cleanLimit]);
      const payload = result.rows[0];
      if (!Array.isArray(payload?.messages) || !Number.isInteger(payload.unread_count)) {
        throw new MessageStorageError("Message storage returned an invalid response");
      }
      return { messages: payload.messages.map(publicMessage), unreadCount: payload.unread_count };
    },
    async markWebhookMessageRead(id, userId) {
      const recipient = messageRecipientId(userId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""))) {
        throw new MessageStorageError("Message not found", 404);
      }
      const result = await query(
        "UPDATE monitor_trace.webhook_messages SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND recipient_user_id = $2 RETURNING *",
        [id, recipient]
      );
      if (!result.rows[0]) throw new MessageStorageError("Message not found", 404);
      return publicMessage(result.rows[0]);
    },
  };
}

export function createMessageStore({ connectionString, localStore = authStore, requireShared = false } = {}) {
  let sharedStore;
  function backend() {
    if (connectionString) {
      sharedStore ||= createPostgresMessageStore({ connectionString });
      return sharedStore;
    }
    if (requireShared) throw new MessageStorageError("Shared PostgreSQL message storage is not configured");
    return localStore;
  }
  return {
    async createWebhookMessage(input) { return backend().createWebhookMessage(input); },
    async listWebhookMessages(options) { return backend().listWebhookMessages(options); },
    async markWebhookMessageRead(id, userId) { return backend().markWebhookMessageRead(id, userId); },
  };
}

export const messageStore = createMessageStore({
  connectionString: process.env.MESSAGE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL,
  requireShared: Boolean(process.env.VERCEL),
});
