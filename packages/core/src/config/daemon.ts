import { isMapping, loadYamlFile } from "./yaml.ts";
import { DAEMON_DEFAULTS, type DaemonConfig } from "./daemon-types.ts";
import {
  mergeHttp,
  mergeLogging,
  mergeRetention,
  mergeScheduler,
  mergeWatchdog,
} from "./daemon-mergers.ts";
import type { ParseResult } from "../compile/types.ts";

export { DAEMON_DEFAULTS, type DaemonConfig };

const TOP_LEVEL_KEYS = ["http", "scheduler", "watchdog", "retention", "logging"] as const;

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
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}
