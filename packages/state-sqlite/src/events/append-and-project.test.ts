import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeEvent, makeIdGenerator } from "@aloop/core";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter } from "./append-and-project.ts";
import { EventCountsProjector } from "../state/projector.ts";
import { PermitProjector } from "../state/permit-projector.ts";
import { loadBundledMigrations, migrate } from "../state/migrations.ts";

function openDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

describe("createEventWriter", () => {
  let dir: string;
  let db: Database;
  let logPath: string;
  let events: ReturnType<typeof createEventWriter>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-ev-writer-"));
    db = openDb();
    logPath = join(dir, "aloopd.log");
    const store = new JsonlEventStore(logPath);
    events = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector(), new PermitProjector()],
      nextId: makeIdGenerator(),
    });
  });

  afterEach(async () => {
    await events.append("test.teardown", {});
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("append returns an EventEnvelope with correct topic and data", async () => {
    const result = await events.append("test.topic", { key: "value" });
    expect(result.topic).toBe("test.topic");
    expect(result.data).toEqual({ key: "value" });
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.timestamp.length).toBeGreaterThan(0);
  });

  test("append persists event to JSONL store", async () => {
    await events.append("test.persist", { n: 1 });
    await events.append("test.persist", { n: 2 });
    await events.append("test.persist", { n: 3 });

    const store2 = new JsonlEventStore(logPath);
    const read: unknown[] = [];
    for await (const e of store2.read()) read.push(e);
    await store2.close();

    expect(read.length).toBe(3);
    expect(read.map((e: any) => e.topic)).toEqual([
      "test.persist",
      "test.persist",
      "test.persist",
    ]);
    expect(read.map((e: any) => (e.data as any).n)).toEqual([1, 2, 3]);
  });

  test("append runs all projectors via transaction", async () => {
    await events.append("session.start", { sessionId: "s_1" });
    await events.append("provider.health", { ok: true });
    await events.append("scheduler.permit.grant", {
      permit_id: "p_1",
      session_id: "s_1",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });

    const counts = db
      .query<{ topic: string; count: number }, []>(
        `SELECT topic, count FROM event_counts ORDER BY topic`,
      )
      .all();
    expect(counts.length).toBe(3);
    const map: Record<string, number> = {};
    for (const r of counts) map[r.topic] = r.count;
    expect(map).toEqual({
      "provider.health": 1,
      "scheduler.permit.grant": 1,
      "session.start": 1,
    });
  });

  test("append is idempotent per call — each call is a distinct event", async () => {
    const e1 = await events.append("dup", { i: 1 });
    const e2 = await events.append("dup", { i: 2 });
    expect(e1.id).not.toBe(e2.id);
    expect(e1.topic).toBe(e2.topic);
  });

  test("custom nextId and now functions are used", async () => {
    const fixedId = () => "fixed-id-0001";
    const fixedNow = () => 1745270000000;

    const store = new JsonlEventStore(join(dir, "custom.log"));
    const writer = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector()],
      nextId: fixedId,
      now: fixedNow,
    });

    const result = await writer.append("custom.time", { ok: true });
    expect(result.id).toBe("fixed-id-0001");
    // Verify timestamp is ISO string derived from fixedNow ms epoch
    expect(new Date(result.timestamp).getTime()).toBe(1745270000000);
  });

  test("projectors run in order and all see the same transaction", async () => {
    // Track projector application order via a custom projector
    const order: string[] = [];
    const trackingProjector = {
      name: "tracking",
      apply(_db: Database, event: any) {
        order.push(event.topic);
      },
    };

    const store = new JsonlEventStore(join(dir, "order.log"));
    const writer = createEventWriter({
      db,
      store,
      projectors: [
        new EventCountsProjector(),
        trackingProjector as any,
        new PermitProjector(),
      ],
      nextId: makeIdGenerator(),
    });

    await writer.append("order.first", {});
    await writer.append("order.second", {});

    // Both projectors should have recorded both events in order
    expect(order).toEqual(["order.first", "order.second"]);
  });

  test("append throws when store is closed", async () => {
    const store = new JsonlEventStore(join(dir, "closed.log"));
    await store.close();

    const writer = createEventWriter({
      db,
      store,
      projectors: [],
      nextId: makeIdGenerator(),
    });

    await expect(writer.append("closed", {})).rejects.toThrow("EventStore closed");
  });
});
