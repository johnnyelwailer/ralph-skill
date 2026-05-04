import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadBundledMigrations, openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRegistry } from "./projects.ts";
import { WorkspaceProjector } from "./workspace-projector.ts";

describe("WorkspaceProjector", () => {
  let db: ReturnType<typeof openDatabase> extends { db: infer D } ? D : never;
  let projector: WorkspaceProjector;
  let projectRegistry: ProjectRegistry;
  let tmpDir: string;

  beforeEach(() => {
    const { db: database } = openDatabase(":memory:");
    db = database;
    migrate(db);
    projectRegistry = new ProjectRegistry(db);
    projector = new WorkspaceProjector();
    tmpDir = mkdtempSync(join(tmpdir(), "aloop-ws-proj-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeEvent<T>(topic: string, data: T) {
    return { topic, data, id: "1.1", timestamp: "2026-01-01T00:00:00.000Z", trace: {} };
  }

  test("workspace.created inserts into workspaces table", () => {
    projector.apply(db, makeEvent("workspace.created", {
      workspace_id: "ws-1",
      name: "My Workspace",
      description: "A test workspace",
      default_project_id: null,
      metadata: { color: "blue" },
      created_at: "2026-01-01T00:00:00.000Z",
    }));

    const row = db.query("SELECT * FROM workspaces WHERE id = 'ws-1'").get() as {
      id: string; name: string; description: string; metadata: string;
    };
    expect(row.id).toBe("ws-1");
    expect(row.name).toBe("My Workspace");
    expect(row.description).toBe("A test workspace");
    expect(row.metadata).toBe(JSON.stringify({ color: "blue" }));
  });

  test("workspace.created with null description defaults to empty string", () => {
    projector.apply(db, makeEvent("workspace.created", {
      workspace_id: "ws-2",
      name: "No Desc",
      created_at: "2026-01-01T00:00:00.000Z",
    }));

    const row = db.query("SELECT description FROM workspaces WHERE id = 'ws-2'").get() as { description: string };
    expect(row.description).toBe("");
  });

  test("workspace.created with null default_project_id inserts null", () => {
    projector.apply(db, makeEvent("workspace.created", {
      workspace_id: "ws-3",
      name: "No Default",
      created_at: "2026-01-01T00:00:00.000Z",
    }));

    const row = db.query("SELECT default_project_id FROM workspaces WHERE id = 'ws-3'").get() as { default_project_id: string | null };
    expect(row.default_project_id).toBeNull();
  });

  test("workspace.created is idempotent on conflict (ON CONFLICT DO UPDATE)", () => {
    projector.apply(db, makeEvent("workspace.created", {
      workspace_id: "ws-idempotent",
      name: "First",
      created_at: "2026-01-01T00:00:00.000Z",
    }));
    projector.apply(db, makeEvent("workspace.created", {
      workspace_id: "ws-idempotent",
      name: "Second",
      created_at: "2026-01-02T00:00:00.000Z",
    }));

    const row = db.query("SELECT name, updated_at FROM workspaces WHERE id = 'ws-idempotent'").get() as { name: string; updated_at: string };
    expect(row.name).toBe("Second");
  });

  test("workspace.updated sets updated_at", () => {
    // Create first so the update has a row to act on
    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-upd", "Original", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.updated", {
      workspace_id: "ws-upd",
      updated_at: "2026-02-01T00:00:00.000Z",
    }));

    const row = db.query("SELECT updated_at FROM workspaces WHERE id = 'ws-upd'").get() as { updated_at: string };
    expect(row.updated_at).toBe("2026-02-01T00:00:00.000Z");
  });

  test("workspace.archived sets archived_at and updated_at", () => {
    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-arch", "To Archive", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.archived", {
      workspace_id: "ws-arch",
      archived_at: "2026-03-01T00:00:00.000Z",
    }));

    const row = db.query("SELECT archived_at, updated_at FROM workspaces WHERE id = 'ws-arch'").get() as { archived_at: string; updated_at: string };
    expect(row.archived_at).toBe("2026-03-01T00:00:00.000Z");
    expect(row.updated_at).toBe("2026-03-01T00:00:00.000Z");
  });

  test("workspace.project_added inserts into workspace_projects", () => {
    // Set up required project first
    projectRegistry.create({ absPath: tmpDir });
    const projectRow = db.query("SELECT id FROM projects LIMIT 1").get() as { id: string };
    const projectId = projectRow.id;

    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-proj-add", "Test", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.project_added", {
      workspace_id: "ws-proj-add",
      project_id: projectId,
      role: "primary",
      added_at: "2026-01-15T00:00:00.000Z",
    }));

    const row = db.query(
      "SELECT workspace_id, project_id, role, added_at FROM workspace_projects WHERE workspace_id = 'ws-proj-add'",
    ).get() as { workspace_id: string; project_id: string; role: string; added_at: string };
    expect(row.workspace_id).toBe("ws-proj-add");
    expect(row.project_id).toBe(projectId);
    expect(row.role).toBe("primary");
    expect(row.added_at).toBe("2026-01-15T00:00:00.000Z");
  });

  test("workspace.project_added is idempotent (updates role on conflict)", () => {
    projectRegistry.create({ absPath: tmpDir });
    const projectRow = db.query("SELECT id FROM projects LIMIT 1").get() as { id: string };
    const projectId = projectRow.id;

    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-proj-conf", "Test", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`,
      ["ws-proj-conf", projectId, "supporting", "2026-01-10T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.project_added", {
      workspace_id: "ws-proj-conf",
      project_id: projectId,
      role: "primary",
      added_at: "2026-01-20T00:00:00.000Z",
    }));

    const rows = db.query(
      "SELECT role, added_at FROM workspace_projects WHERE workspace_id = 'ws-proj-conf'",
    ).all() as { role: string; added_at: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe("primary");
    expect(rows[0]!.added_at).toBe("2026-01-20T00:00:00.000Z");
  });

  test("workspace.project_removed deletes from workspace_projects", () => {
    projectRegistry.create({ absPath: tmpDir });
    const projectRow = db.query("SELECT id FROM projects LIMIT 1").get() as { id: string };
    const projectId = projectRow.id;

    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-proj-rem", "Test", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`,
      ["ws-proj-rem", projectId, "primary", "2026-01-01T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.project_removed", {
      workspace_id: "ws-proj-rem",
      project_id: projectId,
    }));

    const rows = db.query(
      "SELECT * FROM workspace_projects WHERE workspace_id = 'ws-proj-rem'",
    ).all();
    expect(rows).toHaveLength(0);
  });

  test("unknown topic is a no-op", () => {
    db.run(
      `INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ["ws-unknown", "Before", "", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );

    projector.apply(db, makeEvent("workspace.unknown_topic", {}));

    const row = db.query("SELECT name FROM workspaces WHERE id = 'ws-unknown'").get() as { name: string };
    expect(row.name).toBe("Before");
  });
});

function migrate(db: ReturnType<typeof openDatabase> extends { db: infer D } ? D : never) {
  const { loadBundledMigrations, migrate } = require("@aloop/sqlite-db");
  migrate(db, loadBundledMigrations());
}
