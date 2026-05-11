-- 019-sessions: daemon session registry.
-- See docs/spec/daemon.md §Session kinds — the sessions table is the
-- authoritative StateStore record for session lifecycle. JSONL files in
-- sessions/<id>/log.jsonl remain the authoritative event history; this table
-- holds the current projected state for fast queries and crash recovery.
--
-- Crash recovery (daemon.md §Lifecycle): on startup the daemon scans for
-- status=running rows, marks them interrupted, reads event tail, and emits
-- session.interrupted so clients can offer resume.

CREATE TABLE IF NOT EXISTS sessions (
  id                          TEXT PRIMARY KEY,
  project_id                  TEXT NOT NULL,
  kind                        TEXT NOT NULL
                                 CHECK (kind IN ('standalone', 'orchestrator', 'child')),
  parent_session_id           TEXT,
  workflow                    TEXT NOT NULL DEFAULT '',
  provider_chain              TEXT NOT NULL DEFAULT '[]',  -- JSON array
  issue_ref                   TEXT,
  max_iterations              INTEGER,
  notes                       TEXT NOT NULL DEFAULT '',
  status                      TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN (
                                   'pending','running','paused','interrupted',
                                   'stopped','completed','failed','archived'
                                 )),
  worktree_path               TEXT,
  current_iteration           INTEGER NOT NULL DEFAULT 0,
  current_phase                TEXT,
  current_provider_id          TEXT,
  last_event_id               TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL,
  ended_at                    TEXT,
  stopped_at                  TEXT,
  started_at                  TEXT,
  cost_usd                    REAL NOT NULL DEFAULT 0,
  tokens_in                   INTEGER NOT NULL DEFAULT 0,
  tokens_out                  INTEGER NOT NULL DEFAULT 0,
  commits                     INTEGER NOT NULL DEFAULT 0
);

-- Fast lookups by project and status (list queries, watchdog scans)
CREATE INDEX IF NOT EXISTS idx_sessions_project_id
  ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id
  ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at
  ON sessions(created_at);

-- Session queue items for steer operations.
-- Written by POST /v1/sessions/:id/steer, consumed by the scheduler.
CREATE TABLE IF NOT EXISTS session_queue (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  instruction TEXT NOT NULL,
  affects_completed_work TEXT NOT NULL DEFAULT 'unknown'
                  CHECK (affects_completed_work IN ('yes', 'no', 'unknown')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sq_session_id  ON session_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_sq_position    ON session_queue(position);
