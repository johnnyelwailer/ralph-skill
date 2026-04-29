import { isMapping, loadYamlFile } from "@aloop/config-schema-utils";
import type { ParseResult } from "@aloop/core";
import { writeFileSync } from "node:fs";
import { stringify as yamlStringify } from "yaml";
import { DAEMON_DEFAULTS, type DaemonConfig } from "./daemon-types.ts";
import {
  mergeFeatures,
  mergeHttp,
  mergeLogging,
  mergeRetention,
  mergeScheduler,
  mergeWatchdog,
} from "./daemon-mergers.ts";

export { DAEMON_DEFAULTS, type DaemonConfig };

const TOP_LEVEL_KEYS = ["http", "scheduler", "watchdog", "retention", "logging", "features"] as const;

/** Load daemon.yml from disk. Missing file → returns DEFAULTS (typed ok). */
export function loadDaemonConfig(path: string): ParseResult<DaemonConfig> {
  const raw = loadYamlFile(path);
  if (!raw.ok) {
    if (raw.errors[0]?.startsWith("file not found:")) {
      return { ok: true, value: DAEMON_DEFAULTS };
    }
    return raw as ParseResult<DaemonConfig>;
  }
  return parseDaemonConfig(raw.value);
}

/** Parse already-loaded YAML into a DaemonConfig with defaults applied. */
export function parseDaemonConfig(raw: unknown): ParseResult<DaemonConfig> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: DAEMON_DEFAULTS };
  }
  if (!isMapping(raw)) {
    return { ok: false, errors: ["daemon.yml must be a YAML mapping at the top level"] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.includes(key as (typeof TOP_LEVEL_KEYS)[number])) {
      errors.push(`unknown top-level field: ${key}`);
    }
  }

  const value: DaemonConfig = {
    http: mergeHttp(raw.http, errors),
    scheduler: mergeScheduler(raw.scheduler, errors),
    watchdog: mergeWatchdog(raw.watchdog, errors),
    retention: mergeRetention(raw.retention, errors),
    logging: mergeLogging(raw.logging, errors),
    features: mergeFeatures(raw.features, errors),
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

/** Persist a fully-validated daemon config to disk in canonical snake_case. */
export function saveDaemonConfig(path: string, config: DaemonConfig): void {
  writeFileSync(path, yamlStringify(daemonConfigToRaw(config)), { encoding: "utf-8" });
}

/**
 * Convert the typed daemon config to a YAML-serializable raw mapping.
 * Keys use the canonical snake_case shape documented in daemon.md.
 */
export function daemonConfigToRaw(config: DaemonConfig): Record<string, unknown> {
  return {
    http: {
      bind: config.http.bind,
      port: config.http.port,
      autostart: config.http.autostart,
    },
    scheduler: {
      concurrency_cap: config.scheduler.concurrencyCap,
      permit_ttl_default_seconds: config.scheduler.permitTtlDefaultSeconds,
      permit_ttl_max_seconds: config.scheduler.permitTtlMaxSeconds,
      system_limits: {
        cpu_max_pct: config.scheduler.systemLimits.cpuMaxPct,
        mem_max_pct: config.scheduler.systemLimits.memMaxPct,
        load_max: config.scheduler.systemLimits.loadMax,
      },
      burn_rate: {
        max_tokens_since_commit: config.scheduler.burnRate.maxTokensSinceCommit,
        min_commits_per_hour: config.scheduler.burnRate.minCommitsPerHour,
      },
    },
    watchdog: {
      tick_interval: config.watchdog.tickIntervalSeconds,
      stuck_threshold: config.watchdog.stuckThresholdSeconds,
      quota_poll_interval: config.watchdog.quotaPollIntervalSeconds,
    },
    retention: {
      completed_sessions_days: config.retention.completedSessionsDays,
      interrupted_sessions_days: config.retention.interruptedSessionsDays,
      abandoned_setup_days: config.retention.abandonedSetupDays,
    },
    logging: {
      level: config.logging.level,
    },
    features: {
      daemon_config_write: config.features?.daemonConfigWrite ?? false,
    },
  };
}
