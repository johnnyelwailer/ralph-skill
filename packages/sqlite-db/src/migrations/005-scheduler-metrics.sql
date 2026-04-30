-- 005-scheduler-metrics: denial counters and time-window rate computation.
--
-- Metrics this table tracks:
--   permit_denial_total{gate}  — monotonically increasing denial counter per gate
--   permit_decision_total       — monotonically increasing total decisions (for rate denom)
--
-- Rate computation (in-memory, at read time):
--   permit_denial_rate = permit_denial_total{interval} / interval_duration_seconds
--
-- The table stores the current totals; the metrics handler computes the rate by
-- looking at how many denials occurred in the last 60 minutes.
--
-- Design notes:
--   - All values are monotonically increasing counters.  Never reset on read.
--   - A separate sliding-window structure (in-memory) tracks timestamps of recent
--     denials to compute per-minute rates without rolling up on every event.
--   - This table is a projection of daemon events, rebuildable from JSONL.
--     See metrics.md §Storage.

CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name TEXT NOT NULL,
  gate        TEXT NOT NULL DEFAULT '',
  value       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (metric_name, gate)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_metrics_name ON scheduler_metrics(metric_name);
