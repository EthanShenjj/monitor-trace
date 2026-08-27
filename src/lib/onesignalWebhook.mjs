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

function getEventName(payload, headers = {}) {
  return firstString(
    payload.event,
    payload.event_type,
    payload.eventType,
    headers["x-onesignal-event"],
    headers["X-OneSignal-Event"]
  );
}

export function buildOneSignalClickMessageInput(body, headers = {}) {
  const payload = asRecord(body);
  const eventName = getEventName(payload, headers);
  const notificationId = firstString(payload.notificationId, payload.notification_id);
  const actionId = firstString(payload.actionId, payload.action_id);
  const subscriptionId = firstString(payload.subscriptionId, payload.subscription_id);
  const url = firstString(payload.url, payload.launchUrl, payload.launch_url);
  const heading = firstString(payload.heading, payload.title, payload.subject);
  const content = firstString(payload.content, payload.body, payload.message, payload.text);
  const additionalData = asRecord(payload.additionalData || payload.additional_data);

  if (eventName !== "notification.clicked") {
    throw new Error("Only OneSignal notification.clicked events are supported");
  }
  if (!notificationId) {
    throw new Error("OneSignal notificationId is required");
  }

  const userId = firstString(additionalData.userId, additionalData.user_id);
  const campaignId = firstString(additionalData.campaignId, additionalData.campaign_id);
  const title = heading || `OneSignal notification clicked`;
  const bodyLines = [
    content || "A OneSignal notification was clicked.",
    actionId ? `Action: ${actionId}` : null,
    url ? `URL: ${url}` : null,
    userId ? `User: ${userId}` : null,
    campaignId ? `Campaign: ${campaignId}` : null,
  ].filter(Boolean);

  return {
    provider: "onesignal",
    externalId: [
      notificationId,
      actionId || "body",
      subscriptionId || userId || url || "unknown",
    ].join(":"),
    eventType: "notification.clicked",
    title,
    body: bodyLines.join("\n"),
    rawPayload: payload,
    analytics: {
      notificationId,
      actionId,
      subscriptionId,
      url,
      userId,
      campaignId,
    },
  };
}
