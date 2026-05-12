import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type Project,
  type ProjectStatus,
} from "@aloop/state-sqlite";
import type { ProjectWorkspaceRole } from "@aloop/state-projects";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./http-helpers.ts";
import { type Deps, projectResponse, VALID_STATUSES } from "./projects-common.ts";

const VALID_WORKSPACE_ROLES: readonly ProjectWorkspaceRole[] = [
  "primary",
  "supporting",
  "dependency",
  "experiment",
];

export async function createProject(req: Request, deps: Deps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const absPath = typeof body.data.abs_path === "string" ? body.data.abs_path : undefined;
  if (!absPath) return badRequest("abs_path is required");

  const name = typeof body.data.name === "string" ? body.data.name : undefined;

  // Parse optional workspace_ids
  let workspaceMemberships: { workspaceId: string; role: ProjectWorkspaceRole }[] | undefined;
  if (body.data.workspace_ids !== undefined) {
    if (!Array.isArray(body.data.workspace_ids)) {
      return badRequest("workspace_ids must be an array");
    }
    workspaceMemberships = [];
    for (const item of body.data.workspace_ids) {
      if (typeof item !== "object" || item === null) {
        return badRequest("each workspace_ids entry must be an object");
      }
      const obj = item as Record<string, unknown>;
      const workspaceId =
        typeof obj.workspace_id === "string" && obj.workspace_id.length > 0
          ? obj.workspace_id
          : undefined;
      if (!workspaceId) return badRequest("workspace_id is required in each workspace_ids entry");
      const roleRaw = obj.role;
      const role: ProjectWorkspaceRole =
        typeof roleRaw === "string" && VALID_WORKSPACE_ROLES.includes(roleRaw as ProjectWorkspaceRole)
          ? (roleRaw as ProjectWorkspaceRole)
          : "supporting";
      workspaceMemberships.push({ workspaceId, role });
    }
  }

  try {
    const created = deps.registry.create({
      absPath,
      ...(name !== undefined && { name }),
      ...(workspaceMemberships !== undefined && { workspaceMemberships }),
    });
    return jsonResponse(201, projectResponse(created, getSessionsDir(deps)));
  } catch (err) {
    if (err instanceof ProjectAlreadyRegisteredError) {
      return errorResponse(409, "project_already_registered", err.message, {
        abs_path: err.absPath,
      });
    }
    throw err;
  }
}

function getSessionsDir(deps: Deps): string {
  return typeof deps.sessionsDir === "function" ? deps.sessionsDir() : deps.sessionsDir;
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
    return jsonResponse(200, projectResponse(updated, getSessionsDir(deps)));
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
    return jsonResponse(200, projectResponse(archived, getSessionsDir(deps)));
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
