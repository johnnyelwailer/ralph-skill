import {
  boolField,
  durationField,
  isMapping,
  nonNegIntField,
  pick,
  portField,
  posIntField,
  stringField,
} from "@aloop/config-schema-utils";
import {
  DAEMON_DEFAULTS,
  type DaemonConfig,
} from "./daemon-types.ts";

/** Merge the `features` section of daemon.yml. */
export function mergeFeatures(raw: unknown, errors: string[]): DaemonConfig["features"] {
  const def = DAEMON_DEFAULTS.features;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("features: must be a mapping");
    return def;
  }
  const result: DaemonConfig["features"] = { ...def };
  for (const key of Object.keys(raw)) {
    if (key === "daemon_config_write" || key === "daemonConfigWrite") {
      const val = pick(raw, "daemon_config_write", "daemonConfigWrite");
      if (typeof val === "boolean") {
        result.daemonConfigWrite = val;
      } else if (val !== undefined) {
        errors.push("features.daemon_config_write: must be a boolean");
      }
    } else {
      errors.push(`unknown features field: ${key}`);
    }
  }
  return result;
}

export { mergeScheduler } from "./daemon-mergers-scheduler.ts";

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function mergeHttp(raw: unknown, errors: string[]): DaemonConfig["http"] {
  const def = DAEMON_DEFAULTS.http;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("http: must be a mapping");
    return def;
  }
  return {
    bind: stringField(raw.bind, "http.bind", def.bind, errors),
    port: portField(raw.port, "http.port", def.port, errors),
    autostart: boolField(raw.autostart, "http.autostart", def.autostart, errors),
  };
}

export function mergeWatchdog(raw: unknown, errors: string[]): DaemonConfig["watchdog"] {
  const def = DAEMON_DEFAULTS.watchdog;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("watchdog: must be a mapping");
    return def;
  }
  return {
    tickIntervalSeconds: durationField(
      pick(raw, "tick_interval", "tickIntervalSeconds"),
      "watchdog.tick_interval",
      def.tickIntervalSeconds,
      errors,
    ),
    stuckThresholdSeconds: durationField(
      pick(raw, "stuck_threshold", "stuckThresholdSeconds"),
      "watchdog.stuck_threshold",
      def.stuckThresholdSeconds,
      errors,
    ),
    quotaPollIntervalSeconds: durationField(
      pick(raw, "quota_poll_interval", "quotaPollIntervalSeconds"),
      "watchdog.quota_poll_interval",
      def.quotaPollIntervalSeconds,
      errors,
    ),
  };
}

export function mergeRetention(raw: unknown, errors: string[]): DaemonConfig["retention"] {
  const def = DAEMON_DEFAULTS.retention;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("retention: must be a mapping");
    return def;
  }
  return {
    completedSessionsDays: nonNegIntField(
      pick(raw, "completed_sessions_days", "completedSessionsDays"),
      "retention.completed_sessions_days",
      def.completedSessionsDays,
      errors,
    ),
    interruptedSessionsDays: nonNegIntField(
      pick(raw, "interrupted_sessions_days", "interruptedSessionsDays"),
      "retention.interrupted_sessions_days",
      def.interruptedSessionsDays,
      errors,
    ),
    abandonedSetupDays: nonNegIntField(
      pick(raw, "abandoned_setup_days", "abandonedSetupDays"),
      "retention.abandoned_setup_days",
      def.abandonedSetupDays,
      errors,
    ),
  };
}

export function mergeLogging(raw: unknown, errors: string[]): DaemonConfig["logging"] {
  const def = DAEMON_DEFAULTS.logging;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("logging: must be a mapping");
    return def;
  }
  if (raw.level === undefined) return def;
  if (typeof raw.level !== "string" || !LOG_LEVELS.has(raw.level)) {
    errors.push(`logging.level: must be one of ${Array.from(LOG_LEVELS).join(", ")}`);
    return def;
  }
  return { level: raw.level as DaemonConfig["logging"]["level"] };
}

/**
 * Merge the `contexts` section of daemon.yml.
 * Maps context ids (e.g. "orch_recall") to their provider manifest and defaults.
 */
export function mergeContexts(
  raw: unknown,
  errors: string[],
): DaemonConfig["contexts"] {
  const def = DAEMON_DEFAULTS.contexts;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("contexts: must be a mapping of context_id → config");
    return def;
  }
  const result: Record<string, DaemonConfig["contexts"][string]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) {
      errors.push(`contexts.${key}: must not be null`);
      continue;
    }
    if (!isMapping(value)) {
      errors.push(`contexts.${key}: must be a mapping`);
      continue;
    }
    const providerRaw = pick(value, "provider", "Provider");
    if (typeof providerRaw !== "string" || providerRaw.length === 0) {
      errors.push(`contexts.${key}.provider: must be a non-empty string`);
      continue;
    }
    const budgetTokens = posIntField(
      pick(value, "budget_tokens", "budgetTokens"),
      `contexts.${key}.budget_tokens`,
      6000,
      errors,
    );
    const includeSources =
      pick(value, "include_sources", "includeSources") === false ? false : true;
    result[key] = {
      provider: providerRaw,
      budgetTokens,
      includeSources,
    };
  }
  return Object.freeze(result);
}
