import type { SchedulerService } from "@aloop/scheduler";

export type SchedulerDeps = {
  readonly scheduler: SchedulerService;
};

export async function handleScheduler(
  req: Request,
  deps: SchedulerDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname === "/v1/scheduler/limits") {
    if (req.method === "GET") {
      return jsonResponse(200, { _v: 1, ...deps.scheduler.currentLimits() });
    }
    if (req.method !== "PUT") return methodNotAllowed();

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;

    const updated = await deps.scheduler.updateLimits(parsed.data);
    if (!updated.ok) return badRequest("invalid scheduler limits", { errors: updated.errors });
    return jsonResponse(200, { _v: 1, ...updated.limits });
  }

  if (pathname === "/v1/scheduler/permits") {
    if (req.method === "GET") {
      return jsonResponse(200, { items: deps.scheduler.listPermits() });
    }
    if (req.method !== "POST") return methodNotAllowed();

    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;

    const sessionId = asNonEmptyString(parsed.data.session_id);
    const providerCandidate = asNonEmptyString(parsed.data.provider_candidate);
    const ttlSeconds = asPositiveInt(parsed.data.ttl_seconds);
    const estimatedCostUsd = asNonNegativeFloat(parsed.data.estimated_cost_usd);
    if (!sessionId) return badRequest("session_id is required");
    if (!providerCandidate) return badRequest("provider_candidate is required");
    if (ttlSeconds === "invalid") return badRequest("ttl_seconds must be a positive integer");
    if (estimatedCostUsd === "invalid") return badRequest("estimated_cost_usd must be a non-negative number");

    const decision = await deps.scheduler.acquirePermit({
      sessionId,
      providerCandidate,
      ...(typeof ttlSeconds === "number" ? { ttlSeconds } : {}),
      ...(typeof estimatedCostUsd === "number" ? { estimatedCostUsd } : {}),
    });
    if (!decision.granted) return jsonResponse(200, { _v: 1, ...decision });
    return jsonResponse(200, { _v: 1, granted: true, permit: decision.permit });
  }

  if (!pathname.startsWith("/v1/scheduler/permits/")) return undefined;
  if (req.method !== "DELETE") return methodNotAllowed();

  const id = pathname.slice("/v1/scheduler/permits/".length);
  if (id.length === 0) return notFoundResponse(pathname);
  const released = await deps.scheduler.releasePermit(id);
  if (!released) return notFoundResponse(pathname);
  return new Response(null, { status: 204 });
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asPositiveInt(value: unknown): number | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return "invalid";
  return value;
}

function asNonNegativeFloat(value: unknown): number | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value) || value < 0) return "invalid";
  return value;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  return jsonResponse(status, {
    error: { _v: 1, code, message, details },
  });
}

function badRequest(message: string, details: Record<string, unknown> = {}): Response {
  return errorResponse(400, "bad_request", message, details);
}

function notFoundResponse(path: string): Response {
  return errorResponse(404, "not_found", `No route: ${path}`, { path });
}

function methodNotAllowed(): Response {
  return errorResponse(405, "method_not_allowed", "method not allowed for this resource");
}

async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  try {
    const text = await req.text();
    if (text.length === 0) return { data: {} };
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: badRequest("request body must be a JSON object") };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: badRequest("invalid JSON body") };
  }
}
