import type { Database } from "bun:sqlite";
import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceProject,
  WorkspaceProjectCounts,
  WorkspaceProjectRole,
  WorkspaceWithCounts,
} from "./workspace-types.ts";
import {
  addProjectToWorkspace,
  createWorkspace,
  deleteWorkspace,
  getProjectCounts,
  getWorkspaceById,
  listWorkspaceProjects,
  listWorkspaces,
  removeProjectFromWorkspace,
  updateWorkspace,
} from "./workspace-queries.ts";

export class WorkspaceRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateWorkspaceInput): Workspace {
    return createWorkspace(this.db, input);
  }

  get(id: string): Workspace | undefined {
    return getWorkspaceById(this.db, id);
  }

  list(filter: WorkspaceFilter = {}): WorkspaceWithCounts[] {
    return listWorkspaces(this.db, filter);
  }

  update(
    id: string,
    patch: {
      name?: string;
      description?: string;
      defaultBudgetUsdPerDay?: number;
      metadata?: Record<string, unknown>;
    },
  ): Workspace {
    return updateWorkspace(this.db, id, patch);
  }

  delete(id: string): void {
    return deleteWorkspace(this.db, id);
  }

  listProjects(workspaceId: string): WorkspaceProject[] {
    return listWorkspaceProjects(this.db, workspaceId);
  }

  addProject(
    workspaceId: string,
    projectId: string,
    role?: WorkspaceProjectRole,
  ): WorkspaceProject {
    return addProjectToWorkspace(this.db, workspaceId, projectId, role);
  }

  removeProject(workspaceId: string, projectId: string): void {
    return removeProjectFromWorkspace(this.db, workspaceId, projectId);
  }

  getProjectCounts(
    workspaceId: string,
  ): WorkspaceProjectCounts & { defaultProjectId: string | null } {
    return getProjectCounts(this.db, workspaceId);
  }
}
