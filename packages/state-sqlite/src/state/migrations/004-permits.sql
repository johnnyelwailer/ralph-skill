-- 004-permits: current in-flight scheduler permits.
-- This table is a projection of daemon events:
--   scheduler.permit.grant   -> insert active permit
--   scheduler.permit.release -> remove
--   scheduler.permit.expired -> remove

CREATE TABLE IF NOT EXISTS permits (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  ttl_seconds  INTEGER NOT NULL CHECK (ttl_seconds > 0),
  granted_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permits_session_id ON permits(session_id);
CREATE INDEX IF NOT EXISTS idx_permits_expires_at ON permits(expires_at);
