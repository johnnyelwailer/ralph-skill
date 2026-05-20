/**
 * Edge-case coverage for workspaces-handlers.ts.
 *
 * These tests cover validation gaps found during coverage analysis:
 * - whitespace-only name strings (should be rejected, currently not validated)
 * - negative default_budget_usd_per_day (should be rejected, currently not validated)
 *
 * Per TDD philosophy: tests assert what the code SHOULD do per spec. When they
 * fail against current implementation, that is a valid spec-mismatch finding.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry, WorkspaceRegistry } from "@aloop/state-sqlite";
import {
  createWorkspaceHandler,
  patchWorkspaceHandler,
  addProjectToWorkspaceHandler,
} from "./workspaces-handlers.ts";
import type { Deps } from "./workspaces-common.ts";

function makeDeps(dir: string): Deps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const registry = new WorkspaceRegistry(db);
  const projectRegistry = new ProjectRegistry(db);
  (registry as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  (registry as unknown as { _projectRegistry: ProjectRegistry })._projectRegistry = projectRegistry;
  return { registry, projectRegistry };
}

// ─────────────────────────────────────────────────────────────────
// createWorkspaceHandler — whitespace name validation
// ─────────────────────────────────────────────────────────────────

describe("createWorkspaceHandler whitespace-only name", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-whitespace-create-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 400 for name with only spaces", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    // name is required and spaces-only is not a valid name
    expect(body.error.message).toContain("name");
  });

  test("returns 400 for name with only tabs", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "\t\t" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for name with only newlines", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "\n\n" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 for name that is only whitespace (mixed chars)", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  \t  \n  " }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
  });

  test("accepts name with leading/trailing spaces (non-empty after trim)", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  Team Alpha  " }),
    });
    const res = await createWorkspaceHandler(req, deps);
    // Currently this passes (spaces are accepted as part of name)
    // This test documents current behaviour
    expect(res.status).toBe(201);
  });

  test("accepts name with leading/trailing tabs", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "\tTeam Beta\t" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────
// createWorkspaceHandler — default_budget_usd_per_day validation
// ─────────────────────────────────────────────────────────────────

describe("createWorkspaceHandler default_budget_usd_per_day validation", () => {
  let dir: string;
  let deps: Deps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-budget-create-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 400 when default_budget_usd_per_day is negative", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws", default_budget_usd_per_day: -50 }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when default_budget_usd_per_day is a string", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws", default_budget_usd_per_day: "50" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when default_budget_usd_per_day is an object", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws", default_budget_usd_per_day: {} }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(400);
  });

  test("accepts zero default_budget_usd_per_day", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws", default_budget_usd_per_day: 0 }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });

  test("accepts positive default_budget_usd_per_day", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws", default_budget_usd_per_day: 25.5 }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });

  test("accepts absent default_budget_usd_per_day", async () => {
    const req = new Request("http://localhost/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "budget-ws" }),
    });
    const res = await createWorkspaceHandler(req, deps);
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────
// patchWorkspaceHandler — whitespace name validation
// ─────────────────────────────────────────────────────────────────

describe("patchWorkspaceHandler whitespace-only name", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-whitespace-patch-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "original-name" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 400 when patch sets name to only spaces", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when patch sets name to only tabs", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "\t\t" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
  });

  test("returns 400 when patch sets name to only newlines", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "\n\n" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
  });

  test("accepts patch that sets name to whitespace-trimmed string", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  Updated Name  " }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    // Currently this is accepted (spaces are allowed in name)
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
// patchWorkspaceHandler — default_budget_usd_per_day validation
// ─────────────────────────────────────────────────────────────────

describe("patchWorkspaceHandler default_budget_usd_per_day validation", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-budget-patch-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "budget-patch-ws" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 400 when default_budget_usd_per_day is set to negative", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_budget_usd_per_day: -10 }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when default_budget_usd_per_day is a string", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_budget_usd_per_day: "100" }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(400);
  });

  test("accepts zero default_budget_usd_per_day in patch", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_budget_usd_per_day: 0 }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
  });

  test("accepts positive default_budget_usd_per_day in patch", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ default_budget_usd_per_day: 150.75 }),
    });
    const res = await patchWorkspaceHandler(workspaceId, req, deps);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
// addProjectToWorkspaceHandler — description validation edge cases
// (description is accepted as any string; tests document current behaviour)
// ─────────────────────────────────────────────────────────────────

describe("addProjectToWorkspaceHandler description field edge cases", () => {
  let dir: string;
  let deps: Deps;
  let workspaceId: string;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ws-add-desc-"));
    deps = makeDeps(dir);
    workspaceId = deps.registry.create({ name: "desc-ws" }).id;
    projectId = deps.projectRegistry.create({ absPath: "/test/desc", name: "desc-project" }).id;
  });

  afterEach(() => {
    const reg = deps.registry as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("accepts empty string description", async () => {
    const req = new Request(`http://localhost/v1/workspaces/${workspaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: projectId, description: "" }),
    });
    const res = await addProjectToWorkspaceHandler(workspaceId, req, deps);
    // No description field in request body means addProjectToWorkspaceHandler
    // doesn't handle it; this is documentation that description is not accepted here
    expect(res.status).toBe(201);
  });
});