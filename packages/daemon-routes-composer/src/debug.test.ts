import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { jsonResponse } from "@aloop/daemon-routes";
import { ComposerTurnRegistry } from "@aloop/state-sqlite";
import { migrate, loadBundledMigrations } from "@aloop/sqlite-db";

function createTestDb() {
  const dir = join("/tmp", `composer-debug-${crypto.randomUUID()!.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "test.db"));
  const migrations = loadBundledMigrations();
  migrate(db, migrations);
  return { db, dir };
}

test("jsonResponse works directly with 201", async () => {
  const resp = jsonResponse(201, { hello: "world" });
  console.log("status:", resp.status);
  console.log("body:", await resp.clone().text());
  expect(resp.status).toBe(201);
});

test("registry create then jsonResponse works", async () => {
  const { db, dir } = createTestDb();
  try {
    const registry = new ComposerTurnRegistry(db);
    const turn = registry.create({ scope: { kind: "global" }, message: "Hello" });
    const resp = jsonResponse(turn, 201);
    console.log("status:", resp.status);
    expect(resp.status).toBe(201);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});