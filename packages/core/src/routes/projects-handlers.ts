import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type Project,
  type ProjectRegistry,
  type ProjectStatus,
} from "../state/projects.ts";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./http-helpers.ts";

const VALID_STATUSES: ReadonlyArray<ProjectStatus> = [
  "setup_pending",
  "ready",
  "archived",
];

export type Deps = { readonly registry: ProjectRegistry };

export function listProjects(req: Request, deps: Deps): Response {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const path = url.searchParams.get("path");

  if (statusParam !== null && !VALID_STATUSES.includes(statusParam as ProjectStatus)) {
    return badRequest(`invalid status: ${statusParam}`, { statusParam });
  }

  const items = deps.registry.list({
    ...(statusParam !== null && { status: statusParam as ProjectStatus }),
    ...(path !== null && { absPath: path }),
  });

  return jsonResponse(200, {
    _v: 1,
    items: items.map(projectResponse),
    next_cursor: null,
  });
}

export async function createProject(req: Request, deps: Deps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const absPath = typeof body.data.abs_path === "string" ? body.data.abs_path : undefined;
  if (!absPath) return badRequest("abs_path is required");

  const name = typeof body.data.name === "string" ? body.data.name : undefined;

  try {
    const created = deps.registry.create({ absPath, ...(name !== undefined && { name }) });
    return jsonResponse(201, projectResponse(created));
  } catch (err) {
    if (err instanceof ProjectAlreadyRegisteredError) {
      return errorResponse(409, "project_already_registered", err.message, {
        abs_path: err.absPath,
      });
    }
    throw err;
  }
}

export function getProject(id: string, deps: Deps): Response {
  const p = deps.registry.get(id);
  if (!p) return errorResponse(404, "project_not_found", `project not found: ${id}`, { id });
  return jsonResponse(200, projectResponse(p));
}

export async function patchProject(
  id: string,
  req: Request,
  deps: Deps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;
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
    return jsonResponse(200, projectResponse(updated));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return errorResponse(404, "project_not_found", err.message, { id });
    }
    throw err;
  }
}

export function archiveProject(id: string, deps: Deps): Response {
  try {
    const archived = deps.registry.archive(id);
    return jsonResponse(200, projectResponse(archived));
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

function projectResponse(p: Project): Record<string, unknown> {
  return {
    _v: 1,
    id: p.id,
    abs_path: p.absPath,
    name: p.name,
    status: p.status,
    added_at: p.addedAt,
    last_active_at: p.lastActiveAt,
    updated_at: p.updatedAt,
  };
}
