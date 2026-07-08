import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import { trackServerThinkingDataEvent } from "@/lib/serverAnalytics.mjs";
import {
  buildWebhookMessageInput,
  createThinkingDataWebhookResponse,
  normalizeWebhookItems,
} from "@/lib/thinkingdataWebhook.mjs";

export const dynamic = "force-dynamic";

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
    const items = normalizeWebhookItems(body);
    const provider = request.headers.get("x-webhook-provider") || undefined;
    const failList = [];
    let storedCount = 0;
    let duplicateCount = 0;

    for (const [batchIndex, item] of items.entries()) {
      const index = batchIndex + 1;

      try {
        const input = buildWebhookMessageInput(item, index, { provider });
        const { message, duplicate } = await authStore.createWebhookMessage(input);

        if (duplicate) {
          duplicateCount += 1;
        } else {
          storedCount += 1;
        }

        await trackServerThinkingDataEvent(
          "webhook_message_received",
          {
            provider: message.provider,
            event_type: message.eventType,
            message_status: message.readAt ? "read" : "unread",
            duplicate,
            batch_index: index,
            batch_size: items.length,
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
      } catch (error) {
        failList.push({
          index,
          message: error?.message || "Unable to store webhook message",
        });
      }
    }

    return NextResponse.json({
      ...createThinkingDataWebhookResponse({
        storedCount,
        duplicateCount,
        failList,
      }),
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
