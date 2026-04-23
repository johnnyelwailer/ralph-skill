import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry } from "@aloop/state-sqlite";
import { archiveProject, createProject, purgeProject, patchProject } from "./projects-write.ts";
import type { Deps } from "./projects-common.ts";

function makeDeps(dir: string): Deps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const registry = new ProjectRegistry(db);
  (registry as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  return { registry };
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/v1/projects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/v1/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("createProject", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-write-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 201 with created project when input is valid", async () => {
    const req = makeRequest({ abs_path: "/test/project", name: "my-project" });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await (res as Response).json();
    expect(body.abs_path).toBe("/test/project");
    expect(body.name).toBe("my-project");
    expect(body.status).toBe("setup_pending");
    expect(body._v).toBe(1);
    expect(body.id).toBeDefined();
  });

  test("returns 201 and auto-derives name from abs_path when name is not provided", async () => {
    const req = makeRequest({ abs_path: "/test/project-no-name" });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await (res as Response).json();
    expect(body.abs_path).toBe("/test/project-no-name");
    // name defaults to basename of abs_path when not supplied
    expect(body.name).toBe("project-no-name");
  });

  test("returns 400 when abs_path is missing", async () => {
    const req = makeRequest({ name: "orphan" });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("abs_path");
  });

  test("returns 400 when abs_path is not a string", async () => {
    const req = makeRequest({ abs_path: 12345 });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("abs_path");
  });

  test("returns 409 when abs_path is already registered", async () => {
    deps.registry.create({ absPath: "/duplicate/path", name: "first" });
    const req = makeRequest({ abs_path: "/duplicate/path", name: "second" });
    const res = await createProject(req, deps);
    expect(res.status).toBe(409);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_already_registered");
    expect(body.error.details.abs_path).toBe("/duplicate/path");
  });
});

describe("patchProject", () => {
  let dir: string;
  let deps: Deps;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-write-"));
    deps = makeDeps(dir);
    projectId = deps.registry.create({ absPath: "/patchable", name: "original-name" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 when updating name", async () => {
    const req = makePatchRequest(projectId, { name: "updated-name" });
    const res = await patchProject(projectId, req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.name).toBe("updated-name");
    expect(body.id).toBe(projectId);
  });

  test("returns 200 when updating status to a valid status", async () => {
    const req = makePatchRequest(projectId, { status: "ready" });
    const res = await patchProject(projectId, req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.status).toBe("ready");
  });

  test("returns 200 when updating both name and status", async () => {
    const req = makePatchRequest(projectId, { name: "new-name", status: "archived" });
    const res = await patchProject(projectId, req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.name).toBe("new-name");
    expect(body.status).toBe("archived");
  });

  test("returns 400 when status is an invalid value", async () => {
    const req = makePatchRequest(projectId, { status: "not_a_real_status" });
    const res = await patchProject(projectId, req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("invalid status");
  });

  test("returns 400 when no updatable fields are provided", async () => {
    const req = makePatchRequest(projectId, {});
    const res = await patchProject(projectId, req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("no updatable fields");
  });

  test("returns 404 when project not found", async () => {
    const req = makePatchRequest("no-such-id", { name: "new-name" });
    const res = await patchProject("no-such-id", req, deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_not_found");
    expect(body.error.details.id).toBe("no-such-id");
  });
});

// ─── archiveProject ──────────────────────────────────────────────────────────

describe("archiveProject", () => {
  let dir: string;
  let deps: Deps;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-write-"));
    deps = makeDeps(dir);
    projectId = deps.registry.create({ absPath: "/archivable", name: "to-archive" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with archived project", async () => {
    const res = archiveProject(projectId, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.status).toBe("archived");
    expect(body.id).toBe(projectId);
  });

  test("returns 404 when project not found", async () => {
    const res = archiveProject("no-such-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_not_found");
    expect(body.error.details.id).toBe("no-such-id");
  });
});

// ─── purgeProject ────────────────────────────────────────────────────────────

describe("purgeProject", () => {
  let dir: string;
  let deps: Deps;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-write-"));
    deps = makeDeps(dir);
    projectId = deps.registry.create({ absPath: "/purgable", name: "to-purge" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 204 and removes the project", () => {
    const res = purgeProject(projectId, deps);
    expect(res.status).toBe(204);
    // project is gone from registry
    expect(deps.registry.get(projectId)).toBeUndefined();
  });

  test("returns 404 when project not found", () => {
    const res = purgeProject("no-such-id", deps);
    expect(res.status).toBe(404);
    (res as Response).json().then((body) => {
      expect(body.error.code).toBe("project_not_found");
      expect(body.error.details.id).toBe("no-such-id");
    });
  });
});
