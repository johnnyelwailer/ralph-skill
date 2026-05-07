import type { ProjectStatus } from "@aloop/state-sqlite";
import {
  badRequest,
  errorResponse,
  jsonResponse,
} from "./http-helpers.ts";
import { type Deps, projectResponse, VALID_STATUSES } from "./projects-common.ts";

export type { Deps } from "./projects-common.ts";
export {
  archiveProject,
  createProject,
  patchProject,
  purgeProject,
} from "./projects-write.ts";

export function listProjects(req: Request, deps: Deps): Response {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const path = url.searchParams.get("path");
  const workspaceId = url.searchParams.get("workspace_id");
  const q = url.searchParams.get("q");
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;

  if (statusParam !== null && !VALID_STATUSES.includes(statusParam as ProjectStatus)) {
    return badRequest(`invalid status: ${statusParam}`, { statusParam });
  }

  const limit = limitParam !== null ? Math.floor(Number(limitParam)) : undefined;
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return badRequest(`invalid limit: ${limitParam}`, { limit: limitParam });
  }

  const { items, nextCursor } = deps.registry.list({
    ...(statusParam !== null && { status: statusParam as ProjectStatus }),
    ...(path !== null && { absPath: path }),
    ...(workspaceId !== null && { workspaceId }),
    ...(q !== null && { q }),
    ...(limit !== undefined && { limit }),
    ...(cursor !== null && { cursor }),
  });

  return jsonResponse(200, {
    _v: 1,
    items: items.map((p) => projectResponse(p, sessionsDir)),
    next_cursor: nextCursor,
  });
}

export function getProject(id: string, deps: Deps): Response {
  const p = deps.registry.get(id);
  if (!p) return errorResponse(404, "project_not_found", `project not found: ${id}`, { id });
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  return jsonResponse(200, projectResponse(p, sessionsDir));
}
