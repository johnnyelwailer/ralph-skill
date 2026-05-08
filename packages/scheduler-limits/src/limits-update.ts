import {
  daemonConfigToRaw,
  parseDaemonConfig,
  type DaemonConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import { type EventWriter } from "@aloop/state-sqlite";
import {
  SCHEDULER_KNOB_BOUNDS,
  checkBound,
  type BoundViolation,
} from "./limits-bounds.ts";
import { normalizeLimitsPatch, type SchedulerLimitsPatch } from "./limits-patch.ts";

export type SchedulerLimits = DaemonConfig["scheduler"];

export type LimitsUpdateResult =
  | { ok: true; limits: SchedulerLimits }
  | { ok: false; errors: readonly string[] }
  | { ok: false; code: "tune_out_of_bounds"; violations: readonly BoundViolation[] };

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

  // Enforce hard bounds per self-improvement.md §Level-2 DGM-resistance mechanism.
  // The bounds are the containment box — the agent cannot resize them.
  const violations: BoundViolation[] = [];
  for (const violation of checkPatchBounds(patch)) {
    violations.push(violation);
  }
  if (violations.length > 0) {
    return { ok: false, code: "tune_out_of_bounds", violations };
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
  if (patch.watchdogStuckThresholdSeconds !== undefined) {
    asMutableMap(candidateRaw.watchdog).stuck_threshold = patch.watchdogStuckThresholdSeconds;
  }

  const parsed = parseDaemonConfig(candidateRaw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  if (parsed.value.scheduler.permitTtlDefaultSeconds > parsed.value.scheduler.permitTtlMaxSeconds) {
    return {
      ok: false,
      errors: ["scheduler.permit_ttl_default_seconds must be <= permit_ttl_max_seconds"],
    };
  }

  config.setDaemon(parsed.value);
  await events.append("scheduler.limits.changed", { limits: parsed.value.scheduler });
  return { ok: true, limits: parsed.value.scheduler };
}

function checkPatchBounds(patch: SchedulerLimitsPatch): BoundViolation[] {
  const violations: BoundViolation[] = [];
  if (patch.concurrencyCap !== undefined && typeof patch.concurrencyCap === "number") {
    const v = checkBound("concurrencyCap", patch.concurrencyCap, SCHEDULER_KNOB_BOUNDS.concurrencyCap);
    if (v) violations.push(v);
  }
  if (patch.maxTokensSinceCommit !== undefined && typeof patch.maxTokensSinceCommit === "number") {
    const v = checkBound(
      "maxTokensSinceCommit",
      patch.maxTokensSinceCommit,
      SCHEDULER_KNOB_BOUNDS.maxTokensSinceCommit,
    );
    if (v) violations.push(v);
  }
  if (patch.minCommitsPerHour !== undefined && typeof patch.minCommitsPerHour === "number") {
    const v = checkBound(
      "minCommitsPerHour",
      patch.minCommitsPerHour,
      SCHEDULER_KNOB_BOUNDS.minCommitsPerHour,
    );
    if (v) violations.push(v);
  }
  if (patch.cpuMaxPct !== undefined && typeof patch.cpuMaxPct === "number") {
    const v = checkBound("cpuMaxPct", patch.cpuMaxPct, SCHEDULER_KNOB_BOUNDS.cpuMaxPct);
    if (v) violations.push(v);
  }
  if (patch.memMaxPct !== undefined && typeof patch.memMaxPct === "number") {
    const v = checkBound("memMaxPct", patch.memMaxPct, SCHEDULER_KNOB_BOUNDS.memMaxPct);
    if (v) violations.push(v);
  }
  if (patch.permitTtlDefaultSeconds !== undefined && typeof patch.permitTtlDefaultSeconds === "number") {
    const v = checkBound(
      "permitTtlDefaultSeconds",
      patch.permitTtlDefaultSeconds,
      SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds,
    );
    if (v) violations.push(v);
  }
  if (
    patch.watchdogStuckThresholdSeconds !== undefined &&
    typeof patch.watchdogStuckThresholdSeconds === "number"
  ) {
    const v = checkBound(
      "watchdogStuckThresholdSeconds",
      patch.watchdogStuckThresholdSeconds,
      SCHEDULER_KNOB_BOUNDS.watchdogStuckThresholdSeconds,
    );
    if (v) violations.push(v);
  }
  if (patch.loadMax !== undefined && typeof patch.loadMax === "number") {
    const v = checkBound("loadMax", patch.loadMax, SCHEDULER_KNOB_BOUNDS.loadMax);
    if (v) violations.push(v);
  }
  return violations;
}

function asMutableMap(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
