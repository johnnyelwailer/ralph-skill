import type { Database } from "bun:sqlite";
import {
  DuplicateWorkspaceProjectError,
  ProjectNotFoundWorkspaceError,
  type CreateWorkspaceInput,
  type Workspace,
  type WorkspaceFilter,
  type WorkspaceProject,
  type WorkspaceProjectCounts,
  type WorkspaceProjectRole,
  type WorkspaceWithCounts,
} from "./workspace-types.ts";

type WorkspaceRow = {
  id: string;
  name: string;
  description: string;
  default_budget_usd_per_day: number;
  metadata: string;
  created_at: string;
  updated_at: string;
};

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultBudgetUsdPerDay: row.default_budget_usd_per_day,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type WorkspaceProjectRow = {
  workspace_id: string;
  project_id: string;
  role: WorkspaceProjectRole;
  added_at: string;
};

function rowToWorkspaceProject(row: WorkspaceProjectRow): WorkspaceProject {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    role: row.role,
    addedAt: row.added_at,
  };
}

// Extended row shape for listWorkspaces (includes computed counts)
type WorkspaceWithCountsRow = WorkspaceRow & {
  default_project_id: string | null;
  total: number;
  primary_count: number;
  supporting_count: number;
  dependency_count: number;
  experiment_count: number;
};

export function createWorkspace(
  db: Database,
  input: CreateWorkspaceInput,
): Workspace {
  const id = input.id ?? crypto.randomUUID();
  const now = input.now ?? new Date().toISOString();
  const metadata = JSON.stringify(input.metadata ?? {});

  db.run(
    `INSERT INTO workspaces (id, name, description, default_budget_usd_per_day, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? "",
      input.defaultBudgetUsdPerDay ?? 0.0,
      metadata,
      now,
      now,
    ],
  );

  const row = db
    .query<WorkspaceRow, [string]>(`SELECT * FROM workspaces WHERE id = ?`)
    .get(id)!;
  return rowToWorkspace(row);
}

export function getWorkspaceById(db: Database, id: string): Workspace | undefined {
  const row = db.query<WorkspaceRow, [string]>(`SELECT * FROM workspaces WHERE id = ?`).get(id);
  return row ? rowToWorkspace(row) : undefined;
}

export function listWorkspaces(
  db: Database,
  filter: WorkspaceFilter = {},
): WorkspaceWithCounts[] {
  const q = filter.q ?? "";
  const limit = Math.min(filter.limit ?? 50, 200);

  const countsSubquery = `
    SELECT
      workspace_id,
      MIN(CASE WHEN role = 'primary' THEN project_id END) AS default_project_id,
      COUNT(*) AS total,
      COALESCE(SUM(role = 'primary'),    0) AS primary_count,
      COALESCE(SUM(role = 'supporting'), 0) AS supporting_count,
      COALESCE(SUM(role = 'dependency'), 0) AS dependency_count,
      COALESCE(SUM(role = 'experiment'), 0) AS experiment_count
    FROM workspace_projects
    GROUP BY workspace_id
  `;

  let sql: string;
  let params: (string | number)[];

  const countCols = `
      COALESCE(wp_cnts.default_project_id, NULL) AS default_project_id,
      COALESCE(wp_cnts.total, 0)             AS total,
      COALESCE(wp_cnts.primary_count, 0)     AS primary_count,
      COALESCE(wp_cnts.supporting_count, 0)  AS supporting_count,
      COALESCE(wp_cnts.dependency_count, 0)   AS dependency_count,
      COALESCE(wp_cnts.experiment_count, 0)   AS experiment_count
  `;

  if (q.length > 0) {
    const qPattern = `%${q}%`;
    sql = `
      SELECT w.*,${countCols}
      FROM workspaces w
      LEFT JOIN (${countsSubquery}) wp_cnts ON wp_cnts.workspace_id = w.id
      WHERE w.name LIKE ? OR w.description LIKE ?
      ORDER BY w.created_at
      LIMIT ?
    `;
    params = [qPattern, qPattern, limit + 1];
  } else {
    sql = `
      SELECT w.*,${countCols}
      FROM workspaces w
      LEFT JOIN (${countsSubquery}) wp_cnts ON wp_cnts.workspace_id = w.id
      ORDER BY w.created_at
      LIMIT ?
    `;
    params = [limit + 1];
  }

  const rows = db.query<WorkspaceWithCountsRow, (string | number)[]>(sql).all(...params);
  return rows.slice(0, limit).map(rowToWorkspaceWithCounts);
}

function rowToWorkspaceWithCounts(
  row: WorkspaceWithCountsRow,
): WorkspaceWithCounts {
  return {
    ...rowToWorkspace(row),
    defaultProjectId: row.default_project_id,
    projectCounts: {
      total: row.total,
      primary: row.primary_count,
      supporting: row.supporting_count,
      dependency: row.dependency_count,
      experiment: row.experiment_count,
    },
  };
}

export function updateWorkspace(
  db: Database,
  id: string,
  patch: {
    name?: string;
    description?: string;
    defaultBudgetUsdPerDay?: number;
    metadata?: Record<string, unknown>;
  },
  now: string = new Date().toISOString(),
): Workspace {
  const sets: string[] = [];
  const vals: (string | number)[] = [];

  sets.push("updated_at = ?");
  vals.push(now);

  if (patch.name !== undefined) {
    sets.push("name = ?");
    vals.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    vals.push(patch.description);
  }
  if (patch.defaultBudgetUsdPerDay !== undefined) {
    sets.push("default_budget_usd_per_day = ?");
    vals.push(patch.defaultBudgetUsdPerDay);
  }
  if (patch.metadata !== undefined) {
    sets.push("metadata = ?");
    vals.push(JSON.stringify(patch.metadata));
  }

  vals.push(id);
  const setClause = sets.join(", ");
  const changes = db
    .query<{ changes: number }, (string | number)[]>(
      `UPDATE workspaces SET ${setClause} WHERE id = ?`,
    )
    .run(...vals);

  if (changes.changes === 0) {
    const existing = getWorkspaceById(db, id);
    if (!existing) throw new Error(`workspace not found: ${id}`);
  }

  return getWorkspaceById(db, id)!;
}

export function deleteWorkspace(db: Database, id: string): void {
  db.run(`DELETE FROM workspaces WHERE id = ?`, [id]);
}

// ---- workspace project membership ----

export function listWorkspaceProjects(
  db: Database,
  workspaceId: string,
): WorkspaceProject[] {
  return db
    .query<WorkspaceProjectRow, [string]>(
      `SELECT * FROM workspace_projects WHERE workspace_id = ? ORDER BY added_at`,
    )
    .all(workspaceId)
    .map(rowToWorkspaceProject);
}

export function addProjectToWorkspace(
  db: Database,
  workspaceId: string,
  projectId: string,
  role: WorkspaceProjectRole = "supporting",
  now: string = new Date().toISOString(),
): WorkspaceProject {
  // Check project exists
  const project = db.query<{ id: string }, [string]>(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    throw new ProjectNotFoundWorkspaceError(workspaceId, projectId);
  }

  // Check workspace exists
  const workspace = db.query<{ id: string }, [string]>(`SELECT id FROM workspaces WHERE id = ?`).get(workspaceId);
  if (!workspace) {
    throw new ProjectNotFoundWorkspaceError(workspaceId, projectId);
  }

  // Check duplicate
  const existing = db
    .query<{ workspace_id: string; project_id: string }, [string, string]>(
      `SELECT workspace_id, project_id FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
    )
    .get(workspaceId, projectId);
  if (existing) {
    throw new DuplicateWorkspaceProjectError(workspaceId, projectId);
  }

  db.run(
    `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at)
     VALUES (?, ?, ?, ?)`,
    [workspaceId, projectId, role, now],
  );
  return { workspaceId, projectId, role, addedAt: now };
}

