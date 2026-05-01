-- 006-idempotency-keys: deduplicate mutation requests.
--
-- Per api.md §Idempotency: mutations that create resources accept
-- Idempotency-Key: <uuid>. Repeat key within 24h returns the original result.
--
-- Design:
--   - key is a random UUID provided by the client.
--   - result is stored as JSON (the original response body).
--   - status tracks whether the original request succeeded or failed.
--   - created_at drives the 24h TTL (checked at read time).

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT NOT NULL PRIMARY KEY,
  status       TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  result       TEXT NOT NULL,   -- serialized JSON of the original Response
  created_at   TEXT NOT NULL,   -- ISO timestamp
  expires_at   TEXT NOT NULL    -- ISO timestamp = created_at + 24h
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
