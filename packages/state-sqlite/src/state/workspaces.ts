import type { Database } from "bun:sqlite";
import type { ProjectStatus } from "@aloop/state-projects";

export type WorkspaceProjectRole = "primary" | "supporting" | "dependency" | "experiment";

export type Workspace = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultProjectId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};

export type WorkspaceProject = {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly role: WorkspaceProjectRole;
  readonly addedAt: string;
  readonly projectName: string;
  readonly projectAbsPath: string;
  readonly projectStatus: ProjectStatus;
};

export type WorkspaceFilter = {
  readonly archived?: boolean;
  /**
   * Full-text search across name. Matches anywhere in the name (case-insensitive).
   * Returns all workspaces when omitted.
   */
  readonly q?: string;
};

export type CreateWorkspaceInput = {
  readonly name: string;
  readonly description?: string;
  readonly defaultProjectId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly id?: string;
  readonly now?: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description: string;
  default_project_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type WorkspaceProjectRow = {
  workspace_id: string;
  project_id: string;
  role: string;
  added_at: string;
  project_name: string;
  project_abs_path: string;
  project_status: ProjectStatus;
};

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultProjectId: row.default_project_id,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function rowToWorkspaceProject(row: WorkspaceProjectRow): WorkspaceProject {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    role: row.role as WorkspaceProjectRole,
    addedAt: row.added_at,
    projectName: row.project_name,
    projectAbsPath: row.project_abs_path,
    projectStatus: row.project_status,
  };
}

export class WorkspaceRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateWorkspaceInput): Workspace {
    const id = input.id ?? crypto.randomUUID();
    const name = input.name.trim();
    const description = input.description?.trim() ?? "";
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";
    const now = input.now ?? new Date().toISOString();

    this.db.run(
      `INSERT INTO workspaces (id, name, description, default_project_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description, input.defaultProjectId ?? null, metadata, now, now],
    );

    const row = this.db.query<WorkspaceRow, [string]>(`SELECT * FROM workspaces WHERE id = ?`).get(id);
    if (!row) throw new Error(`workspace not found after create: ${id}`);
    return rowToWorkspace(row);
  }

  get(id: string): Workspace | undefined {
    const row = this.db.query<WorkspaceRow, [string]>(`SELECT * FROM workspaces WHERE id = ?`).get(id);
    return row ? rowToWorkspace(row) : undefined;
  }

  list(filter: WorkspaceFilter & { limit?: number; cursor?: string } = {}): { items: Workspace[]; nextCursor: string | null } {
    const { archived, q, limit, cursor } = filter;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (!archived) {
      conditions.push("archived_at IS NULL");
    }
    if (q !== undefined && q.trim() !== "") {
      conditions.push("LOWER(name) LIKE ?");
      params.push(`%${q.toLowerCase().trim()}%`);
    }
    if (cursor !== undefined) {
      conditions.push("(created_at || ':' || id) > ?");
      params.push(cursor);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const effectiveLimit = limit !== undefined ? Math.min(limit, 100) : 100;

    const rows = this.db
      .query<WorkspaceRow, (string | number)[]>(
        `SELECT * FROM workspaces ${whereClause} ORDER BY created_at ASC, id ASC LIMIT ?`,
      )
      .all(...params, effectiveLimit + 1);

    const hasMore = rows.length > effectiveLimit;
    const items = hasMore ? rows.slice(0, effectiveLimit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? `${items[items.length - 1]!.created_at}:${items[items.length - 1]!.id}`
      : null;

    return {
      items: items.map(rowToWorkspace),
      nextCursor,
    };
  }

  updateName(id: string, name: string): Workspace {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("name cannot be empty");
    const now = new Date().toISOString();
    const changes = this.db.run(
      `UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?`,
      [trimmed, now, id],
    );
    if (changes.changes === 0) throw new WorkspaceNotFoundError(id);
    return this.getRequired(id);
  }

  updateDescription(id: string, description: string): Workspace {
    const now = new Date().toISOString();
    const changes = this.db.run(
      `UPDATE workspaces SET description = ?, updated_at = ? WHERE id = ?`,
      [description, now, id],
    );
    if (changes.changes === 0) throw new WorkspaceNotFoundError(id);
    return this.getRequired(id);
  }

  archive(id: string): Workspace {
    const now = new Date().toISOString();
    const changes = this.db.run(
      `UPDATE workspaces SET archived_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
    if (changes.changes === 0) throw new WorkspaceNotFoundError(id);
    return this.getRequired(id);
  }

  addProject(workspaceId: string, projectId: string, role: WorkspaceProjectRole): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id, project_id) DO UPDATE SET role = excluded.role, added_at = excluded.added_at`,
      [workspaceId, projectId, role, now],
    );
  }

  removeProject(workspaceId: string, projectId: string): void {
    this.db.run(
      `DELETE FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
      [workspaceId, projectId],
    );
  }

  listProjects(workspaceId: string): WorkspaceProject[] {
    return this.db
      .query<WorkspaceProjectRow, [string]>(
        `SELECT wp.workspace_id, wp.project_id, wp.role, wp.added_at,
                p.name as project_name, p.abs_path as project_abs_path, p.status as project_status
         FROM workspace_projects wp
         JOIN projects p ON p.id = wp.project_id
         WHERE wp.workspace_id = ?
         ORDER BY wp.added_at`,
      )
      .all(workspaceId)
      .map(rowToWorkspaceProject);
  }

  getProjectRole(workspaceId: string, projectId: string): WorkspaceProjectRole | null {
    const row = this.db
      .query<{ role: string }, [string, string]>(
        `SELECT role FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
      )
      .get(workspaceId, projectId);
    return row ? (row.role as WorkspaceProjectRole) : null;
  }

  private getRequired(id: string): Workspace {
    const w = this.get(id);
    if (!w) throw new WorkspaceNotFoundError(id);
    return w;
  }
}

export class WorkspaceNotFoundError extends Error {
  readonly code = "workspace_not_found";
  constructor(readonly id: string) {
    super(`workspace not found: ${id}`);
  }
}