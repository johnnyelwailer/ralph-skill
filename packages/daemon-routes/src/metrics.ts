import type { InMemoryProviderHealthStore } from "@aloop/provider";
import type { SchedulerLimits } from "@aloop/scheduler-gates";
import type { SchedulerProbes, SystemSample } from "@aloop/scheduler-gates";
import type { Permit } from "@aloop/state-sqlite";
import type { SchedulerService } from "@aloop/scheduler";

export type MetricsDeps = {
  readonly scheduler: SchedulerService;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly systemSample: SchedulerProbes["systemSample"];
};

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Handle GET /v1/metrics — Prometheus text exposition format.
 *
 * Exposes cardinality-bounded daemon metrics per metrics.md §Exposure.
 * Counters, gauges, and info values are emitted; histograms are a future
 * concern (require bucketing infrastructure that is not yet wired).
 *
 * Per metrics.md: no per-session labels on counters (bounded cardinality).
 */
export async function handleMetrics(
  _req: Request,
  deps: MetricsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname !== "/v1/metrics") return undefined;
  // This handler is GET-only; all other methods fall through to 404.
  const text = buildPrometheusOutput(deps);
  return new Response(text, {
    status: 200,
    headers: { "content-type": CONTENT_TYPE },
  });
}

function buildPrometheusOutput(deps: MetricsDeps): string {
  const lines: string[] = [];

  emitInfo(lines, "aloop", "aloop daemon metrics exporter", {
    version: "0.1.0",
  });

  emitSchedulerLimits(lines, deps.scheduler);
  emitConcurrency(lines, deps.scheduler);
  emitProviderHealth(lines, deps.providerHealth);
  emitSystemMetrics(lines, deps.systemSample);

  return lines.join("\n") + "\n";
}

function emitInfo(
  lines: string[],
  name: string,
  help: string,
  labels: Record<string, string>,
): void {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} info`);
  const labelStr =
    labels && Object.keys(labels).length > 0
      ? `{${Object.entries(labels)
          .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
          .join(",")}}`
      : "";
  lines.push(`${name}${labelStr} 1`);
}

function emitSchedulerLimits(lines: string[], scheduler: SchedulerService): void {
  const limits = scheduler.currentLimits();
  const prefix = "aloop_scheduler_limits";

  lines.push(`# HELP ${prefix} Currently configured scheduler limits`);
  lines.push(`# TYPE ${prefix} gauge`);

  lines.push(
    `${prefix}{name="concurrency_cap"} ${limits.concurrencyCap}`,
  );
  lines.push(
    `${prefix}{name="permit_ttl_default_seconds"} ${limits.permitTtlDefaultSeconds}`,
  );
  lines.push(
    `${prefix}{name="permit_ttl_max_seconds"} ${limits.permitTtlMaxSeconds}`,
  );
  lines.push(
    `${prefix}{name="cpu_max_pct"} ${limits.systemLimits.cpuMaxPct}`,
  );
  lines.push(
    `${prefix}{name="mem_max_pct"} ${limits.systemLimits.memMaxPct}`,
  );
  lines.push(
    `${prefix}{name="load_max"} ${limits.systemLimits.loadMax}`,
  );
  lines.push(
    `${prefix}{name="burn_rate_max_tokens_since_commit"} ${limits.burnRate.maxTokensSinceCommit}`,
  );
  lines.push(
    `${prefix}{name="burn_rate_min_commits_per_hour"} ${limits.burnRate.minCommitsPerHour}`,
  );
}

function emitConcurrency(lines: string[], scheduler: SchedulerService): void {
  const inFlight = scheduler.listPermits();
  const count = inFlight.length;

  lines.push(
    `# HELP aloop_scheduler_permits_in_flight Number of currently granted scheduler permits`,
  );
  lines.push(
    `# TYPE aloop_scheduler_permits_in_flight gauge`,
  );
  lines.push(`aloop_scheduler_permits_in_flight ${count}`);

  for (const permit of inFlight) {
    lines.push(
      `aloop_scheduler_permit{session_id="${escapeLabel(permit.sessionId)}",provider_id="${escapeLabel(permit.providerId)}"} 1`,
    );
  }
}

function emitProviderHealth(
  lines: string[],
  health: InMemoryProviderHealthStore,
): void {
  const states = health.list();

  lines.push(
    `# HELP aloop_provider_up Whether the provider is reachable (1) or not (0)`,
  );
  lines.push(`# TYPE aloop_provider_up gauge`);

  for (const s of states) {
    const up = s.status === "healthy" ? 1 : 0;
    lines.push(
      `aloop_provider_up{provider_id="${escapeLabel(s.providerId)}",status="${escapeLabel(s.status)}"} ${up}`,
    );
  }

  lines.push(
    `# HELP aloop_provider_consecutive_failures Number of consecutive failures for a provider`,
  );
  lines.push(`# TYPE aloop_provider_consecutive_failures gauge`);

  for (const s of states) {
    lines.push(
      `aloop_provider_consecutive_failures{provider_id="${escapeLabel(s.providerId)}"} ${s.consecutiveFailures}`,
    );
  }

  lines.push(
    `# HELP aloop_provider_cooldown_until_seconds Unix timestamp when provider cooldown expires (0 if not in cooldown)`,
  );
  lines.push(`# TYPE aloop_provider_cooldown_until_seconds gauge`);

  for (const s of states) {
    const cooldownUntil = s.cooldownUntil
      ? Math.floor(new Date(s.cooldownUntil).getTime() / 1000)
      : 0;
    lines.push(
      `aloop_provider_cooldown_until_seconds{provider_id="${escapeLabel(s.providerId)}"} ${cooldownUntil}`,
    );
  }

  lines.push(
    `# HELP aloop_provider_quota_remaining Remaining quota units (null if unknown)`,
  );
  lines.push(`# TYPE aloop_provider_quota_remaining gauge`);

  for (const s of states) {
    const remaining = s.quotaRemaining ?? -1;
    lines.push(
      `aloop_provider_quota_remaining{provider_id="${escapeLabel(s.providerId)}"} ${remaining}`,
    );
  }
}

function emitSystemMetrics(
  lines: string[],
  systemSample: SchedulerProbes["systemSample"] | undefined,
): void {
  let sample: SystemSample | undefined;
  if (systemSample) {
    try {
      sample = systemSample();
    } catch {
      // Probe failed — emit NaN so the metric is present but invalid
    }
  }

  lines.push(
    `# HELP aloop_system_cpu_pct Current CPU usage percentage (0–100)`,
  );
  lines.push(`# TYPE aloop_system_cpu_pct gauge`);
  lines.push(
    `aloop_system_cpu_pct ${sample?.cpuPct ?? "NaN"}`,
  );

  lines.push(
    `# HELP aloop_system_mem_pct Current memory usage percentage (0–100)`,
  );
  lines.push(`# TYPE aloop_system_mem_pct gauge`);
  lines.push(
    `aloop_system_mem_pct ${sample?.memPct ?? "NaN"}`,
  );

  lines.push(
    `# HELP aloop_system_load_avg System load average (1-minute)`,
  );
  lines.push(`# TYPE aloop_system_load_avg gauge`);
  lines.push(
    `aloop_system_load_avg ${sample?.loadAvg ?? "NaN"}`,
  );
}

/** Escape double-quotes and backslashes in Prometheus label values. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
