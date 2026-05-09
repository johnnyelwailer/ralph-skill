import type { WorkspaceRegistry } from "@aloop/state-sqlite";
import { methodNotAllowed, notFoundResponse } from "./http-helpers.ts";
import {
  addProjectToWorkspaceHandler,
  createWorkspaceHandler,
  deleteWorkspaceHandler,
  getWorkspaceHandler,
  listWorkspaceProjectsHandler,
  listWorkspacesHandler,
  patchWorkspaceHandler,
  removeProjectFromWorkspaceHandler,
} from "./workspaces-handlers.ts";

export type WorkspacesDeps = { readonly registry: WorkspaceRegistry };

/**
 * Dispatcher for /v1/workspaces/*. Each verb routes to a focused handler in
 * workspaces-handlers.ts; this file owns only path matching and method gating.
 */
export async function handleWorkspaces(
  req: Request,
  deps: WorkspacesDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/workspaces")) return undefined;

  // GET /v1/workspaces
  if (pathname === "/v1/workspaces") {
    if (req.method === "GET") return listWorkspacesHandler(req, deps);
    if (req.method === "POST") return createWorkspaceHandler(req, deps);
    return methodNotAllowed();
  }

  // /v1/workspaces/:id[/...]
  const rest = pathname.slice("/v1/workspaces/".length);
  const segments = rest.split("/");
  const id = segments[0]!;

  if (segments.length === 1) {
    // /v1/workspaces/:id
    if (req.method === "GET") return getWorkspaceHandler(id, deps);
    if (req.method === "PATCH") return patchWorkspaceHandler(id, req, deps);
    if (req.method === "DELETE") return deleteWorkspaceHandler(id, deps);
    return methodNotAllowed();
  }

  const action = segments[1]!;

  // /v1/workspaces/:id/projects
  if (action === "projects" && segments.length === 2) {
    if (req.method === "GET") return listWorkspaceProjectsHandler(id, deps);
    if (req.method === "POST") return addProjectToWorkspaceHandler(id, req, deps);
    return methodNotAllowed();
  }

  // /v1/workspaces/:id/projects/:projectId
  if (action === "projects" && segments.length === 3) {
    const projectId = segments[2]!;
    if (req.method === "DELETE") {
      return removeProjectFromWorkspaceHandler(id, projectId, deps);
    }
    return methodNotAllowed();
  }

  return notFoundResponse(pathname);
}
