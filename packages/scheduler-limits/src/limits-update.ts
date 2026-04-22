import {
  daemonConfigToRaw,
  parseDaemonConfig,
  type DaemonConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import { type EventWriter } from "@aloop/state-sqlite";
import { normalizeLimitsPatch } from "./limits-patch.ts";

export type SchedulerLimits = DaemonConfig["scheduler"];

export type LimitsUpdateResult =
  | { ok: true; limits: SchedulerLimits }
  | { ok: false; errors: readonly string[] };

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

function asMutableMap(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
