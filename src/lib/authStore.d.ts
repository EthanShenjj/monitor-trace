type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type PublicPayment = {
  id: string;
  userId: string;
  amount: number;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  source: string;
  amountEntryMethod: string;
  status: string;
  createdAt: string;
};

type PublicWebhookMessage = {
  id: string;
  provider: string;
  externalId: string | null;
  eventType: string;
  title: string;
  body: string;
  rawPayload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type PublicEventConfiguration = {
  id: string;
  userId: string;
  source: string;
  events: Record<string, unknown>[];
  eventCount: number;
  createdAt: string;
};

export function createAuthStore(options: {
  dbPath?: string;
  filePath?: string;
  sessionSecret: string;
}): {
  registerUser(input: { name: string; email: string; password: string }): Promise<PublicUser>;
  authenticateUser(email: string, password: string): Promise<PublicUser>;
  getUserById(userId: string): Promise<PublicUser | null>;
  ensureUserForSession(userId: string): Promise<PublicUser>;
  createPayment(input: {
    userId: string;
    amount: number;
    currency?: string;
    paymentMethod?: string;
    source?: string;
    amountEntryMethod?: string;
  }): Promise<PublicPayment>;
  createEventConfiguration(input: {
    userId: string;
    events: Record<string, unknown>[];
    source?: string;
  }): Promise<PublicEventConfiguration>;
  createWebhookMessage(input: {
    provider?: string;
    externalId?: string;
    eventType?: string;
    title?: string;
    body?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<{ message: PublicWebhookMessage; duplicate: boolean }>;
  listWebhookMessages(input?: {
    status?: "all" | "unread";
    limit?: number;
  }): Promise<{ messages: PublicWebhookMessage[]; unreadCount: number }>;
  markWebhookMessageRead(messageId: string): Promise<PublicWebhookMessage>;
  createSessionToken(userId: string): string;
  verifySessionToken(token?: string): { userId: string; iat: number; exp: number } | null;
};

export function getDefaultAuthStore(): ReturnType<typeof createAuthStore>;
export const authStore: ReturnType<typeof createAuthStore>;
