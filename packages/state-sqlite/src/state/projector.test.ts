import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { openDatabase } from "./database.ts";
import {
  clearEventCounts,
  EventCountsProjector,
  runProjector,
  type Projector,
} from "./projector.ts";
import type { EventEnvelope } from "@aloop/core";

function openMem(): Database {
  const { db } = openDatabase(":memory:");
  return db;
}

function makeEnvelope(topic: string, data: Record<string, unknown> = {}): EventEnvelope {
  return {
    topic,
    data,
    timestamp: new Date().toISOString(),
    seq: 0,
  };
}

describe("EventCountsProjector", () => {
  test("applies event and upserts count in event_counts", () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);

    const projector = new EventCountsProjector();
    projector.apply(db, makeEnvelope("user.created", {}));
    projector.apply(db, makeEnvelope("user.created", {}));

    const row = db.query<{ count: number }, []>(`SELECT count FROM event_counts WHERE topic = ?`).get("user.created");
    expect(row?.count).toBe(2);
    db.close();
  });
});

describe("runProjector", () => {
  test("returns 0 for an empty event stream", async () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);

    async function* empty(): AsyncIterable<EventEnvelope> {
      // no yield
    }

    const count = await runProjector(db, new EventCountsProjector(), empty());
    expect(count).toBe(0);
    db.close();
  });

  test("applies all events and returns total count", async () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);

    async function* events(): AsyncIterable<EventEnvelope> {
      yield makeEnvelope("a");
      yield makeEnvelope("b");
      yield makeEnvelope("a");
    }

    const count = await runProjector(db, new EventCountsProjector(), events());
    expect(count).toBe(3);

    const a = db.query<{ count: number }, []>(`SELECT count FROM event_counts WHERE topic = ?`).get("a");
    const b = db.query<{ count: number }, []>(`SELECT count FROM event_counts WHERE topic = ?`).get("b");
    expect(a?.count).toBe(2);
    expect(b?.count).toBe(1);
    db.close();
  });

  test("flushes batch when buffer reaches 500 events", async () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);

    async function* manyEvents(): AsyncIterable<EventEnvelope> {
      for (let i = 0; i < 550; i++) {
        yield makeEnvelope("bulk");
      }
    }

    const count = await runProjector(db, new EventCountsProjector(), manyEvents());
    expect(count).toBe(550);

    const row = db.query<{ count: number }, []>(`SELECT count FROM event_counts WHERE topic = ?`).get("bulk");
    expect(row?.count).toBe(550);
    db.close();
  });

  test("flushes remaining buffer after stream ends", async () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);

    async function* tailEvents(): AsyncIterable<EventEnvelope> {
      for (let i = 0; i < 42; i++) {
        yield makeEnvelope("tail");
      }
    }

    const count = await runProjector(db, new EventCountsProjector(), tailEvents());
    expect(count).toBe(42);

    const row = db.query<{ count: number }, []>(`SELECT count FROM event_counts WHERE topic = ?`).get("tail");
    expect(row?.count).toBe(42);
    db.close();
  });
});

describe("clearEventCounts", () => {
  test("deletes all rows from event_counts table", () => {
    const db = openMem();
    db.run(`CREATE TABLE IF NOT EXISTS event_counts (
      topic TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`);
    db.run(`INSERT INTO event_counts (topic, count, updated_at) VALUES ('x', 99, '2024-01-01')`);

    clearEventCounts(db);

    const rows = db.query<{ count: number }, []>(`SELECT count FROM event_counts`).all();
    expect(rows).toEqual([]);
    db.close();
  });
});