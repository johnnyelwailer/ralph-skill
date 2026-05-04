import {
  isMapping,
  nonNegIntField,
  pctField,
  pick,
  posIntField,
  posNumField,
} from "@aloop/config-schema-utils";
import {
  DAEMON_DEFAULTS,
  type DaemonConfig,
  type ProjectSchedulerConfig,
} from "./daemon-types.ts";

export function mergeScheduler(raw: unknown, errors: string[]): DaemonConfig["scheduler"] {
  const def = DAEMON_DEFAULTS.scheduler;
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("scheduler: must be a mapping");
    return def;
  }
  return {
    concurrencyCap: posIntField(
      pick(raw, "concurrency_cap", "concurrencyCap"),
      "scheduler.concurrency_cap",
      def.concurrencyCap,
      errors,
    ),
    permitTtlDefaultSeconds: posIntField(
      pick(raw, "permit_ttl_default_seconds", "permitTtlDefaultSeconds"),
      "scheduler.permit_ttl_default_seconds",
      def.permitTtlDefaultSeconds,
      errors,
    ),
    permitTtlMaxSeconds: posIntField(
      pick(raw, "permit_ttl_max_seconds", "permitTtlMaxSeconds"),
      "scheduler.permit_ttl_max_seconds",
      def.permitTtlMaxSeconds,
      errors,
    ),
    systemLimits: mergeSystemLimits(pick(raw, "system_limits", "systemLimits"), errors),
    burnRate: mergeBurnRate(pick(raw, "burn_rate", "burnRate"), errors),
    projects: mergeProjectSchedulerConfig(pick(raw, "projects", "projects"), errors),
  };
}

function mergeProjectSchedulerConfig(
  raw: unknown,
  errors: string[],
): DaemonConfig["scheduler"]["projects"] {
  const def = DAEMON_DEFAULTS.scheduler.projects ?? {};
  if (raw === undefined) return def;
  if (!isMapping(raw)) {
    errors.push("scheduler.projects: must be a mapping of project_id → config");
    return def;
  }
  const result: Record<string, ProjectSchedulerConfig> = {};
  for (const [projectId, value] of Object.entries(raw)) {
    if (value === null) {
      errors.push(`scheduler.projects.${projectId}: must not be null`);
      continue;
    }
    if (!isMapping(value)) {
      errors.push(`scheduler.projects.${projectId}: must be a mapping`);
      continue;
    }
    const concurrencyCap = posIntField(
      pick(value, "concurrency_cap", "concurrencyCap"),
      `scheduler.projects.${projectId}.concurrency_cap`,
      undefined,
      errors,
    );
    const dailyCostCapCents = nonNegIntField(
      pick(value, "daily_cost_cap_cents", "dailyCostCapCents"),
      `scheduler.projects.${projectId}.daily_cost_cap_cents`,
      undefined,
      errors,
    );
    if (concurrencyCap !== undefined || dailyCostCapCents !== undefined) {
      result[projectId] = Object.freeze({
        ...(concurrencyCap !== undefined ? { concurrencyCap } : {}),
        ...(dailyCostCapCents !== undefined ? { dailyCostCapCents } : {}),
      });
    }
  }
  return Object.freeze(result);
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
    cpuMaxPct: pctField(
      pick(raw, "cpu_max_pct", "cpuMaxPct"),
      "scheduler.system_limits.cpu_max_pct",
      def.cpuMaxPct,
      errors,
    ),
    memMaxPct: pctField(
      pick(raw, "mem_max_pct", "memMaxPct"),
      "scheduler.system_limits.mem_max_pct",
      def.memMaxPct,
      errors,
    ),
    loadMax: posNumField(
      pick(raw, "load_max", "loadMax"),
      "scheduler.system_limits.load_max",
      def.loadMax,
      errors,
    ),
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
      pick(raw, "max_tokens_since_commit", "maxTokensSinceCommit"),
      "scheduler.burn_rate.max_tokens_since_commit",
      def.maxTokensSinceCommit,
      errors,
    ),
    minCommitsPerHour: nonNegIntField(
      pick(raw, "min_commits_per_hour", "minCommitsPerHour"),
      "scheduler.burn_rate.min_commits_per_hour",
      def.minCommitsPerHour,
      errors,
    ),
  };
}
