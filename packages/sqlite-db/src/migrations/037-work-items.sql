-- 037-work-items: daemon projection for tracker work items.
-- The daemon mirrors normalized Epics, Stories, and other work items that the
-- TrackerAdapter creates, updates, or closes. JSONL events remain the
-- authoritative log; this table is a queryable projection.
-- See docs/spec/work-tracker.md §Source of truth and api.md §Work items.

CREATE TABLE IF NOT EXISTS work_items (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tracker_id      TEXT NOT NULL,
  ref_key         TEXT NOT NULL,
  ref_url         TEXT,
  kind            TEXT NOT NULL
                    CHECK (kind IN ('epic', 'story', 'task_mirror', 'other')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'closed')),
  status          TEXT,
  parent_ref_key  TEXT,
  parent_tracker  TEXT,
  labels          TEXT NOT NULL DEFAULT '[]',
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  closed_at       TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_ref
  ON work_items(project_id, tracker_id, ref_key);
CREATE INDEX IF NOT EXISTS idx_work_items_project_kind
  ON work_items(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_work_items_parent
  ON work_items(project_id, parent_tracker, parent_ref_key);
CREATE INDEX IF NOT EXISTS idx_work_items_state
  ON work_items(project_id, state);

-- Cursor for tracker event ingestion (incremental sync from adapter).
CREATE TABLE IF NOT EXISTS work_item_cursors (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tracker_id  TEXT NOT NULL,
  cursor      TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (project_id, tracker_id)
);
