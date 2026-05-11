import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceById,
  listWorkspaceProjects,
  listWorkspaces,
  removeProjectFromWorkspace,
  updateWorkspace,
  addProjectToWorkspace,
} from "./workspace-queries.ts";
import {
  ProjectNotFoundWorkspaceError,
} from "./workspace-types.ts";

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
  const d = new Database(":memory:");
  d.exec(WORKSPACE_SCHEMA);
  return d;
}

beforeEach(() => {
  db = freshDb();
});

afterEach(() => {
  db.close();
});

function seedProject(id: string, name: string, status = "ready") {
  db.run(
    `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    [id, `/tmp/${id}`, name, status],
  );
}

describe("createWorkspace", () => {
  test("inserts a workspace row and returns it", () => {
    const w = createWorkspace(db, { name: "Aloop" });
    expect(w.name).toBe("Aloop");
    expect(w.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(w.description).toBe("");
    expect(w.defaultBudgetUsdPerDay).toBe(0);
    expect(w.metadata).toEqual({});
    expect(w.createdAt).toBe(w.updatedAt);
  });

  test("accepts all optional fields", () => {
    const now = "2026-05-01T10:00:00Z";
    const w = createWorkspace(db, {
      name: "Platform",
      description: "Core infrastructure",
      defaultBudgetUsdPerDay: 50.0,
      metadata: { team: "platform" },
      id: "w_fixed",
      now,
    });
    expect(w.id).toBe("w_fixed");
    expect(w.name).toBe("Platform");
    expect(w.description).toBe("Core infrastructure");
    expect(w.defaultBudgetUsdPerDay).toBe(50.0);
    expect(w.metadata).toEqual({ team: "platform" });
    expect(w.createdAt).toBe(now);
  });
});

describe("getWorkspaceById", () => {
  test("returns the workspace when found", () => {
    const created = createWorkspace(db, { name: "Aloop" });
    const found = getWorkspaceById(db, created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Aloop");
  });

  test("returns undefined when not found", () => {
    const found = getWorkspaceById(db, "w_nonexistent");
    expect(found).toBeUndefined();
  });
});

describe("listWorkspaces", () => {
  test("returns empty array when no workspaces", () => {
    const items = listWorkspaces(db);
    expect(items).toHaveLength(0);
  });

  test("returns workspaces ordered by created_at", () => {
    createWorkspace(db, { name: "Second", id: "w_second", now: "2026-05-02T00:00:00Z" });
    createWorkspace(db, { name: "First", id: "w_first", now: "2026-05-01T00:00:00Z" });
    const items = listWorkspaces(db);
    expect(items).toHaveLength(2);
    expect(items[0]!.name).toBe("First");
    expect(items[1]!.name).toBe("Second");
  });

  test("filters by q (name)", () => {
    createWorkspace(db, { name: "Aloop" });
    createWorkspace(db, { name: "Platform" });
    const items = listWorkspaces(db, { q: "alo" });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("Aloop");
  });

  test("filters by q (description)", () => {
    createWorkspace(db, { name: "A", description: " harness product " });
    createWorkspace(db, { name: "B", description: " other " });
    const items = listWorkspaces(db, { q: "harness" });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("A");
  });

  test("enforces limit (capped at 50 default)", () => {
    for (let i = 0; i < 60; i++) {
      createWorkspace(db, {
        name: `W${i}`,
        id: `w_${i}`,
        now: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
    }
    const items = listWorkspaces(db);
    expect(items).toHaveLength(50);
  });

  test("respects explicit limit", () => {
    for (let i = 0; i < 10; i++) {
      createWorkspace(db, {
        name: `W${i}`,
        id: `w_${i}`,
        now: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      });
    }
    const items = listWorkspaces(db, { limit: 3 });
    expect(items).toHaveLength(3);
  });

  test("project counts are zero when no memberships", () => {
    createWorkspace(db, { name: "Empty" });
    const items = listWorkspaces(db);
    expect(items[0]!.projectCounts.total).toBe(0);
    expect(items[0]!.projectCounts.primary).toBe(0);
    expect(items[0]!.defaultProjectId).toBeNull();
  });

  test("project counts reflect workspace_projects rows", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    seedProject("p2", "P2");
    seedProject("p3", "P3");
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`,
      [w.id, "p1", "primary", "2026-05-01T00:00:00Z"],
    );
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`,
      [w.id, "p2", "supporting", "2026-05-01T00:00:00Z"],
    );
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`,
      [w.id, "p3", "primary", "2026-05-01T00:00:00Z"],
    );
    const items = listWorkspaces(db);
    expect(items[0]!.projectCounts.total).toBe(3);
    expect(items[0]!.projectCounts.primary).toBe(2);
    expect(items[0]!.projectCounts.supporting).toBe(1);
    expect(items[0]!.defaultProjectId).toBe("p1");
  });
});

