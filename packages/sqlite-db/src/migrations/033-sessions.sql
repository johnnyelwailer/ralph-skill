-- 033-sessions: add missing columns to sessions table.
-- The sessions table may have been created by migration v023 (or earlier) without
-- all columns that later migrations (v027/v030) added. This migration brings older
-- databases in line with the v030 schema.
--
-- Idempotent: uses IF NOT EXISTS so re-running is safe.

ALTER TABLE sessions ADD COLUMN worktree_path TEXT;
ALTER TABLE sessions ADD COLUMN ended_at TEXT;
ALTER TABLE sessions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN tokens_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN tokens_out INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN commits INTEGER NOT NULL DEFAULT 0;