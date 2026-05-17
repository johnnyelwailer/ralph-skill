import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  badRequest,
  errorResponse,
  isParseJsonBodySuccess,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "./http-helpers.ts";

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

describe("jsonResponse", () => {
  test("returns a Response with correct status and content-type", () => {
    const res = jsonResponse(200, { foo: "bar" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  test("serializes the body as JSON", async () => {
    const body = { _v: 1, items: [1, 2, 3] };
    const res = jsonResponse(201, body);
    expect(await resJson<typeof body>(res)).toEqual(body);
  });

  test("accepts null as body", () => {
    const res = jsonResponse(204, null);
    expect(res.status).toBe(204);
  });

  test("accepts array as body", () => {
    const res = jsonResponse(200, [1, 2, 3]);
    expect(res.status).toBe(200);
  });
});

describe("errorResponse", () => {
  test("wraps error in the v1 envelope with all fields", async () => {
    const res = errorResponse(403, "access_denied", "you shall not pass", { ip: "1.2.3.4" });
    expect(res.status).toBe(403);
    const body = await resJson(res);
    expect(body).toEqual({
      error: { _v: 1, code: "access_denied", message: "you shall not pass", details: { ip: "1.2.3.4" } },
    });
  });

  test("defaults details to empty object when omitted", async () => {
    const res = errorResponse(500, "internal_error", "oops");
    const body = await resJson<{ error: { details: Record<string, unknown> } }>(res);
    expect(body.error.details).toEqual({});
  });

  test("status code is passed through correctly", () => {
    expect(errorResponse(400, "x", "y").status).toBe(400);
    expect(errorResponse(404, "x", "y").status).toBe(404);
    expect(errorResponse(503, "x", "y").status).toBe(503);
  });
});

describe("badRequest", () => {
  test("returns 400 with bad_request code", () => {
    const res = badRequest("missing field: name");
    expect(res.status).toBe(400);
  });

  test("includes the message", async () => {
    const res = badRequest("field x is required");
    const body = await resJson<{ error: { message: string } }>(res);
    expect(body.error.message).toBe("field x is required");
  });

  test("accepts optional details", async () => {
    const res = badRequest("invalid", { field: "email" });
    const body = await resJson<{ error: { details: Record<string, unknown> } }>(res);
    expect(body.error.details).toEqual({ field: "email" });
  });
});

describe("notFoundResponse", () => {
  test("returns 404 with not_found code", () => {
    const res = notFoundResponse("/v1/does/not/exist");
    expect(res.status).toBe(404);
  });

  test("message includes the path", async () => {
    const res = notFoundResponse("/v1/unknown");
    const body = await resJson<{ error: { message: string } }>(res);
    expect(body.error.message).toBe("No route: /v1/unknown");
  });

  test("details contain the path", async () => {
    const res = notFoundResponse("/v1/foo");
    const body = await resJson<{ error: { details: { path: string } } }>(res);
    expect(body.error.details).toEqual({ path: "/v1/foo" });
  });
});

describe("methodNotAllowed", () => {
  test("returns 405 with method_not_allowed code", () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
  });

  test("returns a generic message", async () => {
    const res = methodNotAllowed();
    const body = await resJson<{ error: { message: string; code: string } }>(res);
    expect(body.error.message).toBe("method not allowed for this resource");
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("parseJsonBody", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-json-body-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns parsed object for a valid JSON body", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify({ key: "value", num: 42 }),
    });
    const result = await parseJsonBody(req);
    const dataResult = result as { data: Record<string, unknown> };
    expect(isParseJsonBodySuccess(result)).toBe(true);
    expect(dataResult.data).toEqual({ key: "value", num: 42 });
  });

  test("returns empty object for an empty body", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(req);
    const dataResult = result as { data: Record<string, unknown> };
    expect(isParseJsonBodySuccess(result)).toBe(true);
    expect(dataResult.data).toEqual({});
  });

  test("returns badRequest error for invalid JSON", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "not { json",
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(errorResult.error);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("invalid JSON body");
  });

  test("returns badRequest error when body is a JSON array", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { message: string } }>(errorResult.error);
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns badRequest error when body is JSON null", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "null",
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { message: string } }>(errorResult.error);
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns badRequest error when body is a JSON string", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify("just a string"),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { message: string } }>(errorResult.error);
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns badRequest error when body is a JSON number", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(42),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { message: string } }>(errorResult.error);
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns badRequest error when body is a JSON boolean", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(true),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
  });

  test("returns badRequest error when body contains only whitespace", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "   \n  ",
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(false);
    const errorResult = result as { error: Response };
    expect(errorResult.error.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(errorResult.error);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("invalid JSON body");
  });

  test("handles deeply nested object", async () => {
    const nested = { a: { b: { c: { d: { e: 1 } } } } };
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(nested),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual(nested);
  });

  test("handles object with array values", async () => {
    const data = { items: [{ id: 1 }, { id: 2 }], count: 2 };
    const req = new Request("http://x/", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual(data);
  });

  test("unwraps enveloped body when top-level 'data' field is an object", async () => {
    const enveloped = { data: { project_id: "proj-1", kind: "standalone" } };
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(enveloped),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual({ project_id: "proj-1", kind: "standalone" });
  });

  test("unwraps enveloped body preserving all nested fields", async () => {
    const enveloped = {
      data: {
        project_id: "proj-x",
        kind: "orchestrated",
        workflow: "test",
        provider_chain: ["provider-1", "provider-2"],
        metadata: { source: "api" },
      },
    };
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(enveloped),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual(enveloped.data);
    expect((dataResult.data as Record<string, unknown>).metadata).toEqual({ source: "api" });
  });

  test("returns direct shape when 'data' field is a primitive", async () => {
    const body = { data: "just a string", other_field: true };
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual(body);
  });

  test("returns direct shape when 'data' field is null", async () => {
    const body = { data: null, foo: "bar" };
    const req = new Request("http://x/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const result = await parseJsonBody(req);
    expect(isParseJsonBodySuccess(result)).toBe(true);
    const dataResult = result as { data: Record<string, unknown> };
    expect(dataResult.data).toEqual(body);
  });

  test("returns error Response (not throw) for all error cases", async () => {
    const invalidCases = [
      "not json at all",
      "null",
      "[]",
      "42",
      "true",
      "   \n  ",
    ];
    for (const body of invalidCases) {
      const req = new Request("http://x/", { method: "POST", body });
      const result = await parseJsonBody(req);
      expect(isParseJsonBodySuccess(result)).toBe(false);
      const errorResult = result as { error: Response };
      expect(errorResult.error).toBeInstanceOf(Response);
    }
  });
});
