-- 006-artifacts: artifact metadata storage.
-- Files are stored on disk at $ALOOP_HOME/artifacts/<id>/<filename>.
-- Metadata is here for querying and url generation.

CREATE TABLE IF NOT EXISTS artifacts (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  session_id   TEXT,
  setup_run_id TEXT,
  work_item_key TEXT,
  kind         TEXT NOT NULL DEFAULT 'other'
                 CHECK (kind IN ('image', 'screenshot', 'mockup', 'diff', 'other')),
  phase        TEXT,
  label        TEXT,
  filename     TEXT NOT NULL,
  media_type   TEXT NOT NULL,
  bytes        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project  ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_session  ON artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_setup    ON artifacts(setup_run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_workitem ON artifacts(work_item_key);
CREATE INDEX IF NOT EXISTS idx_artifacts_phase   ON artifacts(phase);