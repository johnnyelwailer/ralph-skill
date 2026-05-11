-- 011-project-workspaces: project-to-workspace many-to-many membership.
-- A project may belong to zero, one, or multiple workspaces.
-- The workspace_projects table (005) already has project_id; this table
-- provides the reverse lookup (project -> workspaces) efficiently and
-- enables the /v1/projects?workspace_id=<id> filter at the query level.

CREATE TABLE IF NOT EXISTS project_workspaces (
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'supporting'
                  CHECK (role IN ('primary', 'supporting', 'dependency', 'experiment')),
  added_at      TEXT NOT NULL,
  PRIMARY KEY (project_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_pw_workspace_id ON project_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pw_project_id   ON project_workspaces(project_id);
