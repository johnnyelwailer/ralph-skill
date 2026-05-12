import type { Database } from "bun:sqlite";
import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceProject,
  WorkspaceProjectCounts,
  WorkspaceProjectRole,
  WorkspaceProjectWithDetails,
  WorkspaceWithCounts,
} from "./workspace-types.ts";
import {
  addProjectToWorkspace,
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  getProjectCounts,
  getProjectRole,
  getWorkspaceById,
  listWorkspaceProjects,
  listWorkspaceProjectsWithDetails,
  listWorkspaces,
  removeProjectFromWorkspace,
  updateWorkspace,
  updateWorkspaceName,
  updateWorkspaceDescription,
} from "./workspace-queries.ts";

export class WorkspaceRegistry {
  constructor(private readonly db: Database) {}

  create(input: CreateWorkspaceInput): Workspace {
    return createWorkspace(this.db, input);
  }

  get(id: string): Workspace | undefined {
    return getWorkspaceById(this.db, id);
  }

  list(filter: WorkspaceFilter = {}): { items: WorkspaceWithCounts[]; nextCursor: string | null } {
    const items = listWorkspaces(this.db, filter);
    return { items, nextCursor: null };
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

  listProjects(workspaceId: string): WorkspaceProjectWithDetails[] {
    return listWorkspaceProjectsWithDetails(this.db, workspaceId);
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

  getProjectRole(workspaceId: string, projectId: string): WorkspaceProjectRole | null {
    return getProjectRole(this.db, workspaceId, projectId);
  }

  updateName(id: string, name: string): Workspace {
    return updateWorkspaceName(this.db, id, name);
  }

  updateDescription(id: string, description: string): Workspace {
    return updateWorkspaceDescription(this.db, id, description);
  }

  archive(id: string): Workspace {
    return archiveWorkspace(this.db, id);
  }
}
