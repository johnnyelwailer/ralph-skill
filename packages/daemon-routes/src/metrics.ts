import type { Database } from "bun:sqlite";
import type { InMemoryProviderHealthStore } from "@aloop/provider";
import type { SchedulerProbes, SystemSample } from "@aloop/scheduler-gates";
import type { SchedulerService } from "@aloop/scheduler";

export type MetricsDeps = {
  readonly scheduler: SchedulerService;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly systemSample: SchedulerProbes["systemSample"];
};

export type MetricsAggregatesDeps = {
  readonly db: Database;
};

export type MetricsAggregatesResponse = {
  readonly window: {
    readonly start: string;
    readonly end: string;
  };
  readonly group_by: readonly string[];
  readonly items: readonly MetricsAggregatesItem[];
};

export type MetricsAggregatesItem = {
  readonly labels: Record<string, string>;
  readonly sample_size: number;
  readonly directional: boolean;
  readonly metrics: Record<string, number>;
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

// ─── Metrics aggregates ───────────────────────────────────────────────────────

/** Allowed group-by dimension fields, per metrics.md §Metric dimensions. */
const ALLOWED_GROUP_BY = new Set([
  "scope",
  "provider_route",
  "model_id",
  "deployment_route",
  "workflow",
  "workflow_phase",
  "task_family",
  "story_complexity",
  "spec_quality_tier",
  "outcome",
]);

/** Allowed metric names for the aggregates endpoint. */
const ALLOWED_METRICS = new Set([
  "model_approval_rate",
  "model_merge_rate",
  "model_cost_per_merged_pr",
  "model_changes_requested_rate",
  "model_review_gate_pass_rate",
  "model_cost_per_approved_change",
  "model_turn_success_rate",
  "change_set_approval_rate",
  "change_set_merge_rate",
  "keeper_rate",
  "burn_rate_tokens_per_merged_pr",
  "permit_denial_rate",
]);

/**
 * Handle GET /v1/metrics/aggregates.
 *
 * Returns materialized aggregates from the `metric_aggregates` table.
 * Query params:
 *   scope        — scope filter (e.g. "project:p_123", "workspace:w_abc", "global")
 *   window       — time window label: "24h", "7d", "30d", "all"  (default "30d")
 *   group_by     — comma-separated dimension names (subset of ALLOWED_GROUP_BY)
 *   metrics      — comma-separated metric names to return (subset of ALLOWED_METRICS)
 *
 * Returns 400 bad_request for unknown group_by fields or unknown metric names.
 *
 * The `metric_aggregates` table is populated by a background projector; this
 * handler only reads from it.  When no rows exist it returns an empty items
 * array — the table is rebuildable from events per metrics.md §Invariants.
 */
export async function handleMetricsAggregates(
  _req: Request,
  deps: MetricsAggregatesDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname !== "/v1/metrics/aggregates") return undefined;

  const url = new URL(_req.url);
  const scope = url.searchParams.get("scope") ?? "global";
  const windowLabel = url.searchParams.get("window") ?? "30d";
  const groupByParam = url.searchParams.get("group_by") ?? "";
  const metricsParam = url.searchParams.get("metrics") ?? "";

  // Validate window label
  if (!["24h", "7d", "30d", "all"].includes(windowLabel)) {
    return jsonError("bad_request", `window must be one of: 24h, 7d, 30d, all`, 400);
  }

  // Parse and validate group_by
  const groupBy = groupByParam
    ? groupByParam.split(",").map((s) => s.trim())
    : [];
  for (const dim of groupBy) {
    if (!ALLOWED_GROUP_BY.has(dim)) {
      return jsonError(
        "bad_request",
        `Unknown or high-cardinality group_by field: "${dim}". Allowed: ${[...ALLOWED_GROUP_BY].join(", ")}`,
        400,
      );
    }
  }

  // Parse and validate metrics
  const requestedMetrics = metricsParam
    ? metricsParam.split(",").map((s) => s.trim())
    : [];
  for (const m of requestedMetrics) {
    if (!ALLOWED_METRICS.has(m)) {
      return jsonError(
        "bad_request",
        `Unknown metric: "${m}". Allowed: ${[...ALLOWED_METRICS].join(", ")}`,
        400,
      );
    }
  }

  // Compute window bounds
  const now = new Date();
  const windowEndIso = now.toISOString();
  const windowStart = subtractWindow(now, windowLabel);
  const windowStartIso = windowStart.toISOString();

  // Query the metric_aggregates table
  const rows = deps.db
    .query<
      { labels: string; sample_size: number; directional: number; metrics: string },
      [string, string, string, string],
    >(
      `SELECT labels, sample_size, directional, metrics
       FROM metric_aggregates
       WHERE scope = ?
         AND window_label = ?
         AND window_start = ?
         AND window_end = ?
       ORDER BY sample_size DESC`,
      [scope, windowLabel, windowStartIso, windowEndIso],
    )
    .all();

  const items = rows.map((row) => {
    let labels: Record<string, string> = {};
    try {
      labels = JSON.parse(row.labels) as Record<string, string>;
    } catch {
      labels = {};
    }

    let rawMetrics: Record<string, number> = {};
    try {
      rawMetrics = JSON.parse(row.metrics) as Record<string, number>;
    } catch {
      rawMetrics = {};
    }

    // Filter to only requested metrics if specified
    const filteredMetrics =
      requestedMetrics.length > 0
        ? Object.fromEntries(
            Object.entries(rawMetrics).filter(([k]) => requestedMetrics.includes(k)),
          )
        : rawMetrics;

    return {
      labels,
      sample_size: row.sample_size,
      directional: row.directional === 1,
      metrics: filteredMetrics,
    };
  });

  const body: MetricsAggregatesResponse = {
    window: {
      start: windowStartIso,
      end: windowEndIso,
    },
    group_by: groupBy,
    items,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function subtractWindow(now: Date, label: string): Date {
  const copy = new Date(now);
  switch (label) {
    case "24h":
      copy.setHours(copy.getHours() - 24);
      break;
    case "7d":
      copy.setDate(copy.getDate() - 7);
      break;
    case "30d":
      copy.setDate(copy.getDate() - 30);
      break;
    case "all":
      copy.setFullYear(2000, 0, 1); // far-past sentinel for "all time"
      break;
  }
  return copy;
}

function jsonError(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: { _v: 1, code, message },
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}
