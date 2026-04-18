import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Database } from "bun:sqlite";
import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
} from "./project-types.ts";

export {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
};

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

/**
 * Canonicalize a project path: resolve to absolute, follow symlinks, strip
 * trailing slashes. Two callers passing equivalent path strings end up with
 * the same canonical string, so the UNIQUE constraint on abs_path works.
 *
 * Non-existent paths resolve to their absolute form without following —
 * useful for setup flows that pre-register a project before its worktree is
 * fully initialized.
 */
export function canonicalizeProjectPath(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    return abs.replace(/\/+$/, "");
  }
}

export class ProjectRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateProjectInput): Project {
    const absPath = canonicalizeProjectPath(input.absPath);
    const id = input.id ?? crypto.randomUUID();
    const name = input.name?.trim() || basename(absPath) || absPath;
    const now = input.now ?? new Date().toISOString();

    try {
      this.db.run(
        `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
         VALUES (?, ?, ?, 'setup_pending', ?, ?)`,
        [id, absPath, name, now, now],
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("UNIQUE") && msg.includes("abs_path")) {
        throw new ProjectAlreadyRegisteredError(absPath);
      }
      throw err;
    }

    return this.getByPathRequired(absPath);
  }

  get(id: string): Project | undefined {
    const row = this.db
      .query<ProjectRow, [string]>(`SELECT * FROM projects WHERE id = ?`)
      .get(id);
    return row ? rowToProject(row) : undefined;
  }

  getByPath(absPath: string): Project | undefined {
    const canonical = canonicalizeProjectPath(absPath);
    const row = this.db
      .query<ProjectRow, [string]>(`SELECT * FROM projects WHERE abs_path = ?`)
      .get(canonical);
    return row ? rowToProject(row) : undefined;
  }

  list(filter: ProjectFilter = {}): Project[] {
    if (filter.status !== undefined && filter.absPath !== undefined) {
      const canonical = canonicalizeProjectPath(filter.absPath);
      return this.db
        .query<ProjectRow, [ProjectStatus, string]>(
          `SELECT * FROM projects WHERE status = ? AND abs_path = ? ORDER BY added_at`,
        )
        .all(filter.status, canonical)
        .map(rowToProject);
    }
    if (filter.status !== undefined) {
      return this.db
        .query<ProjectRow, [ProjectStatus]>(
          `SELECT * FROM projects WHERE status = ? ORDER BY added_at`,
        )
        .all(filter.status)
        .map(rowToProject);
    }
    if (filter.absPath !== undefined) {
      const canonical = canonicalizeProjectPath(filter.absPath);
      return this.db
        .query<ProjectRow, [string]>(
          `SELECT * FROM projects WHERE abs_path = ? ORDER BY added_at`,
        )
        .all(canonical)
        .map(rowToProject);
    }
    return this.db
      .query<ProjectRow, []>(`SELECT * FROM projects ORDER BY added_at`)
      .all()
      .map(rowToProject);
  }

  updateName(id: string, name: string, now: string = new Date().toISOString()): Project {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("name cannot be empty");
    const changes = this.db.run(
      `UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`,
      [trimmed, now, id],
    );
    if (changes.changes === 0) throw new ProjectNotFoundError(id);
    return this.getRequired(id);
  }

  updateStatus(
    id: string,
    status: ProjectStatus,
    now: string = new Date().toISOString(),
  ): Project {
    const changes = this.db.run(
      `UPDATE projects SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id],
    );
    if (changes.changes === 0) throw new ProjectNotFoundError(id);
    return this.getRequired(id);
  }

  touchActivity(id: string, now: string = new Date().toISOString()): void {
    this.db.run(
      `UPDATE projects SET last_active_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  }

  archive(id: string, now: string = new Date().toISOString()): Project {
    return this.updateStatus(id, "archived", now);
  }

  purge(id: string): void {
    this.db.run(`DELETE FROM projects WHERE id = ?`, [id]);
  }

  private getRequired(id: string): Project {
    const p = this.get(id);
    if (!p) throw new ProjectNotFoundError(id);
    return p;
  }

  private getByPathRequired(absPath: string): Project {
    const p = this.getByPath(absPath);
    if (!p) throw new Error(`project not found by path after create: ${absPath}`);
    return p;
  }
}
