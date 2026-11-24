-- Apply before deploying the account-isolated message APIs.
-- Existing messages retain NULL ownership and are hidden until explicitly assigned.
BEGIN;
ALTER TABLE monitor_trace.webhook_messages
  ADD COLUMN IF NOT EXISTS recipient_user_id text
  CHECK (length(recipient_user_id) BETWEEN 1 AND 160);
CREATE INDEX IF NOT EXISTS webhook_messages_recipient_created_idx
  ON monitor_trace.webhook_messages (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS webhook_messages_recipient_unread_idx
  ON monitor_trace.webhook_messages (recipient_user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
COMMIT;
