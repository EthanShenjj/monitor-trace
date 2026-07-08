import { NextResponse } from "next/server";
import { handleWebhookMessages } from "@/lib/webhookMessages.mjs";

export const dynamic = "force-dynamic";

async function createWebhookMessage(input) {
  const { authStore } = await import("@/lib/authStore.mjs");

  return authStore.createWebhookMessage(input);
}

async function trackWebhookMessage({
  message,
  input,
  duplicate,
  index,
  batchSize,
}) {
  const { trackServerThinkingDataEvent } = await import("@/lib/serverAnalytics.mjs");

  await trackServerThinkingDataEvent(
    "webhook_message_received",
    {
      provider: message.provider,
      event_type: message.eventType,
      message_status: message.readAt ? "read" : "unread",
      duplicate,
      batch_index: index,
      batch_size: batchSize,
      push_id: input.analytics.pushId,
      ops_project_id: input.analytics.opsProjectId,
      ops_task_id: input.analytics.opsTaskId,
      ops_task_instance_id: input.analytics.opsTaskInstanceId,
      ops_task_exec_detail_id: input.analytics.opsTaskExecDetailId,
      ops_request_id: input.analytics.opsRequestId,
      ops_flow_id: input.analytics.opsFlowId,
      ops_node_id: input.analytics.opsNodeId,
      ops_push_language: input.analytics.opsPushLanguage,
    },
    { accountId: input.analytics.pushId }
  );
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        return_code: 1,
        return_message: "Invalid JSON body",
        data: {
          fail_list: [],
        },
      },
      { status: 400 }
    );
  }

  try {
    const provider = request.headers.get("x-webhook-provider") || undefined;
    const response = await handleWebhookMessages({
      body,
      provider,
      createWebhookMessage,
      trackWebhookMessage,
    });

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        return_code: 1,
        return_message: error?.message || "Unable to process webhook request",
        data: {
          fail_list: [],
        },
      },
      { status: 400 }
    );
  }
}
