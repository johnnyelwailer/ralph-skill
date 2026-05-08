-- 008-metrics: scheduler gate inputs, session health, orchestrator health,
-- cost, and provider health projection tables.
-- See docs/spec/metrics.md §Storage for the full catalog and invariants.
--
-- Key invariants (enforced at the application level, not the DB level):
--   1. Daemon-computed, not agent-reported.
--   2. Every row is derived from events — JSONL is truth; projections are rebuildable.
--   3. Scheduler gate reads are cheap (<1ms); metric values are indexed for that path.

-- session_metrics: current (latest) values for session-scoped metrics.
-- Written by the daemon projector on usage/turn events; read by scheduler gates
-- and orchestrator diagnose on every permit acquire.
CREATE TABLE IF NOT EXISTS session_metrics (
  session_id   TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_metrics_name    ON session_metrics(metric_name);

-- scheduler_metrics: daemon-level scheduler state used by permit gates.
-- Written by the daemon on scheduler.permit.grant, scheduler.permit.deny,
-- scheduler.permit.release, and scheduler.permit.expired events.
CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name  TEXT NOT NULL PRIMARY KEY,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL
);

-- provider_metrics: per-provider health and quota state used by the provider gate.
-- Written by the daemon on provider.health transitions and provider.quota events.
CREATE TABLE IF NOT EXISTS provider_metrics (
  provider_id  TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (provider_id, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider ON provider_metrics(provider_id);

-- system_metrics: daemon host resource gauges written by OS probe.
CREATE TABLE IF NOT EXISTS system_metrics (
  metric_name  TEXT NOT NULL PRIMARY KEY,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL
);

-- orchestrator_metrics: cross-session outcome metrics used by burn-rate and
-- keeper-rate gates and orchestrator self-healing.
CREATE TABLE IF NOT EXISTS orchestrator_metrics (
  metric_name  TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '{}',   -- JSON object for high-cardinality dims
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, labels)
);

-- metric_history: time-series ring buffer for project-level metrics.
-- Bounded by retention period; oldest entries are dropped when the buffer fills.
-- Consumed by dashboard histograms and trend charts.
CREATE TABLE IF NOT EXISTS metric_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name  TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '{}',   -- JSON object
  value        REAL NOT NULL,
  timestamp    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metric_history_name_time
  ON metric_history(metric_name, timestamp DESC);

-- metric_aggregates: periodically computed roll-ups at fixed windows.
-- Written by the daemon projector on a schedule (not on every event).
-- Used for histograms, ratios, and long-range dashboard views.
CREATE TABLE IF NOT EXISTS metric_aggregates (
  metric_name   TEXT NOT NULL,
  labels        TEXT NOT NULL DEFAULT '{}',
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL,
  window_kind   TEXT NOT NULL DEFAULT 'rolling',  -- 'rolling' | 'calendar'
  stat          TEXT NOT NULL,   -- 'sum' | 'mean' | 'min' | 'max' | 'p50' | 'p95' | 'count'
  value         REAL NOT NULL,
  computed_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, labels, window_start, window_kind, stat)
);

CREATE INDEX IF NOT EXISTS idx_metric_aggregates_name_time
  ON metric_aggregates(metric_name, window_start DESC);
