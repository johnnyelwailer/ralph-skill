import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLocalFsProjectAdapter, type LocalFsProjectAdapterOptions } from "./local-fs.ts";

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
CREATE TABLE IF NOT EXISTS project_workspaces (
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'supporting'
                  CHECK (role IN ('primary', 'supporting', 'dependency', 'experiment')),
  added_at      TEXT NOT NULL,
  PRIMARY KEY (project_id, workspace_id)
);
`;

describe("createLocalFsProjectAdapter", () => {
  let tmpDir: string;
  let db: Database;
  let adapter: ReturnType<typeof createLocalFsProjectAdapter>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(__dirname, "local-fs-test-"));
    db = new Database(join(tmpDir, "test.sqlite"));
    db.exec(SCHEMA);
    const opts: LocalFsProjectAdapterOptions = { db, stateDir: tmpDir };
    adapter = createLocalFsProjectAdapter(opts);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true });
  });

  test("adapter has correct id and target", () => {
    expect(adapter.id).toBe("local-fs");
    expect(adapter.target).toBe("local-fs");
  });

  test("resolveProjectRoot returns project path for valid id", async () => {
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p1", "/tmp/testproj", "testproj", "ready", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    await expect(adapter.resolveProjectRoot("p1")).resolves.toBe("/tmp/testproj");
  });

  test("resolveProjectRoot throws for unknown project", () => {
    expect(adapter.resolveProjectRoot("unknown")).rejects.toThrow("project not found");
  });

  test("resolveWorktreeRoot returns path when worktree exists", async () => {
    const sessionDir = join(tmpDir, "sessions", "s1", "worktree");
    mkdirSync(sessionDir, { recursive: true });
    const result = await adapter.resolveWorktreeRoot("s1");
    expect(result).toBe(sessionDir);
  });

  test("resolveWorktreeRoot returns null when worktree does not exist", () => {
    expect(adapter.resolveWorktreeRoot("s_nonexistent")).resolves.toBeNull();
  });

  test("createWorktree returns worktree path for valid project", async () => {
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p1", "/tmp/testproj", "testproj", "ready", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    const worktreePath = await adapter.createWorktree("s_new", "p1");
    expect(worktreePath).toBe(join(tmpDir, "sessions", "s_new", "worktree"));
  });

  test("createWorktree throws for unknown project", () => {
    expect(adapter.createWorktree("s_new", "unknown")).rejects.toThrow("project not found");
  });

  test("getProjectFromPath returns project for known path", () => {
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p1", "/tmp/testproj", "testproj", "ready", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    const project = adapter.getProjectFromPath("/tmp/testproj");
    expect(project?.id).toBe("p1");
  });

  test("getProjectFromPath returns undefined for unknown path", () => {
    expect(adapter.getProjectFromPath("/unknown")).toBeUndefined();
  });

  test("listProjects returns all projects", () => {
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p1", "/tmp/proj1", "proj1", "ready", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, last_active_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["p2", "/tmp/proj2", "proj2", "setup_pending", "2024-01-01T00:00:00Z", null, "2024-01-01T00:00:00Z"],
    );
    const projects = adapter.listProjects();
    expect(projects.length).toBe(2);
  });
});