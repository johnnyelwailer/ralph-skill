import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { loadBundledMigrations, migrate, type MigrateResult } from "./migrations.ts";

export type OpenedDatabase = {
  readonly db: Database;
  readonly migrated: MigrateResult;
};

/**
 * Open a SQLite database at the given path (creating parent dirs as needed),
 * apply all bundled migrations, and return the handle. `:memory:` is a valid
 * path for tests.
 */
export function openDatabase(path: string): OpenedDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  // WAL mode gives better concurrent-read behavior alongside the single writer.
  if (path !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  const migrated = migrate(db, loadBundledMigrations());
  return { db, migrated };
}

export { Database };
