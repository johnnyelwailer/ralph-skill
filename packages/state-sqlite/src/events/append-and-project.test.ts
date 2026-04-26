import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeIdGenerator } from "@aloop/core";
import { loadBundledMigrations, migrate, openDatabase } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { createEventWriter, type EventWriter } from "./append-and-project.ts";
import { EventCountsProjector, clearEventCounts } from "../state/projector.ts";

describe("createEventWriter", () => {
  let dir: string;
  let eventWriter: EventWriter;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-evtwriter-"));
  });

  afterEach(async () => {
    const store = eventWriter as unknown as { store: { close(): Promise<void> } };
    if (store?.store?.close) await store.store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("append returns an EventEnvelope with correct topic, data, id, and timestamp", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);
    const nextId = makeIdGenerator(() => 1700000000000);
    eventWriter = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector()],
      nextId,
    });

    const event = await eventWriter.append("test.topic", { key: "value" });

    expect(event.topic).toBe("test.topic");
    expect(event.data).toEqual({ key: "value" });
    expect(event.id).toMatch(/^\d+\.\d+$/); // format: {ms}.{seq}
    // timestamp must be a valid ISO string (exact value depends on Date.now at call time)
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    await store.close();
    db.close();
  });

  test("append persists the event to the underlying store", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);
    eventWriter = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector()],
      nextId: makeIdGenerator(),
    });

    await eventWriter.append("test.persist", { foo: "bar" });

    const read: unknown[] = [];
    for await (const e of store.read()) {
      read.push(e);
    }
    expect(read).toHaveLength(1);
    expect((read[0] as { topic: string }).topic).toBe("test.persist");
    expect((read[0] as { data: { foo: string } }).data.foo).toBe("bar");
    await store.close();
    db.close();
  });

  test("append calls every projector.apply with the event after store append succeeds", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);

    let applyCallCount = 0;
    let lastAppliedTopic = "";
    const countingProjector = {
      name: "counting",
      apply(_db: unknown, event: { topic: string }) {
        applyCallCount++;
        lastAppliedTopic = event.topic;
      },
    };

    eventWriter = createEventWriter({
      db,
      store,
      projectors: [countingProjector, new EventCountsProjector()],
      nextId: makeIdGenerator(),
    });

    expect(applyCallCount).toBe(0);
    await eventWriter.append("counter.test", { n: 1 });
    expect(applyCallCount).toBe(1);
    expect(lastAppliedTopic).toBe("counter.test");

    await eventWriter.append("counter.test2", { n: 2 });
    expect(applyCallCount).toBe(2);
    expect(lastAppliedTopic).toBe("counter.test2");

    await store.close();
    db.close();
  });

  test("append uses the optional now() override for event timestamp", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);
    const fixedNow = () => 1800000000000; // 2026-12-13T17:20:00.000Z
    eventWriter = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector()],
      nextId: makeIdGenerator(fixedNow),
      now: fixedNow,
    });

    const event = await eventWriter.append("test.now", { ts: true });

    expect(event.timestamp).toBe("2027-01-15T08:00:00.000Z");
    await store.close();
    db.close();
  });

  test("append returns correctly typed EventEnvelope<T>", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);
    eventWriter = createEventWriter({
      db,
      store,
      projectors: [new EventCountsProjector()],
      nextId: makeIdGenerator(),
    });

    type MyData = { readonly msg: string; readonly count: number };
    const event = await eventWriter.append<MyData>("typed.topic", {
      msg: "hello",
      count: 42,
    });

    // TypeScript would enforce this at compile time; at runtime just verify shape
    expect(event.data.msg).toBe("hello");
    expect(event.data.count).toBe(42);
    await store.close();
    db.close();
  });

  test("append propagates store.append rejection without calling projectors", async () => {
    const dbPath = join(dir, "db.sqlite");
    const logPath = join(dir, "aloopd.log");
    const { db } = openDatabase(dbPath);
    migrate(db, loadBundledMigrations());
    const store = new JsonlEventStore(logPath);

    let projectorApplyCalled = false;
    const failingProjector = {
      name: "failing",
      apply() { projectorApplyCalled = true; },
    };

    const rejectingStore = {
      async append() { throw new Error("store write failed"); },
      async *read() { yield* store.read(); },
      async close() { await store.close(); },
    };

    eventWriter = createEventWriter({
      db,
      store: rejectingStore,
      projectors: [failingProjector],
      nextId: makeIdGenerator(),
    });

    await expect(
      eventWriter.append("test.reject", { ok: false }),
    ).rejects.toThrow("store write failed");
    expect(projectorApplyCalled).toBe(false);
    db.close();
  });
});
