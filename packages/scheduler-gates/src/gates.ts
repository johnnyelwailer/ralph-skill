import type { EventWriter } from "@aloop/state-sqlite";
import type { ProviderOverrides, SchedulerLimits } from "./types.ts";
import type { BurnRateSample, SchedulerProbes } from "./probes.ts";

type GateDenied = { ok: false; reason: string; details: Record<string, unknown> };

export function applyOverrides(
  providerCandidate: string,
  overrides: ProviderOverrides,
): { ok: true; providerId: string } | GateDenied {
  if (overrides.force !== null) return { ok: true, providerId: overrides.force };
  if (overrides.deny?.includes(providerCandidate)) {
    return {
      ok: false,
      reason: "provider_denied",
      details: { provider_candidate: providerCandidate, deny: overrides.deny },
    };
  }
  if (overrides.allow !== null && !overrides.allow.includes(providerCandidate)) {
    return {
      ok: false,
      reason: "provider_not_allowed",
      details: { provider_candidate: providerCandidate, allow: overrides.allow },
    };
  }
  return { ok: true, providerId: providerCandidate };
}

export function checkSystemGate(
  systemSample: SchedulerProbes["systemSample"] | undefined,
  limits: SchedulerLimits["systemLimits"],
): { ok: true } | GateDenied {
  // Keep host-load checks deterministic: enforce only when a system probe is explicitly wired.
  if (!systemSample) return { ok: true };
  const sample = systemSample();
  if (
    sample.cpuPct <= limits.cpuMaxPct &&
    sample.memPct <= limits.memMaxPct &&
    sample.loadAvg <= limits.loadMax
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "system_limit_exceeded",
    details: {
      observed: {
        cpu_pct: sample.cpuPct,
        mem_pct: sample.memPct,
        load_avg: sample.loadAvg,
      },
      limits: {
        cpu_max_pct: limits.cpuMaxPct,
        mem_max_pct: limits.memMaxPct,
        load_max: limits.loadMax,
      },
    },
  };
}

export async function checkBurnRateGate(
  events: EventWriter,
  sessionId: string,
  sample: BurnRateSample,
  burn: SchedulerLimits["burnRate"],
): Promise<{ ok: true } | { ok: false; details: Record<string, unknown> }> {
  if (sample.tokensSinceLastCommit > burn.maxTokensSinceCommit) {
    await events.append("scheduler.burn_rate_exceeded", {
      session_id: sessionId,
      observed: sample.tokensSinceLastCommit,
      threshold: burn.maxTokensSinceCommit,
    }).catch(() => {
      // Audit log failure is best-effort — denial decision is authoritative.
    });
    return {
      ok: false,
      details: {
        observed_tokens_since_commit: sample.tokensSinceLastCommit,
        threshold_tokens_since_commit: burn.maxTokensSinceCommit,
      },
    };
  }
  if (sample.commitsPerHour < burn.minCommitsPerHour) {
    await events.append("scheduler.burn_rate_exceeded", {
      session_id: sessionId,
      observed: sample.commitsPerHour,
      threshold: burn.minCommitsPerHour,
    }).catch(() => {
      // Audit log failure is best-effort — denial decision is authoritative.
    });
    return {
      ok: false,
      details: {
        observed_commits_per_hour: sample.commitsPerHour,
        threshold_commits_per_hour: burn.minCommitsPerHour,
      },
    };
  }
  return { ok: true };
}
