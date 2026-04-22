import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  patchProject,
  purgeProject,
  type Deps,
} from "./projects-handlers.ts";

function makeDeps(): Deps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return { registry: new ProjectRegistry(db) };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

// ─── listProjects ─────────────────────────────────────────────────────────────

describe("listProjects", () => {
  test("returns 200 with empty items when no projects exist", async () => {
    const deps = makeDeps();
    const res = listProjects(new Request("http://x/v1/projects"), deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; items: unknown[] }>(res);
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
  });

  test("returns projects matching status filter", async () => {
    const deps = makeDeps();
    const p1 = deps.registry.create({ absPath: "/a" });
    deps.registry.updateStatus(p1.id, "ready");
    deps.registry.create({ absPath: "/b" }); // setup_pending

    const res = listProjects(
      new Request("http://x/v1/projects?status=ready"),
      deps,
    );
    const body = await resJson<{ items: Array<{ id: string }> }>(res);
    expect(body.items.length).toBe(1);
    expect(body.items[0]!.id).toBe(p1.id);
  });

  test("returns 400 for invalid status param", async () => {
    const deps = makeDeps();
    const res = listProjects(
      new Request("http://x/v1/projects?status=invalid_status"),
      deps,
    );
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("combines status and path filters", async () => {
    const deps = makeDeps();
    const p1 = deps.registry.create({ absPath: "/a" });
    deps.registry.updateStatus(p1.id, "ready");
    deps.registry.create({ absPath: "/b" });

    const url = new URL("http://x/v1/projects");
    url.searchParams.set("status", "ready");
    url.searchParams.set("path", "/a");
    const res = listProjects(new Request(url), deps);
    const body = await resJson<{ items: Array<{ id: string }> }>(res);
    expect(body.items.length).toBe(1);
    expect(body.items[0]!.id).toBe(p1.id);
  });
});

// ─── createProject ───────────────────────────────────────────────────────────

describe("createProject", () => {
  test("returns 201 with project on success", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/test/path" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson<{ _v: number; id: string; abs_path: string }>(res);
    expect(body._v).toBe(1);
    expect(body.abs_path).toBe("/test/path");
  });

  test("returns 400 when abs_path is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "no path" }),
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

  test("accepts name alongside abs_path", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/my/path", name: "My Project" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson<{ name: string }>(res);
    expect(body.name).toBe("My Project");
  });

  test("returns 409 when abs_path is already registered", async () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/dup" });
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/dup" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(409);
    const body = await resJson<{ error: { code: string; details: { abs_path: string } } }>(res);
    expect(body.error.code).toBe("project_already_registered");
    expect(body.error.details.abs_path).toBe("/dup");
  });

  test("returns 400 when body is not JSON", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when body is an array instead of object", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when abs_path is an empty string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("non-string name falls back to basename of abs_path (TypeScript coercion)", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/test", name: 42 }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    // input.name?.trim() returns undefined for a number, so basename("/test") is used
    const body = await resJson<{ name: string }>(res);
    expect(body.name).toBe("test");
  });
});

// ─── getProject ──────────────────────────────────────────────────────────────

describe("getProject", () => {
  test("returns 200 with project when found", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const res = getProject(created.id, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; id: string }>(res);
    expect(body.id).toBe(created.id);
  });

  test("returns 404 when project not found", async () => {
    const deps = makeDeps();
    const res = getProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("project_not_found");
  });
});

// ─── patchProject ────────────────────────────────────────────────────────────

describe("patchProject", () => {
  test("returns 200 when updating name", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; name: string }>(res);
    expect(body.name).toBe("Renamed");
  });

  test("returns 200 when updating status", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ready" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ status: string }>(res);
    expect(body.status).toBe("ready");
  });

  test("returns 200 when updating both name and status", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name", status: "archived" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ name: string; status: string }>(res);
    expect(body.name).toBe("New Name");
    expect(body.status).toBe("archived");
  });

  test("returns 400 when neither name nor status is provided", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when status value is invalid", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "not_a_valid_status" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 404 when project not found", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects/nope", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await patchProject("nope", req, deps);
    expect(res.status).toBe(404);
  });

  test("returns 400 when body is not JSON", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
  });
});

// ─── archiveProject ──────────────────────────────────────────────────────────

describe("archiveProject", () => {
  test("returns 200 with archived project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const res = archiveProject(created.id, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ _v: number; status: string }>(res);
    expect(body.status).toBe("archived");
  });

  test("returns 404 when project not found", async () => {
    const deps = makeDeps();
    const res = archiveProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("project_not_found");
  });
});

// ─── purgeProject ────────────────────────────────────────────────────────────

describe("purgeProject", () => {
  test("returns 204 and removes the project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test" });
    const res = purgeProject(created.id, deps);
    expect(res.status).toBe(204);
    // Verify project is gone
    const getRes = getProject(created.id, deps);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 when project not found", async () => {
    const deps = makeDeps();
    const res = purgeProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("project_not_found");
  });
});
