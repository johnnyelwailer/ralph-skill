-- 011-project-permits: project_id column on permits table.
--
-- Enables per-project permit counting for the scheduler's project-gate
-- (docs/spec/daemon.md §Scheduler authority item 6).
--
-- The permits table tracks session_id.  Every session belongs to exactly one
-- project, so we back-populate project_id from the session's session.json.
-- New permits get project_id written at grant time via the event data.

ALTER TABLE permits ADD COLUMN project_id TEXT
  REFERENCES projects(id) ON DELETE SET NULL;

-- Index for efficient per-project active permit counting.
CREATE INDEX IF NOT EXISTS idx_permits_project_id
  ON permits(project_id)
  WHERE project_id IS NOT NULL;
