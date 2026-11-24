import { handleMarketLoopWebhookRequest } from "@/lib/marketloopWebhook.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  return handleMarketLoopWebhookRequest(request, {
    secret: process.env.MARKETLOOP_WEBHOOK_SECRET || "",
    recipients: process.env.MARKETLOOP_WEBHOOK_RECIPIENTS,
    async createWebhookMessage(input) {
      const { messageStore } = await import("@/lib/messageStore.mjs");
      return messageStore.createWebhookMessage(input);
    },
  });
}
