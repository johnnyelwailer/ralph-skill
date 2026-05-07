import {
  daemonConfigToRaw,
  parseDaemonConfig,
  type DaemonConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import { type EventWriter } from "@aloop/state-sqlite";
import { normalizeLimitsPatch } from "./limits-patch.ts";

export type SchedulerLimits = DaemonConfig["scheduler"];

/**
 * Bounds for every tunable knob, sourced from docs/spec/self-improvement.md §Level 2.
 * Each bound is inclusive. Values outside these ranges cause a tune_out_of_bounds error.
 */
export const TUNABLE_BOUNDS = {
  concurrency_cap: { min: 1, max: 8 },
  permit_ttl_default_seconds: { min: 120, max: 3600 },
  permit_ttl_max_seconds: { min: 120, max: 3600 },
  cpu_max_pct: { min: 50, max: 95 },
  mem_max_pct: { min: 50, max: 95 },
  load_max: { min: 0.5, max: 16 },
  max_tokens_since_commit: { min: 100_000, max: 10_000_000 },
  min_commits_per_hour: { min: 0, max: 10 },
  cooldown_multiplier: { min: 0.5, max: 4.0 },
  stuck_threshold_seconds: { min: 120, max: 3600 },
} as const;

export type TuningBoundKey = keyof typeof TUNABLE_BOUNDS;

/** Structured error for a single out-of-bounds value. */
export type OutOfBoundsError = {
  readonly code: "tune_out_of_bounds";
  readonly limit: TuningBoundKey;
  readonly min: number;
  readonly max: number;
  readonly proposed: number;
};

export type LimitsUpdateResult =
  | { ok: true; limits: SchedulerLimits }
  | { ok: false; errors: readonly string[]; outOfBounds?: OutOfBoundsError };

export async function updateSchedulerLimits(
  config: ConfigStore,
  events: EventWriter,
  rawPatch: Record<string, unknown>,
): Promise<LimitsUpdateResult> {
  const errors: string[] = [];
  const patch = normalizeLimitsPatch(rawPatch, errors);
  if (errors.length > 0) return { ok: false, errors };
  if (Object.keys(patch).length === 0) {
    return { ok: false, errors: ["no updatable scheduler limit fields provided"] };
  }

  const candidateRaw = daemonConfigToRaw(config.daemon());
  const scheduler = asMutableMap(candidateRaw.scheduler);
  const systemLimits = asMutableMap(scheduler.system_limits);
  const burnRate = asMutableMap(scheduler.burn_rate);

  if (patch.concurrencyCap !== undefined) scheduler.concurrency_cap = patch.concurrencyCap;
  if (patch.permitTtlDefaultSeconds !== undefined) {
    scheduler.permit_ttl_default_seconds = patch.permitTtlDefaultSeconds;
  }
  if (patch.permitTtlMaxSeconds !== undefined) {
    scheduler.permit_ttl_max_seconds = patch.permitTtlMaxSeconds;
  }
  if (patch.cpuMaxPct !== undefined) systemLimits.cpu_max_pct = patch.cpuMaxPct;
  if (patch.memMaxPct !== undefined) systemLimits.mem_max_pct = patch.memMaxPct;
  if (patch.loadMax !== undefined) systemLimits.load_max = patch.loadMax;
  if (patch.maxTokensSinceCommit !== undefined) {
    burnRate.max_tokens_since_commit = patch.maxTokensSinceCommit;
  }
  if (patch.minCommitsPerHour !== undefined) {
    burnRate.min_commits_per_hour = patch.minCommitsPerHour;
  }

  // Validate every patched value against the daemon.yml bounds from self-improvement.md §Level 2.
  const boundsError = validateBounds(patch);
  if (boundsError) return { ok: false, errors: [`${boundsError.limit}: proposed ${boundsError.proposed} is outside allowed range [${boundsError.min}, ${boundsError.max}]`], outOfBounds: boundsError };

  const parsed = parseDaemonConfig(candidateRaw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  if (parsed.value.scheduler.permitTtlDefaultSeconds > parsed.value.scheduler.permitTtlMaxSeconds) {
    return {
      ok: false,
      errors: ["scheduler.permit_ttl_default_seconds must be <= permit_ttl_max_seconds"],
    };
  }

  const before = config.daemon().scheduler;
  config.setDaemon(parsed.value);
  await events.append("scheduler.limits.changed", { limits: parsed.value.scheduler });
  await events.append("self_tuning_adjustment", {
    before: {
      concurrencyCap: before.concurrencyCap,
      permitTtlDefaultSeconds: before.permitTtlDefaultSeconds,
      permitTtlMaxSeconds: before.permitTtlMaxSeconds,
      systemLimits: { ...before.systemLimits },
      burnRate: { ...before.burnRate },
    },
    after: {
      concurrencyCap: parsed.value.scheduler.concurrencyCap,
      permitTtlDefaultSeconds: parsed.value.scheduler.permitTtlDefaultSeconds,
      permitTtlMaxSeconds: parsed.value.scheduler.permitTtlMaxSeconds,
      systemLimits: { ...parsed.value.scheduler.systemLimits },
      burnRate: { ...parsed.value.scheduler.burnRate },
    },
  });
  return { ok: true, limits: parsed.value.scheduler };
}

function asMutableMap(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type SchedulerLimitsPatch = {
  concurrencyCap?: unknown;
  permitTtlDefaultSeconds?: unknown;
  permitTtlMaxSeconds?: unknown;
  cpuMaxPct?: unknown;
  memMaxPct?: unknown;
  loadMax?: unknown;
  maxTokensSinceCommit?: unknown;
  minCommitsPerHour?: unknown;
};

/**
 * Validates every defined patch value against TUNABLE_BOUNDS.
 * Returns the first out-of-bounds error found, or undefined if all are valid.
 * Numeric type coercion is applied so that string "5" parses to 5 before checking.
 */
function validateBounds(patch: SchedulerLimitsPatch): OutOfBoundsError | undefined {
  const entries: [TuningBoundKey, unknown][] = [
    ["concurrency_cap", patch.concurrencyCap],
    ["permit_ttl_default_seconds", patch.permitTtlDefaultSeconds],
    ["permit_ttl_max_seconds", patch.permitTtlMaxSeconds],
    ["cpu_max_pct", patch.cpuMaxPct],
    ["mem_max_pct", patch.memMaxPct],
    ["load_max", patch.loadMax],
    ["max_tokens_since_commit", patch.maxTokensSinceCommit],
    ["min_commits_per_hour", patch.minCommitsPerHour],
  ];

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const num = Number(value);
    if (!Number.isFinite(num)) continue; // skip non-numeric
    const { min, max } = TUNABLE_BOUNDS[key];
    if (num < min || num > max) {
      return { code: "tune_out_of_bounds", limit: key, min, max, proposed: num };
    }
  }

  return undefined;
}
