import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  loadBundledMigrations,
  migrate,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { getProject, listProjects, type Deps } from "./projects-handlers.ts";

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
