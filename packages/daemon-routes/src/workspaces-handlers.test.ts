import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { ProjectRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import {
  createWorkspaceHandler,
  patchWorkspaceHandler,
  deleteWorkspaceHandler,
  listWorkspaceProjectsHandler,
  addProjectToWorkspaceHandler,
  removeProjectFromWorkspaceHandler,
  listWorkspacesHandler,
  getWorkspaceHandler,
} from "./workspaces-handlers.ts";
import type { Deps } from "./workspaces-common.ts";

function makeDeps(dir: string): Deps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const registry = new WorkspaceRegistry(db);
  const projectRegistry = new ProjectRegistry(db);
  // Close db when deps is torn down — stored on registry via closure
  (registry as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  // Also attach projectRegistry so tests can create projects
  (registry as unknown as { _projectRegistry: ProjectRegistry })._projectRegistry = projectRegistry;
  return { registry, projectRegistry };
}

// ─────────────────────────────────────────────────────────────────
// createWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("createWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-create-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 201 with created workspace on valid input", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "my-workspace" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("my-workspace");
    expect(body.project_counts).toEqual({
      total: 0,
      primary: 0,
      supporting: 0,
      dependency: 0,
      experiment: 0,
    });
  });

  test("returns 400 when name is missing", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("name is required");
  });

  test("returns 400 when name is empty string", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("name is required");
  });

  test("returns 400 when name is not a string", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: 42 }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("name is required");
  });

  test("accepts optional description", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "ws", description: "A test workspace" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.description).toBe("A test workspace");
  });

  test("accepts optional default_budget_usd_per_day", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "ws", default_budget_usd_per_day: 25.5 }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });

  test("accepts optional metadata object", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "ws", metadata: { team: "platform", env: "prod" } }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: "not json",
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is a JSON array", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      body: JSON.stringify([{ name: "ws" }]),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("request body must be a JSON object");
  });
});

