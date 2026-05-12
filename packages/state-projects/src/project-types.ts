/** Project domain types — the shape future state and routes depend on. */

export type ProjectStatus = "setup_pending" | "ready" | "archived";

export type ProjectWorkspaceRole = "primary" | "supporting" | "dependency" | "experiment";

export type Project = {
  readonly id: string;
  readonly absPath: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly addedAt: string;
  readonly lastActiveAt: string | null;
  readonly updatedAt: string;
  /** Workspaces this project belongs to, each with a role. */
  readonly workspaceMemberships: ReadonlyArray<{
    readonly workspaceId: string;
    readonly role: ProjectWorkspaceRole;
    readonly addedAt: string;
  }>;
};

export type ProjectFilter = {
  readonly status?: ProjectStatus;
  readonly absPath?: string;
  /** Filter to projects that belong to a given workspace. */
  readonly workspaceId?: string;
  /** Case-insensitive name search (LIKE %nameSearch%). */
  readonly nameSearch?: string;
  /** Cursor for pagination — value is created_at:id of last item from previous page. */
  readonly cursor?: string;
  /** Max items to return (capped at 100 by handler). */
  readonly limit?: number;
};

export type CreateProjectInput = {
  readonly absPath: string;
  readonly name?: string;
  readonly id?: string; // optional override, mainly for tests
  readonly now?: string;
  /** Initial workspace memberships to create alongside the project. */
  readonly workspaceMemberships?: ReadonlyArray<{
    readonly workspaceId: string;
    readonly role?: ProjectWorkspaceRole;
  }>;
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
