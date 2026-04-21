-- 001-init: schema_version tracking.
-- The real tables (projects, sessions, permits, metrics projections, etc.)
-- land in later migrations as their owning milestones ship.

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
