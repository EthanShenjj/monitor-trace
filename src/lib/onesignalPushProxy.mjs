const ONESIGNAL_CREATE_NOTIFICATION_URL = "https://api.onesignal.com/notifications?c=push";
const MAX_ONESIGNAL_RESPONSE_CHARS = 12000;

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

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map(asNonEmptyString).filter(Boolean);
  }

  const singleValue = asNonEmptyString(value);
  return singleValue ? [singleValue] : [];
}

function firstStringList(...values) {
  for (const value of values) {
    const list = normalizeStringList(value);

    if (list.length > 0) {
      return list;
    }
  }

  return [];
}

function getReceiptProperties(item) {
  return asRecord(asRecord(item)["#ops_receipt_properties"]);
}

export function normalizeOneSignalProxyItems(body) {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new Error("Request body must contain at least one item");
    }

    return body;
  }

  if (body && typeof body === "object") {
    return [body];
  }

  throw new Error("Request body must be a JSON array or object");
}

export function buildOneSignalNotificationPayload(item, options = {}) {
  const message = asRecord(item);
  const params = asRecord(message.params);
  const customParams = asRecord(message.custom_params);
  const receiptProperties = getReceiptProperties(message);
  const appId = firstString(
    params.app_id,
    params.appId,
    message.app_id,
    message.appId,
    options.appId
  );
  const externalIds = firstStringList(
    message.push_id,
    message.external_id,
    message.externalId,
    params.external_id,
    params.externalId,
    customParams.external_id,
    customParams.externalId
  );
  const title = firstString(params.title, params.heading, params.subject, message.title);
  const content = firstString(
    params.content,
    params.body,
    params.message,
    params.text,
    message.content,
    message.body
  );
  const launchUrl = firstString(
    params.url,
    params.launch_url,
    params.launchUrl,
    message.url,
    message.launch_url,
    options.defaultUrl
  );

  if (!appId) {
    throw new Error("OneSignal app_id is required");
  }
  if (externalIds.length === 0) {
    throw new Error("push_id or external_id is required");
  }
  if (!title) {
    throw new Error("params.title is required");
  }
  if (!content) {
    throw new Error("params.content is required");
  }

  return {
    app_id: appId,
    target_channel: "push",
    include_aliases: {
      external_id: externalIds,
    },
    headings: {
      en: title,
    },
    contents: {
      en: content,
    },
    url: launchUrl || undefined,
    data: {
      ...customParams,
      "#ops_receipt_properties": receiptProperties,
      push_id: firstString(message.push_id),
    },
  };
}

export async function sendOneSignalNotification(payload, {
  apiKey,
  fetcher = fetch,
  targetUrl = ONESIGNAL_CREATE_NOTIFICATION_URL,
} = {}) {
  const cleanApiKey = asNonEmptyString(apiKey);

  if (!cleanApiKey) {
    throw new Error("ONESIGNAL_REST_API_KEY is required");
  }

  const response = await fetcher(targetUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${cleanApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseBody = (await response.text()).slice(0, MAX_ONESIGNAL_RESPONSE_CHARS);

  if (!response.ok) {
    throw new Error(responseBody || response.statusText || "OneSignal request failed");
  }

  return {
    statusCode: response.status,
    responseBody,
    responseJson: responseBody ? JSON.parse(responseBody) : null,
  };
}

export async function handleOneSignalPushProxy({
  body,
  appId,
  apiKey,
  defaultUrl,
  fetcher = fetch,
} = {}) {
  const items = normalizeOneSignalProxyItems(body);
  const failList = [];
  const results = [];

  for (const [itemIndex, item] of items.entries()) {
    const index = itemIndex + 1;

    try {
      const payload = buildOneSignalNotificationPayload(item, {
        appId,
        defaultUrl,
      });
      const result = await sendOneSignalNotification(payload, {
        apiKey,
        fetcher,
      });

      results.push({
        index,
        status_code: result.statusCode,
        onesignal_response: result.responseJson,
      });
    } catch (error) {
      failList.push({
        index,
        message: error?.message || "OneSignal push failed",
      });
    }
  }

  return {
    return_code: results.length > 0 || failList.length === 0 ? 0 : 1,
    return_message: results.length > 0 || failList.length === 0 ? "success" : "failed",
    data: {
      fail_list: failList,
      success_list: results,
    },
  };
}
