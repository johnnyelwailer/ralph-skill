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

export function listProjectsFromDb(db: Database, filter: ProjectFilter = {}): Project[] {
  if (filter.status !== undefined && filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    return db
      .query<ProjectRow, [ProjectStatus, string]>(
        `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
         FROM projects p
         LEFT JOIN workspace_projects wp ON wp.project_id = p.id
         WHERE p.status = ? AND p.abs_path = ?
         GROUP BY p.id
         ORDER BY p.added_at`,
      )
      .all(filter.status, canonical)
      .map((row) => rowToProject(row, parseWorkspaceIds(row.workspace_ids)));
  }

  if (filter.status !== undefined) {
    return db
      .query<ProjectRow, [ProjectStatus]>(
        `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
         FROM projects p
         LEFT JOIN workspace_projects wp ON wp.project_id = p.id
         WHERE p.status = ?
         GROUP BY p.id
         ORDER BY p.added_at`,
      )
      .all(filter.status)
      .map((row) => rowToProject(row, parseWorkspaceIds(row.workspace_ids)));
  }

  if (filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    return db
      .query<ProjectRow, [string]>(
        `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
         FROM projects p
         LEFT JOIN workspace_projects wp ON wp.project_id = p.id
         WHERE p.abs_path = ?
         GROUP BY p.id
         ORDER BY p.added_at`,
      )
      .all(canonical)
      .map((row) => rowToProject(row, parseWorkspaceIds(row.workspace_ids)));
  }

  return db
    .query<ProjectRow, []>(
      `SELECT p.*, COALESCE(GROUP_CONCAT(wp.workspace_id), '') as workspace_ids
       FROM projects p
       LEFT JOIN workspace_projects wp ON wp.project_id = p.id
       GROUP BY p.id
       ORDER BY p.added_at`,
    )
    .all()
    .map((row) => rowToProject(row, parseWorkspaceIds(row.workspace_ids)));
}