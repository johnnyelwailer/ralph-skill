import { isMapping, loadYamlFile } from "./yaml.ts";
import type { ParseResult } from "../compile/types.ts";

/**
 * Daemon-level configuration. Source: ~/.aloop/daemon.yml. Fields not present
 * in the file fall back to DEFAULTS (every default is explicit and documented;
 * no silent fallbacks per CONSTITUTION §III.14).
 *
 * Future milestones consume more of this surface:
 *   - http.*           — used in M1 (port, hostname, autostart)
 *   - scheduler.*      — used in M4 (permit gates, TTLs, system caps)
 *   - watchdog.*       — used in M4 (intervals)
 *   - retention.*      — used by setup (M3) + session lifecycle (M6)
 *   - logging.*        — used by daemon stdout pipeline
 *
 * Adding a knob here without a consumer is acceptable IF it's documented in
 * docs/spec/daemon.md or docs/spec/self-improvement.md (tunable knobs table).
 */
export type DaemonConfig = {
  readonly http: {
    readonly bind: string;
    readonly port: number;
    readonly autostart: boolean;
  };
  readonly scheduler: {
    readonly concurrencyCap: number;
    readonly permitTtlDefaultSeconds: number;
    readonly permitTtlMaxSeconds: number;
    readonly systemLimits: {
      readonly cpuMaxPct: number;
      readonly memMaxPct: number;
      readonly loadMax: number;
    };
    readonly burnRate: {
      readonly maxTokensSinceCommit: number;
      readonly minCommitsPerHour: number;
    };
  };
  readonly watchdog: {
    readonly tickIntervalSeconds: number;
    readonly stuckThresholdSeconds: number;
    readonly quotaPollIntervalSeconds: number;
  };
  readonly retention: {
    readonly completedSessionsDays: number;
    readonly interruptedSessionsDays: number;
    readonly abandonedSetupDays: number;
  };
  readonly logging: {
    readonly level: "debug" | "info" | "warn" | "error";
  };
};

export const DAEMON_DEFAULTS: DaemonConfig = {
  http: {
    bind: "127.0.0.1",
    port: 7777,
    autostart: true,
  },
  scheduler: {
    concurrencyCap: 3,
    permitTtlDefaultSeconds: 600,
    permitTtlMaxSeconds: 3600,
    systemLimits: {
      cpuMaxPct: 80,
      memMaxPct: 85,
      loadMax: 4.0,
    },
    burnRate: {
      maxTokensSinceCommit: 1_000_000,
      minCommitsPerHour: 1,
    },
  },
  watchdog: {
    tickIntervalSeconds: 15,
    stuckThresholdSeconds: 600,
    quotaPollIntervalSeconds: 60,
  },
  retention: {
    completedSessionsDays: 30,
    interruptedSessionsDays: 90,
    abandonedSetupDays: 14,
  },
  logging: {
    level: "info",
  },
};

const TOP_LEVEL_KEYS = ["http", "scheduler", "watchdog", "retention", "logging"] as const;
const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

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

  const http = mergeHttp(raw.http, errors);
  const scheduler = mergeScheduler(raw.scheduler, errors);
  const watchdog = mergeWatchdog(raw.watchdog, errors);
  const retention = mergeRetention(raw.retention, errors);
  const logging = mergeLogging(raw.logging, errors);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { http, scheduler, watchdog, retention, logging } };
}

function mergeHttp(raw: unknown, errors: string[]): DaemonConfig["http"] {
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

function mergeScheduler(raw: unknown, errors: string[]): DaemonConfig["scheduler"] {
  const def = DAEMON_DEFAULTS.scheduler;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("scheduler: must be a mapping");
    return def;
  }
  return {
    concurrencyCap: posIntField(
      raw.concurrency_cap ?? raw.concurrencyCap,
      "scheduler.concurrency_cap",
      def.concurrencyCap,
      errors,
    ),
    permitTtlDefaultSeconds: posIntField(
      raw.permit_ttl_default_seconds ?? raw.permitTtlDefaultSeconds,
      "scheduler.permit_ttl_default_seconds",
      def.permitTtlDefaultSeconds,
      errors,
    ),
    permitTtlMaxSeconds: posIntField(
      raw.permit_ttl_max_seconds ?? raw.permitTtlMaxSeconds,
      "scheduler.permit_ttl_max_seconds",
      def.permitTtlMaxSeconds,
      errors,
    ),
    systemLimits: mergeSystemLimits(raw.system_limits ?? raw.systemLimits, errors),
    burnRate: mergeBurnRate(raw.burn_rate ?? raw.burnRate, errors),
  };
}

function mergeSystemLimits(
  raw: unknown,
  errors: string[],
): DaemonConfig["scheduler"]["systemLimits"] {
  const def = DAEMON_DEFAULTS.scheduler.systemLimits;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("scheduler.system_limits: must be a mapping");
    return def;
  }
  return {
    cpuMaxPct: pctField(raw.cpu_max_pct ?? raw.cpuMaxPct, "scheduler.system_limits.cpu_max_pct", def.cpuMaxPct, errors),
    memMaxPct: pctField(raw.mem_max_pct ?? raw.memMaxPct, "scheduler.system_limits.mem_max_pct", def.memMaxPct, errors),
    loadMax: posNumField(raw.load_max ?? raw.loadMax, "scheduler.system_limits.load_max", def.loadMax, errors),
  };
}

