import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { handleProjects, type ProjectsDeps } from "./projects.ts";

function makeDeps(): ProjectsDeps {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return { registry: new ProjectRegistry(db) };
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

// ─── /v1/projects (exact) ─────────────────────────────────────────────────

describe("GET /v1/projects", () => {
  test("returns 200 with project list", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects"),
      deps,
      "/v1/projects",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; items: unknown[] }>(res!);
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
  });
});

describe("POST /v1/projects", () => {
  test("returns 201 when abs_path is provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ abs_path: "/test/path" }),
    });
    const res = await handleProjects(req, deps, "/v1/projects");
    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    const body = await resJson<{ _v: number; id: string }>(res!);
    expect(body._v).toBe(1);
    expect(body.id).toBeTruthy();
  });

  test("returns 400 when abs_path is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleProjects(req, deps, "/v1/projects");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });
});

describe("non-GET/POST on /v1/projects", () => {
  test("returns 405 for DELETE", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects", { method: "DELETE" }),
      deps,
      "/v1/projects",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("returns 405 for PATCH", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects", { method: "PATCH" }),
      deps,
      "/v1/projects",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/projects/:id (no action) ───────────────────────────────────────

describe("GET /v1/projects/:id", () => {
  test("returns 200 with project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}`),
      deps,
      `/v1/projects/${created.id}`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; id: string }>(res!);
    expect(body.id).toBe(created.id);
  });

  test("returns 404 for unknown id", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects/unknown-id"),
      deps,
      "/v1/projects/unknown-id",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("PATCH /v1/projects/:id", () => {
  test("returns 200 when updating name", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const req = new Request(`http://x/v1/projects/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await handleProjects(req, deps, `/v1/projects/${created.id}`);
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; name: string }>(res!);
    expect(body.name).toBe("Updated");
  });

  test("returns 404 for unknown id", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/projects/unknown-id", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await handleProjects(req, deps, "/v1/projects/unknown-id");
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("DELETE /v1/projects/:id", () => {
  test("returns 200 and archives project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}`, { method: "DELETE" }),
      deps,
      `/v1/projects/${created.id}`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; status: string }>(res!);
    expect(body.status).toBe("archived");
  });

  test("returns 404 for unknown id", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects/unknown-id", { method: "DELETE" }),
      deps,
      "/v1/projects/unknown-id",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("non-GET/PATCH/DELETE on /v1/projects/:id", () => {
  test("returns 405 for POST", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}`, { method: "POST" }),
      deps,
      `/v1/projects/${created.id}`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("returns 405 for PUT", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}`, { method: "PUT" }),
      deps,
      `/v1/projects/${created.id}`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/projects/:id/purge ────────────────────────────────────────────────

describe("POST /v1/projects/:id/purge", () => {
  test("returns 204 and removes project", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}/purge`, { method: "POST" }),
      deps,
      `/v1/projects/${created.id}/purge`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(204);
    // verify project is gone
    const getRes = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}`),
      deps,
      `/v1/projects/${created.id}`,
    );
    expect(getRes!.status).toBe(404);
  });

  test("returns 404 for unknown id", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects/unknown-id/purge", { method: "POST" }),
      deps,
      "/v1/projects/unknown-id/purge",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("project_not_found");
  });
});

describe("non-POST on /v1/projects/:id/purge", () => {
  test("returns 404 for GET", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}/purge`),
      deps,
      `/v1/projects/${created.id}/purge`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });

  test("returns 404 for DELETE", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}/purge`, { method: "DELETE" }),
      deps,
      `/v1/projects/${created.id}/purge`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });
});

// ─── Unhandled paths ──────────────────────────────────────────────────────

describe("empty id segment", () => {
  test("returns 404 for /v1/projects/ (no id)", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/projects/"),
      deps,
      "/v1/projects/",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });
});

describe("unknown action", () => {
  test("returns 404 for /v1/projects/:id/unknown_action", async () => {
    const deps = makeDeps();
    const created = deps.registry.create({ absPath: "/test/path" });
    const res = await handleProjects(
      new Request(`http://x/v1/projects/${created.id}/unknown`),
      deps,
      `/v1/projects/${created.id}/unknown`,
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });
});

describe("pathname not starting with /v1/projects", () => {
  test("returns undefined (caller should handle)", async () => {
    const deps = makeDeps();
    const res = await handleProjects(
      new Request("http://x/v1/other"),
      deps,
      "/v1/other",
    );
    expect(res).toBeUndefined();
  });
});
