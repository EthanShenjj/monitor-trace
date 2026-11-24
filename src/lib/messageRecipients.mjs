export class MessageRecipientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function messageRecipientId(value, { required = true } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new MessageRecipientError("A recipient account ID of at most 160 characters is required");
  }
  return value.trim();
}

// This map is supplied by the server operator, never by an inbound request.
export function resolveMarketLoopRecipient(accountId, configuredRecipients) {
  let recipients;
  try {
    recipients = typeof configuredRecipients === "string"
      ? JSON.parse(configuredRecipients)
      : configuredRecipients;
    if (!recipients || typeof recipients !== "object" || Array.isArray(recipients) ||
        !Object.keys(recipients).length) throw new Error();
    for (const [account, userId] of Object.entries(recipients)) {
      messageRecipientId(account);
      messageRecipientId(userId);
    }
  } catch {
    throw new MessageRecipientError("MarketLoop recipient mapping is not configured correctly", 503);
  }
  const account = messageRecipientId(accountId);
  if (!Object.hasOwn(recipients, account)) {
    throw new MessageRecipientError("Recipient account is not mapped", 422);
  }
  return messageRecipientId(recipients[account]);
}

export function assertSameMessageRecipient(storedRecipient, recipient) {
  if ((storedRecipient ?? null) !== (recipient ?? null)) {
    throw new MessageRecipientError("Event ID is already assigned to another recipient", 409);
  }
}
