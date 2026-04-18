import type { ProjectRegistry } from "../state/projects.ts";
import { methodNotAllowed, notFoundResponse } from "./http-helpers.ts";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  patchProject,
  purgeProject,
} from "./projects-handlers.ts";

export type ProjectsDeps = { readonly registry: ProjectRegistry };

/**
 * Dispatcher for /v1/projects/*. Each verb routes to a focused handler in
 * projects-handlers.ts; this file owns only path matching and method gating.
 */
export async function handleProjects(
  req: Request,
  deps: ProjectsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/projects")) return undefined;

  if (pathname === "/v1/projects") {
    if (req.method === "GET") return listProjects(req, deps);
    if (req.method === "POST") return createProject(req, deps);
    return methodNotAllowed();
  }

  const rest = pathname.slice("/v1/projects/".length);
  const [id, action] = rest.split("/", 2);
  if (!id) return notFoundResponse(pathname);

  if (!action) {
    if (req.method === "GET") return getProject(id, deps);
    if (req.method === "PATCH") return patchProject(id, req, deps);
    if (req.method === "DELETE") return archiveProject(id, deps);
    return methodNotAllowed();
  }

  if (action === "purge" && req.method === "POST") {
    return purgeProject(id, deps);
  }

  return notFoundResponse(pathname);
}
