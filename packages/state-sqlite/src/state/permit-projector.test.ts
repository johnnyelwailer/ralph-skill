import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator } from "@aloop/core";
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

  function openDb() {
    const dbPath = join(dir, "db.sqlite");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    return db;
  }

  function makeGrant(permitId: string, sessionId: string, providerId: string, expiresAt: string) {
    return makeEvent("scheduler.permit.grant", {
      permit_id: permitId,
      session_id: sessionId,
      provider_id: providerId,
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: expiresAt,
    }, makeIdGenerator());
  }

  function makeRelease(permitId: string) {
    return makeEvent("scheduler.permit.release", { permit_id: permitId }, makeIdGenerator());
  }

  function makeExpired(permitId: string) {
    return makeEvent("scheduler.permit.expired", { permit_id: permitId }, makeIdGenerator());
  }

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

  test("apply handles scheduler.permit.release event — removes permit by id", async () => {
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

    // Grant two permits, then release one via scheduler.permit.release
    await events.append("scheduler.permit.grant", {
      permit_id: "perm_r_a",
      session_id: "s_r1",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });
    await events.append("scheduler.permit.grant", {
      permit_id: "perm_r_b",
      session_id: "s_r2",
      provider_id: "codex",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:01:00.000Z",
      expires_at: "2026-01-01T00:11:00.000Z",
    });
    expect(permits.countActive()).toBe(2);

    // Release perm_r_a via the release topic (used by scheduler on session end)
    await events.append("scheduler.permit.release", {
      permit_id: "perm_r_a",
    });
    expect(permits.countActive()).toBe(1);

    // Only perm_r_b remains
    const remaining = permits.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe("perm_r_b");

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

  test("apply grant path inserts permit and returns early", () => {
    // Covers the early return at line 32 of permit-projector.ts
    const db = openDb();
    const projector = new PermitProjector();
    projector.apply(db, makeGrant("p1", "s1", "opencode", "2026-01-01T00:10:00.000Z"));
    const registry = new PermitRegistry(db);
    expect(registry.countActive()).toBe(1);
    expect(registry.get("p1")!.sessionId).toBe("s1");
    db.close();
  });

  test("apply release path calls projectPermitRemoval with correct id", () => {
    // Covers lines 36-41: scheduler.permit.release branch
    const db = openDb();
    const projector = new PermitProjector();
    // First insert a permit via the grant path
    projector.apply(db, makeGrant("p_release", "s1", "codex", "2026-01-01T00:10:00.000Z"));
    expect(new PermitRegistry(db).countActive()).toBe(1);
    // Apply a release event — projector should remove it
    projector.apply(db, makeRelease("p_release"));
    expect(new PermitRegistry(db).countActive()).toBe(0);
    db.close();
  });

  test("apply expired path calls projectPermitRemoval with correct id", () => {
    // Covers lines 36-41: scheduler.permit.expired branch
    const db = openDb();
    const projector = new PermitProjector();
    projector.apply(db, makeGrant("p_expired", "s2", "claude", "2026-01-01T00:10:00.000Z"));
    expect(new PermitRegistry(db).countActive()).toBe(1);
    projector.apply(db, makeExpired("p_expired"));
    expect(new PermitRegistry(db).countActive()).toBe(0);
    db.close();
  });

  test("apply ignores unknown topics (no-op, no throw)", () => {
    // Covers the implicit fall-through when neither grant nor release/expired matches
    const db = openDb();
    const projector = new PermitProjector();
    projector.apply(db, makeGrant("p_ignore", "s3", "opencode", "2026-01-01T00:10:00.000Z"));
    expect(new PermitRegistry(db).countActive()).toBe(1);
    // An arbitrary unknown topic — must be silently ignored
    projector.apply(db, makeEvent("some.other.topic", { permit_id: "p_ignore" }, makeIdGenerator()));
    // Original permit must remain untouched
    expect(new PermitRegistry(db).countActive()).toBe(1);
    db.close();
  });
});
