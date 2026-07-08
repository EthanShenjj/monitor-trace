"use client";

import { useApp } from "@/context/AppContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useEffect, useMemo, useState } from "react";

type FieldKind = "string" | "number" | "boolean" | "date";

type FieldDefinition = {
  key: string;
  label: string;
  dataType: string;
  kind: FieldKind;
  options?: string[];
  weights?: number[];
  min?: number;
  max?: number;
  startDate?: string;
  endDate?: string;
  group?: string;
};

type EventDefinition = {
  eventName: string;
  displayName: string;
  probability: number;
  nextEvent: string;
  conversionRate: number;
  fields: FieldDefinition[];
};

type EventCardState = {
  probability: string;
  nextEvent: string;
  conversionRate: string;
  properties: Record<string, string>;
};

type EventState = Record<string, EventCardState>;
type EventPropertyValue = string | number | boolean | Record<string, unknown>;

const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    eventName: "activity_attend",
    displayName: "参加活动",
    probability: 100,
    nextEvent: "gold_get",
    conversionRate: 100,
    fields: [
      {
        key: "activity_type",
        label: "活动类型",
        dataType: "字符串",
        kind: "string",
        options: ["五一活动", "周年庆活动", "工会活动"],
        weights: [1, 3, 2],
      },
      {
        key: "activity_reward",
        label: "活动奖励类型",
        dataType: "字符串",
        kind: "string",
        options: ["金币", "砖石", "点券"],
        weights: [7, 2, 1],
      },
      { key: "reward_amount", label: "奖励值", dataType: "数值", kind: "number", min: 1, max: 100 },
      { key: "attend_progress", label: "参与进度", dataType: "数值", kind: "number", min: 1, max: 100 },
    ],
  },
  {
    eventName: "payment",
    displayName: "付费事件",
    probability: 100,
    nextEvent: "draw_card",
    conversionRate: 80,
    fields: [
      {
        key: "currency_type",
        label: "币种",
        dataType: "字符串",
        kind: "string",
        options: ["点券", "代币券"],
        weights: [1, 3],
      },
      { key: "diamond_get_amount", label: "钻石获取量", dataType: "数值", kind: "number", min: 100, max: 10000 },
      {
        key: "is_first_pay",
        label: "是否首次付费",
        dataType: "布尔",
        kind: "boolean",
        options: ["true", "false"],
        weights: [1, 3],
      },
      { key: "pay_amount", label: "付费金额", dataType: "数值", kind: "number", min: 1, max: 1000 },
      {
        key: "payment_name",
        label: "购买礼包名",
        dataType: "字符串",
        kind: "string",
        options: ["至尊礼包", "天尊礼包", "地尊礼包"],
        weights: [1, 3, 6],
      },
    ],
  },
  {
    eventName: "app_start",
    displayName: "启动",
    probability: 100,
    nextEvent: "",
    conversionRate: 100,
    fields: [],
  },
  {
    eventName: "level_up",
    displayName: "升级事件",
    probability: 100,
    nextEvent: "",
    conversionRate: 100,
    fields: [
      { key: "level_before", label: "升级前等级", dataType: "数值", kind: "number", min: 1, max: 100 },
    ],
  },
  {
    eventName: "gold_get",
    displayName: "获取金币",
    probability: 100,
    nextEvent: "",
    conversionRate: 100,
    fields: [
      { key: "gold_get_amount", label: "金币获得量", dataType: "数值", kind: "number", min: 100, max: 10000 },
      { key: "gold_change_before", label: "金币变更前", dataType: "数值", kind: "number", min: 100, max: 10000 },
      { key: "gold_change_after", label: "金币变更后", dataType: "数值", kind: "number", min: 100, max: 10000 },
      {
        key: "reason",
        label: "原因",
        dataType: "字符串",
        kind: "string",
        options: ["升级奖励", "每日奖励", "邮件奖励"],
        weights: [1, 3, 2],
      },
    ],
  },
  {
    eventName: "gold_consume",
    displayName: "金币消耗",
    probability: 100,
    nextEvent: "",
    conversionRate: 100,
    fields: [
      { key: "gold_get_amount", label: "金币获得量", dataType: "数值", kind: "number", min: 100, max: 10000 },
      { key: "gold_change_before", label: "金币变更前", dataType: "数值", kind: "number", min: 100, max: 10000 },
      { key: "gold_change_after", label: "金币变更后", dataType: "数值", kind: "number", min: 100, max: 10000 },
      {
        key: "reason",
        label: "原因",
        dataType: "字符串",
        kind: "string",
        options: ["升级奖励", "每日奖励", "邮件奖励"],
        weights: [1, 3, 2],
      },
    ],
  },
  {
    eventName: "draw_card",
    displayName: "抽卡事件",
    probability: 100,
    nextEvent: "",
    conversionRate: 100,
    fields: [
      {
        key: "draw_type",
        label: "抽卡类型",
        dataType: "字符串",
        kind: "string",
        options: ["单抽", "十连抽"],
        weights: [7, 3],
      },
      { key: "hero_id", label: "英雄ID", dataType: "数值", kind: "number", min: 1, max: 30 },
      {
        key: "hero_quality",
        label: "英雄品质",
        dataType: "字符串",
        kind: "string",
        options: ["R", "SR", "SSR"],
        weights: [7, 2, 1],
      },
      {
        key: "hero_type",
        label: "英雄类型",
        dataType: "字符串",
        kind: "string",
        options: ["射手", "战士", "法师", "辅助"],
        weights: [3, 1, 1, 1],
      },
      {
        key: "object.time",
        label: "日期",
        dataType: "日期",
        kind: "date",
        startDate: "20210101",
        endDate: "20211217",
        group: "对象",
      },
      { key: "object.num", label: "数值", dataType: "数值", kind: "number", min: 1, max: 100, group: "对象" },
      {
        key: "object.str",
        label: "字符串",
        dataType: "字符串",
        kind: "string",
        options: ["射手", "战士", "法师", "辅助"],
        group: "对象",
      },
      { key: "objects.num", label: "数值", dataType: "数值", kind: "number", min: 1, max: 100, group: "对象组" },
      {
        key: "objects.str",
        label: "字符串",
        dataType: "字符串",
        kind: "string",
        options: ["射手", "战士", "法师", "辅助"],
        group: "对象组",
      },
    ],
  },
];

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(options: string[], weights?: number[]) {
  const normalizedWeights =
    weights && weights.length === options.length && weights.every((weight) => Number.isFinite(weight) && weight > 0)
      ? weights
      : options.map(() => 1);
  const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  let cursor = Math.random() * totalWeight;

  for (let index = 0; index < options.length; index += 1) {
    cursor -= normalizedWeights[index];
    if (cursor <= 0) {
      return options[index];
    }
  }

  return options[0] || "";
}

function parseCompactDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));

  return Date.UTC(year, month - 1, day);
}

function formatCompactDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function randomFieldValue(field: FieldDefinition) {
  if (field.kind === "number") {
    return String(randomInteger(field.min ?? 1, field.max ?? 100));
  }

  if (field.kind === "date") {
    const start = parseCompactDate(field.startDate || "20210101");
    const end = parseCompactDate(field.endDate || "20211217");
    return formatCompactDate(randomInteger(start, end));
  }

  return pickWeighted(field.options || ["true", "false"], field.weights);
}

function defaultFieldValue(field: FieldDefinition) {
  if (field.kind === "number") {
    return String(field.min ?? 0);
  }

  if (field.kind === "date") {
    return field.startDate || "";
  }

  return field.options?.[0] || "";
}

function createEventCardState(definition: EventDefinition, randomize: boolean): EventCardState {
  return {
    probability: String(definition.probability),
    nextEvent: definition.nextEvent,
    conversionRate: String(definition.conversionRate),
    properties: Object.fromEntries(
      definition.fields.map((field) => [field.key, randomize ? randomFieldValue(field) : defaultFieldValue(field)])
    ),
  };
}

function createEventState(randomize: boolean): EventState {
  return Object.fromEntries(
    EVENT_DEFINITIONS.map((definition) => [definition.eventName, createEventCardState(definition, randomize)])
  );
}

