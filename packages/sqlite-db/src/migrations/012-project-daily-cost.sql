-- 012-project-daily-cost: per-project daily token/cost tracking table.
--
-- Enables the scheduler's project-gate (docs/spec/daemon.md §Scheduler authority item 6)
-- to enforce per-project daily cost caps.
--
-- Written by the project-daily-cost projector on scheduler.permit.grant events.
-- Updated (upserted) on permit expiry/release to subtract the associated cost.

CREATE TABLE IF NOT EXISTS project_daily_cost (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  tokens       INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, date)
);

-- Index for efficient date-range queries (e.g., rolling 24h window lookups)
CREATE INDEX IF NOT EXISTS idx_project_daily_cost_date
  ON project_daily_cost(date);
