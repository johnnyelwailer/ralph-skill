/** Shared HTTP response helpers used by route modules.
 *
 * Every body emitted carries the v1 envelope shape per api.md:
 *   - Success: resource JSON directly
 *   - Error:   { error: { _v: 1, code, message, details } }
 */

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): Response {
  return jsonResponse(status, {
    error: { _v: 1, code, message, details },
  });
}

export function badRequest(
  message: string,
  details: Record<string, unknown> = {},
): Response {
  return errorResponse(400, "bad_request", message, details);
}

export function notFoundResponse(path: string): Response {
  return errorResponse(404, "not_found", `No route: ${path}`, { path });
}

export function methodNotAllowed(): Response {
  return errorResponse(405, "method_not_allowed", "method not allowed for this resource");
}

/**
 * Parse a JSON request body. Returns either { data } or { error } where
 * error is a ready-to-return Response.
 */
export async function parseJsonBody(
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
