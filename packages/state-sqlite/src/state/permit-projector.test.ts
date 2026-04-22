import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeIdGenerator } from "@aloop/core";
import { loadBundledMigrations, migrate, openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter } from "../events/append-and-project.ts";
import { PermitProjector } from "./permit-projector.ts";
import { PermitRegistry, clearPermits } from "./permits.ts";
import { EventCountsProjector, runProjector } from "./projector.ts";

describe("PermitProjector", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-permits-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("replay reconstructs active permit state exactly", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());

    const store = new JsonlEventStore(logPath);
    const events = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector(), new PermitProjector()],
      nextId: makeIdGenerator(),
    });
    const permits = new PermitRegistry(db);

    await events.append("scheduler.permit.grant", {
      permit_id: "perm_a",
      session_id: "s_1",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });
    await events.append("scheduler.permit.grant", {
      permit_id: "perm_b",
      session_id: "s_2",
      provider_id: "codex",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:01:00.000Z",
      expires_at: "2026-01-01T00:11:00.000Z",
    });
    await events.append("scheduler.permit.release", {
      permit_id: "perm_a",
      session_id: "s_1",
    });

    const expected = permits.list();
    clearPermits(db);
    await runProjector(db, new PermitProjector(), store.read());

    expect(permits.list()).toEqual(expected);
    await store.close();
    db.close();
  });
});
