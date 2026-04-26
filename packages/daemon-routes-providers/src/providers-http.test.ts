import { describe, expect, test } from "bun:test";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
  quotaProbeFailureHttp,
} from "./providers-http.ts";

// ─── quotaProbeFailureHttp ────────────────────────────────────────────────────

describe("quotaProbeFailureHttp", () => {
  test("maps 'auth' to 401 with provider_auth_failed code", () => {
    const result = quotaProbeFailureHttp("auth");
    expect(result.status).toBe(401);
    expect(result.code).toBe("provider_auth_failed");
  });

  test("maps 'rate_limit' to 429 with provider_rate_limited code", () => {
    const result = quotaProbeFailureHttp("rate_limit");
    expect(result.status).toBe(429);
    expect(result.code).toBe("provider_rate_limited");
  });

  test("maps 'timeout' to 504 with provider_probe_timeout code", () => {
    const result = quotaProbeFailureHttp("timeout");
    expect(result.status).toBe(504);
    expect(result.code).toBe("provider_probe_timeout");
  });

  test("maps 'concurrent_cap' to 409 with provider_concurrent_cap code", () => {
    const result = quotaProbeFailureHttp("concurrent_cap");
    expect(result.status).toBe(409);
    expect(result.code).toBe("provider_concurrent_cap");
  });

  test("maps 'unknown' to 502 with quota_probe_failed code", () => {
    const result = quotaProbeFailureHttp("unknown");
    expect(result.status).toBe(502);
    expect(result.code).toBe("quota_probe_failed");
  });
});

// ─── jsonResponse ────────────────────────────────────────────────────────────

describe("jsonResponse", () => {
  test("returns Response with application/json content-type", async () => {
    const res = jsonResponse(200, { foo: "bar" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({ foo: "bar" });
  });

  test("can create 201 Created response", async () => {
    const res = jsonResponse(201, { id: "123" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: "123" });
  });

  test("serialises null body correctly", async () => {
    const res = jsonResponse(204, null);
    expect(res.status).toBe(204);
    const body = await res.text();
    expect(body).toBe("null");
  });

  test("serialises array body correctly", async () => {
    const res = jsonResponse(200, [1, 2, 3]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });

  test("serialises nested object body correctly", async () => {
    const res = jsonResponse(200, { nested: { value: true }, arr: [] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nested: { value: true }, arr: [] });
  });
});

// ─── errorResponse ───────────────────────────────────────────────────────────

describe("errorResponse", () => {
  test("returns Response with the given code and message", async () => {
    const res = errorResponse(500, "internal_error", "Something went wrong");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json() as {
      error: { _v: number; code: string; message: string; details: Record<string, unknown> };
    };
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("Something went wrong");
  });

  test("includes details when provided with non-empty object", async () => {
    const res = errorResponse(400, "bad_input", "Invalid id", { id: "must be a string" });
    const body = await res.json() as {
      error: { details: Record<string, unknown> };
    };
    expect(body.error.details).toEqual({ id: "must be a string" });
  });

  test("includes empty details object when empty object is passed", async () => {
    // errorResponse always spreads details, so {} is included as "details: {}"
    const res = errorResponse(404, "not_found", "Not here", {});
    const body = await res.json() as {
      error: { details: Record<string, unknown> };
    };
    expect(body.error.details).toEqual({});
  });

  test("can create 503 Service Unavailable response", async () => {
    const res = errorResponse(503, "service_unavailable", "Provider is down");
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("service_unavailable");
  });
});

// ─── badRequest ──────────────────────────────────────────────────────────────

describe("badRequest", () => {
  test("returns 400 with bad_request code", async () => {
    const res = badRequest("missing field");
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("missing field");
  });

  test("includes details when provided", async () => {
    const res = badRequest("invalid value", { field: "count", reason: "must be positive" });
    const body = await res.json() as { error: { details: Record<string, unknown> } };
    expect(body.error.details).toEqual({ field: "count", reason: "must be positive" });
  });

  test("includes _v: 1 in error envelope", async () => {
    const res = badRequest("test");
    const body = await res.json() as { error: { _v: number } };
    expect(body.error._v).toBe(1);
  });

  test("includes empty details object when omitted (uses default {})", async () => {
    // badRequest calls errorResponse which always includes details
    const res = badRequest("no details");
    const body = await res.json() as { error: { details: Record<string, unknown> } };
    expect(body.error.details).toEqual({});
  });
});

// ─── notFoundResponse ───────────────────────────────────────────────────────

describe("notFoundResponse", () => {
  test("returns 404 with not_found code and pathname in message", async () => {
    const res = notFoundResponse("/v1/providers/abc");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/providers/abc");
  });

  test("error envelope has _v: 1", async () => {
    const res = notFoundResponse("/v1/scheduler/permits");
    const body = await res.json() as { error: { _v: number } };
    expect(body.error._v).toBe(1);
  });
});

// ─── methodNotAllowed ───────────────────────────────────────────────────────

describe("methodNotAllowed", () => {
  test("returns 405 with method_not_allowed code", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    const body = await res.json() as { error: { _v: number; code: string } };
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("message describes the restriction", async () => {
    const res = methodNotAllowed();
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toBe("method not allowed");
  });
});

// ─── parseJsonBody ───────────────────────────────────────────────────────────

describe("parseJsonBody", () => {
  async function parseOk(body: unknown): Promise<ReturnType<typeof parseJsonBody>> {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseJsonBody(req);
  }

  function assertError(
    result: ReturnType<typeof parseJsonBody>,
  ): Response {
    expect(result).toBeInstanceOf(Object);
    expect("error" in result).toBe(true);
    const res = result.error;
    expect(res).toBeInstanceOf(Response);
    return res;
  }

  test("returns data for a valid JSON object body", async () => {
    const result = await parseOk({ foo: "bar", count: 42 });
    expect(result).toEqual({ data: { foo: "bar", count: 42 } });
  });

  test("returns data for an empty object", async () => {
    const result = await parseOk({});
    expect(result).toEqual({ data: {} });
  });

  test("returns data for empty string body (treated as empty object)", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: {} });
  });

  test("returns error for a non-object JSON (array)", async () => {
    const result = await parseOk([1, 2, 3]);
    const res = assertError(result);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns error for a JSON null", async () => {
    const result = await parseOk(null);
    const res = assertError(result);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns error for a JSON string", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify("just a string"),
    });
    const result = await parseJsonBody(req);
    const res = assertError(result);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns error for a JSON number", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify(42),
    });
    const result = await parseJsonBody(req);
    const res = assertError(result);
    expect(res.status).toBe(400);
  });

  test("returns error for invalid JSON syntax", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "{not valid json",
    });
    const result = await parseJsonBody(req);
    const res = assertError(result);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be valid JSON");
  });

  test("returns error for non-UTF-8 request body (text() throws)", async () => {
    const badReq = new Request("http://x", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("simulated read failure"));
        },
      }),
    });
    const result = await parseJsonBody(badReq);
    const res = assertError(result);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be valid UTF-8 text");
  });

  test("nested object parses correctly", async () => {
    const result = await parseOk({ outer: { inner: { deep: true } }, arr: [{}] });
    expect(result).toEqual({
      data: { outer: { inner: { deep: true } }, arr: [{}] },
    });
  });

  test("error Response from bad JSON has _v: 1 envelope", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "not json",
    });
    const result = await parseJsonBody(req);
    const res = assertError(result);
    const body = await res.json() as { error: { _v: number } };
    expect(body.error._v).toBe(1);
  });
});
