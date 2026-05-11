-- 010-workspaces: workspace registry and project-to-workspace membership.
-- A workspace is a logical grouping of one or more projects/repos.
-- Projects may belong to zero, one, or multiple workspaces.
-- See api.md §Workspaces for the full contract.

CREATE TABLE IF NOT EXISTS workspaces (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  description               TEXT NOT NULL DEFAULT '',
  default_budget_usd_per_day REAL NOT NULL DEFAULT 0.00,
  metadata                  TEXT NOT NULL DEFAULT '{}',
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);

-- project-to-workspace membership junction
CREATE TABLE IF NOT EXISTS workspace_projects (
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'supporting'
                  CHECK (role IN ('primary', 'supporting', 'dependency', 'experiment')),
  added_at      TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_project_id ON workspace_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_wp_workspace_id ON workspace_projects(workspace_id);