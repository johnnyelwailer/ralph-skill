import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import type { Project, ProjectFilter, ProjectStatus, ProjectWorkspaceRole } from "./project-types.ts";

type ProjectRow = {
  id: string;
  abs_path: string;
  name: string;
  status: ProjectStatus;
  added_at: string;
  last_active_at: string | null;
  updated_at: string;
};

function rowToProject(row: ProjectRow, memberships: ReadonlyArray<{ workspaceId: string; role: ProjectWorkspaceRole; addedAt: string }> = []): Project {
  return {
    id: row.id,
    absPath: row.abs_path,
    name: row.name,
    status: row.status,
    addedAt: row.added_at,
    lastActiveAt: row.last_active_at,
    updatedAt: row.updated_at,
    workspaceMemberships: memberships,
  };
}

type WorkspaceMembershipRow = {
  workspace_id: string;
  role: ProjectWorkspaceRole;
  added_at: string;
};

function loadWorkspaceMemberships(db: Database, projectId: string): ReadonlyArray<{ workspaceId: string; role: ProjectWorkspaceRole; addedAt: string }> {
  const rows = db
    .query<WorkspaceMembershipRow, [string]>(
      `SELECT workspace_id, role, added_at FROM project_workspaces WHERE project_id = ?`,
    )
    .all(projectId);
  return rows.map((r) => ({ workspaceId: r.workspace_id, role: r.role, addedAt: r.added_at }));
}

export function canonicalizeProjectPath(path: string): string {
  const absPath = resolve(path);
  try {
    return realpathSync(absPath);
  } catch {
    return absPath.replace(/\/+$/, "");
  }
}

export function getProjectById(db: Database, id: string): Project | undefined {
  const row = db.query<ProjectRow, [string]>(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (!row) return undefined;
  return rowToProject(row, loadWorkspaceMemberships(db, id));
}

export function getProjectByPath(db: Database, absPath: string): Project | undefined {
  const canonical = canonicalizeProjectPath(absPath);
  const row = db
    .query<ProjectRow, [string]>(`SELECT * FROM projects WHERE abs_path = ?`)
    .get(canonical);
  if (!row) return undefined;
  return rowToProject(row, loadWorkspaceMemberships(db, row.id));
}

export function listProjectsFromDb(db: Database, filter: ProjectFilter = {}): Project[] {
  // Join project_workspaces to support workspaceId filter and to eagerly load memberships
  const pwAlias = "pw";
  // Concatenate workspace fields into a single string per row; separator between rows is '|||'
  // SQLite's GROUP_CONCAT takes at most 2 args (value, separator), so we pre-concatenate fields with '||'
  const workspaceConcatExpr = `${pwAlias}.workspace_id || '||' || ${pwAlias}.role || '||' || ${pwAlias}.added_at`;
  const workspaceGroupConcat = `GROUP_CONCAT(${workspaceConcatExpr}, '|||')`;

  const cols = [
    `p.id, p.abs_path, p.name, p.status, p.added_at, p.last_active_at, p.updated_at`,
    `${workspaceGroupConcat} AS workspace_data`,
  ];

  let sql: string;
  let params: (string | number)[];

  if (filter.workspaceId !== undefined) {
    // Must join project_workspaces to filter; always include the data subquery
    const statusClause = filter.status !== undefined ? "AND p.status = ?" : "";
    sql = `
      SELECT ${cols.join(", ")},
      (SELECT GROUP_CONCAT(workspace_id || '||' || role || '||' || added_at, '|||')
       FROM project_workspaces WHERE project_id = p.id) AS workspace_data
      FROM projects p
      INNER JOIN project_workspaces ${pwAlias} ON ${pwAlias}.project_id = p.id
      WHERE ${pwAlias}.workspace_id = ? ${statusClause}
      GROUP BY p.id
      ORDER BY p.added_at
    `;
    params = filter.status !== undefined
      ? [filter.workspaceId, filter.status]
      : [filter.workspaceId];
  } else if (filter.status !== undefined && filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    sql = `
      SELECT ${cols.join(", ")},
      (SELECT GROUP_CONCAT(workspace_id || '||' || role || '||' || added_at, '|||')
       FROM project_workspaces WHERE project_id = p.id) AS workspace_data
      FROM projects p
      LEFT JOIN project_workspaces ${pwAlias} ON ${pwAlias}.project_id = p.id
      WHERE p.status = ? AND p.abs_path = ?
      GROUP BY p.id
      ORDER BY p.added_at
    `;
    params = [filter.status, canonical];
  } else if (filter.status !== undefined) {
    sql = `
      SELECT ${cols.join(", ")},
      (SELECT GROUP_CONCAT(workspace_id || '||' || role || '||' || added_at, '|||')
       FROM project_workspaces WHERE project_id = p.id) AS workspace_data
      FROM projects p
      LEFT JOIN project_workspaces ${pwAlias} ON ${pwAlias}.project_id = p.id
      WHERE p.status = ?
      GROUP BY p.id
      ORDER BY p.added_at
    `;
    params = [filter.status];
  } else if (filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    sql = `
      SELECT ${cols.join(", ")},
      (SELECT GROUP_CONCAT(workspace_id || '||' || role || '||' || added_at, '|||')
       FROM project_workspaces WHERE project_id = p.id) AS workspace_data
      FROM projects p
      LEFT JOIN project_workspaces ${pwAlias} ON ${pwAlias}.project_id = p.id
      WHERE p.abs_path = ?
      GROUP BY p.id
      ORDER BY p.added_at
    `;
    params = [canonical];
  } else {
    sql = `
      SELECT ${cols.join(", ")},
      (SELECT GROUP_CONCAT(workspace_id || '||' || role || '||' || added_at, '|||')
       FROM project_workspaces WHERE project_id = p.id) AS workspace_data
      FROM projects p
      LEFT JOIN project_workspaces ${pwAlias} ON ${pwAlias}.project_id = p.id
      GROUP BY p.id
      ORDER BY p.added_at
    `;
    params = [];
  }

  const rows = db
    .query<ProjectRow & { workspace_data: string | null }, (string | number)[]>(
      sql,
    )
    .all(...params);

  return rows.map((row) => {
    const memberships = parseWorkspaceData(row.workspace_data);
    return rowToProject(row, memberships);
  });
}

function parseWorkspaceData(
  data: string | null,
): ReadonlyArray<{ workspaceId: string; role: ProjectWorkspaceRole; addedAt: string }> {
  if (!data || data.length === 0) return [];
  return data.split("|||").map((segment) => {
    const [workspaceId, role, addedAt] = segment.split("||");
    return { workspaceId: workspaceId!, role: role as ProjectWorkspaceRole, addedAt: addedAt! };
  });
}