// ─────────────────────────────────────────────────────────────────
// patchWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("patchWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-patch-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "original" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with updated workspace when name is patched", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "updated-name" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("updated-name");
  });

  test("returns 200 when description is patched", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "new description" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("new description");
  });

  test("returns 200 when default_budget_usd_per_day is patched", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ default_budget_usd_per_day: 100 }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
  });

  test("returns 200 when metadata is patched", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ metadata: { env: "staging" } }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata).toEqual({ env: "staging" });
  });

  test("returns 404 when workspace does not exist", async () => {
    const req = new Request("http://localhost/v1/workspaces/nonexistent-id", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    const res = await patchWorkspaceHandler("nonexistent-id", req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_not_found");
  });

  test("returns 400 when no updatable fields are provided", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("no updatable fields provided");
  });

  test("returns 400 when name is empty string", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("name is required");
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: "not json",
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("deleteWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-delete-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "to-delete" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 204 when workspace is deleted", () => {
    const res = deleteWorkspaceHandler(workspaceId, deps);
    expect(res.status).toBe(204);
    // Verify it's gone
    const getRes = getWorkspaceHandler(workspaceId, deps);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 when workspace does not exist", async () => {
    const res = deleteWorkspaceHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// listWorkspacesHandler
// ─────────────────────────────────────────────────────────────────

describe("listWorkspacesHandler", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-list-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty items when no workspaces exist", async () => {
    const req = new Request("http://localhost/v1/workspaces");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("returns all workspaces when no filters are provided", async () => {
    deps.registry.create({ name: "workspace-a" });
    deps.registry.create({ name: "workspace-b" });

    const req = new Request("http://localhost/v1/workspaces");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });

  test("filters workspaces by q search param matching name substring", async () => {
    deps.registry.create({ name: "platform-alpha" });
    deps.registry.create({ name: "backend-beta" });
    deps.registry.create({ name: "platform-gamma" });

    const req = new Request("http://localhost/v1/workspaces?q=platform");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.name).toMatch(/platform/);
    }
  });

  test("filters workspaces by q with no matches returning empty list", async () => {
    deps.registry.create({ name: "workspace-a" });
    deps.registry.create({ name: "workspace-b" });

    const req = new Request("http://localhost/v1/workspaces?q=nonexistent");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  test("limits results via limit query param", async () => {
    deps.registry.create({ name: "ws-1" });
    deps.registry.create({ name: "ws-2" });
    deps.registry.create({ name: "ws-3" });

    const req = new Request("http://localhost/v1/workspaces?limit=2");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
  });

  test("limit param defaults to 50 when not specified", async () => {
    // Just verify it works without limit and returns items
    deps.registry.create({ name: "ws-1" });
    const req = new Request("http://localhost/v1/workspaces");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  test("cursor param is accepted and passed through", async () => {
    deps.registry.create({ name: "ws-1" });
    const req = new Request("http://localhost/v1/workspaces?cursor=w_abc123");
    const res = listWorkspacesHandler(req, deps);
    expect(res.status).toBe(200);
    // listWorkspacesHandler currently does not implement cursor pagination
    // (next_cursor is always null), but the filter parsing should accept it
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.next_cursor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// getWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("getWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-get-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "get-test-ws" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with workspace data", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`);
    const res = getWorkspaceHandler(workspaceId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(workspaceId);
    expect(body.name).toBe("get-test-ws");
    expect(body.project_counts).toBeDefined();
  });

  test("returns 404 when workspace does not exist", async () => {
    const req = new Request("http://localhost/v1/workspaces/nonexistent");
    const res = getWorkspaceHandler("nonexistent", deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// listWorkspaceProjectsHandler
// ─────────────────────────────────────────────────────────────────

describe("listWorkspaceProjectsHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-proj-list-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "proj-list-ws" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty items when no projects in workspace", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`);
    const res = listWorkspaceProjectsHandler(workspaceId, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });

  test("returns 404 when workspace does not exist", () => {
    const req = new Request("http://localhost/v1/workspaces/nonexistent/projects");
    const res = listWorkspaceProjectsHandler("nonexistent", deps);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────
// addProjectToWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("addProjectToWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-add-proj-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "add-proj-ws" }).id;
    projectId = deps.projectRegistry.create({ absPath: "/test/project", name: "test-project" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 201 when project is added to workspace with default role", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project_id).toBe(projectId);
    expect(body.workspace_id).toBe(workspaceId);
    expect(body.role).toBe("supporting");
  });

  test("returns 201 when project is added with explicit primary role", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, role: "primary" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe("primary");
  });

  test("returns 201 when project is added with experiment role", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, role: "experiment" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe("experiment");
  });

  test("returns 400 when project_id is missing", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("project_id is required");
  });

  test("returns 400 when project_id is empty string", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: "" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("project_id is required");
  });

  test("returns 400 when role is invalid", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId, role: "not-a-role" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("invalid role");
  });

  test("returns 404 when workspace does not exist", async () => {
    const req = new Request("http://localhost/v1/workspaces/nonexistent/projects", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    const res = await addProjectToWorkspaceHandler("nonexistent", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 404 when project does not exist", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: "nonexistent-project" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("project_not_found");
  });

  test("returns 404 when workspace does not exist", async () => {
    // The workspace never existed — registry has no such ID
    const req = new Request("http://localhost/v1/workspaces/ws-doesnt-exist/projects", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    const res = await addProjectToWorkspaceHandler("ws-doesnt-exist", req, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_not_found");
  });

  test("returns 409 when project is already in workspace", async () => {
    // Add it once
    const req1 = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    await addProjectToWorkspaceHandler(workspaceId, req1, deps);
    // Add again
    const req2 = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req2, deps);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("duplicate_workspace_project");
  });
});

// ─────────────────────────────────────────────────────────────────
// removeProjectFromWorkspaceHandler
// ─────────────────────────────────────────────────────────────────

describe("removeProjectFromWorkspaceHandler", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-rm-proj-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "remove-proj-ws" }).id;
    projectId = deps.projectRegistry.create({ absPath: "/test/remove", name: "remove-project" }).id;
    deps.registry.addProject(workspaceId, projectId, "primary");
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 204 when project is removed from workspace", async () => {
    const res = removeProjectFromWorkspaceHandler(workspaceId, projectId, deps);
    expect(res.status).toBe(204);
    // Verify it's gone
    const listRes = listWorkspaceProjectsHandler(workspaceId, deps);
    const body = await listRes.json();
    expect(body.items).toHaveLength(0);
  });

  test("returns 404 when workspace does not exist", () => {
    const res = removeProjectFromWorkspaceHandler("nonexistent-ws", projectId, deps);
    expect(res.status).toBe(404);
  });

  test("returns 404 when project is not in workspace", async () => {
    const otherProjectId = deps.projectRegistry.create({ absPath: "/test/other", name: "other-project" }).id;
    const res = removeProjectFromWorkspaceHandler(workspaceId, otherProjectId, deps);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("workspace_project_not_found");
  });
});
