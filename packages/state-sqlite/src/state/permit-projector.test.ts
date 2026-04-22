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

  test("apply handles scheduler.permit.expired event — removes permit by id", async () => {
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

    // Grant two permits, then expire one via scheduler.permit.expired
    await events.append("scheduler.permit.grant", {
      permit_id: "perm_x",
      session_id: "s_x",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });
    await events.append("scheduler.permit.grant", {
      permit_id: "perm_y",
      session_id: "s_y",
      provider_id: "codex",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:01:00.000Z",
      expires_at: "2026-01-01T00:11:00.000Z",
    });
    expect(permits.countActive()).toBe(2);

    // Expire perm_x via the expired topic (used by watchdog ticker)
    await events.append("scheduler.permit.expired", {
      permit_id: "perm_x",
    });
    expect(permits.countActive()).toBe(1);

    // Only perm_y remains
    const remaining = permits.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("perm_y");

    await store.close();
    db.close();
  });

  test("runProjector flushes partial batch (< 500 events) correctly", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());

    const store = new JsonlEventStore(logPath);
    const projector = new PermitProjector();

    // Write exactly 3 events — fewer than the 500-event batch threshold
    await store.append({
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        permit_id: "perm_batch_1",
        session_id: "s_1",
        provider_id: "opencode",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    });
    await store.append({
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:01.000Z",
      data: {
        permit_id: "perm_batch_2",
        session_id: "s_2",
        provider_id: "codex",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:01.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    });
    await store.append({
      topic: "scheduler.permit.grant",
      timestamp: "2026-01-01T00:00:02.000Z",
      data: {
        permit_id: "perm_batch_3",
        session_id: "s_3",
        provider_id: "claude",
        ttl_seconds: 300,
        granted_at: "2026-01-01T00:00:02.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    });

    const applied = await runProjector(db, projector, store.read());

    // All 3 events must have been applied despite being below 500 threshold
    expect(applied).toBe(3);
    const permits = new PermitRegistry(db);
    expect(permits.countActive()).toBe(3);

    await store.close();
    db.close();
  });
});
