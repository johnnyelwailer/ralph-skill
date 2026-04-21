import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // events are not used by projects-handlers, but Deps requires it
  return { registry: new ProjectRegistry(db) } as unknown as Deps;
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

function postRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("listProjects", () => {
  test("returns empty list when no projects exist", async () => {
    const deps = makeDeps();
    const res = listProjects(new Request("http://x/v1/projects"), deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ items: unknown[] }>(res as Response);
    expect(body.items).toEqual([]);
  });

  test("returns projects filtered by status", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    deps.registry.updateStatus(created.id, "archived");

    const res = listProjects(new Request("http://x/v1/projects?status=archived"), deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ items: Array<{ id: string; abs_path: string }> }>(res as Response);
    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe(created.id);
    expect(body.items[0].abs_path).toBe("/test/path");
  });

  test("returns projects filtered by path", async () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/unique/path" });
    deps.registry.create({ absPath: "/other/path" });

    const res = listProjects(new Request("http://x/v1/projects?path=/unique/path"), deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ items: Array<{ abs_path: string }> }>(res as Response);
    expect(body.items.length).toBe(1);
    expect(body.items[0].abs_path).toBe("/unique/path");
  });

  test("returns 400 for invalid status param", async () => {
    const deps = makeDeps();
    const res = listProjects(new Request("http://x/v1/projects?status=invalid_status"), deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("invalid_status");
  });
});

describe("createProject", () => {
  test("creates a project with required abs_path", async () => {
    const deps = makeDeps();
    const res = await createProject(
      postRequest("http://x/v1/projects", { abs_path: "/new/project" }),
      deps,
    );
    expect(res.status).toBe(201);
    const body = await resJson<{ id: string; abs_path: string; name: string }>(res as Response);
    expect(body.id).toBeTruthy();
    expect(body.abs_path).toBe("/new/project");
    expect(body.name).toBe("project"); // defaults to basename of abs_path
  });

  test("creates a project with optional name", async () => {
    const deps = makeDeps();
    const res = await createProject(
      postRequest("http://x/v1/projects", { abs_path: "/named/project", name: "My Project" }),
      deps,
    );
    expect(res.status).toBe(201);
    const body = await resJson<{ name: string }>(res as Response);
    expect(body.name).toBe("My Project");
  });

  test("returns 400 when abs_path is missing", async () => {
    const deps = makeDeps();
    const res = await createProject(postRequest("http://x/v1/projects", {}), deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("abs_path");
  });

  test("returns 409 when project already registered", async () => {
    const deps = makeDeps();
    deps.registry.create({ absPath: "/duplicate/path" });
    const res = await createProject(
      postRequest("http://x/v1/projects", { abs_path: "/duplicate/path" }),
      deps,
    );
    expect(res.status).toBe(409);
    const body = await resJson<{ error: { code: string; details: { abs_path: string } } }>(
      res as Response,
    );
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
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for non-object JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "123",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for empty body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });
});

describe("getProject", () => {
  test("returns project by id", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = getProject(created.id, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ id: string }>(res as Response);
    expect(body.id).toBe(created.id);
  });

  test("returns 404 for unknown id", async () => {
    const deps = makeDeps();
    const res = getProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("patchProject", () => {
  test("updates project name", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await patchProject(
      created.id,
      patchRequest("http://x/v1/projects", { name: "Updated Name" }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = await resJson<{ name: string }>(res as Response);
    expect(body.name).toBe("Updated Name");
  });

  test("updates project status", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await patchProject(
      created.id,
      patchRequest("http://x/v1/projects", { status: "archived" }),
      deps,
    );
    expect(res.status).toBe(200);
    const body = await resJson<{ status: string }>(res as Response);
    expect(body.status).toBe("archived");
  });

  test("returns 400 for invalid status value", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await patchProject(
      created.id,
      patchRequest("http://x/v1/projects", { status: "invalid_status" }),
      deps,
    );
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when no updatable fields provided", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await patchProject(
      created.id,
      patchRequest("http://x/v1/projects", {}),
      deps,
    );
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("no updatable fields");
  });

  test("returns 404 for unknown project id", async () => {
    const deps = makeDeps();
    const res = await patchProject(
      "does-not-exist",
      patchRequest("http://x/v1/projects", { name: "New Name" }),
      deps,
    );
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("project_not_found");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "not valid json",
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for non-object JSON body", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const req = new Request("http://x/v1/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: '"just a string"',
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("bad_request");
  });
});

describe("archiveProject", () => {
  test("archives an existing project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = archiveProject(created.id, deps);
    expect(res.status).toBe(200);
    const body = await resJson<{ status: string }>(res as Response);
    expect(body.status).toBe("archived");
  });

  test("returns 404 for unknown project id", async () => {
    const deps = makeDeps();
    const res = archiveProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("purgeProject", () => {
  test("purges an existing project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = purgeProject(created.id, deps);
    expect(res.status).toBe(204);
    // verify project is gone
    const getRes = getProject(created.id, deps);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 for unknown project id", async () => {
    const deps = makeDeps();
    const res = purgeProject("does-not-exist", deps);
    expect(res.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res as Response);
    expect(body.error.code).toBe("project_not_found");
  });
});