describe("updateWorkspace", () => {
  test("updates name", () => {
    const created = createWorkspace(db, { name: "Old" });
    const updated = updateWorkspace(db, created.id, { name: "New" });
    expect(updated.name).toBe("New");
    expect(updated.id).toBe(created.id);
  });

  test("updates description", () => {
    const created = createWorkspace(db, { name: "W" });
    const updated = updateWorkspace(db, created.id, { description: "New description" });
    expect(updated.description).toBe("New description");
  });

  test("updates defaultBudgetUsdPerDay", () => {
    const created = createWorkspace(db, { name: "W" });
    const updated = updateWorkspace(db, created.id, { defaultBudgetUsdPerDay: 99.5 });
    expect(updated.defaultBudgetUsdPerDay).toBe(99.5);
  });

  test("updates metadata", () => {
    const created = createWorkspace(db, { name: "W" });
    const updated = updateWorkspace(db, created.id, { metadata: { key: "value" } });
    expect(updated.metadata).toEqual({ key: "value" });
  });

  test("throws when workspace not found", () => {
    expect(() => updateWorkspace(db, "w_nonexistent", { name: "X" })).toThrow(
      "workspace not found",
    );
  });
});

describe("deleteWorkspace", () => {
  test("deletes the workspace", () => {
    const created = createWorkspace(db, { name: "ToDelete" });
    deleteWorkspace(db, created.id);
    expect(getWorkspaceById(db, created.id)).toBeUndefined();
  });

  test("deleting non-existent is silent", () => {
    expect(() => deleteWorkspace(db, "w_nonexistent")).not.toThrow();
  });
});

describe("workspace project membership", () => {
  test("addProjectToWorkspace inserts a membership row", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    const wp = addProjectToWorkspace(db, w.id, "p1", "primary");
    expect(wp.workspaceId).toBe(w.id);
    expect(wp.projectId).toBe("p1");
    expect(wp.role).toBe("primary");
  });

  test("listWorkspaceProjects returns memberships for a workspace", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    seedProject("p2", "P2");
    addProjectToWorkspace(db, w.id, "p1", "primary");
    addProjectToWorkspace(db, w.id, "p2", "supporting");
    const projects = listWorkspaceProjects(db, w.id);
    expect(projects).toHaveLength(2);
    expect(projects[0]!.role).toBe("primary");
    expect(projects[1]!.role).toBe("supporting");
  });

  test("removeProjectFromWorkspace deletes the membership", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    addProjectToWorkspace(db, w.id, "p1");
    removeProjectFromWorkspace(db, w.id, "p1");
    expect(listWorkspaceProjects(db, w.id)).toHaveLength(0);
  });
});

describe("addProjectToWorkspace", () => {
  test("inserts a membership row", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    const wp = addProjectToWorkspace(db, w.id, "p1", "primary");
    expect(wp.workspaceId).toBe(w.id);
    expect(wp.projectId).toBe("p1");
    expect(wp.role).toBe("primary");
  });

  test("updates role when project is already a member (upsert)", () => {
    const w = createWorkspace(db, { name: "W" });
    seedProject("p1", "P1");
    addProjectToWorkspace(db, w.id, "p1", "primary");
    const updated = addProjectToWorkspace(db, w.id, "p1", "supporting");
    expect(updated.role).toBe("supporting");
    const projects = listWorkspaceProjects(db, w.id);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.role).toBe("supporting");
  });

  test("throws ProjectNotFoundWorkspaceError when project does not exist", () => {
    const w = createWorkspace(db, { name: "W" });
    expect(() => addProjectToWorkspace(db, w.id, "nonexistent-proj")).toThrow(
      ProjectNotFoundWorkspaceError,
    );
  });

  test("throws ProjectNotFoundWorkspaceError when workspace does not exist", () => {
    seedProject("p1", "P1");
    expect(() => addProjectToWorkspace(db, "nonexistent-ws", "p1")).toThrow(
      ProjectNotFoundWorkspaceError,
    );
  });

  test("ProjectNotFoundWorkspaceError carries the missing project id", () => {
    const w = createWorkspace(db, { name: "W" });
    let err: unknown;
    try {
      addProjectToWorkspace(db, w.id, "proj-missing");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ProjectNotFoundWorkspaceError);
    if (err instanceof ProjectNotFoundWorkspaceError) {
      expect(err.projectId).toBe("proj-missing");
    }
  });
});
