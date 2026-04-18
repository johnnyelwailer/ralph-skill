-- 002-event-counts: per-topic counters populated by the projector.
-- A minimal useful projection that proves the events-as-truth mechanism:
-- delete this table, re-run the projector over JSONL, counts are restored.

CREATE TABLE IF NOT EXISTS event_counts (
  topic      TEXT NOT NULL PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
