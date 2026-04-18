import {
  ProjectAlreadyRegisteredError,
  ProjectNotFoundError,
  type Project,
  type ProjectRegistry,
  type ProjectStatus,
} from "../state/projects.ts";

export type ProjectsDeps = {
  readonly registry: ProjectRegistry;
};

const VALID_STATUSES: ReadonlyArray<ProjectStatus> = [
  "setup_pending",
  "ready",
  "archived",
];

export async function handleProjects(
  req: Request,
  deps: ProjectsDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/projects")) return undefined;

  // /v1/projects (collection)
  if (pathname === "/v1/projects") {
    if (req.method === "GET") return listProjects(req, deps);
    if (req.method === "POST") return createProject(req, deps);
    return methodNotAllowed();
  }

  // /v1/projects/<id> or /v1/projects/<id>/purge
  const rest = pathname.slice("/v1/projects/".length);
  const [id, action] = rest.split("/", 2);
  if (!id) return notFound(pathname);

  if (!action) {
    if (req.method === "GET") return getProject(id, deps);
    if (req.method === "PATCH") return patchProject(id, req, deps);
    if (req.method === "DELETE") return archiveProject(id, deps);
    return methodNotAllowed();
  }

  if (action === "purge" && req.method === "POST") {
    return purgeProject(id, deps);
  }

  return notFound(pathname);
}

function listProjects(req: Request, deps: ProjectsDeps): Response {
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

  return json(200, {
    _v: 1,
    items: items.map(projectResponse),
    next_cursor: null,
  });
}

async function createProject(req: Request, deps: ProjectsDeps): Promise<Response> {
  const body = await parseJsonBody(req);
  if ("error" in body) return body.error;

  const absPath = typeof body.data.abs_path === "string" ? body.data.abs_path : undefined;
  if (!absPath) return badRequest("abs_path is required", {});

  const name = typeof body.data.name === "string" ? body.data.name : undefined;

  try {
    const created = deps.registry.create({ absPath, ...(name !== undefined && { name }) });
    return json(201, projectResponse(created));
  } catch (err) {
    if (err instanceof ProjectAlreadyRegisteredError) {
      return errorResponse(409, "project_already_registered", err.message, {
        abs_path: err.absPath,
      });
    }
    throw err;
  }
}

function getProject(id: string, deps: ProjectsDeps): Response {
  const p = deps.registry.get(id);
  if (!p) return errorResponse(404, "project_not_found", `project not found: ${id}`, { id });
  return json(200, projectResponse(p));
}

async function patchProject(
  id: string,
  req: Request,
  deps: ProjectsDeps,
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
    if (!updated) return badRequest("no updatable fields provided", {});
    return json(200, projectResponse(updated));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return errorResponse(404, "project_not_found", err.message, { id });
    }
    throw err;
  }
}

function archiveProject(id: string, deps: ProjectsDeps): Response {
  try {
    const archived = deps.registry.archive(id);
    return json(200, projectResponse(archived));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return errorResponse(404, "project_not_found", err.message, { id });
    }
    throw err;
  }
}

function purgeProject(id: string, deps: ProjectsDeps): Response {
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

async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  try {
    const text = await req.text();
    if (text.length === 0) return { data: {} };
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: badRequest("request body must be a JSON object", {}) };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: badRequest("invalid JSON body", {}) };
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function badRequest(message: string, details: Record<string, unknown>): Response {
  return errorResponse(400, "bad_request", message, details);
}

function notFound(path: string): Response {
  return errorResponse(404, "not_found", `No route: ${path}`, { path });
}

function methodNotAllowed(): Response {
  return errorResponse(405, "method_not_allowed", "method not allowed for this resource", {});
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({
      error: { _v: 1, code, message, details },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}
