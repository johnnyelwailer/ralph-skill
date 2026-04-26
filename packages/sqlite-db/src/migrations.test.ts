import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBundledMigrations,
  loadMigrationsFromDir,
  migrate,
  type Migration,
} from "./migrations.ts";

function openInMemory(): Database {
  return new Database(":memory:");
}

describe("migrate", () => {
  test("applies pending migrations from a clean database", () => {
    const db = openInMemory();
    const migrations: Migration[] = [
      { version: 1, name: "init", sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
      { version: 2, name: "add-col", sql: "ALTER TABLE t1 ADD COLUMN name TEXT" },
    ];
    const result = migrate(db, migrations);
    expect(result.previousVersion).toBe(0);
    expect(result.currentVersion).toBe(2);
    expect(result.applied).toEqual([1, 2]);

    // Schema actually changed
    const cols = db.query<{ name: string }, []>("PRAGMA table_info(t1)").all();
    expect(cols.map((c) => c.name).sort()).toEqual(["id", "name"]);
  });

  test("is idempotent — rerunning is a no-op", () => {
    const db = openInMemory();
    const migrations: Migration[] = [
      { version: 1, name: "init", sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
    ];
    migrate(db, migrations);
    const second = migrate(db, migrations);
    expect(second.previousVersion).toBe(1);
    expect(second.currentVersion).toBe(1);
    expect(second.applied).toEqual([]);
  });

  test("only applies migrations with version > current", () => {
    const db = openInMemory();
    const first: Migration[] = [
      { version: 1, name: "init", sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
    ];
    migrate(db, first);

    const both: Migration[] = [
      ...first,
      { version: 2, name: "add", sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" },
    ];
    const result = migrate(db, both);
    expect(result.applied).toEqual([2]);
    expect(result.currentVersion).toBe(2);
  });

  test("applies migrations in version order even if passed shuffled", () => {
    const db = openInMemory();
    const shuffled: Migration[] = [
      { version: 3, name: "third", sql: "CREATE TABLE t3 (id INTEGER PRIMARY KEY)" },
      { version: 1, name: "first", sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
      { version: 2, name: "second", sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" },
    ];
    const result = migrate(db, shuffled);
    expect(result.applied).toEqual([1, 2, 3]);
    expect(result.currentVersion).toBe(3);
  });

  test("rolls back on SQL error so version stays consistent", () => {
    const db = openInMemory();
    const migrations: Migration[] = [
      { version: 1, name: "good", sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
      { version: 2, name: "bad", sql: "NOT VALID SQL AT ALL" },
    ];
    expect(() => migrate(db, migrations)).toThrow();
    // v1 committed; v2 rolled back.
    const cur = db.query<{ v: number }, []>("SELECT MAX(version) AS v FROM schema_version").get();
    expect(cur?.v).toBe(1);
  });

  test("bundled migrations load and apply cleanly", () => {
    const db = openInMemory();
    const bundled = loadBundledMigrations();
    expect(bundled.length).toBeGreaterThan(0);
    const result = migrate(db, bundled);
    expect(result.currentVersion).toBe(bundled[bundled.length - 1]!.version);
  });

  test("loadMigrationsFromDir rejects malformed filenames", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    try {
      writeFileSync(join(dir, "not-a-migration.sql"), "SELECT 1");
      expect(() => loadMigrationsFromDir(dir)).toThrow(/must match/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadMigrationsFromDir parses NNN-name.sql correctly", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    try {
      writeFileSync(join(dir, "001-alpha.sql"), "-- alpha");
      writeFileSync(join(dir, "002-beta.sql"), "-- beta");
      const migs = loadMigrationsFromDir(dir);
      expect(migs.map((m) => ({ version: m.version, name: m.name }))).toEqual([
        { version: 1, name: "alpha" },
        { version: 2, name: "beta" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadMigrationsFromDir returns empty array for an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-empty-"));
    try {
      const migs = loadMigrationsFromDir(dir);
      expect(migs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadMigrationsFromDir throws when directory does not exist", () => {
    const dir = join(tmpdir(), "this-directory-does-not-exist-at-all-", String(Date.now()));
    expect(() => loadMigrationsFromDir(dir)).toThrow();
  });

  test("loadMigrationsFromDir silently skips non-.sql files", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-skip-"));
    try {
      writeFileSync(join(dir, "001-valid.sql"), "CREATE TABLE t1 (id INTEGER PRIMARY KEY)");
      writeFileSync(join(dir, "README.txt"), "not a migration");
      writeFileSync(join(dir, "002-also-valid.sql"), "CREATE TABLE t2 (id INTEGER PRIMARY KEY)");
      writeFileSync(join(dir, ".hidden"), "ignored");
      const migs = loadMigrationsFromDir(dir);
      expect(migs.map((m) => ({ version: m.version, name: m.name }))).toEqual([
        { version: 1, name: "valid" },
        { version: 2, name: "also-valid" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadMigrationsFromDir returns migrations sorted by version number", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-sorted-"));
    try {
      writeFileSync(join(dir, "003-third.sql"), "-- third");
      writeFileSync(join(dir, "001-first.sql"), "-- first");
      writeFileSync(join(dir, "002-second.sql"), "-- second");
      const migs = loadMigrationsFromDir(dir);
      expect(migs.map((m) => m.version)).toEqual([1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadMigrationsFromDir includes SQL content in returned migration", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-content-"));
    try {
      const sql = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)";
      writeFileSync(join(dir, "042-users-table.sql"), sql);
      const migs = loadMigrationsFromDir(dir);
      expect(migs).toHaveLength(1);
      expect(migs[0]!.version).toBe(42);
      expect(migs[0]!.name).toBe("users-table");
      expect(migs[0]!.sql).toBe(sql);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
