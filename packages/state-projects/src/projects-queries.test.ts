import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalizeProjectPath,
  getProjectById,
  getProjectByPath,
  listProjectsFromDb,
} from "./projects-queries.ts";
import type { ProjectStatus } from "./project-types.ts";

const SCHEMA = `
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
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_abs_path ON projects(abs_path);
CREATE TABLE IF NOT EXISTS workspace_projects (
  workspace_id TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (workspace_id, project_id)
);
`;

function seedProject(
  db: Database,
  id: string,
  status: ProjectStatus,
  absPath: string,
  name: string,
  addedAt = "2024-01-01T00:00:00Z",
  lastActiveAt: string | null = "2024-01-01T00:00:00Z",
) {
  db.run(
    `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, absPath, name, status, addedAt, lastActiveAt, addedAt],
  );
}

describe("getProjectById", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA);
    seedProject(db, "id-1", "ready", "/tmp/project-a", "Project A");
    seedProject(db, "id-2", "archived", "/tmp/project-b", "Project B");
  });

  afterEach(() => {
    db.close();
  });

  test("returns the project when found by id", () => {
    const project = getProjectById(db, "id-1");
    expect(project).toBeDefined();
    expect(project!.id).toBe("id-1");
    expect(project!.absPath).toBe("/tmp/project-a");
    expect(project!.name).toBe("Project A");
    expect(project!.status).toBe("ready");
  });

  test("returns undefined when no project has that id", () => {
    const project = getProjectById(db, "nonexistent-id");
    expect(project).toBeUndefined();
  });

  test("returns correct project when multiple exist", () => {
    const project = getProjectById(db, "id-2");
    expect(project).toBeDefined();
    expect(project!.name).toBe("Project B");
    expect(project!.status).toBe("archived");
  });

  test("returns workspaceIds when project belongs to one or more workspaces", () => {
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role) VALUES (?, ?, ?)`,
      ["ws_alpha", "id-1", "admin"],
    );
    db.run(
      `INSERT INTO workspace_projects (workspace_id, project_id, role) VALUES (?, ?, ?)`,
      ["ws_beta", "id-1", "member"],
    );
    const project = getProjectById(db, "id-1")!;
    expect(project.workspaceIds).toEqual(["ws_alpha", "ws_beta"]);
  });

  test("returns empty workspaceIds array when project has no workspace associations", () => {
    const project = getProjectById(db, "id-1")!;
    expect(project.workspaceIds).toEqual([]);
  });
});

describe("getProjectByPath", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA);
    seedProject(db, "id-x", "setup_pending", "/tmp/path-test", "Path Test");
  });

  afterEach(() => {
    db.close();
  });

  test("returns the project when found by absolute path", () => {
    const project = getProjectByPath(db, "/tmp/path-test");
    expect(project).toBeDefined();
    expect(project!.id).toBe("id-x");
    expect(project!.status).toBe("setup_pending");
  });

  test("returns undefined when no project at that path", () => {
    const project = getProjectByPath(db, "/tmp/nonexistent");
    expect(project).toBeUndefined();
  });

  test("strips trailing slashes from path before lookup", () => {
    const project = getProjectByPath(db, "/tmp/path-test///");
    expect(project).toBeDefined();
    expect(project!.id).toBe("id-x");
  });
});

describe("listProjectsFromDb", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(SCHEMA);
    seedProject(db, "p1", "ready", "/tmp/alpha", "Alpha");
    seedProject(db, "p2", "archived", "/tmp/beta", "Beta");
    seedProject(db, "p3", "setup_pending", "/tmp/gamma", "Gamma");
    seedProject(db, "p4", "ready", "/tmp/delta", "Delta");
    // Insert out of added_at order to test ORDER BY
    seedProject(db, "p5", "ready", "/tmp/epsilon", "Epsilon", "2024-01-00T00:00:00Z");
  });

  afterEach(() => {
    db.close();
  });

  test("returns all projects with no filter", () => {
    const projects = listProjectsFromDb(db);
    expect(projects).toHaveLength(5);
  });

  test("filters by status", () => {
    const ready = listProjectsFromDb(db, { status: "ready" });
    expect(ready).toHaveLength(3);
    expect(ready.every((p) => p.status === "ready")).toBe(true);
  });

  test("filters by absPath", () => {
    const results = listProjectsFromDb(db, { absPath: "/tmp/alpha" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("p1");
  });

  test("combines status and absPath filters", () => {
    const results = listProjectsFromDb(db, { status: "ready", absPath: "/tmp/alpha" });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("p1");
  });

  test("returns empty array when status filter matches nothing", () => {
    const results = listProjectsFromDb(db, { status: "archived", absPath: "/tmp/nonexistent" });
    expect(results).toHaveLength(0);
  });

  test("returns projects ordered by added_at ascending", () => {
    const projects = listProjectsFromDb(db);
    expect(projects[0]!.id).toBe("p5"); // earliest added
    expect(projects[4]!.id).toBe("p4"); // latest added
  });

  test("maps all row fields correctly to Project shape", () => {
    const project = getProjectById(db, "p1")!;
    expect(project.absPath).toBe("/tmp/alpha");
    expect(project.name).toBe("Alpha");
    expect(typeof project.addedAt).toBe("string");
    expect(typeof project.updatedAt).toBe("string");
  });

  test("handles null last_active_at", () => {
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p6", "/tmp/zeta", "Zeta", "ready", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    const project = getProjectById(db, "p6")!;
    expect(project.lastActiveAt).toBeNull();
  });
});

describe("getProjectByPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-canonicalize-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("resolves an existing path via realpathSync", () => {
    const result = canonicalizeProjectPath("/tmp");
    expect(result).toBe(realpathSync("/tmp"));
  });

  test("strips trailing slashes from a nonexistent path and returns it as-is", () => {
    const result = canonicalizeProjectPath("/nonexistent/path/to/project///");
    expect(result).toBe("/nonexistent/path/to/project");
  });

  test("returns a normalized path when realpathSync throws (nonexistent dir)", () => {
    const result = canonicalizeProjectPath("/tmp/also-does-not-exist///");
    expect(result).toBe("/tmp/also-does-not-exist");
  });

  test("result is always absolute (starts with /)", () => {
    const result = canonicalizeProjectPath("/tmp");
    expect(result.startsWith("/")).toBe(true);
  });

  test("resolves a valid symlink to its target", () => {
    const target = join(dir, "target");
    const link = join(dir, "link");
    writeFileSync(target, "");
    symlinkSync(target, link);
    const result = canonicalizeProjectPath(link);
    expect(result).toBe(target);
  });

  test("strips trailing slashes when realpathSync throws on broken symlink", () => {
    const broken = join(dir, "broken");
    const link = join(dir, "link");
    symlinkSync(broken, link);
    const result = canonicalizeProjectPath(link);
    expect(result).toBe(link.replace(/\/+$/, "") || link);
  });

  test("strips trailing slashes for non-existent nested path", () => {
    const result = canonicalizeProjectPath(join(dir, "nonexistent-subdir", "path"));
    expect(result).toBe(join(dir, "nonexistent-subdir", "path").replace(/\/+$/, ""));
  });
});
