import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";

/**
 * Projector for scheduler-level metrics.
 *
 * Tracks:
 *   - permit_denial_total{gate}  — per-gate denial counter
 *   - permit_decision_total      — total grant+deny decisions
 *
 * Both are monotonically increasing counters. The metrics handler computes
 * permit_denial_rate (denials per second in the last hour) at read time.
 *
 * Rebuildable from JSONL per metrics.md §Invariants.
 */
export class SchedulerMetricsProjector implements Projector {
  readonly name = "scheduler_metrics";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "scheduler.permit.deny") {
      const data = event.data as { gate?: string; reason?: string };
      const gate = (data.gate ?? "unknown").slice(0, 64);
      const now = event.timestamp;
      db.run(
        `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
         VALUES ('permit_denial_total', ?, 1, ?)
         ON CONFLICT(metric_name, gate) DO UPDATE SET
           value = value + 1,
           updated_at = excluded.updated_at`,
        [gate, now],
      );
      db.run(
        `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
         VALUES ('permit_decision_total', '', 1, ?)
         ON CONFLICT(metric_name, gate) DO UPDATE SET
           value = value + 1,
           updated_at = excluded.updated_at`,
        [now],
      );
      return;
    }

    if (event.topic === "scheduler.permit.grant") {
      const now = event.timestamp;
      db.run(
        `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
         VALUES ('permit_decision_total', '', 1, ?)
         ON CONFLICT(metric_name, gate) DO UPDATE SET
           value = value + 1,
           updated_at = excluded.updated_at`,
        [now],
      );
    }
  }
}

/** Denials per gate, keyed by gate name. */
export type SchedulerMetricsSnapshot = {
  readonly denialsByGate: ReadonlyMap<string, number>;
  readonly totalDecisions: number;
};

/** Fetch current snapshot from the database. */
export function loadSchedulerMetrics(db: Database): SchedulerMetricsSnapshot {
  const denialsByGate = new Map<string, number>();
  const rows = db
    .query<{ metric_name: string; gate: string; value: number }, []>(
      `SELECT metric_name, gate, value FROM scheduler_metrics WHERE metric_name = 'permit_denial_total'`,
    )
    .all();
  for (const row of rows) {
    denialsByGate.set(row.gate, row.value);
  }
  const totalRow = db
    .query<{ value: number }, [string]>(
      `SELECT value FROM scheduler_metrics WHERE metric_name = 'permit_decision_total' AND gate = ''`,
    )
    .get();
  return {
    denialsByGate,
    totalDecisions: totalRow?.value ?? 0,
  };
}
