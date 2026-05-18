-- 035-turns: add turns table for session turn metadata.
-- Turns are identified by session_id + turn_id (from agent.chunk events).
-- The turn record is created when the first agent.chunk for that turn is
-- persisted to JSONL, and updated with usage stats when the turn ends.
--
-- The turns table supplements the session log JSONL with queryable turn metadata.
-- Turn data (chunks) remain in JSONL and are replayed via the chunks endpoint.

CREATE TABLE IF NOT EXISTS turns (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  turn_id         TEXT NOT NULL,
  sequence        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  ended_at        TEXT,
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_session_turn ON turns(session_id, turn_id);

-- Prevent duplicate turn_id starts (first chunk wins, extra inserts are no-ops)
-- Note: ON CONFLICT is not used since we just silently ignore dups via INSERT OR IGNORE