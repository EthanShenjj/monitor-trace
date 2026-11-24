# Shared PostgreSQL message storage

Production webhook receivers and the message center use one PostgreSQL table: `monitor_trace.webhook_messages`. The application stays on Vercel, and the public webhook URL stays `/api/webhooks/marketloop`.

## Setup

1. Run `scripts/setup-postgres-messages.sql` on the PostgreSQL instance using the existing application database owner connection. It creates only a private message schema, table, and indexes. RLS is enabled and public access is revoked; the existing table owner retains access. It creates no database accounts or role grants.
2. Keep database credentials outside source control. The runtime uses the existing application database login. If an operator configures a separate restricted login later, that operator must grant it the required table access and an appropriate RLS policy.
3. Use a PostgreSQL endpoint reachable from Vercel. A self-hosted instance or an existing Vercel PostgreSQL integration both work. An existing PgBouncer-compatible pooler can be used if available.
4. The runtime reads `MESSAGE_DATABASE_URL`, then `DATABASE_URL`, then `POSTGRES_URL`. An existing Vercel/Neon connection can therefore be reused without copying credentials. Redeploy after applying the schema. The driver verifies TLS for remote connections, limits its local pool to two connections, and uses parameterized queries without named prepared statements.

```dotenv
MESSAGE_DATABASE_URL=postgresql://<login-role>:<password>@<postgres-host>:5432/<database>?sslmode=verify-full
```

No database credential belongs in `NEXT_PUBLIC_` variables. The existing signup/login system is unchanged; this configuration moves webhook message storage only.

## Behavior

MarketLoop, ThinkingData AE, and OneSignal inbound messages use the PostgreSQL message table with the list and mark-read APIs. Each visible message has a server-established `recipient_user_id`; list, unread counts and mark-read are scoped to the authenticated account. Messages without ownership remain stored but hidden. Configure the MarketLoop account mapping and apply the ownership migration as described in [recipient isolation](marketloop-recipient-isolation.md).

Provider and external ID enforce deduplication in PostgreSQL, including concurrent requests. A replay for a different recipient is rejected rather than transferring the existing message. Raw payloads are stored as JSONB. Marking a message read preserves its first read timestamp.

On Vercel, missing or unavailable PostgreSQL storage returns an explicit error instead of falling back to another temporary SQLite file or presenting a false empty inbox. Local development without a configured PostgreSQL URL can continue using the existing SQLite store.

The message center refreshes visible pages every five seconds, refreshes when focus returns, and offers a manual refresh button.

## Verification

Run `npm test` for local tests. Set `TEST_MESSAGE_DATABASE_URL` to a test PostgreSQL login to also run the integration test, which exercises independent connections, concurrent deduplication, reconnection, and read state. `MESSAGE_TEST_RUN_ID` can identify those synthetic `monitor_trace_test` rows for owner-only cleanup afterward.

Deployment verification must send a webhook and read it through the authenticated message-center API from another browser session. A successful MarketLoop response means PostgreSQL has committed the message.

Existing records inside Vercel's temporary SQLite files do not migrate automatically. If an old SQLite file remains available, import its `webhook_messages` records preserving message IDs, provider/external ID pairs, read timestamps, and creation timestamps. Otherwise, resend a MarketLoop test request after deployment.
