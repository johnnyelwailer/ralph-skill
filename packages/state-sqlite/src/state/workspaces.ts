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
} from "@aloop/state-projects";
import {
  WorkspaceRegistry,
  WorkspaceNotFoundError,
} from "@aloop/state-projects";

export type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceFilter,
  WorkspaceProject,
  WorkspaceProjectCounts,
  WorkspaceProjectRole,
  WorkspaceProjectWithDetails,
  WorkspaceWithCounts,
};

export { WorkspaceRegistry, WorkspaceNotFoundError };
