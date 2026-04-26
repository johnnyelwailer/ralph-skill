import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlEventStore, appendEventOnce, readAllEvents, simpleAppend } from "./jsonl.ts";
import type { EventEnvelope } from "@aloop/core";

function makeEvent(id: string, topic = "test.event", data: unknown = {}): EventEnvelope {
  return { _v: 1, id, timestamp: new Date().toISOString(), topic, data };
}

describe("JsonlEventStore", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-jsonl-"));
    path = join(dir, "events.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("append", () => {
    test("creates the file and writes one event per line", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001", "test.a", { x: 1 }));
      await store.close();

      expect(existsSync(path)).toBe(true);
      const content = await Bun.file(path).text();
      const lines = content.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.id).toBe("0001");
      expect(parsed.topic).toBe("test.a");
      expect(parsed.data).toEqual({ x: 1 });
    });

    test("appends a second event on a new line without overwriting", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001", "test.a"));
      await store.append(makeEvent("0002", "test.b"));
      await store.close();

      const lines = (await Bun.file(path).text()).split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).id).toBe("0001");
      expect(JSON.parse(lines[1]!).id).toBe("0002");
    });

    test("creates parent directories recursively", async () => {
      const deepPath = join(dir, "a", "b", "c", "events.jsonl");
      const store = new JsonlEventStore(deepPath);
      await store.append(makeEvent("0001"));
      await store.close();

      expect(existsSync(deepPath)).toBe(true);
    });

    test("throws when appending after close", async () => {
      const store = new JsonlEventStore(path);
      await store.close();
      await expect(store.append(makeEvent("0001"))).rejects.toThrow("EventStore closed");
    });

    test("lazy-opens file handle on first append", async () => {
      const store = new JsonlEventStore(path);
      expect(existsSync(path)).toBe(false);
      await store.append(makeEvent("0001"));
      expect(existsSync(path)).toBe(true);
      await store.close();
    });
  });

  describe("read", () => {
    test("returns empty iterable when file does not exist", async () => {
      const store = new JsonlEventStore(path);
      const events: EventEnvelope[] = [];
      for await (const e of store.read()) events.push(e);
      await store.close();
      expect(events).toHaveLength(0);
    });

    test("yields all events in order", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001", "a"));
      await store.append(makeEvent("0002", "b"));
      await store.append(makeEvent("0003", "c"));
      await store.close();

      const events: EventEnvelope[] = [];
      const store2 = new JsonlEventStore(path);
      for await (const e of store2.read()) events.push(e);
      await store2.close();

      expect(events).toHaveLength(3);
      expect(events[0]!.id).toBe("0001");
      expect(events[1]!.id).toBe("0002");
      expect(events[2]!.id).toBe("0003");
    });

    test("skips empty lines in the file", async () => {
      // Write a file with an empty line between two valid events
      await Bun.write(
        path,
        JSON.stringify(makeEvent("0001")) + "\n\n" + JSON.stringify(makeEvent("0002")) + "\n",
      );

      const events: EventEnvelope[] = [];
      const store = new JsonlEventStore(path);
      for await (const e of store.read()) events.push(e);
      await store.close();

      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("0001");
      expect(events[1]!.id).toBe("0002");
    });

    test("filters by since (exclusive, by event id)", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001"));
      await store.append(makeEvent("0002"));
      await store.append(makeEvent("0003"));
      await store.close();

      const events: EventEnvelope[] = [];
      const store2 = new JsonlEventStore(path);
      for await (const e of store2.read("0001")) events.push(e);
      await store2.close();

      // "since" is exclusive, so 0001 is not included
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("0002");
      expect(events[1]!.id).toBe("0003");
    });

    test("read yields events from a pre-populated file", async () => {
      // Pre-populate a file with known events (simulating existing log)
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001", "a"));
      await store.append(makeEvent("0002", "b"));
      await store.close();

      // Read from a fresh store instance pointing to the same file
      const reader = new JsonlEventStore(path);
      const events: EventEnvelope[] = [];
      for await (const e of reader.read()) events.push(e);
      await reader.close();

      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("0001");
      expect(events[1]!.id).toBe("0002");
    });

    test("since with id equal to last event returns empty", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001"));
      await store.append(makeEvent("0002"));
      await store.close();

      const events: EventEnvelope[] = [];
      const store2 = new JsonlEventStore(path);
      for await (const e of store2.read("0002")) events.push(e);
      await store2.close();

      expect(events).toHaveLength(0);
    });

    test("read is iterable even after store is closed", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001"));
      await store.close();

      // Read from a new store instance pointing to the same file
      const reader = new JsonlEventStore(path);
      const events: EventEnvelope[] = [];
      for await (const e of reader.read()) events.push(e);
      await reader.close();

      expect(events).toHaveLength(1);
    });
  });

  describe("close", () => {
    test("close is idempotent (safe to call twice)", async () => {
      const store = new JsonlEventStore(path);
      await store.append(makeEvent("0001"));
      await store.close();
      await store.close(); // should not throw
    });

    test("close before any append does not throw", async () => {
      const store = new JsonlEventStore(path);
      await store.close();
    });
  });

  describe("readAllEvents", () => {
    test("reads all events from an existing file", async () => {
      // Manually write two events
      await Bun.write(
        path,
        JSON.stringify(makeEvent("0001", "a")) + "\n" + JSON.stringify(makeEvent("0002", "b")) + "\n",
      );

      const events = await readAllEvents(path);
      expect(events).toHaveLength(2);
      expect(events[0]!.id).toBe("0001");
      expect(events[1]!.id).toBe("0002");
    });

    test("returns empty array for non-existent file", async () => {
      const events = await readAllEvents(join(dir, "nonexistent.jsonl"));
      expect(events).toHaveLength(0);
    });
  });
});

describe("appendEventOnce", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-once-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("appends a single event to a new file", async () => {
    const p = join(dir, "events.jsonl");
    await appendEventOnce(p, makeEvent("0001", "once"));

    const lines = (await Bun.file(p).text()).split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).id).toBe("0001");
  });

  test("creates parent directories recursively", async () => {
    const p = join(dir, "a", "b", "c", "events.jsonl");
    await appendEventOnce(p, makeEvent("0001"));

    expect(existsSync(p)).toBe(true);
  });

  test("appends to an existing file without overwriting", async () => {
    const p = join(dir, "events.jsonl");
    await Bun.write(p, JSON.stringify(makeEvent("0001", "first")) + "\n");
    await appendEventOnce(p, makeEvent("0002", "second"));

    const lines = (await Bun.file(p).text()).split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
  });
});

describe("simpleAppend", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-simple-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("appends event to file without overwriting existing content", async () => {
    const p = join(dir, "events.jsonl");
    await simpleAppend(p, makeEvent("0001", "a"));
    await simpleAppend(p, makeEvent("0002", "b"));

    const lines = (await Bun.file(p).text()).split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).id).toBe("0001");
    expect(JSON.parse(lines[1]!).id).toBe("0002");
  });

  test("creates parent directories recursively", async () => {
    const p = join(dir, "x", "y", "events.jsonl");
    await simpleAppend(p, makeEvent("0001"));

    expect(existsSync(p)).toBe(true);
  });

  test("writes a valid JSON line with newline terminator", async () => {
    const p = join(dir, "events.jsonl");
    await simpleAppend(p, makeEvent("0001", "test"));

    const content = await Bun.file(p).text();
    // Content should be a single line ending with \n
    const lines = content.split("\n");
    expect(lines[0]).toBeTruthy();
    expect(lines[1]).toBe("");
    // The first line should be valid JSON
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.id).toBe("0001");
  });
});
