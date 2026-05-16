import type { Database } from "bun:sqlite";
import type {
  ContextBlock,
  ContextInput,
  ContextPlugin,
  SourceRef,
} from "@aloop/core";

export type OperationalMetricsOptions = {
  readonly db: Database;
};

function makeBlock(
  id: string,
  title: string,
  body: string,
  sources: readonly SourceRef[],
  confidence?: number,
): ContextBlock {
  return { id, title, body, sources, ...(confidence !== undefined && { confidence }), createdAt: new Date().toISOString() };
}

function sqlRows<T>(db: Database, sql: string, params: (string | number | null)[]): T[] {
  return db.query<T, (string | number | null)[]>(sql).all(...params);
}

function buildSchedulerMetricsContext(db: Database): ContextBlock | null {
  const rows = sqlRows<
    { metric_name: string; gate: string; value: number; updated_at: string }
  >(
    db,
    `SELECT metric_name, gate, value, updated_at FROM scheduler_metrics
     WHERE metric_name IN ('concurrency_in_flight', 'permit_denial_rate', 'concurrency_cap')
     ORDER BY metric_name`,
    [],
  );
  if (rows.length === 0) return null;
  const lines = rows.map(
    (r) => `${r.metric_name}${r.gate ? `[${r.gate}]` : ""}: ${r.value} (${r.updated_at})`,
  );
  return makeBlock(
    "scheduler-metrics",
    "Scheduler Metrics",
    lines.join("\n"),
    [{ label: "scheduler_metrics", uri: "" }],
    0.95,
  );
}

function buildProviderHealthContext(db: Database): ContextBlock | null {
  const rows = sqlRows<
    { provider_id: string; metric_name: string; value: number }
  >(
    db,
    `SELECT provider_id, metric_name, value FROM provider_metrics
     WHERE metric_name IN ('provider_consecutive_failures', 'provider_cooldown_remaining_seconds', 'provider_quota_utilization')
     ORDER BY provider_id, metric_name`,
    [],
  );
  if (rows.length === 0) return null;
  const byProvider: Record<string, string[]> = {};
  for (const r of rows) {
    if (!byProvider[r.provider_id]) byProvider[r.provider_id] = [];
    byProvider[r.provider_id]!.push(`${r.metric_name}: ${r.value}`);
  }
  const lines = Object.entries(byProvider).map(
    ([p, metrics]) => `${p}: ${metrics.join(", ")}`,
  );
  return makeBlock(
    "provider-health",
    "Provider Health",
    lines.join("\n"),
    [{ label: "provider_metrics", uri: "" }],
    0.9,
  );
}

function buildSessionBurnRateContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { session_id: string; metric_name: string; value: number }
  >(
    db,
    `SELECT sm.session_id, sm.metric_name, sm.value
     FROM session_metrics sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.project_id = ? AND sm.metric_name = 'burn_rate.tokens_since_last_commit'
     ORDER BY sm.updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const lines = rows.map(
    (r) => `session ${r.session_id.slice(0, 8)}: ${r.value} tokens since last commit`,
  );
  return makeBlock(
    "burn-rate",
    "Token Burn Rate History",
    lines.join("\n"),
    [{ label: "session_metrics", uri: "" }],
    0.85,
  );
}

function buildConcurrencyContext(db: Database): ContextBlock | null {
  const rows = sqlRows<
    { value: number }
  >(
    db,
    `SELECT value FROM scheduler_metrics WHERE metric_name = 'concurrency_in_flight' LIMIT 1`,
    [],
  );
  if (rows.length === 0) return null;
  const running = rows[0]?.value ?? 0;
  const capRows = sqlRows<{ value: number }>(
    db,
    `SELECT value FROM scheduler_metrics WHERE metric_name = 'concurrency_cap' LIMIT 1`,
    [],
  );
  const cap = capRows[0]?.value ?? 3;
  const body = `running: ${running} / cap: ${cap}`;
  return makeBlock(
    "concurrency",
    "Concurrency",
    body,
    [{ label: "scheduler_metrics", uri: "" }],
    1.0,
  );
}

function buildStuckSessionSignalsContext(db: Database, projectId: string): ContextBlock | null {
  const rows = sqlRows<
    { session_id: string; value: number }
  >(
    db,
    `SELECT sm.session_id, sm.value
     FROM session_metrics sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.project_id = ? AND sm.metric_name = 'iteration_stuck_count' AND sm.value > 2
     ORDER BY sm.updated_at DESC LIMIT 5`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `session ${r.session_id.slice(0, 8)}: stuck=${r.value}`).join("\n");
  return makeBlock(
    "stuck-signals",
    "Stuck Session Signals",
    body,
    [{ label: "session_metrics", uri: "" }],
    0.8,
  );
}

function buildProviderFailuresContext(db: Database): ContextBlock | null {
  const rows = sqlRows<
    { provider_id: string; value: number }
  >(
    db,
    `SELECT provider_id, value FROM provider_metrics
     WHERE metric_name = 'provider_consecutive_failures' AND value > 0
     ORDER BY value DESC LIMIT 5`,
    [],
  );
  if (rows.length === 0) return null;
  const body = rows.map((r) => `${r.provider_id}: ${r.value} consecutive failures`).join("\n");
  return makeBlock(
    "provider-failures",
    "Recent Provider Failures",
    body,
    [{ label: "provider_metrics", uri: "" }],
    0.85,
  );
}

export function createOperationalMetricsProvider(
  opts: OperationalMetricsOptions,
): ContextPlugin {
  return {
    id: "operational_metrics",
    async build(input: ContextInput): Promise<ContextBlock[]> {
      const blocks: ContextBlock[] = [];
      const { projectId, budgetTokens } = input;
      const targetSize = Math.min(budgetTokens, 4000);

      const schedulerBlock = buildSchedulerMetricsContext(opts.db);
      if (schedulerBlock) blocks.push(schedulerBlock);

      const concurrencyBlock = buildConcurrencyContext(opts.db);
      if (concurrencyBlock) blocks.push(concurrencyBlock);

      const providerBlock = buildProviderHealthContext(opts.db);
      if (providerBlock) blocks.push(providerBlock);

      const failuresBlock = buildProviderFailuresContext(opts.db);
      if (failuresBlock) blocks.push(failuresBlock);

      const burnBlock = buildSessionBurnRateContext(opts.db, projectId);
      if (burnBlock) blocks.push(burnBlock);

      const stuckBlock = buildStuckSessionSignalsContext(opts.db, projectId);
      if (stuckBlock) blocks.push(stuckBlock);

      return blocks;
    },
  };
}