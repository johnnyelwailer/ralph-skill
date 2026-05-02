import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type Project,
  type ProjectStatus,
} from "@aloop/state-sqlite";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./http-helpers.ts";
import { type Deps, projectResponse, VALID_STATUSES } from "./projects-common.ts";

export async function createProject(req: Request, deps: Deps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const absPath = typeof body.data.abs_path === "string" ? body.data.abs_path : undefined;
  if (!absPath) return badRequest("abs_path is required");

  const name = typeof body.data.name === "string" ? body.data.name : undefined;

  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  try {
    const created = deps.registry.create({ absPath, ...(name !== undefined && { name }) });
    return jsonResponse(201, projectResponse(created, sessionsDir));
  } catch (err) {
    if (err instanceof ProjectAlreadyRegisteredError) {
      return errorResponse(409, "project_already_registered", err.message, {
        abs_path: err.absPath,
      });
    }
    throw err;
  }
}

export async function patchProject(
  id: string,
  req: Request,
  deps: Deps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  try {
    let updated: Project | undefined;
    if (typeof body.data.name === "string") {
      updated = deps.registry.updateName(id, body.data.name);
    }
    if (typeof body.data.status === "string") {
      if (!VALID_STATUSES.includes(body.data.status as ProjectStatus)) {
        return badRequest(`invalid status: ${body.data.status}`, { status: body.data.status });
      }
      updated = deps.registry.updateStatus(id, body.data.status as ProjectStatus);
    }
    if (!updated) return badRequest("no updatable fields provided");
    return jsonResponse(200, projectResponse(updated, sessionsDir));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return errorResponse(404, "project_not_found", err.message, { id });
    }
    throw err;
  }
}

export function archiveProject(id: string, deps: Deps): Response {
  const sessionsDir = typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
  try {
    const archived = deps.registry.archive(id);
    return jsonResponse(200, projectResponse(archived, sessionsDir));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return errorResponse(404, "project_not_found", err.message, { id });
    }
    throw err;
  }
}

export function purgeProject(id: string, deps: Deps): Response {
  const p = deps.registry.get(id);
  if (!p) return errorResponse(404, "project_not_found", `project not found: ${id}`, { id });
  deps.registry.purge(id);
  return new Response(null, { status: 204 });
}
