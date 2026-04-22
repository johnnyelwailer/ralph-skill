import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { migrate, loadBundledMigrations } from "./migrations.ts";
import { canonicalizeProjectPath, getProjectById, getProjectByPath, listProjectsFromDb } from "./projects-queries.ts";
import type { ProjectStatus } from "./project-types.ts";

describe("canonicalizeProjectPath", () => {
  test("resolves relative paths to absolute", () => {
    const abs = canonicalizeProjectPath("./fixtures");
    expect(abs.startsWith("/")).toBe(true);
  });

  test("returns non-existent paths as-is with trailing slashes stripped", () => {
    expect(canonicalizeProjectPath("/nonexistent/foo/bar")).toBe("/nonexistent/foo/bar");
    expect(canonicalizeProjectPath("/nonexistent/foo/bar/")).toBe("/nonexistent/foo/bar");
    expect(canonicalizeProjectPath("/nonexistent/foo//")).toBe("/nonexistent/foo");
  });

  test("realpaths an existing directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-canon-"));
    try {
      const result = canonicalizeProjectPath(dir);
      expect(result).toBe(realpathSync(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("strips trailing slashes from existing directory after realpath", () => {
    const dir = mkdtempSync(join(tmpdir(), "aloop-canon-"));
    try {
      const withSlash = dir + "/";
      const result = canonicalizeProjectPath(withSlash);
      expect(result).toBe(realpathSync(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("projects-queries helpers", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-queries-"));
    dbPath = join(dir, "db.sqlite");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("getProjectById returns undefined for unknown id", () => {
    const { db } = openDatabase(dbPath);
    expect(getProjectById(db, "nope")).toBeUndefined();
    db.close();
  });

  test("getProjectById finds a project by id", () => {
    const { db } = openDatabase(dbPath);
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'setup_pending', ?, ?)`,
      ["proj-find", "/tmp/proj", "test-proj", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    const found = getProjectById(db, "proj-find");
    expect(found).toEqual({
      id: "proj-find",
      absPath: "/tmp/proj",
      name: "test-proj",
      status: "setup_pending",
      addedAt: "2026-01-01T00:00:00.000Z",
      lastActiveAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    db.close();
  });

  test("getProjectByPath returns undefined for unknown path", () => {
    const { db } = openDatabase(dbPath);
    expect(getProjectByPath(db, "/nonexistent/path")).toBeUndefined();
    db.close();
  });

  test("getProjectByPath finds a project by absolute path", () => {
    const { db } = openDatabase(dbPath);
    const absPath = join(dir, "my-project");
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-path", absPath, "my-project", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    const found = getProjectByPath(db, absPath);
    expect(found?.id).toBe("proj-path");
    db.close();
  });

  test("getProjectByPath is canonicalization-aware (trailing slash)", () => {
    const { db } = openDatabase(dbPath);
    const absPath = join(dir, "trail-project");
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-trail", absPath, "trail-project", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    // Lookup with trailing slash should still find the project
    const found = getProjectByPath(db, absPath + "/");
    expect(found?.id).toBe("proj-trail");
    db.close();
  });

  test("listProjectsFromDb returns all projects ordered by added_at", () => {
    const { db } = openDatabase(dbPath);
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-later", "/later", "later", "2026-01-01T00:02:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-earlier", "/earlier", "earlier", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    const list = listProjectsFromDb(db);
    expect(list.map((p) => p.id)).toEqual(["proj-earlier", "proj-later"]);
    db.close();
  });

  test("listProjectsFromDb filters by status", () => {
    const { db } = openDatabase(dbPath);
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-ready", "/ready", "ready", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'archived', ?, ?)`,
      ["proj-archived", "/archived", "archived", "2026-01-01T00:01:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    const ready = listProjectsFromDb(db, { status: "ready" as ProjectStatus });
    expect(ready.map((p) => p.id)).toEqual(["proj-ready"]);
    const archived = listProjectsFromDb(db, { status: "archived" as ProjectStatus });
    expect(archived.map((p) => p.id)).toEqual(["proj-archived"]);
    db.close();
  });

  test("listProjectsFromDb filters by absPath", () => {
    const { db } = openDatabase(dbPath);
    const pathA = join(dir, "a");
    const pathB = join(dir, "b");
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-a", pathA, "a", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-b", pathB, "b", "2026-01-01T00:01:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    const list = listProjectsFromDb(db, { absPath: pathA });
    expect(list.map((p) => p.id)).toEqual(["proj-a"]);
    db.close();
  });

  test("listProjectsFromDb filters by both status and absPath", () => {
    const { db } = openDatabase(dbPath);
    const pathReady = join(dir, "x-ready");
    const pathArchived = join(dir, "x-archived");
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-x-ready", pathReady, "x-ready", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'archived', ?, ?)`,
      ["proj-x-archived", pathArchived, "x-archived", "2026-01-01T00:01:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    // Filter by 'archived' status — only the archived row matches
    const result = listProjectsFromDb(db, { status: "archived" as ProjectStatus, absPath: pathArchived });
    expect(result.map((p) => p.id)).toEqual(["proj-x-archived"]);
    db.close();
  });

  test("listProjectsFromDb returns empty array when no projects exist", () => {
    const { db } = openDatabase(dbPath);
    expect(listProjectsFromDb(db)).toEqual([]);
    db.close();
  });

  test("listProjectsFromDb returns empty array when filter matches nothing", () => {
    const { db } = openDatabase(dbPath);
    db.run(
      `INSERT INTO projects (id, abs_path, name, status, added_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?)`,
      ["proj-exist", "/exist", "exist", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    expect(listProjectsFromDb(db, { status: "archived" as ProjectStatus })).toEqual([]);
    db.close();
  });
});
