-- 009-incubation-comments: durable discussion on incubation items.
-- See docs/spec/api.md §Incubation › Comments.

CREATE TABLE IF NOT EXISTS incubation_comments (
  id                  TEXT PRIMARY KEY,
  incubation_item_id  TEXT NOT NULL,
  body                TEXT NOT NULL,
  author              TEXT NOT NULL DEFAULT 'anonymous',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  FOREIGN KEY (incubation_item_id) REFERENCES incubation_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ic_item_id ON incubation_comments(incubation_item_id);
