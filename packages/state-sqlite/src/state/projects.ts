import { basename } from "node:path";
import type { Database } from "bun:sqlite";
import {
  canonicalizeProjectPath,
  getProjectById,
  getProjectByPath,
  listProjectsFromDb,
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
} from "@aloop/state-projects";

export {
  canonicalizeProjectPath,
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type CreateProjectInput,
  type Project,
  type ProjectFilter,
  type ProjectStatus,
};

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
    return getProjectById(this.db, id);
  }

  getByPath(absPath: string): Project | undefined {
    return getProjectByPath(this.db, absPath);
  }

  list(filter: ProjectFilter & { limit?: number; cursor?: string } = {}): { items: Project[]; nextCursor: string | null } {
    return listProjectsFromDb(this.db, filter);
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
