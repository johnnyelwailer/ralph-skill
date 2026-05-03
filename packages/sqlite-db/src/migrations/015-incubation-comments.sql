-- 015-incubation-comments: comments on incubation items.
-- See docs/spec/api.md §Comments and docs/spec/incubation.md §Object model.

CREATE TABLE IF NOT EXISTS incubation_comments (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES incubation_items(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incubation_comments_item
  ON incubation_comments(item_id);
CREATE INDEX IF NOT EXISTS idx_incubation_comments_created
  ON incubation_comments(created_at);
