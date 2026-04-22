import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";

describe("openDatabase", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = join(tmpdir(), `aloop-db-test-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("creates parent directories when path does not exist", () => {
    const nested = join(tmp, "a", "b", "c", "db.sqlite");
    expect(existsSync(join(tmp, "a"))).toBe(false);
    const result = openDatabase(nested);
    expect(existsSync(nested)).toBe(true);
    result.db.close();
  });

  test("opens an in-memory database", () => {
    const result = openDatabase(":memory:");
    expect(result.db).toBeDefined();
    expect(result.migrated).toBeDefined();
    result.db.close();
  });

  test("applies bundled migrations on a fresh database", () => {
    const dbPath = join(tmp, "fresh.sqlite");
    const result = openDatabase(dbPath);
    expect(result.migrated.previousVersion).toBe(0);
    expect(result.migrated.applied.length).toBeGreaterThan(0);
    expect(result.migrated.currentVersion).toBe(
      result.migrated.applied[result.migrated.applied.length - 1],
    );
    result.db.close();
  });

  test("returns existing version when reopening a migrated database", () => {
    const dbPath = join(tmp, "reopened.sqlite");
    const first = openDatabase(dbPath);
    const versionAfterFirst = first.migrated.currentVersion;
    first.db.close();

    const second = openDatabase(dbPath);
    expect(second.migrated.previousVersion).toBe(versionAfterFirst);
    expect(second.migrated.applied).toEqual([]);
    expect(second.migrated.currentVersion).toBe(versionAfterFirst);
    second.db.close();
  });

  test("enables foreign_keys PRAGMA", () => {
    const result = openDatabase(join(tmp, "fk.sqlite"));
    // Bun:sqlite PRAGMA returns {foreign_keys: 0|1}
    const row = result.db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(row?.foreign_keys).toBe(1);
    result.db.close();
  });

  test("enables WAL journal mode for file-backed databases", () => {
    const result = openDatabase(join(tmp, "wal.sqlite"));
    // Bun:sqlite PRAGMA returns {journal_mode: string}
    const row = result.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row?.journal_mode).toBe("wal");
    result.db.close();
  });

  test(":memory: does not set WAL mode", () => {
    const result = openDatabase(":memory:");
    // :memory: always uses the default (memory) mode regardless of code
    const row = result.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get();
    expect(row?.journal_mode).not.toBe("wal");
    result.db.close();
  });

  test("marks the OpenedDatabase return shape correctly", () => {
    const result = openDatabase(join(tmp, "shape.sqlite"));
    expect(typeof result.db).toBe("object");
    expect(typeof result.migrated.previousVersion).toBe("number");
    expect(typeof result.migrated.currentVersion).toBe("number");
    expect(Array.isArray(result.migrated.applied)).toBe(true);
    result.db.close();
  });
});