function parsePercent(value: string, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return fallback;
  }

  return parsed;
}

function coercePropertyValue(field: FieldDefinition, value: string): string | number | boolean {
  if (field.kind === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number(defaultFieldValue(field));
  }

  if (field.kind === "boolean") {
    return value === "true";
  }

  return value;
}

function setNestedProperty(target: Record<string, EventPropertyValue>, key: string, value: string | number | boolean) {
  const parts = key.split(".");
  let cursor: Record<string, EventPropertyValue> = target;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }

    const currentValue = cursor[part];
    if (!currentValue || typeof currentValue !== "object" || Array.isArray(currentValue)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, EventPropertyValue>;
  });
}

function buildProperties(definition: EventDefinition, state: EventCardState) {
  const properties: Record<string, EventPropertyValue> = {};

  definition.fields.forEach((field) => {
    setNestedProperty(properties, field.key, coercePropertyValue(field, state.properties[field.key] || ""));
  });

  return properties;
}

export default function EventsPage() {
  const { locale } = useApp();
  const [eventState, setEventState] = useState<EventState>(() => createEventState(false));
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");

  const eventOptions = useMemo(
    () => EVENT_DEFINITIONS.map((definition) => ({ value: definition.eventName, label: definition.displayName })),
    []
  );

  useEffect(() => {
    trackAnalyticsEvent("event_config_page_viewed", {
      event_count: EVENT_DEFINITIONS.length,
      platform: "web",
    });
  }, []);

  const updateEventField = (eventName: string, fieldKey: string, value: string) => {
    setEventState((current) => ({
      ...current,
      [eventName]: {
        ...current[eventName],
        properties: {
          ...current[eventName]?.properties,
          [fieldKey]: value,
        },
      },
    }));
    setStatusMessage(null);
  };

  const updateEventMeta = (eventName: string, key: "probability" | "nextEvent" | "conversionRate", value: string) => {
    setEventState((current) => ({
      ...current,
      [eventName]: {
        ...current[eventName],
        [key]: value,
      },
    }));
    setStatusMessage(null);
  };

  const randomizeAll = () => {
    setEventState(createEventState(true));
    setStatusMessage(null);
    trackAnalyticsEvent("event_config_randomized", {
      scope: "all",
      event_count: EVENT_DEFINITIONS.length,
      platform: "web",
    });
  };

  const randomizeOne = (definition: EventDefinition) => {
    setEventState((current) => ({
      ...current,
      [definition.eventName]: createEventCardState(definition, true),
    }));
    setStatusMessage(null);
    trackAnalyticsEvent("event_config_randomized", {
      scope: "single",
      event_name: definition.eventName,
      platform: "web",
    });
  };

  const getPayloadEvents = () =>
    EVENT_DEFINITIONS.map((definition) => {
      const state = eventState[definition.eventName] || createEventCardState(definition, false);

      return {
        event_name: definition.eventName,
        event_display_name: definition.displayName,
        occurrence_probability: parsePercent(state.probability, definition.probability),
        next_event: state.nextEvent || null,
        conversion_rate: parsePercent(state.conversionRate, definition.conversionRate),
        properties: buildProperties(definition, state),
      };
    });

  const saveEvents = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const events = getPayloadEvents();

    try {
      let responseStatus: number | null = null;
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "events_configuration_page",
          events,
        }),
      });
      responseStatus = response.status;
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const saveError = new Error(payload?.error || "Unable to store event configuration");
        saveError.name = String(responseStatus);
        throw saveError;
      }

      trackAnalyticsEvent("event_config_saved", {
        event_count: events.length,
        source: "events_configuration_page",
        platform: "web",
      });
      setStatusTone("success");
      setStatusMessage(locale === "zh" ? `已保存 ${events.length} 个事件配置` : `Saved ${events.length} event configurations`);
    } catch (error) {
      const statusCode = error instanceof Error && /^\d+$/.test(error.name) ? Number(error.name) : undefined;
      const failureReason = error instanceof Error ? error.message : "Unable to store event configuration";

      trackAnalyticsEvent("event_config_save_failed", {
        status_code: statusCode,
        failure_reason: failureReason,
        platform: "web",
      });
      setStatusTone("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : locale === "zh"
            ? "事件配置保存失败"
            : "Unable to store event configuration"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{locale === "zh" ? "事件" : "Events"}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {locale === "zh" ? "配置游戏行为事件、属性和后续转化链路。" : "Configure behavior events, attributes, and follow-up conversion paths."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" onClick={randomizeAll}>
            {locale === "zh" ? "随机全部" : "Randomize All"}
          </button>
          <button type="button" className="btn btn-primary" onClick={saveEvents} disabled={isSaving}>
            {isSaving ? (locale === "zh" ? "保存中" : "Saving") : locale === "zh" ? "保存" : "Save"}
          </button>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: "1.5rem",
          color: statusTone === "success" ? "var(--status-success)" : "var(--status-error)",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        {statusMessage || ""}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", alignItems: "start" }}>
        {EVENT_DEFINITIONS.map((definition) => {
          const state = eventState[definition.eventName] || createEventCardState(definition, false);
          const groupedFields = definition.fields.reduce<Record<string, FieldDefinition[]>>((groups, field) => {
            const groupName = field.group || "";
            groups[groupName] = [...(groups[groupName] || []), field];
            return groups;
          }, {});

          return (
            <section key={definition.eventName} className="glass-panel" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => randomizeOne(definition)}
                  style={{ width: "100%", minHeight: "3rem", justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: "1rem", fontWeight: 700 }}>{definition.displayName}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{definition.eventName}</span>
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.625rem" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>发生概率</span>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      max="100"
                      value={state.probability}
                      onChange={(event) => updateEventMeta(definition.eventName, "probability", event.target.value)}
                      aria-label={`${definition.displayName} 发生概率`}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>后续事件</span>
                    <select
                      className="input-field"
                      value={state.nextEvent}
                      onChange={(event) => updateEventMeta(definition.eventName, "nextEvent", event.target.value)}
                      aria-label={`${definition.displayName} 后续事件`}
                    >
                      <option value="">无</option>
                      {eventOptions
                        .filter((option) => option.value !== definition.eventName)
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>转换率</span>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      max="100"
                      value={state.conversionRate}
                      onChange={(event) => updateEventMeta(definition.eventName, "conversionRate", event.target.value)}
                      aria-label={`${definition.displayName} 转换率`}
                    />
                  </label>
                </div>
              </div>

              {definition.fields.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  {Object.entries(groupedFields).map(([groupName, fields]) => (
                    <div key={groupName || "base"} style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                      {groupName ? (
                        <div style={{ fontSize: "0.78rem", color: "var(--accent-primary)", fontWeight: 700 }}>{groupName}</div>
                      ) : null}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: "0.625rem" }}>
                        {fields.map((field) => (
                          <label key={field.key} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                              {field.label || field.key}
                              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> · {field.dataType}</span>
                            </span>
                            {field.options ? (
                              <select
                                className="input-field"
                                value={state.properties[field.key] || ""}
                                onChange={(event) => updateEventField(definition.eventName, field.key, event.target.value)}
                                aria-label={`${definition.displayName} ${field.label || field.key}`}
                              >
                                {field.options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="input-field"
                                type={field.kind === "number" ? "number" : "text"}
                                min={field.min}
                                max={field.max}
                                value={state.properties[field.key] || ""}
                                onChange={(event) => updateEventField(definition.eventName, field.key, event.target.value)}
                                aria-label={`${definition.displayName} ${field.label || field.key}`}
                              />
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    minHeight: "5.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-muted)",
                    fontSize: "0.9rem",
                  }}
                >
                  {locale === "zh" ? "无额外属性" : "No extra attributes"}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
