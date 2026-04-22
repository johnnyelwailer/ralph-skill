import type { ProviderFailureClass } from "@aloop/provider";

type QuotaProbeFailureHttp = {
  status: number;
  code: string;
};

export function quotaProbeFailureHttp(classification: ProviderFailureClass): QuotaProbeFailureHttp {
  switch (classification) {
    case "auth":
      return { status: 401, code: "provider_auth_failed" };
    case "rate_limit":
      return { status: 429, code: "provider_rate_limited" };
    case "timeout":
      return { status: 504, code: "provider_probe_timeout" };
    case "concurrent_cap":
      return { status: 409, code: "provider_concurrent_cap" };
    case "unknown":
      return { status: 502, code: "quota_probe_failed" };
  }
}

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
  return jsonResponse(status, { error: { _v: 1, code, message, details } });
}

export function badRequest(message: string, details: Record<string, unknown> = {}): Response {
  return errorResponse(400, "bad_request", message, details);
}

export function notFoundResponse(pathname: string): Response {
  return errorResponse(404, "not_found", `No route: ${pathname}`);
}

export function methodNotAllowed(): Response {
  return errorResponse(405, "method_not_allowed", "method not allowed");
}

export async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return { error: badRequest("request body must be valid UTF-8 text") };
  }
  if (raw.length === 0) return { data: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: badRequest("request body must be valid JSON") };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: badRequest("request body must be a JSON object") };
  }
  return { data: parsed as Record<string, unknown> };
}
