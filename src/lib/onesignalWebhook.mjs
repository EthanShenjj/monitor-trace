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

function localizedString(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const values = Object.values(value);

    if (value.en || value.default || values.every((item) => typeof item !== "object")) {
      return firstString(value.en, value.default, ...values);
    }

    return null;
  }

  return asNonEmptyString(value);
}

function firstLocalizedString(...values) {
  for (const value of values) {
    const clean = localizedString(value);

    if (clean) {
      return clean;
    }
  }

  return null;
}

function getEventName(payload, headers = {}) {
  const event = asRecord(payload.event);

  return firstString(
    event.kind,
    payload.event,
    payload["event.kind"],
    payload.event_kind,
    payload.event_type,
    payload.eventType,
    headers["x-onesignal-event"],
    headers["X-OneSignal-Event"]
  );
}

function normalizeEventName(eventName) {
  if (eventName === "notification.clicked") {
    return "notification.clicked";
  }

  if (
    eventName === "message.push.sent" ||
    eventName === "message.push.received" ||
    eventName === "message.push.clicked" ||
    eventName === "message.push.failed"
  ) {
    return eventName;
  }

  return null;
}

function eventLabel(eventType) {
  if (eventType === "notification.clicked" || eventType === "message.push.clicked") {
    return "clicked";
  }
  if (eventType === "message.push.sent") {
    return "sent";
  }
  if (eventType === "message.push.received") {
    return "received";
  }
  if (eventType === "message.push.failed") {
    return "failed";
  }

  return "received";
}

export function buildOneSignalEventMessageInput(body, headers = {}) {
  const payload = asRecord(body);
  const event = asRecord(payload.event);
  const eventData = asRecord(event.data || payload.event_data);
  const message = asRecord(payload.message);
  const messageTitle = asRecord(message.title);
  const messageContents = asRecord(message.contents || message.content);
  const additionalData = asRecord(
    payload.additionalData ||
      payload.additional_data ||
      message.data ||
      payload.data
  );
  const rawEventName = getEventName(payload, headers);
  const eventType = normalizeEventName(rawEventName);

  if (!eventType) {
    throw new Error("Only OneSignal push sent, received, clicked, and failed events are supported");
  }

  const eventId = firstString(event.id, payload.eventId, payload.event_id, payload["event.id"]);
  const notificationId = firstString(
    payload.notificationId,
    payload.notification_id,
    payload.messageId,
    payload.message_id,
    message.id,
    payload["message.id"]
  );
  const actionId = firstString(payload.actionId, payload.action_id, eventData.target_id);
  const subscriptionId = firstString(
    payload.subscriptionId,
    payload.subscription_id,
    event.subscription_id,
    payload["event.subscription_id"],
    payload["user.subscription.id"]
  );
  const externalUserId = firstString(
    event.external_id,
    payload.external_id,
    payload.externalId,
    payload["event.external_id"],
    additionalData.userId,
    additionalData.user_id
  );
  const url = firstString(payload.url, payload.launchUrl, payload.launch_url, message.url);
  const heading = firstLocalizedString(
    payload.heading,
    payload.title,
    payload.subject,
    messageTitle,
    message.title,
    payload["message.title.en"],
    payload["message.title"]
  );
  const content = firstLocalizedString(
    payload.content,
    payload.body,
    payload.message,
    payload.text,
    messageContents,
    message.contents,
    payload["message.contents.en"],
    payload["message.content.en"]
  );
  const failureReason = firstString(
    eventData.failure_reason,
    eventData.failureReason,
    payload.failure_reason,
    payload.failureReason,
    payload["event.data.failure_reason"]
  );
  const campaignId = firstString(additionalData.campaignId, additionalData.campaign_id);
  const eventDateTime = firstString(event.datetime, payload.event_datetime, payload["event.datetime"]);
  const deviceType = firstString(
    event.subscription_device_type,
    payload.subscription_device_type,
    payload["event.subscription_device_type"]
  );

  if (!notificationId && !eventId) {
    throw new Error("OneSignal message id or event id is required");
  }

  const label = eventLabel(eventType);
  const title = heading || `OneSignal push ${label}`;
  const bodyLines = [
    content || `A OneSignal push ${label} event was received.`,
    failureReason ? `Failure reason: ${failureReason}` : null,
    actionId ? `Action: ${actionId}` : null,
    url ? `URL: ${url}` : null,
    externalUserId ? `User: ${externalUserId}` : null,
    subscriptionId ? `Subscription: ${subscriptionId}` : null,
    deviceType ? `Device: ${deviceType}` : null,
    campaignId ? `Campaign: ${campaignId}` : null,
  ].filter(Boolean);

  return {
    provider: "onesignal",
    externalId:
      eventId ||
      (eventType === "notification.clicked"
        ? [
            notificationId,
            actionId || "body",
            subscriptionId || externalUserId || url || "unknown",
          ]
        : [
            notificationId,
            eventType,
            actionId || subscriptionId || externalUserId || failureReason || url || "unknown",
          ]
      ).join(":"),
    eventType,
    title,
    body: bodyLines.join("\n"),
    rawPayload: payload,
    analytics: {
      eventType,
      eventId,
      notificationId,
      actionId,
      subscriptionId,
      url,
      userId: externalUserId,
      campaignId,
      failureReason,
      eventDateTime,
      deviceType,
    },
  };
}

export function buildOneSignalClickMessageInput(body, headers = {}) {
  const input = buildOneSignalEventMessageInput(body, headers);

  if (input.eventType !== "notification.clicked" && input.eventType !== "message.push.clicked") {
    throw new Error("Only OneSignal notification.clicked events are supported");
  }

  return input;
}
