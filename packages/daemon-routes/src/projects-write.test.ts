import { describe, expect, test } from "bun:test";
import { archiveProject, createProject, purgeProject, patchProject } from "./projects-write.ts";
import type { Deps } from "./projects-common.ts";
import { ProjectAlreadyRegisteredError, ProjectNotFoundError } from "@aloop/state-sqlite";

class MockRegistry {
  private projects = new Map<string, { id: string; name: string; absPath: string; status: string }>();
  private nextId = 1;

  create(input: { absPath: string; name?: string }) {
    if ([...this.projects.values()].some((p) => p.absPath === input.absPath)) {
      const err = new ProjectAlreadyRegisteredError(input.absPath);
      throw err;
    }
    const id = `proj_${this.nextId++}`;
    this.projects.set(id, {
      id,
      name: input.name ?? input.absPath.split("/").pop()!,
      absPath: input.absPath,
      status: "setup_pending",
    });
    return this.get(id)!;
  }

  get(id: string) {
    return this.projects.get(id);
  }

  updateName(id: string, name: string) {
    const p = this.projects.get(id);
    if (!p) throw new ProjectNotFoundError(id);
    p.name = name;
    return p;
  }

  updateStatus(id: string, status: string) {
    const p = this.projects.get(id);
    if (!p) throw new ProjectNotFoundError(id);
    p.status = status;
    return p;
  }

  archive(id: string) {
    const p = this.projects.get(id);
    if (!p) throw new ProjectNotFoundError(id);
    p.status = "archived";
    return p;
  }

  purge(id: string) {
    this.projects.delete(id);
  }
}

function makeDeps(registry = new MockRegistry()): Deps {
  return { registry } as Deps;
}

// ─── createProject ──────────────────────────────────────────────────────────

describe("createProject", () => {
  test("returns 201 with created project when abs_path is provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/tmp/my-project" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.id).toMatch(/^proj_/);
    expect((body as any).abs_path).toBe("/tmp/my-project");
    expect((body as any).status).toBe("setup_pending");
  });

  test("uses basename as name when name is not provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/tmp/my-awesome-project" }),
    });
    const res = await createProject(req, deps);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).name).toBe("my-awesome-project");
  });

  test("uses provided name when given", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/tmp/project", name: "My Custom Name" }),
    });
    const res = await createProject(req, deps);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).name).toBe("My Custom Name");
  });

  test("returns 400 when abs_path is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("abs_path");
  });

  test("returns 400 when abs_path is not a string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: 12345 }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 409 when abs_path is already registered", async () => {
    const deps = makeDeps();
    // Pre-register the path
    deps.registry.create({ absPath: "/tmp/duplicate" });
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/tmp/duplicate" }),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("project_already_registered");
    expect((body as any).error.details.abs_path).toBe("/tmp/duplicate");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
  });

  test("returns 400 for JSON array body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for JSON null body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const res = await createProject(req, deps);
    expect(res.status).toBe(400);
  });

  test("accepts name as non-string (coerced to string or ignored)", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/tmp/test", name: null }),
    });
    // name is not a string so it should be ignored — abs_path is valid
    const res = await createProject(req, deps);
    // Should succeed using default name behavior (basename of abs_path)
    expect(res.status).toBe(201);
  });
});

// ─── archiveProject ─────────────────────────────────────────────────────────

describe("archiveProject", () => {
  test("returns 200 with archived project when project exists", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/archive-test" });
    const res = archiveProject(created.id, deps);
    expect(res.status).toBe(200);
  });

  test("returns 404 when project does not exist", () => {
    const deps = makeDeps();
    const res = archiveProject("nonexistent-id-xyz", deps);
    expect(res.status).toBe(404);
  });
});

// ─── purgeProject ──────────────────────────────────────────────────────────

describe("purgeProject", () => {
  test("returns 204 when project is deleted", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/purge-test" });
    const res = purgeProject(created.id, deps);
    expect(res.status).toBe(204);
  });

  test("project is no longer retrievable after purge", () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/purge-test-2" });
    purgeProject(created.id, deps);
    expect(deps.registry.get(created.id)).toBeUndefined();
  });

  test("returns 404 when project does not exist", () => {
    const deps = makeDeps();
    const res = purgeProject("nonexistent-id-xyz", deps);
    expect(res.status).toBe(404);
  });
});

// ─── patchProject ───────────────────────────────────────────────────────────

describe("patchProject", () => {
  test("returns 200 when updating name", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/patch-test" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed Project" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).name).toBe("Renamed Project");
  });

  test("returns 200 when updating status to ready", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/status-test" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "ready" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).status).toBe("ready");
  });

  test("returns 200 when updating status to archived", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/arch-test" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).status).toBe("archived");
  });

  test("returns 200 when updating both name and status in same request", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/both-test" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name", status: "ready" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).name).toBe("New Name");
    expect((body as any).status).toBe("ready");
  });

  test("returns 400 for invalid status value", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/invalid-status" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "not_a_real_status" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("invalid status");
    expect((body as any).error.details.status).toBe("not_a_real_status");
  });

  test("returns 400 when no updatable fields are provided", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/no-fields" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("no updatable fields");
  });

  test("returns 404 when project does not exist", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Whatever" }),
    });
    const res = await patchProject("nonexistent-id-xyz", req, deps);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("project_not_found");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/bad-json" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "this is not json",
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
  });

  test("returns 400 for JSON array body", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/array-body" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["name", "value"]),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for JSON null body", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/null-body" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
  });

  test("name field is ignored when not a string", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/bad-name-type" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: false }),
    });
    // name is not a string so it's ignored, but status is also not provided → 400
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    expect((await res.json() as any).error.message).toContain("no updatable fields");
  });

  test("status field is ignored when not a string", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/bad-status-type" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: 12345 }),
    });
    // status is not a string so it's ignored, name also not provided → 400
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
  });

  test("first invalid field causes 400 when both name and status provided", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/tmp/mixed-invalid" });
    const req = new Request("http://x/", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Valid Name", status: "totally_invalid_status" }),
    });
    const res = await patchProject(created.id, req, deps);
    expect(res.status).toBe(400);
    // The status validation runs second (after name update), so we get the status error
    const body = await res.json() as Record<string, unknown>;
    expect((body as any).error.details.status).toBe("totally_invalid_status");
  });
});
