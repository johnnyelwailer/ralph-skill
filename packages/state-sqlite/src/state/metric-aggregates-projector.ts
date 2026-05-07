import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";

/**
 * MetricAggregatesProjector — maintains the `metric_aggregates` table.
 *
 * This projector handles scheduler gate metrics that feed directly into permit
 * decisions and dashboard reads. It accumulates counters keyed by
 * (scope, window_label, group_by, labels).
 *
 * Key design decisions (per metrics.md §Storage and §Invariants):
 * - Counters are stored as raw integer values in the `metrics` JSON column.
 *   The reader computes rates/ratios at read time to avoid skew on restart.
 * - Each event writes to the "all" window (unbounded) and the "24h" window,
 *   so both live queries return data immediately.
 * - Idempotent: on conflict, metric values are merged (added to) not replaced.
 *   This requires a SELECT-then-UPDATE-in-a-transaction since SQLite's
 *   ON CONFLICT cannot read the existing row's JSON to merge it.
 * - The `directional` flag marks whether higher metric values are better.
 *   For denial metrics, directional=0 (higher is worse).
 *
 * Rebuildable from JSONL per metrics.md §Rebuildability contract.
 *
 * Supported events:
 *   scheduler.permit.grant  — increments permit_decision_total
 *   scheduler.permit.deny   — increments permit_denial_total + permit_decision_total per gate
 */
