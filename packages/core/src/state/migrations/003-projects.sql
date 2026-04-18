-- 003-projects: project registry.
-- Each row is one repository known to the daemon. Registration happens via
-- POST /v1/projects; setup flow transitions status to `ready`; archive moves
-- to `archived`. See daemon.md §Project registry.

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  abs_path       TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'setup_pending'
                   CHECK (status IN ('setup_pending', 'ready', 'archived')),
  added_at       TEXT NOT NULL,
  last_active_at TEXT,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_abs_path ON projects(abs_path);
