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
  test("maps auth → 401 provider_auth_failed", () => {
    const r = quotaProbeFailureHttp("auth");
    expect(r.status).toBe(401);
    expect(r.code).toBe("provider_auth_failed");
  });

  test("maps rate_limit → 429 provider_rate_limited", () => {
    const r = quotaProbeFailureHttp("rate_limit");
    expect(r.status).toBe(429);
    expect(r.code).toBe("provider_rate_limited");
  });

  test("maps timeout → 504 provider_probe_timeout", () => {
    const r = quotaProbeFailureHttp("timeout");
    expect(r.status).toBe(504);
    expect(r.code).toBe("provider_probe_timeout");
  });

  test("maps concurrent_cap → 409 provider_concurrent_cap", () => {
    const r = quotaProbeFailureHttp("concurrent_cap");
    expect(r.status).toBe(409);
    expect(r.code).toBe("provider_concurrent_cap");
  });

  test("maps unknown → 502 quota_probe_failed", () => {
    const r = quotaProbeFailureHttp("unknown");
    expect(r.status).toBe(502);
    expect(r.code).toBe("quota_probe_failed");
  });
});

describe("jsonResponse", () => {
  test("returns Response with status and JSON body", async () => {
    const r = jsonResponse(200, { ok: true });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(await r.json()).toEqual({ ok: true });
  });

  test("serialises null body", async () => {
    const r = jsonResponse(204, null);
    expect(r.status).toBe(204);
  });

  test("serialises array body", async () => {
    const r = jsonResponse(200, [1, 2, 3]);
    expect(await r.json()).toEqual([1, 2, 3]);
  });
});

describe("errorResponse", () => {
  test("wraps error in v1 envelope", async () => {
    const r = errorResponse(500, "internal_error", "something went wrong", { foo: "bar" });
    expect(r.status).toBe(500);
    const body = await r.json() as { error: { _v: number; code: string; message: string; details: Record<string, unknown> } };
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("something went wrong");
    expect(body.error.details).toEqual({ foo: "bar" });
  });

  test("defaults details to empty object", async () => {
    const r = errorResponse(500, "internal_error", "boom");
    const body = await r.json() as { error: { details: Record<string, unknown> } };
    expect(body.error.details).toEqual({});
  });
});

describe("badRequest", () => {
  test("returns 400 with bad_request code", async () => {
    const r = badRequest("abs_path is required");
    expect(r.status).toBe(400);
    const body = await r.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("abs_path is required");
  });

  test("includes optional details", async () => {
    const r = badRequest("invalid field", { field: "abs_path" });
    const body = await r.json() as { error: { details: { field: string } } };
    expect(body.error.details.field).toBe("abs_path");
  });
});

describe("notFoundResponse", () => {
  test("returns 404 with not_found code and path", async () => {
    const r = notFoundResponse("/v1/providers/abc/quota");
    expect(r.status).toBe(404);
    const body = await r.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("No route: /v1/providers/abc/quota");
  });
});

describe("methodNotAllowed", () => {
  test("returns 405 with method_not_allowed code", async () => {
    const r = methodNotAllowed();
    expect(r.status).toBe(405);
    const body = await r.json() as { error: { code: string } };
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("parseJsonBody", () => {
  test("parses valid JSON object", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/tmp/foo", name: "bar" }),
    });
    const result = await parseJsonBody(req);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data).toEqual({ abs_path: "/tmp/foo", name: "bar" });
    }
  });

  test("returns empty data for empty body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(req);
    expect("data" in result).toBe(true);
    if ("data" in result) {
      expect(result.data).toEqual({});
    }
  });

  test("rejects JSON array body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "[1, 2, 3]",
    });
    const result = await parseJsonBody(req);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  test("rejects JSON null body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "null",
    });
    const result = await parseJsonBody(req);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  test("rejects invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not valid json {",
    });
    const result = await parseJsonBody(req);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
    }
  });

  test("rejects non-UTF-8 text that throws on req.text()", async () => {
    // Simulate a Request whose text() call throws (e.g. malformed stream)
    const badReq = {
      text: async () => { throw new Error("underlying read error"); },
    } as unknown as Request;
    const result = await parseJsonBody(badReq);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(400);
      // Message indicates UTF-8 / body read failure (distinct from JSON parse failure)
      const body = await result.error.json() as { error: { message: string } };
      expect(body.error.message).toContain("valid UTF-8");
    }
  });
});
