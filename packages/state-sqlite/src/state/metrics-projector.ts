import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";

// ── Metric names ────────────────────────────────────────────────────────────────

// Session-scoped metrics
export const SESSION_METRIC_BURN_RATE_TOKENS_PER_MERGED_PR = "burn_rate.tokens_per_merged_pr";
export const SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT = "burn_rate.tokens_since_last_commit";
export const SESSION_METRIC_TURN_SUCCESS_RATE = "turn_success_rate";
export const SESSION_METRIC_ITERATION_STUCK_COUNT = "iteration_stuck_count";
export const SESSION_METRIC_PHASE_RETRY_EXHAUSTION_RATE = "phase_retry_exhaustion_rate";
export const SESSION_METRIC_CYCLE_ADVANCE_RATE = "cycle_advance_rate";
export const SESSION_METRIC_QUEUE_DEPTH = "queue_depth";
export const SESSION_METRIC_SESSIONS_RUNNING = "sessions_running_count";

// Scheduler daemon-level metrics
export const SCHEDULER_METRIC_PERMIT_DENIAL_RATE = "permit_denial_rate";
export const SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT = "concurrency_in_flight";

// Provider metrics
export const PROVIDER_METRIC_QUOTA_UTILIZATION = "provider_quota_utilization";
export const PROVIDER_METRIC_COOLDOWN_REMAINING = "provider_cooldown_remaining_seconds";
export const PROVIDER_METRIC_CONSECUTIVE_FAILURES = "provider_consecutive_failures";

// System metrics
export const SYSTEM_METRIC_CPU = "system_cpu_pct";
export const SYSTEM_METRIC_MEM = "system_mem_pct";
export const SYSTEM_METRIC_LOAD = "system_load";

// ── Type guards ─────────────────────────────────────────────────────────────────

function isSessionCreatedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
  kind: string;
}> {
  return env.topic === "session.created";
}

function isSessionEndedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "session.ended";
}

function isTurnCompletedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "turn.completed";
}

function isTurnFailedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "turn.failed";
}

function isPermitGrantedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
  provider_id: string;
}> {
  return env.topic === "scheduler.permit.grant";
}

function isPermitDeniedEvent(env: EventEnvelope): env is EventEnvelope<{
  gate: string;
  reason: string;
}> {
  return env.topic === "scheduler.permit.deny";
}

function isPermitReleasedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "scheduler.permit.release";
}

function isPermitExpiredEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "scheduler.permit.expired";
}

function isUsageEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
}> {
  return env.topic === "usage";
}

function isChangeSetMergedEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id?: string;
}> {
  return env.topic === "change_set.merged";
}

function isCommitEvent(env: EventEnvelope): env is EventEnvelope<{
  session_id: string;
}> {
  return env.topic === "commit";
}

function isProviderHealthEvent(env: EventEnvelope): env is EventEnvelope<{
  provider_id: string;
  status: string;
  cooldown_seconds?: number;
}> {
  return env.topic === "provider.health";
}

function isProviderQuotaEvent(env: EventEnvelope): env is EventEnvelope<{
  provider_id: string;
  used?: number;
  limit?: number;
}> {
  return env.topic === "provider.quota";
}

function isErrorEvent(env: EventEnvelope): env is EventEnvelope<{
  provider_id?: string;
  session_id?: string;
}> {
  return env.topic === "error";
}

// ── Upsert helpers ─────────────────────────────────────────────────────────────

function upsertSessionMetric(
  db: Database,
  sessionId: string,
  metric: string,
  value: number,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, metric_name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [sessionId, metric, value, timestamp],
  );
}

