import type { ProjectRegistry, WorkspaceProjectRole, WorkspaceRegistry } from "@aloop/state-sqlite";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "./http-helpers.ts";
import { countWorkspaceProjects } from "./projects-common.ts";

export type WorkspacesDeps = {
  readonly workspaceRegistry: WorkspaceRegistry;
  readonly projectRegistry: ProjectRegistry;
  readonly sessionsDir: string | (() => string);
};

function workspaceResponse(w: { id: string; name: string; description: string; defaultProjectId: string | null; metadata: Readonly<Record<string, unknown>>; createdAt: string; updatedAt: string; archivedAt: string | null }, projectCounts?: { total: number; by_status: Record<string, number> }): Record<string, unknown> {
  return {
    _v: 1,
    id: w.id,
    name: w.name,
    description: w.description,
    default_project_id: w.defaultProjectId,
    metadata: w.metadata,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
    archived_at: w.archivedAt,
    ...(projectCounts !== undefined && { project_counts: projectCounts }),
  };
}

function workspaceProjectResponse(wp: { projectId: string; role: WorkspaceProjectRole; addedAt: string; projectName: string; projectAbsPath: string; projectStatus: string }): Record<string, unknown> {
  return {
    _v: 1,
    project_id: wp.projectId,
    role: wp.role,
    added_at: wp.addedAt,
    project_name: wp.projectName,
    project_abs_path: wp.projectAbsPath,
    project_status: wp.projectStatus,
  };
}

const VALID_ROLES: readonly WorkspaceProjectRole[] = ["primary", "supporting", "dependency", "experiment"];

export async function handleWorkspaces(
  req: Request,
  deps: WorkspacesDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/workspaces")) return undefined;

  if (pathname === "/v1/workspaces") {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const archivedParam = url.searchParams.get("archived");
      const includeArchived = archivedParam === "true";
      const q = url.searchParams.get("q");
      const limitParam = url.searchParams.get("limit");
      const cursor = url.searchParams.get("cursor");

      const limit = limitParam !== null ? Math.floor(Number(limitParam)) : undefined;
      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return badRequest(`invalid limit: ${limitParam}`, { limit: limitParam });
      }

      const { items, nextCursor } = deps.workspaceRegistry.list({
        ...(includeArchived && { archived: true }),
        ...(q !== null && { q }),
        ...(limit !== undefined && { limit }),
        ...(cursor !== null && { cursor }),
      });

      const enriched = items.map((w) => {
        const projects = deps.workspaceRegistry.listProjects(w.id);
        const projectCounts = countWorkspaceProjects(projects);
        return workspaceResponse(w, projectCounts);
      });
      return jsonResponse(200, { _v: 1, items: enriched, next_cursor: nextCursor });
    }
    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      if ("error" in body) return body.error;

      const name = typeof body.data.name === "string" ? body.data.name.trim() : undefined;
      if (!name) return badRequest("name is required");

      const description = typeof body.data.description === "string" ? body.data.description : undefined;
      const defaultProjectId = body.data.default_project_id === null ? null : (typeof body.data.default_project_id === "string" ? body.data.default_project_id : undefined);
      const metadata = typeof body.data.metadata === "object" && body.data.metadata !== null ? body.data.metadata as Record<string, unknown> : undefined;

      const created = deps.workspaceRegistry.create({
        name,
        ...(description !== undefined && { description }),
        ...(defaultProjectId !== undefined && { defaultProjectId }),
        ...(metadata !== undefined && { metadata }),
      });
      return jsonResponse(201, workspaceResponse(created));
    }
    return methodNotAllowed();
  }

  const rest = pathname.slice("/v1/workspaces/".length);
  const [id, action] = rest.split("/", 2);
  if (!id) return notFoundResponse(pathname);

    if (!action) {
    if (req.method === "GET") {
      const w = deps.workspaceRegistry.get(id);
      if (!w) return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
      const projects = deps.workspaceRegistry.listProjects(id);
      const projectCounts = countWorkspaceProjects(projects);
      return jsonResponse(200, workspaceResponse(w, projectCounts));
    }
    if (req.method === "PATCH") {
      const body = await parseJsonBody(req);
      if ("error" in body) return body.error;

      let updated;
      if (typeof body.data.name === "string") {
        try {
          updated = deps.workspaceRegistry.updateName(id, body.data.name);
        } catch (err: unknown) {
          if ((err as { code?: string }).code === "workspace_not_found") {
            return errorResponse(404, "workspace_not_found", (err as Error).message, { id });
          }
          throw err;
        }
      }
      if (typeof body.data.description === "string") {
        try {
          updated = deps.workspaceRegistry.updateDescription(id, body.data.description);
        } catch (err: unknown) {
          if ((err as { code?: string }).code === "workspace_not_found") {
            return errorResponse(404, "workspace_not_found", (err as Error).message, { id });
          }
          throw err;
        }
      }
      if (!updated) return badRequest("no updatable fields provided");
      return jsonResponse(200, workspaceResponse(updated));
    }
    if (req.method === "DELETE") {
      try {
        const archived = deps.workspaceRegistry.archive(id);
        return jsonResponse(200, workspaceResponse(archived));
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "workspace_not_found") {
          return errorResponse(404, "workspace_not_found", (err as Error).message, { id });
        }
        throw err;
      }
    }
    return methodNotAllowed();
  }

  if (action === "projects") {
    if (req.method === "GET") {
      const w = deps.workspaceRegistry.get(id);
      if (!w) return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });
      const projects = deps.workspaceRegistry.listProjects(id);
      return jsonResponse(200, { _v: 1, items: projects.map(workspaceProjectResponse), next_cursor: null });
    }
    if (req.method === "POST") {
      const w = deps.workspaceRegistry.get(id);
      if (!w) return errorResponse(404, "workspace_not_found", `workspace not found: ${id}`, { id });

      const body = await parseJsonBody(req);
      if ("error" in body) return body.error;

      const projectId = typeof body.data.project_id === "string" ? body.data.project_id : undefined;
      if (!projectId) return badRequest("project_id is required");

      const role = typeof body.data.role === "string" ? body.data.role as WorkspaceProjectRole : undefined;
      if (!role || !VALID_ROLES.includes(role)) {
        return badRequest(`role must be one of: ${VALID_ROLES.join(", ")}`);
      }

      const project = deps.projectRegistry.get(projectId);
      if (!project) return errorResponse(404, "project_not_found", `project not found: ${projectId}`, { project_id: projectId });

      deps.workspaceRegistry.addProject(id, projectId, role);
      return new Response(null, { status: 201 });
    }
    if (req.method === "DELETE") {
      const projectId = rest.split("/")[2];
      if (!projectId) return notFoundResponse(pathname);
      deps.workspaceRegistry.removeProject(id, projectId);
      return new Response(null, { status: 204 });
    }
    return methodNotAllowed();
  }

  if (action.startsWith("projects/")) {
    const projectId = action.slice("projects/".length);
    if (!projectId) return notFoundResponse(pathname);

    if (req.method === "DELETE") {
      deps.workspaceRegistry.removeProject(id, projectId);
      return new Response(null, { status: 204 });
    }
    return methodNotAllowed();
  }

  return notFoundResponse(pathname);
}