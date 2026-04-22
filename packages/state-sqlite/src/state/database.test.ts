import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { loadBundledMigrations } from "./migrations.ts";

describe("openDatabase", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-db-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("opens an in-memory database with bundled migrations applied", () => {
    const { db, migrated } = openDatabase(":memory:");
    expect(migrated.previousVersion).toBe(0);
    expect(migrated.applied.length).toBeGreaterThan(0);
    expect(migrated.currentVersion).toBe(migrated.applied[migrated.applied.length - 1]!);
    // Can run a query that depends on the schema
    const row = db.query<{ v: number }, []>("SELECT MAX(version) AS v FROM schema_version").get();
    expect(row?.v).toBe(migrated.currentVersion);
    db.close();
  });

  test("returns the correct MigrateResult shape for in-memory", () => {
    const { migrated } = openDatabase(":memory:");
    expect(typeof migrated.previousVersion).toBe("number");
    expect(typeof migrated.currentVersion).toBe("number");
    expect(Array.isArray(migrated.applied)).toBe(true);
  });

  test("creates parent directories when given a deep file path", () => {
    const deepPath = join(dir, "a", "b", "c", "db.sqlite");
    const { db } = openDatabase(deepPath);
    expect(() => db.query<{}, []>("SELECT 1").all()).not.toThrow();
    db.close();
  });

  test("opens a file-backed database and runs bundled migrations", () => {
    const dbPath = join(dir, "aloop.db");
    const { db, migrated } = openDatabase(dbPath);
    expect(migrated.previousVersion).toBe(0);
    expect(migrated.currentVersion).toBeGreaterThan(0);
    expect(migrated.applied).toEqual(
      loadBundledMigrations().map((m) => m.version),
    );
    const row = db.query<{ v: number }, []>("SELECT MAX(version) AS v FROM schema_version").get();
    expect(row?.v).toBe(migrated.currentVersion);
    db.close();
  });

  test("second open on same file is idempotent (migrations already applied)", () => {
    const dbPath = join(dir, "aloop.db");
    const first = openDatabase(dbPath);
    const currentVersion = first.migrated.currentVersion;
    first.db.close();

    const second = openDatabase(dbPath);
    expect(second.migrated.previousVersion).toBe(currentVersion);
    expect(second.migrated.currentVersion).toBe(currentVersion);
    expect(second.migrated.applied).toEqual([]);
    second.db.close();
  });

  test("sets WAL journal mode on file-backed databases", () => {
    const dbPath = join(dir, "aloop.db");
    const { db } = openDatabase(dbPath);
    const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row?.journal_mode).toBe("wal");
    db.close();
  });

  test("does not set WAL journal mode for in-memory databases", () => {
    const { db } = openDatabase(":memory:");
    const row = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    // in-memory defaults to memory or delete; either way WAL is not set
    expect(row).not.toBeNull();
    expect(["memory", "delete"]).toContain(row!.journal_mode);
    db.close();
  });

  test("enables foreign_keys pragma on both in-memory and file-backed", () => {
    const inMem = openDatabase(":memory:");
    const fkInMem = inMem.db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(fkInMem?.foreign_keys).toBe(1);
    inMem.db.close();

    const fileDb = openDatabase(join(dir, "aloop.db"));
    const fkFile = fileDb.db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(fkFile?.foreign_keys).toBe(1);
    fileDb.db.close();
  });

  test("returns a Database handle that can run arbitrary queries", () => {
    const { db } = openDatabase(join(dir, "aloop.db"));
    // Verify a non-trivial bundled migration table exists and is queryable
    const eventCounts = db
      .query<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM event_counts")
      .all();
    expect(eventCounts[0]!.cnt).toBe(0);
    db.close();
  });
});