function upsertSchedulerMetric(
  db: Database,
  metric: string,
  value: number,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO scheduler_metrics (metric_name, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(metric_name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [metric, value, timestamp],
  );
}

function upsertProviderMetric(
  db: Database,
  providerId: string,
  metric: string,
  value: number,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(provider_id, metric_name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [providerId, metric, value, timestamp],
  );
}

function upsertSystemMetric(
  db: Database,
  metric: string,
  value: number,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO system_metrics (metric_name, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(metric_name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [metric, value, timestamp],
  );
}

function appendMetricHistory(
  db: Database,
  metric: string,
  labels: Record<string, string>,
  value: number,
  timestamp: string,
): void {
  db.run(
    `INSERT INTO metric_history (metric_name, labels, value, timestamp) VALUES (?, ?, ?, ?)`,
    [metric, JSON.stringify(labels), value, timestamp],
  );
}

// ── Counter helpers ─────────────────────────────────────────────────────────────

function incrementCounter(db: Database, metric: string, timestamp: string): void {
  const existing = db
    .query<{ value: number }, [string]>(`SELECT value FROM scheduler_metrics WHERE metric_name = ?`)
    .get(metric);
  const next = (existing?.value ?? 0) + 1;
  upsertSchedulerMetric(db, metric, next, timestamp);
}

function incrementProviderCounter(
  db: Database,
  providerId: string,
  metric: string,
  timestamp: string,
): void {
  const existing = db
    .query<{ value: number }, [string, string]>(
      `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
    )
    .get(providerId, metric);
  const next = (existing?.value ?? 0) + 1;
  upsertProviderMetric(db, providerId, metric, next, timestamp);
}

// ── MetricsProjector ────────────────────────────────────────────────────────────

export class MetricsProjector implements Projector {
  readonly name = "metrics";

  apply(db: Database, env: EventEnvelope): void {
    const ts = env.timestamp ?? new Date().toISOString();

    if (isSessionCreatedEvent(env)) {
      const data = env.data;
      if (data.kind === "child") {
        const existing = db
          .query<{ value: number }, [string]>(
            `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
          )
          .get(SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT);
        upsertSchedulerMetric(
          db,
          SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT,
          (existing?.value ?? 0) + 1,
          ts,
        );
      }
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_ITERATION_STUCK_COUNT, 0, ts);
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_TURN_SUCCESS_RATE, 0, ts);
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_BURN_RATE_TOKENS_PER_MERGED_PR, 0, ts);
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT, 0, ts);
      return;
    }

    if (isSessionEndedEvent(env)) {
      const existing = db
        .query<{ value: number }, [string]>(
          `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
        )
        .get(SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT);
      upsertSchedulerMetric(db, SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT, Math.max(0, (existing?.value ?? 1) - 1), ts);
      return;
    }

    if (isTurnCompletedEvent(env)) {
      const data = env.data;
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_ITERATION_STUCK_COUNT, 0, ts);
      const existing = db
        .query<{ value: number }, [string, string]>(
          `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
        )
        .get(data.session_id, SESSION_METRIC_TURN_SUCCESS_RATE);
      upsertSessionMetric(db, data.session_id, SESSION_METRIC_TURN_SUCCESS_RATE, (existing?.value ?? 0) + 1, ts);
      return;
    }

    if (isTurnFailedEvent(env)) {
      const data = env.data;
      const stuck = db
        .query<{ value: number }, [string, string]>(
          `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
        )
        .get(data.session_id, SESSION_METRIC_ITERATION_STUCK_COUNT);
      upsertSessionMetric(
        db,
        data.session_id,
        SESSION_METRIC_ITERATION_STUCK_COUNT,
        (stuck?.value ?? 0) + 1,
        ts,
      );
      return;
    }

    if (isPermitGrantedEvent(env)) {
      const data = env.data;
      incrementCounter(db, `${SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT}_permits_granted`, ts);
      const existing = db
        .query<{ value: number }, [string]>(
          `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
        )
        .get(SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT);
      upsertSchedulerMetric(
        db,
        SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT,
        (existing?.value ?? 0) + 1,
        ts,
      );
      return;
    }

    if (isPermitReleasedEvent(env) || isPermitExpiredEvent(env)) {
      const existing = db
        .query<{ value: number }, [string]>(
          `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
        )
        .get(SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT);
      upsertSchedulerMetric(
        db,
        SCHEDULER_METRIC_CONCURRENCY_IN_FLIGHT,
        Math.max(0, (existing?.value ?? 1) - 1),
        ts,
      );
      return;
    }

    if (isPermitDeniedEvent(env)) {
      const data = env.data;
      incrementCounter(db, "permits_denied_total", ts);
      appendMetricHistory(db, "permit_denial_rate", { gate: data.gate ?? "unknown" }, 1, ts);
      return;
    }

    if (isUsageEvent(env)) {
      const data = env.data;
      if (data.session_id) {
        if (data.tokens_in !== undefined || data.tokens_out !== undefined) {
          const ti = data.tokens_in ?? 0;
          const to = data.tokens_out ?? 0;
          const existing = db
            .query<{ value: number }, [string, string]>(
              `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
            )
            .get(data.session_id, SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT);
          upsertSessionMetric(
            db,
            data.session_id,
            SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT,
            (existing?.value ?? 0) + ti + to,
            ts,
          );
        }
        if (data.cost_usd !== undefined) {
          appendMetricHistory(db, "cost_per_story", {}, data.cost_usd, ts);
        }
      }
      return;
    }

    if (isChangeSetMergedEvent(env)) {
      const data = env.data;
      if (data.session_id) {
        upsertSessionMetric(
          db,
          data.session_id,
          SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT,
          0,
          ts,
        );
      }
      incrementCounter(db, "change_sets_merged_total", ts);
      appendMetricHistory(db, "change_set_merge_rate", {}, 1, ts);
      return;
    }

    if (isCommitEvent(env)) {
      const data = env.data;
      upsertSessionMetric(
        db,
        data.session_id,
        SESSION_METRIC_BURN_RATE_TOKENS_SINCE_LAST_COMMIT,
        0,
        ts,
      );
      return;
    }

    if (isProviderHealthEvent(env)) {
      const data = env.data;
      upsertProviderMetric(
        db,
        data.provider_id,
        PROVIDER_METRIC_COOLDOWN_REMAINING,
        data.cooldown_seconds ?? 0,
        ts,
      );
      if (data.status === "healthy" || data.status === "up") {
        upsertProviderMetric(db, data.provider_id, PROVIDER_METRIC_CONSECUTIVE_FAILURES, 0, ts);
      }
      return;
    }

    if (isProviderQuotaEvent(env)) {
      const data = env.data;
      if (data.limit && data.limit > 0) {
        upsertProviderMetric(
          db,
          data.provider_id,
          PROVIDER_METRIC_QUOTA_UTILIZATION,
          (data.used ?? 0) / data.limit,
          ts,
        );
      }
      return;
    }

    if (isErrorEvent(env)) {
      const data = env.data;
      if (data.provider_id) {
        incrementProviderCounter(db, data.provider_id, "provider_failure_classification_total", ts);
        const existing = db
          .query<{ value: number }, [string, string]>(
            `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
          )
          .get(data.provider_id, PROVIDER_METRIC_CONSECUTIVE_FAILURES);
        upsertProviderMetric(
          db,
          data.provider_id,
          PROVIDER_METRIC_CONSECUTIVE_FAILURES,
          (existing?.value ?? 0) + 1,
          ts,
        );
      }
      return;
    }
  }
}
