import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Migration = {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
};

export type MigrateResult = {
  readonly previousVersion: number;
  readonly currentVersion: number;
  readonly applied: readonly Migration["version"][];
};

/**
 * Run pending migrations against a database. Idempotent: if already at the
 * latest version, applies nothing and returns { applied: [] }.
 *
 * Each migration runs inside a transaction so partial application cannot leave
 * the database in an inconsistent state.
 */
export function migrate(db: Database, migrations: readonly Migration[]): MigrateResult {
  ensureVersionTable(db);
  const previousVersion = currentVersion(db);

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const pending = sorted.filter((m) => m.version > previousVersion);

  const applied: number[] = [];
  for (const m of pending) {
    const tx = db.transaction(() => {
      db.run(m.sql);
      db.run(`INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`, [
        m.version,
        new Date().toISOString(),
      ]);
    });
    tx();
    applied.push(m.version);
  }

  return {
    previousVersion,
    currentVersion: currentVersion(db),
    applied,
  };
}

/** Discover migrations bundled alongside this module. */
export function loadBundledMigrations(): readonly Migration[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "migrations");
  return loadMigrationsFromDir(dir);
}

export function loadMigrationsFromDir(dir: string): readonly Migration[] {
  const entries = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return entries.map((filename) => {
    const match = /^(\d+)-(.+)\.sql$/.exec(filename);
    if (!match) {
      throw new Error(`Migration filename must match NNN-name.sql, got: ${filename}`);
    }
    const version = Number.parseInt(match[1]!, 10);
    const name = match[2]!;
    const sql = readFileSync(join(dir, filename), "utf-8");
    return { version, name, sql };
  });
}

function ensureVersionTable(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version    INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );
}

function currentVersion(db: Database): number {
  const row = db
    .query<{ v: number | null }, []>(`SELECT MAX(version) AS v FROM schema_version`)
    .get();
  return row?.v ?? 0;
}
