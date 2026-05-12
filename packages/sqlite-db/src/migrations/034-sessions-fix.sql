-- 034-sessions: fix schema issues from migration v023.
-- Migration v023 created sessions table with:
--   1. CHECK constraint on status WITHOUT 'archived' value
--   2. FOREIGN KEY constraint on parent_session_id (removed in v027 but persisted)
-- Migration v033 added missing columns but did not fix these constraints.
-- Additionally, session_queue was created with FK to sessions, but after renaming
-- sessions to sessions_v023_old and creating new sessions, the FK pointed to the
-- wrong table. This migration rebuilds both tables to match the v030 schema.

-- Step 1: Rename old table
ALTER TABLE sessions RENAME TO sessions_v023_old;

-- Step 2: Create new sessions table with correct schema (matches v030)
CREATE TABLE sessions (
  id                          TEXT PRIMARY KEY,
  project_id                  TEXT NOT NULL,
  kind                        TEXT NOT NULL
                                 CHECK (kind IN ('standalone', 'orchestrator', 'child')),
  parent_session_id           TEXT,
  workflow                    TEXT NOT NULL DEFAULT '',
  provider_chain              TEXT NOT NULL DEFAULT '[]',
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
  current_phase               TEXT,
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

-- Step 3: Copy data from old table (with compatible columns only)
INSERT INTO sessions (
  id, project_id, kind, parent_session_id, workflow, provider_chain,
  issue_ref, max_iterations, notes, status,
  current_iteration, current_phase, current_provider_id, last_event_id,
  created_at, updated_at, stopped_at, started_at
)
SELECT
  id, project_id, kind, parent_session_id,
  COALESCE(workflow, ''),
  COALESCE(provider_chain, '[]'),
  issue_ref, max_iterations, notes, status,
  current_iteration, current_phase, current_provider_id, last_event_id,
  created_at, updated_at, stopped_at, started_at
FROM sessions_v023_old;

-- Step 4: Drop old sessions table
DROP TABLE sessions_v023_old;

-- Step 5: Drop and recreate session_queue with correct FK reference
DROP TABLE session_queue;

CREATE TABLE session_queue (
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

-- Fast lookups by project and status (list queries, watchdog scans)
CREATE INDEX IF NOT EXISTS idx_sessions_project_id  ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status      ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at   ON sessions(created_at);