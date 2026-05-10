-- 018-permit-owner-fields: make scheduler permit ownership generic.
--
-- Earlier local schemas made permits session-only. The API models permits as
-- owned by exactly one reusable runtime primitive: session, composer turn, or
-- control subagent run.
--
-- Migration path for existing permits:
--   - session_id/composer_turn_id/control_subagent_run_id: carried over from
--     the permits table (004+012).
--   - project_id: carried over from the permits table (011).
--   - research_run_id: added by 012; will be NULL for all pre-020 permits
--     (no pre-020 permit was ever research_run-owned).

CREATE TABLE IF NOT EXISTS permits_v2 (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT,
  composer_turn_id        TEXT,
  control_subagent_run_id TEXT,
  research_run_id         TEXT,
  project_id              TEXT REFERENCES projects(id) ON DELETE SET NULL,
  provider_id             TEXT NOT NULL,
  ttl_seconds             INTEGER NOT NULL CHECK (ttl_seconds > 0),
  granted_at              TEXT NOT NULL,
  expires_at              TEXT NOT NULL,
  CHECK (
    (session_id IS NOT NULL) +
    (composer_turn_id IS NOT NULL) +
    (control_subagent_run_id IS NOT NULL) +
    (research_run_id IS NOT NULL) = 1
  )
);

INSERT OR REPLACE INTO permits_v2 (
  id,
  session_id,
  composer_turn_id,
  control_subagent_run_id,
  research_run_id,
  project_id,
  provider_id,
  ttl_seconds,
  granted_at,
  expires_at
)
SELECT
  id,
  session_id,
  composer_turn_id,
  control_subagent_run_id,
  research_run_id,
  project_id,
  provider_id,
  ttl_seconds,
  granted_at,
  expires_at
FROM permits;

DROP TABLE permits;
ALTER TABLE permits_v2 RENAME TO permits;

CREATE INDEX IF NOT EXISTS idx_permits_session_id ON permits(session_id);
CREATE INDEX IF NOT EXISTS idx_permits_composer_turn_id ON permits(composer_turn_id);
CREATE INDEX IF NOT EXISTS idx_permits_control_subagent_run_id ON permits(control_subagent_run_id);
CREATE INDEX IF NOT EXISTS idx_permits_project_id
  ON permits(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permits_expires_at ON permits(expires_at);