function mergeBurnRate(
  raw: unknown,
  errors: string[],
): DaemonConfig["scheduler"]["burnRate"] {
  const def = DAEMON_DEFAULTS.scheduler.burnRate;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("scheduler.burn_rate: must be a mapping");
    return def;
  }
  return {
    maxTokensSinceCommit: posIntField(
      raw.max_tokens_since_commit ?? raw.maxTokensSinceCommit,
      "scheduler.burn_rate.max_tokens_since_commit",
      def.maxTokensSinceCommit,
      errors,
    ),
    minCommitsPerHour: nonNegIntField(
      raw.min_commits_per_hour ?? raw.minCommitsPerHour,
      "scheduler.burn_rate.min_commits_per_hour",
      def.minCommitsPerHour,
      errors,
    ),
  };
}

function mergeWatchdog(raw: unknown, errors: string[]): DaemonConfig["watchdog"] {
  const def = DAEMON_DEFAULTS.watchdog;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("watchdog: must be a mapping");
    return def;
  }
  return {
    tickIntervalSeconds: durationField(
      raw.tick_interval ?? raw.tickIntervalSeconds,
      "watchdog.tick_interval",
      def.tickIntervalSeconds,
      errors,
    ),
    stuckThresholdSeconds: durationField(
      raw.stuck_threshold ?? raw.stuckThresholdSeconds,
      "watchdog.stuck_threshold",
      def.stuckThresholdSeconds,
      errors,
    ),
    quotaPollIntervalSeconds: durationField(
      raw.quota_poll_interval ?? raw.quotaPollIntervalSeconds,
      "watchdog.quota_poll_interval",
      def.quotaPollIntervalSeconds,
      errors,
    ),
  };
}

function mergeRetention(raw: unknown, errors: string[]): DaemonConfig["retention"] {
  const def = DAEMON_DEFAULTS.retention;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("retention: must be a mapping");
    return def;
  }
  return {
    completedSessionsDays: nonNegIntField(
      raw.completed_sessions_days ?? raw.completedSessionsDays,
      "retention.completed_sessions_days",
      def.completedSessionsDays,
      errors,
    ),
    interruptedSessionsDays: nonNegIntField(
      raw.interrupted_sessions_days ?? raw.interruptedSessionsDays,
      "retention.interrupted_sessions_days",
      def.interruptedSessionsDays,
      errors,
    ),
    abandonedSetupDays: nonNegIntField(
      raw.abandoned_setup_days ?? raw.abandonedSetupDays,
      "retention.abandoned_setup_days",
      def.abandonedSetupDays,
      errors,
    ),
  };
}

function mergeLogging(raw: unknown, errors: string[]): DaemonConfig["logging"] {
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

// --- field validators ---

function stringField(v: unknown, path: string, def: string, errors: string[]): string {
  if (v === undefined) return def;
  if (typeof v !== "string" || v.length === 0) {
    errors.push(`${path}: must be a non-empty string`);
    return def;
  }
  return v;
}

function boolField(v: unknown, path: string, def: boolean, errors: string[]): boolean {
  if (v === undefined) return def;
  if (typeof v !== "boolean") {
    errors.push(`${path}: must be a boolean`);
    return def;
  }
  return v;
}

function posIntField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    errors.push(`${path}: must be a positive integer`);
    return def;
  }
  return v;
}

function nonNegIntField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    errors.push(`${path}: must be a non-negative integer`);
    return def;
  }
  return v;
}

function posNumField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    errors.push(`${path}: must be a positive number`);
    return def;
  }
  return v;
}

function pctField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) {
    errors.push(`${path}: must be a number in [0, 100]`);
    return def;
  }
  return v;
}

function portField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (v === null) return 0; // 0 = pick available; allowed
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 65535) {
    errors.push(`${path}: must be an integer in [0, 65535] or null`);
    return def;
  }
  return v;
}

/** Accept "30s", "5m", "2h", or a raw number (interpreted as seconds). */
function durationField(v: unknown, path: string, def: number, errors: string[]): number {
  if (v === undefined) return def;
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0) {
      errors.push(`${path}: numeric duration must be a non-negative integer (seconds)`);
      return def;
    }
    return v;
  }
  if (typeof v === "string") {
    const m = /^(\d+)\s*(s|m|h|d)?$/.exec(v.trim());
    if (!m) {
      errors.push(`${path}: must be a duration like "30s", "5m", "2h", or "1d"`);
      return def;
    }
    const n = Number.parseInt(m[1]!, 10);
    const unit = m[2] ?? "s";
    const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return n * mult;
  }
  errors.push(`${path}: must be a duration string or a non-negative integer (seconds)`);
  return def;
}
