import { describe, expect, test } from "bun:test";
import type { EventEnvelope } from "./types.js";
import { makeEvent } from "./types.js";

describe("makeEvent", () => {
  test("returns an EventEnvelope with correct shape", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const event = makeEvent("test.topic", { foo: "bar" }, gen);

    expect(event._v).toBe(1);
    expect(typeof event.id).toBe("string");
    expect(typeof event.timestamp).toBe("string");
    expect(event.topic).toBe("test.topic");
    expect(event.data).toEqual({ foo: "bar" });
  });

  test("uses the provided nextId function for id field", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const event = makeEvent("test.topic", {}, gen);

    expect(event.id).toBe("1740000000000.000000");
  });

  test("calls nextId on each makeEvent call, advancing seq", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const event1 = makeEvent("a", {}, gen);
    const event2 = makeEvent("b", {}, gen);

    expect(event1.id).toBe("1740000000000.000000");
    expect(event2.id).toBe("1740000000000.000001");
  });

  test("timestamp is an ISO-8601 UTC string from provided now function", () => {
    const fixedNow = 1740000000000;
    const gen = makeIdGenerator(() => fixedNow);
    const event = makeEvent("test.topic", {}, gen, () => fixedNow);

    // new Date(1740000000000).toISOString() — verified to be in UTC
    // The ISO string must end in 'Z' (UTC indicator)
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Parse back and verify it round-trips
    expect(Date.parse(event.timestamp)).toBe(fixedNow);
  });

  test("timestamp defaults to Date.now when no now function provided", () => {
    const gen = makeIdGenerator();
    const before = Date.now();
    const event = makeEvent("test.topic", {}, gen);
    const after = Date.now();

    const tsMs = Date.parse(event.timestamp);
    expect(tsMs).toBeGreaterThanOrEqual(before);
    expect(tsMs).toBeLessThanOrEqual(after);
  });

  test("data can be any type — primitives", () => {
    const gen = makeIdGenerator(() => 1740000000000);

    const e1 = makeEvent("num", 42, gen);
    expect(e1.data).toBe(42);

    const e2 = makeEvent("str", "hello", gen);
    expect(e2.data).toBe("hello");

    const e3 = makeEvent("bool", true, gen);
    expect(e3.data).toBe(true);

    const e4 = makeEvent("null", null, gen);
    expect(e4.data).toBeNull();
  });

  test("data can be any type — objects and arrays", () => {
    const gen = makeIdGenerator(() => 1740000000000);

    const e1 = makeEvent("obj", { a: 1, b: { c: 2 } }, gen);
    expect(e1.data).toEqual({ a: 1, b: { c: 2 } });

    const e2 = makeEvent("arr", [1, 2, 3], gen);
    expect(e2.data).toEqual([1, 2, 3]);
  });

  test("data can be undefined", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const event = makeEvent("unit", undefined, gen);
    expect(event.data).toBeUndefined();
  });

  test("topic can be any string", () => {
    const gen = makeIdGenerator(() => 1740000000000);

    const topics = [
      "session.update",
      "scheduler.permit.grant",
      "provider.health",
      "agent.chunk",
      "daemon.log",
      "a",
      "",
    ];

    for (const topic of topics) {
      const event = makeEvent(topic, {}, gen);
      expect(event.topic).toBe(topic);
    }
  });

  test("EventEnvelope fields are readonly (structural)", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const event = makeEvent("test.topic", { x: 1 }, gen);

    // @ts-expect-error — id is readonly
    event.id = "other";
    // @ts-expect-error — timestamp is readonly
    event.timestamp = "2025-01-01T00:00:00.000Z";
    // @ts-expect-error — topic is readonly
    event.topic = "other";
    // @ts-expect-error — data is readonly
    event.data = {};
  });

  test("multiple events with same topic but advancing ids are unique", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const event = makeEvent("session.update", { seq: i }, gen);
      ids.add(event.id);
    }

    expect(ids.size).toBe(100);
  });

  test("makeEvent consumes an id from the generator and advances shared seq", () => {
    const gen = makeIdGenerator(() => 1740000000000);

    // id1 is the first id generated
    const id1 = gen(); // seq=0 → "1740000000000.000000"
    // After id1, seq is now 1

    // makeEvent calls gen() internally → gets the NEXT id
    const event = makeEvent("test", {}, gen); // seq=1 → "1740000000000.000001"
    // After makeEvent, seq inside gen is now 2

    // The id inside event.id comes from the call inside makeEvent
    expect(event.id).toBe("1740000000000.000001");
    expect(event.id).not.toBe(id1); // different from id1

    // Calling gen() again should give the next id (seq was advanced by makeEvent)
    const id3 = gen(); // seq=2 → "1740000000000.000002"
    expect(id3).toBe("1740000000000.000002");
  });
});

// Helper used in tests — kept inlined here to avoid import issues
function makeIdGenerator(now: () => number = Date.now): () => string {
  let lastMs = 0;
  let seq = 0;
  return () => {
    const ms = now();
    if (ms === lastMs) {
      seq += 1;
    } else {
      lastMs = ms;
      seq = 0;
    }
    return `${ms.toString().padStart(13, "0")}.${seq.toString().padStart(6, "0")}`;
  };
}
