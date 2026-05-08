import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import { handleWorkspaces } from "./workspaces.ts";
import type { Deps } from "./workspaces-common.ts";

function makeDeps(dir: string): Deps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const registry = new WorkspaceRegistry(db);
  const projectRegistry = new ProjectRegistry(db);
  // Expose db so we can close it in afterEach
  (registry as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  (registry as unknown as { _projectRegistry: ProjectRegistry })._projectRegistry = projectRegistry;
  return { registry, projectRegistry };
}

function closeDeps(deps: Deps) {
  const reg = deps.registry as unknown as { _db?: { close(): void } };
  reg._db?.close();
}

// ─── helper to exercise routes ─────────────────────────────────────────────────

async function dispatch(
  method: string,
  pathname: string,
  deps: Deps,
  body?: unknown,
): Promise<Response> {
  const url = `http://localhost${pathname}`;
  const req = new Request(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await handleWorkspaces(req, deps, pathname);
  if (res === undefined) throw new Error(`handleWorkspaces returned undefined for ${method} ${pathname}`);
  return res;
}

// ─── /v1/workspaces (exact) ─────────────────────────────────────────────────────

describe("GET /v1/workspaces", () => {
  test("returns 200 with workspace list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-get-list-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("GET", "/v1/workspaces", deps);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("POST /v1/workspaces", () => {
  test("returns 201 when name is provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-post-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("POST", "/v1/workspaces", deps, { name: "test-ws" });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeTruthy();
      expect(body.name).toBe("test-ws");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 400 when name is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-post-400-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("POST", "/v1/workspaces", deps, {});
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("bad_request");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("non-GET/POST on /v1/workspaces", () => {
  test("returns 405 for DELETE", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-delete-405-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("DELETE", "/v1/workspaces", deps);
      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error.code).toBe("method_not_allowed");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 405 for PATCH", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-patch-405-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("PATCH", "/v1/workspaces", deps, {});
      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body.error.code).toBe("method_not_allowed");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── /v1/workspaces/:id (single segment) ─────────────────────────────────────

describe("GET /v1/workspaces/:id", () => {
  test("returns 200 with workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-get-id-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "my-ws" });
      const res = await dispatch("GET", `/v1/workspaces/${ws.id}`, deps);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(ws.id);
      expect(body.name).toBe("my-ws");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-get-miss-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("GET", "/v1/workspaces/nonexistent-id", deps);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("workspace_not_found");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("PATCH /v1/workspaces/:id", () => {
  test("returns 200 when name is patched", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-patch-id-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "original" });
      const res = await dispatch("PATCH", `/v1/workspaces/${ws.id}`, deps, { name: "updated" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("updated");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-patch-miss-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("PATCH", "/v1/workspaces/nonexistent-id", deps, { name: "x" });
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DELETE /v1/workspaces/:id", () => {
  test("returns 204 when workspace is deleted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-delete-id-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "to-delete" });
      const res = await dispatch("DELETE", `/v1/workspaces/${ws.id}`, deps);
      expect(res.status).toBe(204);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-delete-miss-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("DELETE", "/v1/workspaces/nonexistent-id", deps);
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("non-GET/PATCH/DELETE on /v1/workspaces/:id", () => {
  test("returns 405 for POST", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-post-405-id-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("POST", `/v1/workspaces/${ws.id}`, deps, {});
      expect(res.status).toBe(405);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── /v1/workspaces/:id/projects ──────────────────────────────────────────────

describe("GET /v1/workspaces/:id/projects", () => {
  test("returns 200 with empty items when no projects in workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-list-proj-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("GET", `/v1/workspaces/${ws.id}/projects`, deps);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toEqual([]);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-list-proj-miss-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("GET", "/v1/workspaces/nonexistent/projects", deps);
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("POST /v1/workspaces/:id/projects", () => {
  test("returns 201 when project is added", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-add-proj-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const proj = deps.projectRegistry.create({ absPath: "/test/proj", name: "test-proj" });
      const res = await dispatch("POST", `/v1/workspaces/${ws.id}/projects`, deps, {
        project_id: proj.id,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.project_id).toBe(proj.id);
      expect(body.workspace_id).toBe(ws.id);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-add-proj-miss-"));
    const deps = makeDeps(dir);
    try {
      const proj = deps.projectRegistry.create({ absPath: "/test/proj", name: "test-proj" });
      const res = await dispatch("POST", "/v1/workspaces/nonexistent/projects", deps, {
        project_id: proj.id,
      });
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("non-GET/POST on /v1/workspaces/:id/projects", () => {
  test("returns 405 for DELETE", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-del-proj-405-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("DELETE", `/v1/workspaces/${ws.id}/projects`, deps);
      expect(res.status).toBe(405);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── /v1/workspaces/:id/projects/:projectId ──────────────────────────────────

describe("DELETE /v1/workspaces/:id/projects/:projectId", () => {
  test("returns 204 when project is removed from workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-remove-proj-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const proj = deps.projectRegistry.create({ absPath: "/test/proj", name: "test-proj" });
      deps.registry.addProject(ws.id, proj.id, "supporting");
      const res = await dispatch(
        "DELETE",
        `/v1/workspaces/${ws.id}/projects/${proj.id}`,
        deps,
      );
      expect(res.status).toBe(204);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when workspace does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-remove-proj-miss-ws-"));
    const deps = makeDeps(dir);
    try {
      const proj = deps.projectRegistry.create({ absPath: "/test/proj", name: "test-proj" });
      const res = await dispatch(
        "DELETE",
        `/v1/workspaces/nonexistent/projects/${proj.id}`,
        deps,
      );
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 when project is not in workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-remove-proj-miss-proj-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const proj = deps.projectRegistry.create({ absPath: "/test/proj", name: "test-proj" });
      const res = await dispatch(
        "DELETE",
        `/v1/workspaces/${ws.id}/projects/${proj.id}`,
        deps,
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("workspace_project_not_found");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("non-DELETE on /v1/workspaces/:id/projects/:projectId", () => {
  test("returns 405 for GET", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-get-proj-405-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("GET", `/v1/workspaces/${ws.id}/projects/some-proj-id`, deps);
      expect(res.status).toBe(405);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 405 for POST", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-post-proj-405-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("POST", `/v1/workspaces/${ws.id}/projects/some-proj-id`, deps, {});
      expect(res.status).toBe(405);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── Unmatched paths ─────────────────────────────────────────────────────────

describe("unmatched paths return 404", () => {
  test("returns 404 for /v1/workspaces//extra", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-404-extra-"));
    const deps = makeDeps(dir);
    try {
      const res = await dispatch("GET", "/v1/workspaces//extra", deps);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("not_found");
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns 404 for /v1/workspaces/:id/invalid-action", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-hw-404-action-"));
    const deps = makeDeps(dir);
    try {
      const ws = deps.registry.create({ name: "ws" });
      const res = await dispatch("GET", `/v1/workspaces/${ws.id}/invalid-action`, deps);
      expect(res.status).toBe(404);
    } finally {
      closeDeps(deps);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
