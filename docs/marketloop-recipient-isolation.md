# MarketLoop recipient mapping and private inboxes

MarketLoop channel tests require a recipient account ID in the test dialog. The outgoing JSON contains `data.recipientAccountId`. A standard journey delivery uses `data.customerId` instead. Monitor Trace maps that external account ID to the stable ID of a Monitor Trace login account. The sending operator's browser login never chooses the recipient.

## Configure admin@163.com as the recipient

1. Apply `scripts/migrate-message-recipients.sql` to the existing message database before deploying the new API. Fresh installations can run the updated `scripts/setup-postgres-messages.sql`. No records are deleted or automatically reassigned.
2. Log in to Monitor Trace as `admin@163.com`. Its message center shows **Receiving account / 当前收件账号**, including the stable account ID. The same ID is available in the authenticated `/api/auth/me` response as `user.id`. An email address is not assumed to be the internal account ID.
3. Configure the server-only `MARKETLOOP_WEBHOOK_RECIPIENTS` environment variable as JSON. For example, if the login's real ID is `the-admin-user-id`:

   ```json
   {"the-admin-user-id":"the-admin-user-id","marketloop-customer-123":"the-admin-user-id"}
   ```

   Keys are external account IDs accepted from MarketLoop. Values are immutable Monitor Trace user IDs. Replace the example with the actual ID; configure only intended recipients. The first entry lets the operator enter the Monitor Trace account ID when sending a channel test; the second is an optional mapping for a journey customer.
4. Configure `MARKETLOOP_WEBHOOK_SECRET` in Monitor Trace and the matching `Authorization: Bearer <secret>` or `X-Webhook-Secret` Header on the MarketLoop channel. The receiver rejects all requests when authentication is unconfigured. Never put either environment variable behind a client prefix.
5. Deploy Monitor Trace, then deploy the MarketLoop sender change. In MarketLoop's test dialog, enter `the-admin-user-id`. Successful tests appear only in that Monitor Trace account's inbox. A second account sees neither the message nor its unread count and cannot mark it read by guessing the message ID.

Recipient mappings are checked at receipt. Missing account IDs return 400, unmapped IDs return 422, and missing/invalid mapping configuration returns 503. None is acknowledged as a successfully stored message. Adding `userId` or `recipientUserId` to the request cannot override the server mapping. Repeating an event ID for a different account returns 409 and leaves the original record unchanged.

## Existing messages and other providers

Every inbox query, unread count and mark-read operation requires the authenticated user's ID. PostgreSQL and SQLite enforce the same predicates. Read timestamps remain idempotent for the owning account. Query parameters and request bodies cannot change the account used by the message APIs.

The migration keeps existing records with `recipient_user_id = NULL`; they are not shown to any account. Other inbound providers that have no explicit server-established recipient also remain unassigned. A body field named `userId` is never enough to claim a message. Integrations must establish ownership through their trusted receiver before their new messages can appear in an account inbox.

To assign selected historical records, an operator must first review the intended account and exact records, then update only those records' `recipient_user_id` with the database owner connection. Do not automatically assign all old shared messages to the next account that logs in. Changing the environment mapping affects future events and does not transfer existing messages.

The existing authentication store is unchanged. Because it uses instance-local SQLite on Vercel, use the ID returned by the **production login session**, not an ID from a local registration. Recreating an account with the same email can produce a different ID; update mappings explicitly after an account migration.

## Verification

Run `npm test`. Ownership tests cover cross-account listing and unread counts, unauthorized mark-read, replay reassignment, malformed mappings, forged payload ownership and SQLite upgrades. `TEST_MESSAGE_DATABASE_URL` enables the independent-client PostgreSQL test. Run it against a dedicated test database after applying the migration.
