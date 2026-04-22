import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { createProject, patchProject, archiveProject, purgeProject, getProject, listProjects, type Deps } from "./projects-handlers.ts";

function makeDeps(): Deps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return { registry: new ProjectRegistry(db) };
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

// ─── listProjects ────────────────────────────────────────────────────────────

describe("listProjects", () => {
  test("returns 200 with empty list when no projects exist", () => {
    const deps = makeDeps();
    const res = listProjects(new Request("http://x/v1/projects"), deps);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ _v: number; items: unknown[]; next_cursor: null }>(res).then((body) => {
      expect(body._v).toBe(1);
      expect(body.items).toEqual([]);
      expect(body.next_cursor).toBeNull();
    });
  });

  test("returns all projects with no filters", () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/a" });
    deps.registry.create({ absPath: "/b" });
    const res = listProjects(new Request("http://x/v1/projects"), deps);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ items: unknown[] }>(res).then((body) => {
      expect(body.items.length).toBe(2);
    });
  });

  test("filters by status query param", () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/ready" });
    const archived = deps.registry.create({ absPath: "/archived" });
    deps.registry.archive(archived.id);
    const res = listProjects(
      new Request("http://x/v1/projects?status=archived"),
      deps,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ items: Array<{ status: string }> }>(res).then((body) => {
      expect(body.items.length).toBe(1);
      expect(body.items[0]!.status).toBe("archived");
    });
  });

  test("filters by path query param", () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/home/user/alpha" });
    deps.registry.create({ absPath: "/home/user/beta" });
    const res = listProjects(
      new Request("http://x/v1/projects?path=/home/user/alpha"),
      deps,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ items: Array<{ abs_path: string }> }>(res).then((body) => {
      expect(body.items.length).toBe(1);
      expect(body.items[0]!.abs_path).toBe("/home/user/alpha");
    });
  });

  test("returns 400 for invalid status query param", () => {
    const deps = makeDeps();
    const res = listProjects(
      new Request("http://x/v1/projects?status=not_a_status"),
      deps,
    );
    expect(res.status).toBe(400);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ error: { code: string; details: { statusParam: string } } }>(res).then((body) => {
      expect(body.error.code).toBe("bad_request");
      expect(body.error.details.statusParam).toBe("not_a_status");
    });
  });

  test("combines status and path filters", () => {
    const deps = makeDeps();
    const p1 = deps.registry.create({ absPath: "/home/user/alpha" });
    deps.registry.create({ absPath: "/home/user/beta" });
    deps.registry.archive(p1.id);
    const res = listProjects(
      new Request("http://x/v1/projects?status=archived&path=/home/user/alpha"),
      deps,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ items: Array<{ status: string; abs_path: string }> }>(res).then((body) => {
      expect(body.items.length).toBe(1);
      expect(body.items[0]!.status).toBe("archived");
      expect(body.items[0]!.abs_path).toBe("/home/user/alpha");
    });
  });
});

// ─── getProject ──────────────────────────────────────────────────────────────

describe("getProject", () => {
  test("returns 200 with project when found", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = getProject(created.id, deps);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ _v: number; id: string; abs_path: string }>(res).then((body) => {
      expect(body._v).toBe(1);
      expect(body.id).toBe(created.id);
      expect(body.abs_path).toBe("/test/path");
    });
  });

  test("returns 404 when project not found", () => {
    const deps = makeDeps();
    const res = getProject("nonexistent-id", deps);
    expect(res.status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ error: { code: string; message: string; details: { id: string } } }>(res).then((body) => {
      expect(body.error.code).toBe("project_not_found");
      expect(body.error.message).toContain("nonexistent-id");
      expect(body.error.details.id).toBe("nonexistent-id");
    });
  });
});

// ─── createProject ───────────────────────────────────────────────────────────

describe("createProject", () => {
  test("returns 201 with project when abs_path is provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/test/path" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson<{ _v: number; id: string; abs_path: string; name: null }>(res);
    expect(body._v).toBe(1);
    expect(body.id).toBeTruthy();
    expect(body.abs_path).toBe("/test/path");
    expect(body.name).toBe("path"); // registry derives default name from abs_path
  });

  test("returns 201 with name when both abs_path and name are provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/test/path", name: "My Project" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson<{ _v: number; name: string }>(res);
    expect(body.name).toBe("My Project");
  });

  test("returns 400 when abs_path is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when abs_path is not a string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: 123 }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 409 when project with same abs_path already exists", async () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/duplicate/path" });
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/duplicate/path" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(409);
    const body = await resJson<{ error: { code: string; details: { abs_path: string } } }>(res);
    expect(body.error.code).toBe("project_already_registered");
    expect(body.error.details.abs_path).toBe("/duplicate/path");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not valid json",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });
});

// ─── patchProject ───────────────────────────────────────────────────────────

describe("patchProject", () => {
  test("returns 200 when name is updated", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path", name: "Original" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; name: string }>(res);
    expect(body.name).toBe("Updated Name");
  });

  test("returns 200 when status is updated to valid value", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; status: string }>(res);
    expect(body.status).toBe("archived");
  });

  test("returns 400 when status is invalid", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "not_a_status" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string; details: { status: string } } }>(res);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.status).toBe("not_a_status");
  });

  test("returns 400 when no updatable fields are provided", async () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/test/path" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await patchProject("test-id", req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 404 when project not found", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await patchProject("nonexistent-id", req, deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("project_not_found");
  });
});

// ─── archiveProject ──────────────────────────────────────────────────────────

describe("archiveProject", () => {
  test("returns 200 when project is archived", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = archiveProject(created.id, deps);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ _v: number; status: string }>(res).then((body) => {
      expect(body.status).toBe("archived");
    });
  });

  test("returns 404 when project not found", () => {
    const deps = makeDeps();
    const res = archiveProject("nonexistent-id", deps);
    expect(res.status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ error: { code: string } }>(res).then((body) => {
      expect(body.error.code).toBe("project_not_found");
    });
  });
});

// ─── purgeProject ───────────────────────────────────────────────────────────

describe("purgeProject", () => {
  test("returns 204 when project is purged", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = purgeProject(created.id, deps);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    // verify it is gone
    expect(deps.registry.get(created.id)).toBeUndefined();
  });

  test("returns 404 when project not found", () => {
    const deps = makeDeps();
    const res = purgeProject("nonexistent-id", deps);
    expect(res.status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resJson<{ error: { code: string } }>(res).then((body) => {
      expect(body.error.code).toBe("project_not_found");
    });
  });
});