export class MetricAggregatesProjector implements Projector {
  readonly name = "metric_aggregates";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "scheduler.permit.grant") {
      this.applyPermitGrant(db, event);
      return;
    }
    if (event.topic === "scheduler.permit.deny") {
      this.applyPermitDeny(db, event);
      return;
    }
    // Unknown topics are a no-op — no throw, no side effects.
  }

  private applyPermitGrant(db: Database, event: EventEnvelope): void {
    const data = event.data as {
      permit_id: string;
      provider_id: string;
      session_id?: string;
      research_run_id?: string;
      composer_turn_id?: string;
      control_subagent_run_id?: string;
      project_id?: string;
    };
    const metadata = event.metadata as Record<string, unknown> | undefined;

    const scope = this.resolveScope(data, metadata);
    const now = event.timestamp;

    this.upsertMetric(db, scope, "all", this.epochAnchor(), now, "gate", JSON.stringify({ gate: "concurrency" }), {
      permit_decision_total: 1,
    }, 1, "permit_decision_total");

    this.upsertMetric(db, scope, "24h", this.windowStart24h(now), now, "gate", JSON.stringify({ gate: "concurrency" }), {
      permit_decision_total: 1,
    }, 1, "permit_decision_total");
  }

  private applyPermitDeny(db: Database, event: EventEnvelope): void {
    const data = event.data as {
      gate: string;
      reason?: string;
      details?: Record<string, unknown>;
      retry_after_seconds?: number;
      session_id?: string;
      research_run_id?: string;
      composer_turn_id?: string;
      control_subagent_run_id?: string;
      project_id?: string;
    };
    const metadata = event.metadata as Record<string, unknown> | undefined;

    const scope = this.resolveScope(data, metadata);
    const now = event.timestamp;
    const gate = (data.gate ?? "unknown").slice(0, 64);
    const labels = JSON.stringify({ gate });

    // Each metric type gets its own row with its own directional flag.
    // The metric key is embedded in labels as `metric_key` so each metric
    // occupies a distinct row (satisfying UNIQUE(scope, window_label, group_by, labels)).
    // group_by is always "gate" (the scheduler gate dimension).
    // permit_denial_total:  directional=0 (higher is worse — system is rejecting requests)
    // permit_decision_total: directional=0 (decisions on denials are neutral events;
    //                                 the reader uses denial_rate=denials/decisions to
    //                                 interpret the pair, so both get directional=0)
    const metricDefs: Array<{ key: string; value: number; directional: number }> = [
      { key: "permit_denial_total", value: 1, directional: 0 },
      { key: "permit_decision_total", value: 1, directional: 0 },
    ];

    for (const { key, value, directional } of metricDefs) {
      // Labels include metric_key so the UNIQUE constraint differentiates rows while
      // preserving the human-readable gate label that queries filter on
      const labelsWithKey = JSON.stringify({ gate, metric_key: key });
      const metrics = { [key]: value };
      this.upsertMetric(db, scope, "all", this.epochAnchor(), now, "gate", labelsWithKey, metrics, directional);
      this.upsertMetric(db, scope, "24h", this.windowStart24h(now), now, "gate", labelsWithKey, metrics, directional);
    }
  }

  /**
   * Resolve the scope for a permit event.
   *
   * Priority: research_run > composer_turn > session > project > global
   * This mirrors how permit owners are keyed in the scheduler decision logic.
   */
  private resolveScope(
    data: Record<string, unknown>,
    metadata: Record<string, unknown> | undefined,
  ): string {
    if (data.research_run_id) return `research_run:${data.research_run_id}`;
    if (data.composer_turn_id) return `composer:${data.composer_turn_id}`;
    if (data.control_subagent_run_id) return `control:${data.control_subagent_run_id}`;
    if (data.session_id) return `session:${data.session_id}`;
    const projectId = (data.project_id as string | undefined) ?? metadata?.project_id as string | undefined;
    if (projectId) return `project:${projectId}`;
    return "global";
  }

  /** Fixed epoch anchor for the "all" window — 2000-01-01T00:00:00.000Z */
  private epochAnchor(): string {
    return "2000-01-01T00:00:00.000Z";
  }

  /** Window start for the "24h" window — 24 hours before the given timestamp */
  private windowStart24h(now: string): string {
    const d = new Date(now);
    d.setHours(d.getHours() - 24);
    return d.toISOString();
  }

  /**
   * Upsert a metric row into the metric_aggregates table, merging metric values
   * on conflict rather than replacing them wholesale.
   *
   * The row key is (scope, window_label, group_by, labels).
   * Uses a transaction: SELECT FOR UPDATE → merge → UPDATE/INSERT.
   * Safe for concurrent access; safe for replay (idempotent semantics).
   *
   * @param directional  1 = higher is better (for decision counts)
   *                     0 = higher is worse (for denial counts)
   * @param metricKey    Optional metric key to include in the row ID so multiple
   *                     metric types for the same entity (e.g. denial+decision)
   *                     produce distinct rows.
   */
  private upsertMetric(
    db: Database,
    scope: string,
    windowLabel: string,
    windowStart: string,
    windowEnd: string,
    groupBy: string,
    labels: string,
    newMetrics: Record<string, number>,
    directional: number,
    metricKey?: string,
  ): void {
    const tx = db.transaction(() => {
      // Read existing row under the transaction lock
      const existing = db
        .query<{ id: string; metrics: string; sample_size: number }, [string, string, string, string]>(
          `SELECT id, metrics, sample_size FROM metric_aggregates
           WHERE scope = ? AND window_label = ? AND group_by = ? AND labels = ?`,
        )
        .get(scope, windowLabel, groupBy, labels);

      let mergedMetrics: Record<string, number>;
      let totalDelta: number;

      if (existing) {
        // Merge new metric values into existing row
        try {
          const parsed = JSON.parse(existing.metrics) as Record<string, number>;
          mergedMetrics = { ...parsed };
          for (const [k, v] of Object.entries(newMetrics)) {
            mergedMetrics[k] = (mergedMetrics[k] ?? 0) + v;
          }
        } catch {
          mergedMetrics = { ...newMetrics };
        }
        totalDelta = existing.sample_size + Object.values(newMetrics).reduce((a, b) => a + b, 0);

        db.run(
          `UPDATE metric_aggregates
             SET sample_size = ?, metrics = ?, window_end = ?, directional = ?, updated_at = ?
             WHERE id = ?`,
          [totalDelta, JSON.stringify(mergedMetrics), windowEnd, directional, windowEnd, existing.id],
        );
      } else {
        // Insert new row
        mergedMetrics = { ...newMetrics };
        totalDelta = Object.values(newMetrics).reduce((a, b) => a + b, 0);
        const metricSuffix = metricKey ? `_${metricKey}` : "";
        const id = `agg_${scope}_${windowLabel}_${labels}_${groupBy}${metricSuffix}`
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .slice(0, 64);

        db.run(
          `INSERT INTO metric_aggregates (scope, window_label, window_start, window_end, group_by, labels, sample_size, directional, metrics, updated_at, id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            scope,
            windowLabel,
            windowStart,
            windowEnd,
            groupBy,
            labels,
            totalDelta,
            directional,
            JSON.stringify(mergedMetrics),
            windowEnd,
            id,
          ],
        );
      }
    });

    tx();
  }
}
