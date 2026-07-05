#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const experiment = {
  key: "test",
  surface: "auth",
  metric: "User Registered",
  variants: {
    control: {
      label: "Copy A - direct register copy",
      expectedConversionRate: 0.32,
    },
    treatment: {
      label: "Copy B - value-led trace visibility copy",
      expectedConversionRate: 0.45,
    },
  },
};

const defaultUsers = 100;
const defaultSeed = 1;
const defaultAmplitudeEndpoint = "https://api2.amplitude.com/2/httpapi";
const defaultGeo = {
  city: "San Francisco",
  country: "United States",
  region: "California",
  ip: null,
};
const defaultDevice = {
  brand: "Apple",
  model: "Mac",
  language: "en-US",
  osName: "macOS",
  platform: "Web",
  userAgent: "Synthetic Auth Copy AB Test Script",
};

loadEnvFile(".env");
loadEnvFile(".env.local");

function parseArgs(argv) {
  const options = {
    users: defaultUsers,
    seed: defaultSeed,
    format: "table",
    showRows: true,
    send: false,
    endpoint: process.env.AMPLITUDE_HTTP_API_ENDPOINT || defaultAmplitudeEndpoint,
    batchSize: 100,
    simulationId: null,
    userIdPrefix: "sim-user",
    deviceIdPrefix: "sim-device",
    city: process.env.SIMULATION_CITY || defaultGeo.city,
    country: process.env.SIMULATION_COUNTRY || defaultGeo.country,
    region: process.env.SIMULATION_REGION || defaultGeo.region,
    ip: process.env.SIMULATION_IP || defaultGeo.ip,
    deviceBrand: process.env.SIMULATION_DEVICE_BRAND || defaultDevice.brand,
    deviceModel: process.env.SIMULATION_DEVICE_MODEL || defaultDevice.model,
    language: process.env.SIMULATION_LANGUAGE || defaultDevice.language,
    osName: process.env.SIMULATION_OS_NAME || defaultDevice.osName,
    platform: process.env.SIMULATION_PLATFORM || defaultDevice.platform,
    userAgent: process.env.SIMULATION_USER_AGENT || defaultDevice.userAgent,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--users" || arg === "-u") {
      options.users = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--seed" || arg === "-s") {
      options.seed = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--format" || arg === "-f") {
      options.format = next;
      index += 1;
    } else if (arg === "--send") {
      options.send = true;
    } else if (arg === "--endpoint") {
      options.endpoint = next;
      index += 1;
    } else if (arg === "--batch-size") {
      options.batchSize = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--simulation-id") {
      options.simulationId = next;
      index += 1;
    } else if (arg === "--user-id-prefix") {
      options.userIdPrefix = next;
      index += 1;
    } else if (arg === "--device-id-prefix") {
      options.deviceIdPrefix = next;
      index += 1;
    } else if (arg === "--city") {
      options.city = next;
      index += 1;
    } else if (arg === "--country") {
      options.country = next;
      index += 1;
    } else if (arg === "--region") {
      options.region = next;
      index += 1;
    } else if (arg === "--ip") {
      options.ip = next;
      index += 1;
    } else if (arg === "--device-brand") {
      options.deviceBrand = next;
      index += 1;
    } else if (arg === "--device-model") {
      options.deviceModel = next;
      index += 1;
    } else if (arg === "--language") {
      options.language = next;
      index += 1;
    } else if (arg === "--os-name") {
      options.osName = next;
      index += 1;
    } else if (arg === "--platform") {
      options.platform = next;
      index += 1;
    } else if (arg === "--user-agent") {
      options.userAgent = next;
      index += 1;
    } else if (arg === "--summary-only") {
      options.showRows = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isInteger(options.users) || options.users <= 0) {
    throw new Error("--users must be a positive integer.");
  }

  if (!Number.isInteger(options.seed)) {
    throw new Error("--seed must be an integer.");
  }

  if (!["table", "json", "csv"].includes(options.format)) {
    throw new Error("--format must be one of: table, json, csv.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error("--batch-size must be a positive integer.");
  }

  for (const key of ["userIdPrefix", "deviceIdPrefix"]) {
    if (typeof options[key] !== "string" || options[key].trim().length === 0) {
      throw new Error(`--${kebabCase(key)} must be a non-empty string.`);
    }
  }

  return options;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function assignVariant(index) {
  return index % 2 === 0 ? "control" : "treatment";
}

function normalizeOptional(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function simulateUsers(options) {
  const { users, seed } = options;
  const random = createSeededRandom(seed);

  return Array.from({ length: users }, (_, index) => {
    const variant = assignVariant(index);
    const variantConfig = experiment.variants[variant];
    const converted = random() < variantConfig.expectedConversionRate;
    const paddedIndex = String(index + 1).padStart(3, "0");
    const userId = `${options.userIdPrefix}-${paddedIndex}`;
    const deviceId = `${options.deviceIdPrefix}-${paddedIndex}`;

    return {
      user_id: userId,
      device_id: deviceId,
      synthetic_user_id: userId,
      synthetic_device_id: deviceId,
      ip: normalizeOptional(options.ip),
      city: normalizeOptional(options.city),
      country: normalizeOptional(options.country),
      region: normalizeOptional(options.region),
      device_brand: normalizeOptional(options.deviceBrand),
      device_model: normalizeOptional(options.deviceModel),
      language: normalizeOptional(options.language),
      os_name: normalizeOptional(options.osName),
      platform: normalizeOptional(options.platform),
      user_agent: normalizeOptional(options.userAgent),
      event_name: converted ? "User Registered" : "Registration Abandoned",
      experiment_key: experiment.key,
      experiment_surface: experiment.surface,
      experiment_variant: variant,
      copy_label: variantConfig.label,
      auth_mode: "register",
      converted,
      conversion_value: converted ? 1 : 0,
    };
  });
}

function summarize(rows) {
  const byVariant = Object.keys(experiment.variants).map((variant) => {
    const variantRows = rows.filter((row) => row.experiment_variant === variant);
    const conversions = variantRows.filter((row) => row.converted).length;
    const users = variantRows.length;
    const conversionRate = users === 0 ? 0 : conversions / users;

    return {
      variant,
      copy_label: experiment.variants[variant].label,
      users,
      conversions,
      conversion_rate: conversionRate,
    };
  });

  const control = byVariant.find((row) => row.variant === "control");
  const treatment = byVariant.find((row) => row.variant === "treatment");
  const absoluteLift = treatment.conversion_rate - control.conversion_rate;
  const relativeLift = control.conversion_rate === 0 ? 0 : absoluteLift / control.conversion_rate;

  return {
    experiment_key: experiment.key,
    primary_metric: experiment.metric,
    total_users: rows.length,
    total_conversions: rows.filter((row) => row.converted).length,
    by_variant: byVariant,
    treatment_vs_control: {
      absolute_lift: absoluteLift,
      relative_lift: relativeLift,
      winner: absoluteLift > 0 ? "treatment" : absoluteLift < 0 ? "control" : "tie",
    },
  };
}

function buildAmplitudeEvents(rows, options) {
  const simulationId = options.simulationId || `auth-copy-ab-sim-${options.seed}-${options.users}`;
  const baseTime = Date.now();

  return rows.flatMap((row, index) => {
    const eventBase = {
      user_id: row.user_id,
      device_id: row.device_id,
      ip: row.ip,
      city: row.city,
      country: row.country,
      region: row.region,
      device_brand: row.device_brand,
      device_model: row.device_model,
      language: row.language,
      os_name: row.os_name,
      platform: row.platform,
      user_agent: row.user_agent,
      time: baseTime + index * 1000,
    };
    const properties = {
      synthetic_user_id: row.synthetic_user_id,
      synthetic_device_id: row.synthetic_device_id,
      city: row.city,
      country: row.country,
      region: row.region,
      device_brand: row.device_brand,
      device_model: row.device_model,
      language: row.language,
      os_name: row.os_name,
      platform: row.platform,
      experiment_surface: row.experiment_surface,
      auth_mode: row.auth_mode,
      page_path: "/register",
      experiment_key: row.experiment_key,
      experiment_variant: row.experiment_variant,
      copy_label: row.copy_label,
      is_synthetic: true,
      simulation_id: simulationId,
    };
    const userProperties = {
      synthetic_user: true,
      synthetic_simulation_id: simulationId,
      synthetic_user_id: row.synthetic_user_id,
      synthetic_device_id: row.synthetic_device_id,
      city: row.city,
      country: row.country,
      region: row.region,
      device_brand: row.device_brand,
      device_model: row.device_model,
      language: row.language,
      os_name: row.os_name,
      platform: row.platform,
      auth_copy_experiment_key: row.experiment_key,
      auth_copy_experiment_variant: row.experiment_variant,
      auth_copy_label: row.copy_label,
      auth_mode: row.auth_mode,
      registered_in_simulation: row.converted,
    };
    const eventTypes = [
      "$exposure",
      "[Experiment] Impression",
      "Auth Copy Experiment Exposed",
      "Auth Page Viewed",
      "Auth Form Submitted",
    ];

    if (row.converted) {
      eventTypes.push("Auth Conversion", "User Registered");
    }

    return eventTypes.map((eventType, eventIndex) => {
      const eventProperties = {
        ...properties,
      };

      if (eventType === "$exposure") {
        eventProperties.flag_key = experiment.key;
        eventProperties.variant = row.experiment_variant;
      }

      if (eventType === "[Experiment] Impression") {
        eventProperties["Flag Key"] = experiment.key;
        eventProperties[experiment.key] = row.experiment_variant;
        eventProperties.Variant = row.experiment_variant;
      }

      if (eventType === "Auth Conversion") {
        eventProperties.conversion_type = "register";
      }

      return {
        ...eventBase,
        event_type: eventType,
        event_properties: eventProperties,
        user_properties: userProperties,
        insert_id: `${simulationId}-${row.user_id}-${slugify(eventType)}`,
        time: eventBase.time + eventIndex * 100,
      };
    });
  });
}

async function sendAmplitudeEvents(events, options) {
  const apiKey = process.env.AMPLITUDE_API_KEY || process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing AMPLITUDE_API_KEY. Add it to .env.local or export it before using --send.");
  }

  const responses = [];

  for (let index = 0; index < events.length; index += options.batchSize) {
    const batch = events.slice(index, index + options.batchSize);
    const response = await fetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        events: batch,
      }),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`Amplitude upload failed (${response.status}): ${body}`);
    }

    responses.push({
      status: response.status,
      events: batch.length,
      body,
    });
  }

  return responses;
}

