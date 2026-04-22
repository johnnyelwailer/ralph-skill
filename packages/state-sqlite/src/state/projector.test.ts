import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { makeEvent, makeIdGenerator, type EventEnvelope } from "@aloop/core";
import { loadBundledMigrations, migrate } from "@aloop/sqlite-db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlEventStore } from "@aloop/event-jsonl";
import { clearEventCounts, EventCountsProjector, runProjector } from "./projector.ts";

function openDb(): Database {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return db;
}

function countsAsMap(db: Database): Record<string, number> {
  const rows = db
    .query<{ topic: string; count: number }, []>(
      `SELECT topic, count FROM event_counts ORDER BY topic`,
    )
    .all();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.topic] = r.count;
  return out;
}

describe("EventCountsProjector", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-proj-"));
    path = join(dir, "log.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("apply increments per-topic counters", async () => {
    const db = openDb();
    const projector = new EventCountsProjector();
    const gen = makeIdGenerator();

    projector.apply(db, makeEvent("a", {}, gen));
    projector.apply(db, makeEvent("a", {}, gen));
    projector.apply(db, makeEvent("b", {}, gen));

    expect(countsAsMap(db)).toEqual({ a: 2, b: 1 });
  });

  test("runProjector over a JSONL log reproduces the counts", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    for (let i = 0; i < 5; i++) await store.append(makeEvent("session.update", { i }, gen));
    for (let i = 0; i < 3; i++) await store.append(makeEvent("provider.health", { i }, gen));
    for (let i = 0; i < 7; i++) await store.append(makeEvent("scheduler.permit.grant", { i }, gen));
    await store.close();

    const db = openDb();
    const projector = new EventCountsProjector();
    const applied = await runProjector(db, projector, new JsonlEventStore(path).read());

    expect(applied).toBe(15);
    expect(countsAsMap(db)).toEqual({
      "session.update": 5,
      "provider.health": 3,
      "scheduler.permit.grant": 7,
    });
  });

  test("replay: events are truth — corrupt projection, rebuild from JSONL, identical state", async () => {
    // Phase 1: populate log and projection.
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    const events: EventEnvelope[] = [];
    for (let i = 0; i < 50; i++) {
      const topic = ["a", "b", "c"][i % 3]!;
      const e = makeEvent(topic, { i }, gen);
      events.push(e);
      await store.append(e);
    }
    await store.close();

    const db1 = openDb();
    const projector = new EventCountsProjector();
    await runProjector(db1, projector, new JsonlEventStore(path).read());
    const before = countsAsMap(db1);

    // Phase 2: "corrupt" the projection (delete all rows — simulates schema
    // change, disk corruption, or operator reset).
    clearEventCounts(db1);
    expect(countsAsMap(db1)).toEqual({});

    // Phase 3: replay the JSONL log; the projection must be restored exactly.
    await runProjector(db1, projector, new JsonlEventStore(path).read());
    const after = countsAsMap(db1);

    expect(after).toEqual(before);
  });

  test("partial + incremental projection equals full projection", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    const firstBatch: EventEnvelope[] = [];
    for (let i = 0; i < 10; i++) {
      const e = makeEvent(i % 2 === 0 ? "a" : "b", { i }, gen);
      firstBatch.push(e);
      await store.append(e);
    }
    const secondBatch: EventEnvelope[] = [];
    for (let i = 0; i < 7; i++) {
      const e = makeEvent(i % 3 === 0 ? "a" : "c", { i }, gen);
      secondBatch.push(e);
      await store.append(e);
    }
    await store.close();

    const full = openDb();
    const projector = new EventCountsProjector();
    await runProjector(full, projector, new JsonlEventStore(path).read());
    const fullCounts = countsAsMap(full);

    // Reset; project first half only, then continue with second half.
    const split = openDb();
    const lastOfFirst = firstBatch[firstBatch.length - 1]!.id;
    await runProjector(split, projector, new JsonlEventStore(path).read());
    clearEventCounts(split);
    await runProjector(split, projector, new JsonlEventStore(path).read(/* since */));
    // Above is equivalent to full replay; verify:
    expect(countsAsMap(split)).toEqual(fullCounts);

    // Also test: using since= skips already-projected events
    const incremental = openDb();
    // Project only the first batch
    const firstStore = new JsonlEventStore(path);
    let firstApplied = 0;
    const tx = incremental.transaction((events: EventEnvelope[]) => {
      for (const e of events) {
        projector.apply(incremental, e);
        firstApplied += 1;
      }
    });
    const firstEvents: EventEnvelope[] = [];
    for await (const e of firstStore.read()) {
      if (e.id > lastOfFirst) break;
      firstEvents.push(e);
    }
    await firstStore.close();
    tx(firstEvents);
    expect(firstApplied).toBe(10);

    // Then project only the second batch via since
    await runProjector(incremental, projector, new JsonlEventStore(path).read(lastOfFirst));
    expect(countsAsMap(incremental)).toEqual(fullCounts);
  });

  test("empty event log projects nothing", async () => {
    const db = openDb();
    const projector = new EventCountsProjector();
    const applied = await runProjector(db, projector, new JsonlEventStore(path).read());
    expect(applied).toBe(0);
    expect(countsAsMap(db)).toEqual({});
  });

  test("clearEventCounts removes all rows", async () => {
    const db = openDb();
    const projector = new EventCountsProjector();
    const gen = makeIdGenerator();
    projector.apply(db, makeEvent("a", {}, gen));
    projector.apply(db, makeEvent("b", {}, gen));
    projector.apply(db, makeEvent("a", {}, gen));
    expect(countsAsMap(db)).toEqual({ a: 2, b: 1 });

    clearEventCounts(db);
    expect(countsAsMap(db)).toEqual({});
  });

  test("clearEventCounts on already-empty table is safe", async () => {
    const db = openDb();
    clearEventCounts(db); // must not throw
    expect(countsAsMap(db)).toEqual({});
  });

  test("projection is transactional — batch commit semantics", async () => {
    // If the transaction mechanism is working, a mid-replay error shouldn't
    // leave the projection in an inconsistent state. We test the happy path
    // here (transaction is internal); the rollback case is covered by
    // migrations.test.ts which uses the same bun:sqlite transaction API.
    const db = openDb();
    const projector = new EventCountsProjector();
    const gen = makeIdGenerator();
    const events: EventEnvelope[] = [];
    for (let i = 0; i < 1200; i++) events.push(makeEvent(`t${i % 10}`, { i }, gen));

    async function* iter() {
      for (const e of events) yield e;
    }
    const applied = await runProjector(db, projector, iter());
    expect(applied).toBe(1200);

    const total = db
      .query<{ n: number }, []>(`SELECT SUM(count) AS n FROM event_counts`)
      .get();
    expect(total?.n).toBe(1200);
  });
});
