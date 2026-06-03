import { describe, expect, test } from "bun:test";
import { parseRefKey, validateCreateBody, validatePatchBody } from "./work-items-validation.ts";

describe("validateCreateBody", () => {
  test("returns input for a well-formed create", () => {
    const result = validateCreateBody({
      project_id: "p1",
      kind: "epic",
      title: "Ship M7",
      body: "tracker work items",
      status: "needs_refinement",
      parent_ref_key: "parent-1",
      parent_tracker: "builtin",
      labels: ["M7"],
    });
    expect(result.error).toBeUndefined();
    expect(result.input?.project_id).toBe("p1");
    expect(result.input?.kind).toBe("epic");
    expect(result.input?.parent_ref_key).toBe("parent-1");
    expect(result.input?.parent_tracker).toBe("builtin");
  });

  test("rejects non-object body", () => {
    const r = validateCreateBody("nope");
    expect(r.error?.status).toBe(400);
  });

  test("rejects missing project_id", () => {
    const r = validateCreateBody({ kind: "epic", title: "x" });
    expect(r.error?.status).toBe(400);
  });

  test("rejects unknown kind", () => {
    const r = validateCreateBody({ project_id: "p1", kind: "bug", title: "x" });
    expect(r.error?.status).toBe(400);
  });

  test("rejects empty title", () => {
    const r = validateCreateBody({ project_id: "p1", kind: "epic", title: "   " });
    expect(r.error?.status).toBe(400);
  });

  test("rejects non-array labels", () => {
    const r = validateCreateBody({ project_id: "p1", kind: "epic", title: "x", labels: "nope" });
    expect(r.error?.status).toBe(400);
  });
});

describe("validatePatchBody", () => {
  test("returns patch with only the provided fields", () => {
    const r = validatePatchBody({ state: "closed", status: "done" });
    expect(r.error).toBeUndefined();
    expect(r.patch).toEqual({ state: "closed", status: "done" });
  });

  test("rejects invalid state", () => {
    const r = validatePatchBody({ state: "merged" });
    expect(r.error?.status).toBe(400);
  });

  test("accepts empty patch object", () => {
    const r = validatePatchBody({});
    expect(r.error).toBeUndefined();
    expect(r.patch).toEqual({});
  });
});

describe("parseRefKey", () => {
  test("extracts projectId, trackerId, refKey from a work item path", () => {
    expect(parseRefKey("/v1/work-items/p1/builtin/epic-1")).toEqual({
      projectId: "p1",
      trackerId: "builtin",
      refKey: "epic-1",
    });
  });

  test("returns null fields for non-matching path", () => {
    expect(parseRefKey("/v1/work-items")).toEqual({ projectId: null, trackerId: null, refKey: null });
    expect(parseRefKey("/v1/sessions/abc")).toEqual({ projectId: null, trackerId: null, refKey: null });
  });
});
