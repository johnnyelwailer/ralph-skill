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

describe("quotaProbeFailureHttp", () => {
  test("maps auth to 401", () => {
    expect(quotaProbeFailureHttp("auth")).toEqual({ status: 401, code: "provider_auth_failed" });
  });

  test("maps rate_limit to 429", () => {
    expect(quotaProbeFailureHttp("rate_limit")).toEqual({ status: 429, code: "provider_rate_limited" });
  });

  test("maps timeout to 504", () => {
    expect(quotaProbeFailureHttp("timeout")).toEqual({ status: 504, code: "provider_probe_timeout" });
  });

  test("maps concurrent_cap to 409", () => {
    expect(quotaProbeFailureHttp("concurrent_cap")).toEqual({ status: 409, code: "provider_concurrent_cap" });
  });

  test("maps unknown to 502", () => {
    expect(quotaProbeFailureHttp("unknown")).toEqual({ status: 502, code: "quota_probe_failed" });
  });
});

describe("jsonResponse", () => {
  test("returns 200 with JSON body", async () => {
    const res = jsonResponse(200, { foo: "bar" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ foo: "bar" });
  });

  test("returns arbitrary status code", async () => {
    const res = jsonResponse(201, { created: true });
    expect(res.status).toBe(201);
  });
});

describe("errorResponse", () => {
  test("wraps error in envelope with _v: 1", async () => {
    const res = errorResponse(500, "internal_error", "something went wrong");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        _v: 1,
        code: "internal_error",
        message: "something went wrong",
        details: {},
      },
    });
  });

  test("includes details when provided", async () => {
    const res = errorResponse(400, "bad_input", "invalid field", { field: "name", reason: "too_short" });
    const body = await res.json();
    expect((body as { error: { details: Record<string, unknown> } }).error.details).toEqual({
      field: "name",
      reason: "too_short",
    });
  });
});

describe("badRequest", () => {
  test("returns 400 with bad_request code", async () => {
    const res = badRequest("session_id is required");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect((body as { error: { code: string } }).error.code).toBe("bad_request");
  });
});

describe("notFoundResponse", () => {
  test("returns 404 with not_found code and pathname in message", async () => {
    const res = notFoundResponse("/v1/providers/claude/quota");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect((body as { error: { code: string; message: string } }).error.code).toBe("not_found");
    expect((body as { error: { code: string; message: string } }).error.message).toContain("/v1/providers/claude/quota");
  });
});

describe("methodNotAllowed", () => {
  test("returns 405 with method_not_allowed code", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect((body as { error: { code: string } }).error.code).toBe("method_not_allowed");
  });
});

describe("parseJsonBody", () => {
  test("parses valid JSON object body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ session_id: "sess_123", provider_chain: ["opencode"] }),
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: { session_id: "sess_123", provider_chain: ["opencode"] } });
  });

  test("accepts empty body as empty data object", async () => {
    const req = new Request("http://x", { method: "POST", body: "" });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: {} });
  });

  test("returns error for non-object JSON (array)", async () => {
    const req = new Request("http://x", { method: "POST", body: "[\"opencode\"]" });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ error: expect.any(Response) });
    const err = (result as { error: Response }).error;
    expect(err.status).toBe(400);
  });

  test("returns error for non-object JSON (primitive)", async () => {
    const req = new Request("http://x", { method: "POST", body: "42" });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ error: expect.any(Response) });
    const err = (result as { error: Response }).error;
    expect(err.status).toBe(400);
  });

  test("returns error for invalid JSON", async () => {
    const req = new Request("http://x", { method: "POST", body: "not valid json {{{" });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ error: expect.any(Response) });
    const err = (result as { error: Response }).error;
    expect(err.status).toBe(400);
  });

  test("returns error when body throws on text() access", async () => {
    const req = new Request("http://x", {
      method: "POST",
      // @ts-expect-error – intentionally broken body for test
      body: {
        async text() {
          throw new Error("read error");
        },
      },
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ error: expect.any(Response) });
    const err = (result as { error: Response }).error;
    expect(err.status).toBe(400);
  });
});
