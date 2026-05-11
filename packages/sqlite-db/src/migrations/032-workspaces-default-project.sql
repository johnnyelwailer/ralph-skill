-- 032-workspaces-default-project: add default_project_id column to workspaces
-- for tracking the primary project in a workspace

ALTER TABLE workspaces ADD COLUMN default_project_id TEXT;