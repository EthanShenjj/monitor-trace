-- Run once using the existing application database owner connection.
-- Creates only the application's message schema, table, and indexes.
CREATE SCHEMA IF NOT EXISTS monitor_trace;
REVOKE ALL ON SCHEMA monitor_trace FROM PUBLIC;

CREATE TABLE IF NOT EXISTS monitor_trace.webhook_messages (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  external_id text CHECK (length(external_id) <= 160),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  raw_payload jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS webhook_messages_created_idx
  ON monitor_trace.webhook_messages (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS webhook_messages_unread_idx
  ON monitor_trace.webhook_messages (created_at DESC, id DESC) WHERE read_at IS NULL;

ALTER TABLE monitor_trace.webhook_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON monitor_trace.webhook_messages FROM PUBLIC;
