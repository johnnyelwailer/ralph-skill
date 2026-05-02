/** Project domain types — the shape future state and routes depend on. */

export type ProjectStatus = "setup_pending" | "ready" | "archived";

export type Project = {
  readonly id: string;
  readonly absPath: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly addedAt: string;
  readonly lastActiveAt: string | null;
  readonly updatedAt: string;
  readonly workspaceIds: readonly string[];
};

export type ProjectFilter = {
  readonly status?: ProjectStatus;
  readonly absPath?: string;
};

export type CreateProjectInput = {
  readonly absPath: string;
  readonly name?: string;
  readonly id?: string; // optional override, mainly for tests
  readonly now?: string;
};

export class ProjectNotFoundError extends Error {
  readonly code = "project_not_found";
  constructor(readonly id: string) {
    super(`project not found: ${id}`);
  }
}

export class ProjectAlreadyRegisteredError extends Error {
  readonly code = "project_already_registered";
  constructor(readonly absPath: string) {
    super(`project already registered at path: ${absPath}`);
  }
}
