import {
  buildWebhookMessageInput,
  createThinkingDataWebhookResponse,
  normalizeWebhookItems,
} from "./thinkingdataWebhook.mjs";

function toErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function handleWebhookMessages({
  body,
  provider,
  createWebhookMessage,
  trackWebhookMessage,
  logger = console,
}) {
  const items = normalizeWebhookItems(body);
  const failList = [];
  let acceptedCount = 0;

  for (const [batchIndex, item] of items.entries()) {
    const index = batchIndex + 1;
    let input;

    try {
      input = buildWebhookMessageInput(item, index, { provider });
      acceptedCount += 1;
    } catch (error) {
      failList.push({
        index,
        message: toErrorMessage(error, "Unable to normalize webhook message"),
      });
      continue;
    }

    let stored;

    try {
      stored = await createWebhookMessage(input);
    } catch (error) {
      logger?.warn?.("Webhook message accepted but persistence failed", {
        index,
        error: toErrorMessage(error, "Unable to store webhook message"),
      });
      continue;
    }

    if (trackWebhookMessage) {
      try {
        const { message, duplicate } = stored;
        await trackWebhookMessage({
          message,
          input,
          duplicate,
          index,
          batchSize: items.length,
        });
      } catch (error) {
        logger?.warn?.("Webhook message accepted but tracking failed", {
          index,
          error: toErrorMessage(error, "Unable to track webhook message"),
        });
      }
    }
  }

  return createThinkingDataWebhookResponse({
    acceptedCount,
    failList,
  });
}
