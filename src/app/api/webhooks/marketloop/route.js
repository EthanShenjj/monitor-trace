import { handleMarketLoopWebhookRequest } from "@/lib/marketloopWebhook.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  return handleMarketLoopWebhookRequest(request, {
    secret: process.env.MARKETLOOP_WEBHOOK_SECRET || "",
    async createWebhookMessage(input) {
      const { authStore } = await import("@/lib/authStore.mjs");
      return authStore.createWebhookMessage(input);
    },
  });
}
