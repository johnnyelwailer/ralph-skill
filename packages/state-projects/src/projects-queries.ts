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
};

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    absPath: row.abs_path,
    name: row.name,
    status: row.status,
    addedAt: row.added_at,
    lastActiveAt: row.last_active_at,
    updatedAt: row.updated_at,
  };
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
  return row ? rowToProject(row) : undefined;
}

export function getProjectByPath(db: Database, absPath: string): Project | undefined {
  const canonical = canonicalizeProjectPath(absPath);
  const row = db
    .query<ProjectRow, [string]>(`SELECT * FROM projects WHERE abs_path = ?`)
    .get(canonical);
  return row ? rowToProject(row) : undefined;
}

export function listProjectsFromDb(db: Database, filter: ProjectFilter = {}): Project[] {
  if (filter.status !== undefined && filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    return db
      .query<ProjectRow, [ProjectStatus, string]>(
        `SELECT * FROM projects WHERE status = ? AND abs_path = ? ORDER BY added_at`,
      )
      .all(filter.status, canonical)
      .map(rowToProject);
  }

  if (filter.status !== undefined) {
    return db
      .query<ProjectRow, [ProjectStatus]>(`SELECT * FROM projects WHERE status = ? ORDER BY added_at`)
      .all(filter.status)
      .map(rowToProject);
  }

  if (filter.absPath !== undefined) {
    const canonical = canonicalizeProjectPath(filter.absPath);
    return db
      .query<ProjectRow, [string]>(`SELECT * FROM projects WHERE abs_path = ? ORDER BY added_at`)
      .all(canonical)
      .map(rowToProject);
  }

  return db
    .query<ProjectRow, []>(`SELECT * FROM projects ORDER BY added_at`)
    .all()
    .map(rowToProject);
}
