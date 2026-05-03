-- 013-metric-aggregates: materialized aggregate metrics for the dashboard
-- and model optimizer.
--
-- Stores pre-computed metric aggregates per scope/window/group_by key.
-- Written by the metric-aggregates projector on a periodic schedule (not
-- on every event — ratios and histograms are expensive to compute live).
--
-- Design notes:
--   - window_start / window_end are ISO timestamps.  All aggregates are
--     keyed by a canonical window so queries can request "30d" and match
--     stored windows without computing UTC ranges in SQL.
--   - labels is a JSON object encoding the group-by dimensions (e.g.
--     { "model_id": "codex/gpt-5.5-high", "task_family": "frontend_builder" })
--   - metrics is a JSON object with the computed values.
--   - Rebuildable from events + session_metrics projection.

CREATE TABLE IF NOT EXISTS metric_aggregates (
  id              TEXT PRIMARY KEY,
  scope           TEXT NOT NULL,
  window_start    TEXT NOT NULL,
  window_end      TEXT NOT NULL,
  window_label    TEXT NOT NULL,          -- "24h", "7d", "30d", "all"
  group_by        TEXT NOT NULL,          -- JSON array of dimension names
  labels          TEXT NOT NULL,          -- JSON object of dimension values
  sample_size     INTEGER NOT NULL DEFAULT 0,
  directional     INTEGER NOT NULL DEFAULT 1,  -- SQLite has no BOOLEAN; 1=true, 0=false
  metrics         TEXT NOT NULL,          -- JSON object of metric values
  updated_at      TEXT NOT NULL,
  UNIQUE(scope, window_label, group_by, labels)
);

CREATE INDEX IF NOT EXISTS idx_metric_aggregates_scope_window
  ON metric_aggregates(scope, window_label);
CREATE INDEX IF NOT EXISTS idx_metric_aggregates_updated
  ON metric_aggregates(updated_at);
