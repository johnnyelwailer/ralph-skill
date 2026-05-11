-- 031-workspaces-archived: add archived_at column to workspaces table
-- for soft-delete / archive support per api.md §Workspaces

ALTER TABLE workspaces ADD COLUMN archived_at TEXT;