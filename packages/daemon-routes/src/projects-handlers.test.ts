import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry } from "@aloop/state-sqlite";
import { listProjects, getProject, archiveProject, purgeProject } from "./projects-handlers.ts";
import type { Deps } from "./projects-common.ts";

function makeDeps(dir: string): Deps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const registry = new ProjectRegistry(db);
  // sessionsDir — we use a subdirectory inside the test dir that never contains any sessions
  const sessionsDir = join(dir, "sessions");
  // Close db when deps is torn down — stored on registry via closure
  (registry as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  return { registry, sessionsDir };
}

describe("listProjects", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-handlers-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    // Access the stored db reference and close it
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty items when no projects exist", async () => {
    const req = new Request("http://localhost/v1/projects");
    const res = listProjects(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("returns all projects when no filters are provided", async () => {
    deps.registry.create({ absPath: "/a", name: "proj-a" });
    deps.registry.create({ absPath: "/b", name: "proj-b" });

    const req = new Request("http://localhost/v1/projects");
    const res = listProjects(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });

  test("filters by status query param", async () => {
    deps.registry.create({ absPath: "/a", name: "proj-a" });
    const archived = deps.registry.create({ absPath: "/b", name: "proj-b" });
    deps.registry.archive(archived.id);

    const req = new Request("http://localhost/v1/projects?status=archived");
    const res = listProjects(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe("proj-b");
    expect(body.items[0]!.status).toBe("archived");
  });

  test("filters by path query param", async () => {
    deps.registry.create({ absPath: "/a", name: "proj-a" });
    deps.registry.create({ absPath: "/b", name: "proj-b" });

    const req = new Request("http://localhost/v1/projects?path=/a");
    const res = listProjects(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.abs_path).toBe("/a");
  });

  test("combines status and path filters", async () => {
    deps.registry.create({ absPath: "/a-ready", name: "proj-a" });
    const archived = deps.registry.create({ absPath: "/a-archived", name: "proj-a-archived" });
    deps.registry.archive(archived.id);
    deps.registry.create({ absPath: "/b", name: "proj-b" });

    const req = new Request("http://localhost/v1/projects?status=archived&path=/a-archived");
    const res = listProjects(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe("proj-a-archived");
  });

  test("returns 400 for invalid status query param value", async () => {
    const req = new Request("http://localhost/v1/projects?status=not_a_real_status");
    const res = listProjects(req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for empty string status query param", async () => {
    const req = new Request("http://localhost/v1/projects?status=");
    const res = listProjects(req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("invalid status");
  });

  test("items use the canonical projectResponse envelope with _v=1", async () => {
    deps.registry.create({ absPath: "/c", name: "proj-c" });

    const req = new Request("http://localhost/v1/projects");
    const res = listProjects(req, deps);
    const body = await (res as Response).json();
    expect(body.items[0]).toMatchObject({
      _v: 1,
      abs_path: "/c",
      name: "proj-c",
      status: "setup_pending",
    });
  });
});

describe("getProject", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-handlers-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with project when found by id", async () => {
    const added = deps.registry.create({ absPath: "/x", name: "proj-x" });

    const req = new Request("http://localhost/v1/projects/" + added.id);
    const res = getProject(added.id, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.id).toBe(added.id);
    expect(body.name).toBe("proj-x");
    expect(body.abs_path).toBe("/x");
    expect(body._v).toBe(1);
  });

  test("returns 404 when project not found", async () => {
    const req = new Request("http://localhost/v1/projects/no-such-id");
    const res = getProject("no-such-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_not_found");
    expect(body.error.details.id).toBe("no-such-id");
  });
});

describe("archiveProject", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-handlers-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with archived status when project exists", async () => {
    const created = deps.registry.create({ absPath: "/x", name: "proj-x" });
    const res = archiveProject(created.id, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body.id).toBe(created.id);
    expect(body.status).toBe("archived");
    expect(body._v).toBe(1);
  });

  test("returns 404 when project not found", async () => {
    const res = archiveProject("no-such-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_not_found");
    expect(body.error.details.id).toBe("no-such-id");
  });

  test("actually archives the project (verifiable via getProject)", async () => {
    const created = deps.registry.create({ absPath: "/y", name: "proj-y" });
    archiveProject(created.id, deps);
    const getRes = getProject(created.id, deps);
    expect(getRes.status).toBe(200);
    const body = await (getRes as Response).json();
    expect(body.status).toBe("archived");
  });
});

describe("purgeProject", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-handlers-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 204 with null body when project is purged", async () => {
    const created = deps.registry.create({ absPath: "/z", name: "proj-z" });
    const res = purgeProject(created.id, deps);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  test("returns 404 when project not found", async () => {
    const res = purgeProject("no-such-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("project_not_found");
    expect(body.error.details.id).toBe("no-such-id");
  });

  test("actually removes the project (verifiable via getProject)", async () => {
    const created = deps.registry.create({ absPath: "/w", name: "proj-w" });
    purgeProject(created.id, deps);
    const getRes = getProject(created.id, deps);
    expect(getRes.status).toBe(404);
  });
});
