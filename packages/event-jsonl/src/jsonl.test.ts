import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator, type EventEnvelope } from "@aloop/core";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEventOnce, JsonlEventStore, readAllEvents, simpleAppend } from "./jsonl.ts";

describe("JsonlEventStore", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-evt-"));
    path = join(dir, "log.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("append then read returns events in monotonic order", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    const events: EventEnvelope[] = [
      makeEvent("a", { n: 1 }, gen),
      makeEvent("b", { n: 2 }, gen),
      makeEvent("c", { n: 3 }, gen),
    ];
    for (const e of events) await store.append(e);
    await store.close();

    const read = await readAllEvents(path);
    expect(read.map((e) => e.topic)).toEqual(["a", "b", "c"]);
    expect(read.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });

  test("since filter skips events with id <= given value", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    const events = [
      makeEvent("a", 1, gen),
      makeEvent("b", 2, gen),
      makeEvent("c", 3, gen),
    ];
    for (const e of events) await store.append(e);
    await store.close();

    const replay = new JsonlEventStore(path);
    const got: EventEnvelope[] = [];
    for await (const e of replay.read(events[0]!.id)) got.push(e);
    await replay.close();
    expect(got.map((e) => e.topic)).toEqual(["b", "c"]);
  });

  test("file on disk is JSONL — one parseable object per line", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    await store.append(makeEvent("a", 1, gen));
    await store.append(makeEvent("b", 2, gen));
    await store.close();

    const raw = readFileSync(path, "utf-8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    for (const l of lines) {
      expect(() => JSON.parse(l)).not.toThrow();
    }
  });

  test("appends from two store instances interleave correctly", async () => {
    // Not about concurrency safety — about the file being append-only.
    const storeA = new JsonlEventStore(path);
    const storeB = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    await storeA.append(makeEvent("a", 1, gen));
    await storeB.append(makeEvent("b", 2, gen));
    await storeA.append(makeEvent("c", 3, gen));
    await storeA.close();
    await storeB.close();

    const events = await readAllEvents(path);
    expect(events.map((e) => e.topic)).toEqual(["a", "b", "c"]);
  });

  test("read on a missing file yields nothing rather than throwing", async () => {
    const store = new JsonlEventStore(join(dir, "does-not-exist.jsonl"));
    const out: EventEnvelope[] = [];
    for await (const e of store.read()) out.push(e);
    await store.close();
    expect(out).toEqual([]);
  });

  test("append after close throws", async () => {
    const store = new JsonlEventStore(path);
    const gen = makeIdGenerator();
    await store.append(makeEvent("a", 1, gen));
    await store.close();
    await expect(store.append(makeEvent("b", 2, gen))).rejects.toThrow(/closed/);
  });

  test("appendEventOnce: standalone durable append", async () => {
    const gen = makeIdGenerator();
    await appendEventOnce(path, makeEvent("a", 1, gen));
    await appendEventOnce(path, makeEvent("b", 2, gen));
    const events = await readAllEvents(path);
    expect(events.map((e) => e.topic)).toEqual(["a", "b"]);
  });

  test("simpleAppend: lightweight direct fs append without a store instance", async () => {
    const gen = makeIdGenerator();
    await simpleAppend(path, makeEvent("x", { k: "v" }, gen));
    await simpleAppend(path, makeEvent("y", { k2: "v2" }, gen));
    const events = await readAllEvents(path);
    expect(events.map((e) => e.topic)).toEqual(["x", "y"]);
    expect(events[0]!.data).toEqual({ k: "v" });
    expect(events[1]!.data).toEqual({ k2: "v2" });
  });

  test("simpleAppend: creates parent directories recursively", async () => {
    const nested = join(dir, "deeply", "nested", "dir", "log.jsonl");
    const gen = makeIdGenerator();
    await simpleAppend(nested, makeEvent("z", 99, gen));
    const events = await readAllEvents(nested);
    expect(events.map((e) => e.topic)).toEqual(["z"]);
  });

  test("appendEventOnce and simpleAppend are interchangeable for single appends", async () => {
    const pathA = join(dir, "a.jsonl");
    const pathB = join(dir, "b.jsonl");
    const gen = makeIdGenerator();
    await appendEventOnce(pathA, makeEvent("a", 1, gen));
    await simpleAppend(pathB, makeEvent("b", 2, gen));
    const eventsA = await readAllEvents(pathA);
    const eventsB = await readAllEvents(pathB);
    expect(eventsA[0]!.data).toBe(1);
    expect(eventsB[0]!.data).toBe(2);
  });
});
