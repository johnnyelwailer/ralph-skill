import type { Database } from "bun:sqlite";
import type { EventEnvelope } from "@aloop/core";
import type { Projector } from "./projector.ts";

type PermitGrantEvent = {
  permit_id: string;
  session_id: string;
  provider_id: string;
  ttl_seconds: number;
  granted_at: string;
  expires_at: string;
  /** Estimated USD cents for this permit's turn. */
  estimated_cost_usd_cents?: number;
};

type PermitRemovalEvent = {
  permit_id: string;
};

export class ProjectDailyCostProjector implements Projector {
  readonly name = "project_daily_cost";

  apply(db: Database, event: EventEnvelope): void {
    if (event.topic === "scheduler.permit.grant") {
      const data = event.data as PermitGrantEvent;
      const projectId = (event.metadata as Record<string, unknown> | undefined)?.project_id as string | null | undefined;
      if (!projectId) return;
      const costCents = data.estimated_cost_usd_cents ?? 0;
      if (costCents <= 0) return;

      const date = data.granted_at.slice(0, 10); // YYYY-MM-DD
      db.run(
        `INSERT INTO project_daily_cost (project_id, date, tokens, cost_usd_cents)
         VALUES (?, ?, 0, ?)
         ON CONFLICT(project_id, date) DO UPDATE SET
           cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents`,
        [projectId, date, costCents],
      );
      return;
    }

    if (
      event.topic === "scheduler.permit.release" ||
      event.topic === "scheduler.permit.expired"
    ) {
      // We don't have cost data at removal time without re-reading the permit,
      // so we trust the grant event was the authoritative record.
      // (Permit cost is small relative to token precision; any future correction
      // can come from an explicit cost reconciliation event.)
    }
  }
}

export type ProjectDailyCostSnapshot = {
  readonly projectId: string;
  readonly date: string;
  readonly tokens: number;
  readonly costUsdCents: number;
};

export function loadProjectDailyCost(
  db: Database,
  projectId: string,
  date: string,
): ProjectDailyCostSnapshot | null {
  const row = db.query<
    { project_id: string; date: string; tokens: number; cost_usd_cents: number },
    [string, string]
  >(
    `SELECT project_id, date, tokens, cost_usd_cents
     FROM project_daily_cost
     WHERE project_id = ? AND date = ?`,
  ).get(projectId, date);
  if (!row) return null;
  return {
    projectId: row.project_id,
    date: row.date,
    tokens: row.tokens,
    costUsdCents: row.cost_usd_cents,
  };
}
