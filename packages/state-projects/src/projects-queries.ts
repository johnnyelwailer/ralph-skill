import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import type { Project, ProjectFilter, ProjectStatus } from "./project-types.ts";

type ProjectRow = {
  id: string;
  abs_path: string;
  name: string;
  status: ProjectStatus;
  added_at: string;
  last_active_at: string | null;
  updated_at: string;
  workspace_ids: string;
};

function rowToProject(row: ProjectRow, workspaceIds: readonly string[] = []): Project {
  return {
    id: row.id,
    absPath: row.abs_path,
    name: row.name,
    status: row.status,
    addedAt: row.added_at,
    lastActiveAt: row.last_active_at,
    updatedAt: row.updated_at,
    workspaceIds,
  };
}

function parseWorkspaceIds(workspaceIdsStr: string): readonly string[] {
  if (!workspaceIdsStr) return [];
  return workspaceIdsStr.split(",").filter(Boolean);
}

export function canonicalizeProjectPath(path: string): string {
  const absPath = resolve(path);
  try {
    return realpathSync(absPath);
  } catch {
    return absPath.replace(/\/+$/, "");
  }
}

function getWorkspaceIdsForProject(db: Database, projectId: string): readonly string[] {
  const rows = db
    .query<{ workspace_id: string }, [string]>(`SELECT workspace_id FROM workspace_projects WHERE project_id = ?`)
    .all(projectId);
  return rows.map((r) => r.workspace_id);
}

export function getProjectById(db: Database, id: string): Project | undefined {
  const row = db
    .query<ProjectRow, [string]>(
      `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
       FROM projects p
       LEFT JOIN workspace_projects wp ON wp.project_id = p.id
       WHERE p.id = ?
       GROUP BY p.id`,
    )
    .get(id);
  return row ? rowToProject(row, parseWorkspaceIds(row.workspace_ids)) : undefined;
}

export function getProjectByPath(db: Database, absPath: string): Project | undefined {
  const canonical = canonicalizeProjectPath(absPath);
  const row = db
    .query<ProjectRow, [string]>(
      `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
       FROM projects p
       LEFT JOIN workspace_projects wp ON wp.project_id = p.id
       WHERE p.abs_path = ?
       GROUP BY p.id`,
    )
    .get(canonical);
  return row ? rowToProject(row, parseWorkspaceIds(row.workspace_ids)) : undefined;
}

/** Supports cursor-based pagination, text search, workspace filter. */
export function listProjectsFromDb(
  db: Database,
  filter: ProjectFilter & { limit?: number; cursor?: string } = {},
): { items: Project[]; nextCursor: string | null } {
  const { status, absPath, workspaceId, q, limit, cursor } = filter;

  // Build conditions and params for the WHERE clause.
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (status !== undefined) {
    conditions.push("p.status = ?");
    params.push(status);
  }
  if (absPath !== undefined) {
    const canonical = canonicalizeProjectPath(absPath);
    conditions.push("p.abs_path = ?");
    params.push(canonical);
  }
  if (workspaceId !== undefined) {
    conditions.push("EXISTS (SELECT 1 FROM workspace_projects wp WHERE wp.project_id = p.id AND wp.workspace_id = ?)");
    params.push(workspaceId);
  }
  if (q !== undefined && q.trim() !== "") {
    conditions.push("LOWER(p.name) LIKE ?");
    params.push(`%${q.toLowerCase().trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Cursor-based pagination: resume after the last seen `added_at || ':' || id`.
  if (cursor !== undefined) {
    conditions.push("(p.added_at || ':' || p.id) > ?");
    params.push(cursor);
  }

  const finalWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const effectiveLimit = limit !== undefined ? Math.min(limit, 100) : 100;

  const rows = db
    .query<ProjectRow, (string | number)[]>(
      `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
       FROM projects p
       LEFT JOIN workspace_projects wp ON wp.project_id = p.id
       ${finalWhere}
       GROUP BY p.id
       ORDER BY p.added_at ASC, p.id ASC
       LIMIT ?`,
    )
    .all(...params, effectiveLimit + 1);

  const hasMore = rows.length > effectiveLimit;
  const items = hasMore ? rows.slice(0, effectiveLimit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? `${items[items.length - 1]!.added_at}:${items[items.length - 1]!.id}`
    : null;

  return {
    items: items.map((row) => rowToProject(row, parseWorkspaceIds(row.workspace_ids))),
    nextCursor,
  };
}
