import type { Database } from "bun:sqlite";
import {
  DuplicateWorkspaceProjectError,
  ProjectNotFoundWorkspaceError,
  type CreateWorkspaceInput,
  type Workspace,
  type WorkspaceProject,
  type WorkspaceProjectRole,
  type WorkspaceWithCounts,
} from "@aloop/state-projects";
import {
  addProjectToWorkspace,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  listWorkspaceProjects,
  removeProjectFromWorkspace,
  updateWorkspace,
} from "@aloop/state-projects";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  parseJsonBody,
} from "./http-helpers.ts";
import { type Deps, parseWorkspaceFilter, VALID_ROLES, workspaceResponse } from "./workspaces-common.ts";

export { type Deps } from "./workspaces-common.ts";

/** POST /v1/workspaces */
export async function createWorkspaceHandler(
  req: Request,
  deps: Deps,
): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const name = typeof body.data.name === "string" && body.data.name.length > 0
    ? body.data.name
    : undefined;
  if (!name) return badRequest("name is required");

  const description =
    typeof body.data.description === "string" ? body.data.description : undefined;

  const defaultBudgetUsdPerDay =
    typeof body.data.default_budget_usd_per_day === "number"
      ? body.data.default_budget_usd_per_day
      : undefined;

  const metadata =
    typeof body.data.metadata === "object" && body.data.metadata !== null
      ? (body.data.metadata as Record<string, unknown>)
      : undefined;

  const input: CreateWorkspaceInput = {
    name,
    ...(description !== undefined && { description }),
    ...(defaultBudgetUsdPerDay !== undefined && { defaultBudgetUsdPerDay }),
    ...(metadata !== undefined && { metadata }),
  };

  const created = createWorkspace(deps.registry, input);
  return jsonResponse(201, workspaceResponse({ ...created, projectCounts: { total: 0, primary: 0, supporting: 0, dependency: 0, experiment: 0 }, defaultProjectId: null }));
}

/** PATCH /v1/workspaces/:id */
export async function patchWorkspaceHandler(
  id: string,
  req: Request,
  deps: Deps,
): Promise<Response> {
  const existing = getWorkspaceById(deps.registry, id);
  if (!existing) {
    return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
  }

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const name =
    typeof body.data.name === "string" && body.data.name.length > 0
      ? body.data.name
      : undefined;
  const description =
    typeof body.data.description === "string" ? body.data.description : undefined;
  const defaultBudgetUsdPerDay =
    typeof body.data.default_budget_usd_per_day === "number"
      ? body.data.default_budget_usd_per_day
      : undefined;
  const metadata =
    typeof body.data.metadata === "object" && body.data.metadata !== null
      ? (body.data.metadata as Record<string, unknown>)
      : undefined;

  if (name === undefined && description === undefined && defaultBudgetUsdPerDay === undefined && metadata === undefined) {
    return badRequest("no updatable fields provided");
  }

  const updated = updateWorkspace(deps.registry, id, {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(defaultBudgetUsdPerDay !== undefined && { defaultBudgetUsdPerDay }),
    ...(metadata !== undefined && { metadata }),
  });

  const counts = deps.registry.getProjectCounts(id);
  return jsonResponse(200, workspaceResponse({ ...updated, defaultProjectId: counts.defaultProjectId, projectCounts: counts }));
}

/** DELETE /v1/workspaces/:id */
export function deleteWorkspaceHandler(
  id: string,
  deps: Deps,
): Response {
  const existing = getWorkspaceById(deps.registry, id);
  if (!existing) {
    return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
  }
  deleteWorkspace(deps.registry, id);
  return new Response(null, { status: 204 });
}

/** GET /v1/workspaces/:id/projects */
export function listWorkspaceProjectsHandler(
  id: string,
  deps: Deps,
): Response {
  const existing = getWorkspaceById(deps.registry, id);
  if (!existing) {
    return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
  }

  const projects = listWorkspaceProjects(deps.registry, id);
  return jsonResponse(200, {
    _v: 1,
    items: projects.map((p) => ({
      project_id: p.projectId,
      workspace_id: p.workspaceId,
      role: p.role,
      added_at: p.addedAt,
    })),
  });
}

/** POST /v1/workspaces/:id/projects */
export async function addProjectToWorkspaceHandler(
  id: string,
  req: Request,
  deps: Deps,
): Promise<Response> {
  const existing = getWorkspaceById(deps.registry, id);
  if (!existing) {
    return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
  }

  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const projectId =
    typeof body.data.project_id === "string" && body.data.project_id.length > 0
      ? body.data.project_id
      : undefined;
  if (!projectId) return badRequest("project_id is required");

  const roleRaw = body.data.role;
  if (roleRaw !== undefined && !VALID_ROLES.includes(roleRaw as WorkspaceProjectRole)) {
    return badRequest(`invalid role: ${roleRaw}`, { valid: [...VALID_ROLES] });
  }
  const role = (roleRaw as WorkspaceProjectRole) ?? "supporting";

  try {
    addProjectToWorkspace(deps.registry, id, projectId, role);
  } catch (err) {
    if (err instanceof DuplicateWorkspaceProjectError) {
      return errorResponse(409, "duplicate_workspace_project", err.message, {
        workspace_id: id,
        project_id: projectId,
      });
    }
    if (err instanceof ProjectNotFoundWorkspaceError) {
      return errorResponse(404, "project_not_found", err.message, { project_id: projectId });
    }
    throw err;
  }

  const projects = listWorkspaceProjects(deps.registry, id);
  const added = projects.find((p) => p.projectId === projectId)!;
  return jsonResponse(201, {
    _v: 1,
    project_id: added.projectId,
    workspace_id: added.workspaceId,
    role: added.role,
    added_at: added.addedAt,
  });
}

/** DELETE /v1/workspaces/:id/projects/:projectId */
export function removeProjectFromWorkspaceHandler(
  id: string,
  projectId: string,
  deps: Deps,
): Response {
  const workspace = getWorkspaceById(deps.registry, id);
  if (!workspace) {
    return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
  }

  const projects = listWorkspaceProjects(deps.registry, id);
  const found = projects.find((p) => p.projectId === projectId);
  if (!found) {
    return errorResponse(404, "workspace_project_not_found",
      `project ${projectId} is not a member of workspace ${id}`,
      { workspace_id: id, project_id: projectId });
  }

  removeProjectFromWorkspace(deps.registry, id, projectId);
  return new Response(null, { status: 204 });
}
