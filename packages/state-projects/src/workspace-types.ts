/** Workspace domain types — the shape future state and routes depend on. */

export type WorkspaceProjectRole = "primary" | "supporting" | "dependency" | "experiment";

export type Workspace = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultBudgetUsdPerDay: number;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WorkspaceProject = {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly role: WorkspaceProjectRole;
  readonly addedAt: string;
};

export type WorkspaceProjectWithDetails = {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly role: WorkspaceProjectRole;
  readonly addedAt: string;
  readonly projectName: string;
  readonly projectAbsPath: string;
  readonly projectStatus: string;
};

export type CreateWorkspaceInput = {
  readonly name: string;
  readonly description?: string;
  readonly defaultBudgetUsdPerDay?: number;
  readonly metadata?: Record<string, unknown>;
  readonly id?: string; // optional override, mainly for tests
  readonly now?: string;
};

export type WorkspaceFilter = {
  readonly q?: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type WorkspaceWithCounts = Workspace & {
  readonly defaultProjectId: string | null;
  readonly projectCounts: WorkspaceProjectCounts;
};

export type WorkspaceProjectCounts = {
  readonly total: number;
  readonly primary: number;
  readonly supporting: number;
  readonly dependency: number;
  readonly experiment: number;
};

export class WorkspaceNotFoundError extends Error {
  readonly code = "workspace_not_found";
  constructor(readonly id: string) {
    super(`workspace not found: ${id}`);
  }
}

export class WorkspaceProjectNotFoundError extends Error {
  readonly code = "workspace_project_not_found";
  constructor(readonly workspaceId: string, readonly projectId: string) {
    super(`project ${projectId} is not a member of workspace ${workspaceId}`);
  }
}

export class DuplicateWorkspaceProjectError extends Error {
  readonly code = "duplicate_workspace_project";
  constructor(readonly workspaceId: string, readonly projectId: string) {
    super(`project ${projectId} is already a member of workspace ${workspaceId}`);
  }
}

export class ProjectNotFoundWorkspaceError extends Error {
  readonly code = "project_not_found";
  constructor(readonly projectId: string) {
    super(`project not found: ${projectId}`);
  }
}
