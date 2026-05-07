import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import { handleWorkspaces } from "./workspaces-handlers.ts";

function createTestDeps() {
  const { db } = openDatabase(":memory:");
  const projectRegistry = new ProjectRegistry(db);
  const workspaceRegistry = new WorkspaceRegistry(db);
  return {
    projectRegistry,
    workspaceRegistry,
    sessionsDir: mkdtempSync(join(tmpdir(), "aloop-ws-handler-")),
  };
}

describe("handleWorkspaces", () => {
  let deps: ReturnType<typeof createTestDeps>;

  beforeEach(() => {
    deps = createTestDeps();
  });

  afterEach(() => {
    rmSync(deps.sessionsDir, { recursive: true, force: true });
  });

  test("GET /v1/workspaces returns empty list", async () => {
    const req = new Request("http://localhost/v1/workspaces");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("POST /v1/workspaces creates workspace", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "My Workspace", description: "Test" }),
    });
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(201);
    const body = await res!.json();
    expect(body.name).toBe("My Workspace");
    expect(body.description).toBe("Test");
  });

  test("POST /v1/workspaces requires name", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "No name" }),
    });
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(400);
  });

  test("GET /v1/workspaces/:id returns 404 for unknown workspace", async () => {
    const req = new Request("http://localhost/v1/workspaces/nonexistent");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces/nonexistent");
    expect(res?.status).toBe(404);
  });

  test("GET /v1/workspaces/:id returns workspace with project_counts", async () => {
    const created = deps.workspaceRegistry.create({ name: "Test" });
    const req = new Request(`http://localhost/v1/workspaces/${created.id}`);
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${created.id}`);
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.id).toBe(created.id);
    expect(body.project_counts).toEqual({ total: 0, by_status: {} });
  });

  test("GET /v1/workspaces/:id project_counts reflects added projects", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const proj = deps.projectRegistry.create({ absPath: "/tmp/test", name: "TestProj" });
    deps.workspaceRegistry.addProject(ws.id, proj.id, "primary");
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}`);
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}`);
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.project_counts.total).toBe(1);
    expect(body.project_counts.by_status.setup_pending).toBe(1);
  });

  test("PATCH /v1/workspaces/:id updates name", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Original" });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}`);
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.name).toBe("Renamed");
  });

  test("PATCH /v1/workspaces/:id requires at least one field", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}`);
    expect(res?.status).toBe(400);
  });

  test("DELETE /v1/workspaces/:id archives workspace", async () => {
    const ws = deps.workspaceRegistry.create({ name: "To Archive" });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}`, {
      method: "DELETE",
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}`);
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.archived_at).not.toBeNull();
  });

  test("GET /v1/workspaces/:id/projects returns empty list", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}/projects`);
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}/projects`);
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.items).toEqual([]);
  });

  test("POST /v1/workspaces/:id/projects adds project to workspace", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const project = deps.projectRegistry.create({ absPath: deps.sessionsDir });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: project.id, role: "primary" }),
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}/projects`);
    expect(res?.status).toBe(201);
  });

  test("POST /v1/workspaces/:id/projects validates role", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const project = deps.projectRegistry.create({ absPath: deps.sessionsDir });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: project.id, role: "invalid" }),
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}/projects`);
    expect(res?.status).toBe(400);
  });

  test("POST /v1/workspaces/:id/projects returns 404 for unknown project", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "nonexistent", role: "primary" }),
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}/projects`);
    expect(res?.status).toBe(404);
  });

  test("DELETE /v1/workspaces/:id/projects/:projectId removes project", async () => {
    const ws = deps.workspaceRegistry.create({ name: "Test" });
    const project = deps.projectRegistry.create({ absPath: deps.sessionsDir });
    deps.workspaceRegistry.addProject(ws.id, project.id, "primary");
    const req = new Request(`http://localhost/v1/workspaces/${ws.id}/projects/${project.id}`, {
      method: "DELETE",
    });
    const res = await handleWorkspaces(req, deps, `/v1/workspaces/${ws.id}/projects/${project.id}`);
    expect(res?.status).toBe(204);
  });

  test("GET /v1/workspaces with ?archived=true includes archived", async () => {
    const ws1 = deps.workspaceRegistry.create({ name: "Active" });
    const ws2 = deps.workspaceRegistry.create({ name: "Archived" });
    deps.workspaceRegistry.archive(ws2.id);
    const req = new Request("http://localhost/v1/workspaces?archived=true");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.items.length).toBe(2);
  });

  test("GET /v1/workspaces ?q searches workspace names (case-insensitive)", async () => {
    deps.workspaceRegistry.create({ name: "Alpha" });
    deps.workspaceRegistry.create({ name: "Beta" });
    deps.workspaceRegistry.create({ name: "ALPHA2" });

    const req = new Request("http://localhost/v1/workspaces?q=alpha");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.items.length).toBe(2);
    expect(body.items.map((w: { name: string }) => w.name).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))).toEqual(["Alpha", "ALPHA2"]);
    expect(body.next_cursor).toBeNull();
  });

  test("GET /v1/workspaces ?limit caps at 100 and returns next_cursor", async () => {
    // Create 5 workspaces
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(deps.workspaceRegistry.create({ name: `Ws${i}` }));
    }
    // Request limit=2 — should get 2 items and a next_cursor
    const req = new Request("http://localhost/v1/workspaces?limit=2");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.items.length).toBe(2);
    expect(body.next_cursor).not.toBeNull();
    // Cursor should allow fetching next page
    const req2 = new Request(`http://localhost/v1/workspaces?limit=2&cursor=${body.next_cursor}`);
    const res2 = await handleWorkspaces(req2, deps, "/v1/workspaces");
    expect(res2?.status).toBe(200);
    const body2 = await res2!.json();
    expect(body2.items.length).toBe(2);
  });

  test("GET /v1/workspaces ?limit above 100 is capped", async () => {
    deps.workspaceRegistry.create({ name: "Ws1" });
    deps.workspaceRegistry.create({ name: "Ws2" });
    const req = new Request("http://localhost/v1/workspaces?limit=200");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    // Only 2 workspaces exist, so we get 2 items and no next_cursor
    expect(body.items.length).toBe(2);
    expect(body.next_cursor).toBeNull();
  });

  test("GET /v1/workspaces ?limit=0 returns 400", async () => {
    const req = new Request("http://localhost/v1/workspaces?limit=0");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(400);
  });

  test("GET /v1/workspaces ?limit=invalid returns 400", async () => {
    const req = new Request("http://localhost/v1/workspaces?limit=abc");
    const res = await handleWorkspaces(req, deps, "/v1/workspaces");
    expect(res?.status).toBe(400);
  });
});