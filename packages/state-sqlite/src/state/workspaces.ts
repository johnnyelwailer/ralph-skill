import type { Database } from "bun:sqlite";
import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceProject,
  WorkspaceProjectRole,
  WorkspaceWithCounts,
} from "@aloop/state-projects";
import {
  addProjectToWorkspace,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  listWorkspaceProjects,
  listWorkspaces,
  removeProjectFromWorkspace,
  updateWorkspace,
} from "@aloop/state-projects";

export type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceProject,
  WorkspaceProjectCounts,
  WorkspaceProjectRole,
  WorkspaceWithCounts,
} from "@aloop/state-projects";

export { WorkspaceRegistry } from "@aloop/state-projects";
