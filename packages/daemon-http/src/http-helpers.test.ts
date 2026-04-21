import { describe, expect, test } from "bun:test";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "./http-helpers.ts";

describe("jsonResponse", () => {
  test("returns 200 with JSON body", async () => {
    const res = jsonResponse(200, { foo: "bar" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body).toEqual({ foo: "bar" });
  });

  test("returns arbitrary status code", async () => {
    const res = jsonResponse(201, { id: 1 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: 1 });
  });
});

describe("errorResponse", () => {
  test("returns envelope with all fields", async () => {
    const res = errorResponse(500, "internal_error", "Something went wrong", { id: 1 });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        _v: 1,
        code: "internal_error",
        message: "Something went wrong",
        details: { id: 1 },
      },
    });
  });

  test("defaults details to empty object", async () => {
    const res = errorResponse(400, "bad_request", "invalid input");
    const body = await res.json();
    expect(body.error.details).toEqual({});
  });
});

describe("badRequest", () => {
  test("returns 400 with code bad_request", async () => {
    const res = badRequest("missing field", { field: "name" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("missing field");
    expect(body.error.details).toEqual({ field: "name" });
  });
});

describe("notFoundResponse", () => {
  test("returns 404 with not_found code and path", async () => {
    const res = notFoundResponse("/v1/unknown");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("No route: /v1/unknown");
    expect(body.error.details).toEqual({ path: "/v1/unknown" });
  });
});

describe("methodNotAllowed", () => {
  test("returns 405 with method_not_allowed code", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("parseJsonBody", () => {
  test("parses valid JSON object body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ name: "test", value: 42 }),
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: { name: "test", value: 42 } });
  });

  test("returns empty data object for empty string body", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: {} });
  });

  test("returns error for null JSON value", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "null",
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({
      error: expect.objectContaining({ status: 400 }),
    });
    const body = await (result as { error: Response }).error.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns error for array JSON value", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({
      error: expect.objectContaining({ status: 400 }),
    });
    const body = await (result as { error: Response }).error.json();
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns error for non-JSON text", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "not json at all",
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({
      error: expect.objectContaining({ status: 400 }),
    });
    const body = await (result as { error: Response }).error.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("invalid JSON body");
  });

  test("returns error for malformed UTF-8", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "\xff\xfe", // invalid UTF-8
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({
      error: expect.objectContaining({ status: 400 }),
    });
  });

  test("parses deeply nested object", async () => {
    const req = new Request("http://x", {
      method: "PUT",
      body: JSON.stringify({ a: { b: { c: { d: 1 } } } }),
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: { a: { b: { c: { d: 1 } } } } });
  });

  test("parses object with string values", async () => {
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ name: "alice", status: "ready" }),
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ data: { name: "alice", status: "ready" } });
  });
});
