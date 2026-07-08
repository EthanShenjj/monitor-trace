function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asNonEmptyString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const clean = String(value).trim();
  return clean.length > 0 ? clean : null;
}

function firstString(...values) {
  for (const value of values) {
    const clean = asNonEmptyString(value);

    if (clean) {
      return clean;
    }
  }

  return null;
}

export function normalizeWebhookItems(body) {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new Error("Request body must contain at least one message");
    }

    return body;
  }

  if (body && typeof body === "object") {
    return [body];
  }

  throw new Error("Request body must be a JSON array or object");
}

export function getThinkingDataReceiptProperties(item) {
  return asRecord(asRecord(item)["#ops_receipt_properties"]);
}

export function buildWebhookMessageInput(item, index, options = {}) {
  const message = asRecord(item);
  const params = asRecord(message.params);
  const customParams = asRecord(message.custom_params);
  const receiptProperties = getThinkingDataReceiptProperties(message);
  const isThinkingDataMessage =
    Boolean(message.push_id) ||
    Object.keys(receiptProperties).length > 0 ||
    Boolean(message.params) ||
    Boolean(message.custom_params);

  if (isThinkingDataMessage) {
    const pushId = firstString(message.push_id);
    const opsRequestId = firstString(receiptProperties.ops_request_id);
    const opsDetailId = firstString(receiptProperties.ops_task_exec_detail_id);
    const eventType = receiptProperties.ops_flow_id
      ? "ae_flow_webhook_push"
      : receiptProperties.ops_task_id
        ? "ae_ops_task_webhook_push"
        : "thinkingdata_ae_webhook_push";
    const fallbackBody = JSON.stringify({
      push_id: pushId,
      params,
      custom_params: customParams,
    });

    return {
      provider: firstString(options.provider) || "thinkingdata_ae",
      externalId:
        firstString(
          message.external_id,
          message.externalId,
          opsRequestId && `${opsRequestId}:${opsDetailId || pushId || index}`,
          opsDetailId
        ),
      eventType,
      title:
        firstString(
          params.title,
          params.subject,
          params.name,
          pushId && `ThinkingData message for ${pushId}`
        ) || `ThinkingData message ${index}`,
      body:
        firstString(
          params.content,
          params.body,
          params.message,
          params.text,
          message.body,
          message.message,
          fallbackBody
        ) || "{}",
      rawPayload: message,
      analytics: {
        pushId,
        opsProjectId: firstString(receiptProperties.ops_project_id),
        opsTaskId: firstString(receiptProperties.ops_task_id),
        opsTaskInstanceId: firstString(receiptProperties.ops_task_instance_id),
        opsTaskExecDetailId: opsDetailId,
        opsRequestId,
        opsFlowId: firstString(receiptProperties.ops_flow_id),
        opsNodeId: firstString(receiptProperties.ops_node_id),
        opsPushLanguage: firstString(receiptProperties.ops_push_language),
      },
    };
  }

  return {
    provider:
      firstString(message.provider, message.source, options.provider) ||
      "generic",
    externalId: firstString(
      message.external_id,
      message.externalId,
      message.event_id,
      message.eventId,
      message.id
    ),
    eventType:
      firstString(message.event_type, message.eventType, message.type) ||
      "message_received",
    title:
      firstString(message.title, message.subject, message.name) ||
      "Webhook message",
    body:
      firstString(
        message.body,
        message.message,
        message.text,
        message.content,
        JSON.stringify(message)
      ) || "{}",
    rawPayload: message,
    analytics: {},
  };
}

export function createThinkingDataWebhookResponse({ storedCount, duplicateCount, failList }) {
  const acceptedCount = storedCount + duplicateCount;
  const returnCode = acceptedCount > 0 || failList.length === 0 ? 0 : 1;

  return {
    return_code: returnCode,
    return_message: returnCode === 0 ? "success" : "failed",
    data: {
      fail_list: failList,
    },
  };
}
