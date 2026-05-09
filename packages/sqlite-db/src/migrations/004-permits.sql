-- 004-permits: current in-flight scheduler permits.
-- This table is a projection of daemon events:
--   scheduler.permit.grant   -> insert active permit
--   scheduler.permit.release -> remove
--   scheduler.permit.expired -> remove

CREATE TABLE IF NOT EXISTS permits (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,
  composer_turn_id TEXT,
  control_subagent_run_id TEXT,
  provider_id  TEXT NOT NULL,
  ttl_seconds  INTEGER NOT NULL CHECK (ttl_seconds > 0),
  granted_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  CHECK (
    (session_id IS NOT NULL) +
    (composer_turn_id IS NOT NULL) +
    (control_subagent_run_id IS NOT NULL) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_permits_session_id ON permits(session_id);
CREATE INDEX IF NOT EXISTS idx_permits_composer_turn_id ON permits(composer_turn_id);
CREATE INDEX IF NOT EXISTS idx_permits_control_subagent_run_id ON permits(control_subagent_run_id);
CREATE INDEX IF NOT EXISTS idx_permits_expires_at ON permits(expires_at);
