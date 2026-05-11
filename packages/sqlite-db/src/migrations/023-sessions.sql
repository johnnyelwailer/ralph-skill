-- 007-sessions: session registry.
-- Each row is one autonomous session (standalone, orchestrator, or child).
-- Sessions are created via POST /v1/sessions, promoted to running by the scheduler,
-- and transitioned through interrupted/stopped/paused states via API calls.
-- See api.md §Sessions for the full contract.

CREATE TABLE IF NOT EXISTS sessions (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  kind                  TEXT NOT NULL
                          CHECK (kind IN ('standalone', 'orchestrator', 'child')),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'running', 'interrupted',
                            'stopped', 'paused', 'completed', 'failed'
                          )),
  workflow              TEXT NOT NULL,
  provider_chain        TEXT NOT NULL,          -- JSON array of provider ids
  issue_ref             TEXT,                   -- tracker issue reference
  parent_session_id     TEXT
                          REFERENCES sessions(id) ON DELETE SET NULL,
  max_iterations        INTEGER,
  notes                 TEXT NOT NULL DEFAULT '',
  current_iteration     INTEGER NOT NULL DEFAULT 0,
  current_phase         TEXT,                   -- agent name or phase label
  current_provider_id   TEXT,
  last_event_id         TEXT,                   -- last event processed
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  stopped_at            TEXT,
  started_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_project_id  ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent      ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_kind         ON sessions(kind);

-- Session queue items for steer operations.
-- Written by POST /v1/sessions/:id/steer, consumed by the scheduler.
CREATE TABLE IF NOT EXISTS session_queue (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  instruction TEXT NOT NULL,
  affects_completed_work TEXT NOT NULL DEFAULT 'no'
                          CHECK (affects_completed_work IN ('yes', 'no', 'unknown')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sq_session_id  ON session_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_sq_position    ON session_queue(position);
