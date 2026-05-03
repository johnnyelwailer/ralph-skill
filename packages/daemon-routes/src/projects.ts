import type { IdempotencyStore, ProjectRegistry } from "@aloop/state-sqlite";
import { jsonResponse, methodNotAllowed, notFoundResponse } from "./http-helpers.ts";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  patchProject,
  purgeProject,
} from "./projects-handlers.ts";

export type ProjectsDeps = { readonly registry: ProjectRegistry; readonly sessionsDir: string | (() => string); readonly idempotencyStore?: IdempotencyStore };

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
    if (req.method === "POST") {
      const store = deps.idempotencyStore;
      const key = store ? req.headers.get("Idempotency-Key")?.trim() : null;
      // Idempotency: return cached response for a repeated key.
      if (key) {
        const cached = store.get(key);
        if (cached) {
          return jsonResponse(200, cached.result);
        }
      }
      const response = await createProject(req, deps);
      // Cache successful creates for replay.
      if (store && key && response.status === 201) {
        const body = await response.clone().json();
        store.put(key, body, "ok");
      }
      return response;
    }
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
