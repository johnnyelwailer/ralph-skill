import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { WorkspaceRegistry } from "./workspace-registry.ts";

const WORKSPACE_SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  description               TEXT NOT NULL DEFAULT '',
  default_budget_usd_per_day REAL NOT NULL DEFAULT 0.00,
  metadata                  TEXT NOT NULL DEFAULT '{}',
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);

CREATE TABLE IF NOT EXISTS workspace_projects (
  workspace_id  TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'supporting',
  added_at      TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_wp_project_id ON workspace_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_wp_workspace_id ON workspace_projects(workspace_id);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  abs_path       TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'setup_pending'
                   CHECK (status IN ('setup_pending', 'ready', 'archived')),
  added_at       TEXT NOT NULL,
  last_active_at TEXT,
  updated_at     TEXT NOT NULL
);
`;

let db: Database;

function freshDb(): Database {
  const d = new Database();
  d.exec(WORKSPACE_SCHEMA);
  return d;
}

let registry: WorkspaceRegistry;

beforeEach(() => {
  db = freshDb();
  registry = new WorkspaceRegistry(db);
});

afterEach(() => {
  db.close();
});

// ─── create ─────────────────────────────────────────────────────────────────

describe("create", () => {
  test("creates a workspace and returns it", () => {
    const ws = registry.create({ name: "Test Workspace" });
    expect(ws.id).toBeTruthy();
    expect(ws.name).toBe("Test Workspace");
    expect(ws.description).toBe("");
    expect(ws.defaultBudgetUsdPerDay).toBe(0);
  });

  test("accepts all optional fields", () => {
    const ws = registry.create({
      name: "Full Workspace",
      description: "A detailed description",
      defaultBudgetUsdPerDay: 10.5,
      metadata: { color: "blue" },
    });
    expect(ws.description).toBe("A detailed description");
    expect(ws.defaultBudgetUsdPerDay).toBe(10.5);
    expect(ws.metadata).toEqual({ color: "blue" });
  });

  test("accepts a custom id override", () => {
    const ws = registry.create({ name: "Custom ID", id: "ws-custom-123" });
    expect(ws.id).toBe("ws-custom-123");
  });
});

// ─── get ─────────────────────────────────────────────────────────────────────

describe("get", () => {
  test("returns the workspace when found", () => {
    const created = registry.create({ name: "Get Me" });
    const found = registry.get(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("Get Me");
  });

  test("returns undefined when workspace does not exist", () => {
    const found = registry.get("nonexistent-ws-id");
    expect(found).toBeUndefined();
  });
});

// ─── list ────────────────────────────────────────────────────────────────────

describe("list", () => {
  test("returns empty array when no workspaces exist", () => {
    expect(registry.list()).toEqual([]);
  });

  test("returns workspaces ordered by created_at", () => {
    const ws1 = registry.create({ name: "First" });
    const ws2 = registry.create({ name: "Second" });
    const ws3 = registry.create({ name: "Third" });

    const listed = registry.list();
    expect(listed.map((w) => w.id)).toEqual([ws1.id, ws2.id, ws3.id]);
  });

  test("returns workspace with zero project counts when no memberships", () => {
    registry.create({ name: "Lonely" });
    const listed = registry.list();
    expect(listed[0]!.projectCounts.total).toBe(0);
    expect(listed[0]!.defaultProjectId).toBeNull();
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("update", () => {
  test("updates name", () => {
    const ws = registry.create({ name: "Old Name" });
    const updated = registry.update(ws.id, { name: "New Name" });
    expect(updated.name).toBe("New Name");
  });

  test("updates description", () => {
    const ws = registry.create({ name: "Desc Test" });
    const updated = registry.update(ws.id, { description: "New description" });
    expect(updated.description).toBe("New description");
  });

  test("updates defaultBudgetUsdPerDay", () => {
    const ws = registry.create({ name: "Budget Test" });
    const updated = registry.update(ws.id, { defaultBudgetUsdPerDay: 25.0 });
    expect(updated.defaultBudgetUsdPerDay).toBe(25.0);
  });

  test("updates metadata", () => {
    const ws = registry.create({ name: "Meta Test" });
    const updated = registry.update(ws.id, { metadata: { tier: "pro" } });
    expect(updated.metadata).toEqual({ tier: "pro" });
  });

  test("throws when workspace not found", () => {
    expect(() => registry.update("nonexistent-id", { name: "X" })).toThrow();
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("delete", () => {
  test("deletes the workspace", () => {
    const ws = registry.create({ name: "To Delete" });
    expect(registry.get(ws.id)).toBeDefined();
    registry.delete(ws.id);
    expect(registry.get(ws.id)).toBeUndefined();
  });

  test("deleting non-existent workspace is silent", () => {
    expect(() => registry.delete("nonexistent-id")).not.toThrow();
  });

  test("deleting a workspace also removes its project memberships", () => {
    const ws = registry.create({ name: "Membership Test" });
    // Insert a project directly so we can link it
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-1', '/tmp/proj1', 'Proj 1', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);
    registry.addProject(ws.id, "proj-1", "primary");

    registry.delete(ws.id);

    // The workspace should be gone
    expect(registry.get(ws.id)).toBeUndefined();
    // The project membership should be gone (listProjects should return empty)
    expect(registry.listProjects(ws.id)).toEqual([]);
  });
});

// ─── listProjects ─────────────────────────────────────────────────────────────

describe("listProjects", () => {
  test("returns empty array when no projects are linked", () => {
    const ws = registry.create({ name: "No Projects" });
    expect(registry.listProjects(ws.id)).toEqual([]);
  });

  test("returns linked projects with their roles", () => {
    const ws = registry.create({ name: "Project List Test" });
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-a', '/tmp/proj-a', 'Proj A', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-b', '/tmp/proj-b', 'Proj B', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);

    registry.addProject(ws.id, "proj-a", "primary");
    registry.addProject(ws.id, "proj-b", "supporting");

    const projects = registry.listProjects(ws.id);
    expect(projects).toHaveLength(2);
    const roles = new Map(projects.map((p) => [p.projectId, p.role]));
    expect(roles.get("proj-a")).toBe("primary");
    expect(roles.get("proj-b")).toBe("supporting");
  });
});

// ─── addProject ───────────────────────────────────────────────────────────────

describe("addProject", () => {
  test("adds a project to a workspace with default role", () => {
    const ws = registry.create({ name: "Add Test" });
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-x', '/tmp/proj-x', 'Proj X', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);

    const membership = registry.addProject(ws.id, "proj-x");
    expect(membership.workspaceId).toBe(ws.id);
    expect(membership.projectId).toBe("proj-x");
    expect(membership.role).toBe("supporting"); // default role
  });

  test("adds a project with explicit role", () => {
    const ws = registry.create({ name: "Add With Role" });
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-y', '/tmp/proj-y', 'Proj Y', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);

    const membership = registry.addProject(ws.id, "proj-y", "experiment");
    expect(membership.role).toBe("experiment");
  });
});

// ─── removeProject ────────────────────────────────────────────────────────────

describe("removeProject", () => {
  test("removes a project from a workspace", () => {
    const ws = registry.create({ name: "Remove Test" });
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-rm', '/tmp/proj-rm', 'Proj RM', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);

    registry.addProject(ws.id, "proj-rm");
    expect(registry.listProjects(ws.id)).toHaveLength(1);

    registry.removeProject(ws.id, "proj-rm");
    expect(registry.listProjects(ws.id)).toEqual([]);
  });

  test("removing non-linked project is silent", () => {
    const ws = registry.create({ name: "Remove Non-linked" });
    expect(() => registry.removeProject(ws.id, "nonexistent-proj")).not.toThrow();
  });
});

// ─── getProjectCounts ─────────────────────────────────────────────────────────

describe("getProjectCounts", () => {
  test("returns zero counts when no projects are linked", () => {
    const ws = registry.create({ name: "Counts Zero" });
    const counts = registry.getProjectCounts(ws.id);
    expect(counts.total).toBe(0);
    expect(counts.primary).toBe(0);
    expect(counts.supporting).toBe(0);
    expect(counts.dependency).toBe(0);
    expect(counts.experiment).toBe(0);
    expect(counts.defaultProjectId).toBeNull();
  });

  test("counts projects by role", () => {
    const ws = registry.create({ name: "Counts By Role" });
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-r1', '/tmp/p1', 'P1', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-r2', '/tmp/p2', 'P2', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);
    db.exec(`INSERT INTO projects (id, abs_path, name, status, added_at, updated_at) VALUES ('proj-r3', '/tmp/p3', 'P3', 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`);

    registry.addProject(ws.id, "proj-r1", "primary");
    registry.addProject(ws.id, "proj-r2", "supporting");
    registry.addProject(ws.id, "proj-r3", "supporting");

    const counts = registry.getProjectCounts(ws.id);
    expect(counts.total).toBe(3);
    expect(counts.primary).toBe(1);
    expect(counts.supporting).toBe(2);
    expect(counts.dependency).toBe(0);
    expect(counts.experiment).toBe(0);
  });
});