export function removeProjectFromWorkspace(
  db: Database,
  workspaceId: string,
  projectId: string,
): void {
  db.run(
    `DELETE FROM workspace_projects WHERE workspace_id = ? AND project_id = ?`,
    [workspaceId, projectId],
  );
}

export function getProjectCounts(
  db: Database,
  workspaceId: string,
): WorkspaceProjectCounts & { defaultProjectId: string | null } {
  const row = db
    .query<{
      default_project_id: string | null;
      total: number;
      primary_count: number;
      supporting_count: number;
      dependency_count: number;
      experiment_count: number;
    }, [string]>(
      `SELECT
        MIN(CASE WHEN role = 'primary' THEN project_id END) AS default_project_id,
        COUNT(*) AS total,
        COALESCE(SUM(role = 'primary'),    0) AS primary_count,
        COALESCE(SUM(role = 'supporting'), 0) AS supporting_count,
        COALESCE(SUM(role = 'dependency'), 0) AS dependency_count,
        COALESCE(SUM(role = 'experiment'), 0) AS experiment_count
       FROM workspace_projects
       WHERE workspace_id = ?`,
    )
    .get(workspaceId);

  return {
    defaultProjectId: row?.default_project_id ?? null,
    total: row?.total ?? 0,
    primary: row?.primary_count ?? 0,
    supporting: row?.supporting_count ?? 0,
    dependency: row?.dependency_count ?? 0,
    experiment: row?.experiment_count ?? 0,
  };
}