function slugify(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printTable(rows, summary, options, amplitudeEvents, uploadResponses) {
  console.log("Auth copy AB experiment simulation");
  console.log(`Experiment key: ${summary.experiment_key}`);
  console.log(`Primary metric: ${summary.primary_metric}`);
  console.log(`Seed: ${options.seed}`);
  console.log(`Synthetic users: ${rows.length}`);
  console.log(`Amplitude events: ${amplitudeEvents.length}`);
  console.log(`Upload mode: ${options.send ? "sent to Amplitude" : "preview only"}`);
  console.log("");

  console.table(
    summary.by_variant.map((row) => ({
      variant: row.variant,
      users: row.users,
      conversions: row.conversions,
      conversion_rate: formatPercent(row.conversion_rate),
      copy: row.copy_label,
    }))
  );

  console.log(
    `Treatment vs control: ${formatPercent(summary.treatment_vs_control.absolute_lift)} absolute lift, ` +
      `${formatPercent(summary.treatment_vs_control.relative_lift)} relative lift.`
  );
  console.log(`Winner: ${summary.treatment_vs_control.winner}`);

  if (uploadResponses.length > 0) {
    const uploadedEvents = uploadResponses.reduce((total, response) => total + response.events, 0);

    console.log(`Uploaded ${uploadedEvents} events in ${uploadResponses.length} batch(es).`);
  }

  if (options.showRows) {
    console.log("");
    console.table(
      rows.map((row) => ({
        user_id: row.user_id,
        device_id: row.device_id,
        city: row.city,
        country: row.country,
        variant: row.experiment_variant,
        converted: row.converted,
        event_name: row.event_name,
      }))
    );
  }
}

function printJson(rows, summary, amplitudeEvents, uploadResponses) {
  console.log(
    JSON.stringify(
      {
        summary,
        upload: {
          sent: uploadResponses.length > 0,
          endpoint: uploadResponses.length > 0 ? undefined : null,
          batches: uploadResponses.length,
          events: amplitudeEvents.length,
        },
        users: rows,
        amplitude_events: amplitudeEvents,
      },
      null,
      2
    )
  );
}

function printCsv(rows) {
  const headers = [
    "user_id",
    "device_id",
    "synthetic_user_id",
    "synthetic_device_id",
    "ip",
    "city",
    "country",
    "region",
    "device_brand",
    "device_model",
    "language",
    "os_name",
    "platform",
    "event_name",
    "experiment_key",
    "experiment_surface",
    "experiment_variant",
    "copy_label",
    "auth_mode",
    "converted",
    "conversion_value",
  ];

  console.log(headers.join(","));
  for (const row of rows) {
    console.log(headers.map((header) => csvValue(row[header])).join(","));
  }
}

function csvValue(value) {
  if (value == null) {
    return "";
  }

  const text = String(value);

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function printHelp() {
  console.log(`Usage: npm run simulate:auth-ab -- [options]

Options:
  -u, --users <number>      Number of users to simulate. Default: ${defaultUsers}
  -s, --seed <number>       Deterministic random seed. Default: ${defaultSeed}
  -f, --format <type>       Output format: table, json, csv. Default: table
      --send                Upload synthetic events to Amplitude HTTP API v2
      --endpoint <url>      Amplitude upload endpoint. Default: ${defaultAmplitudeEndpoint}
      --batch-size <number> Events per upload request. Default: 100
      --simulation-id <id>  Stable id for this synthetic run
      --user-id-prefix <id> User id prefix. Default: sim-user
      --device-id-prefix <id>
                            Device id prefix. Default: sim-device
      --city <name>         Top-level Amplitude city and mirrored property. Default: ${defaultGeo.city}
      --country <name>      Top-level Amplitude country and mirrored property. Default: ${defaultGeo.country}
      --region <name>       Top-level Amplitude region and mirrored property. Default: ${defaultGeo.region}
      --ip <address>        Top-level Amplitude IP address for geo lookup. Default: unset
      --device-brand <name> Top-level Amplitude device brand. Default: ${defaultDevice.brand}
      --device-model <name> Top-level Amplitude device model. Default: ${defaultDevice.model}
      --language <tag>      Top-level Amplitude language. Default: ${defaultDevice.language}
      --os-name <name>      Top-level Amplitude OS name. Default: ${defaultDevice.osName}
      --platform <name>     Top-level Amplitude platform. Default: ${defaultDevice.platform}
      --user-agent <value>  Top-level Amplitude user agent. Default: "${defaultDevice.userAgent}"
      --summary-only        Hide per-user rows in table output
  -h, --help                Show this help text

Examples:
  npm run simulate:auth-ab -- --summary-only
  npm run simulate:auth-ab -- --country "China" --city "Shanghai" --region "Shanghai"
  npm run simulate:auth-ab -- --send --summary-only
  npm run simulate:auth-ab -- --format csv > auth-ab-simulation.csv
`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const rows = simulateUsers(options);
  const summary = summarize(rows);
  const amplitudeEvents = buildAmplitudeEvents(rows, options);
  const uploadResponses = options.send ? await sendAmplitudeEvents(amplitudeEvents, options) : [];

  if (options.format === "json") {
    printJson(rows, summary, amplitudeEvents, uploadResponses);
  } else if (options.format === "csv") {
    if (uploadResponses.length > 0) {
      console.error(`Uploaded ${amplitudeEvents.length} events to Amplitude.`);
    }

    printCsv(rows);
  } else {
    printTable(rows, summary, options, amplitudeEvents, uploadResponses);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
