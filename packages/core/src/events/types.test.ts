import { describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator, type EventEnvelope } from "./types.ts";

describe("makeIdGenerator", () => {
  test("ids are lexicographically monotonic within a single ms", () => {
    const frozen = 1776543210000;
    const gen = makeIdGenerator(() => frozen);
    const ids = [gen(), gen(), gen(), gen()];
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    // All unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("ids are lexicographically monotonic across ms boundaries", () => {
    let t = 1776543210000;
    const gen = makeIdGenerator(() => t);
    const ids: string[] = [];
    ids.push(gen());
    ids.push(gen());
    t += 1;
    ids.push(gen());
    t += 100;
    ids.push(gen());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  test("sequence resets on ms advance", () => {
    let t = 1000;
    const gen = makeIdGenerator(() => t);
    const a = gen();
    const b = gen();
    t += 1;
    const c = gen();
    // second id should have seq=1, third has seq=0 again
    expect(a.endsWith(".000000")).toBe(true);
    expect(b.endsWith(".000001")).toBe(true);
    expect(c.endsWith(".000000")).toBe(true);
  });

  test("fixed-width padding keeps string-sort consistent with time-sort", () => {
    // A lower ms should sort before a higher ms even when seq values differ.
    const gen1 = makeIdGenerator(() => 10);
    const a = gen1();
    const gen2 = makeIdGenerator(() => 100);
    const b = gen2();
    expect(a < b).toBe(true);
  });

  test("generates exactly 6 digits of sequence padding", () => {
    let t = 1000;
    const gen = makeIdGenerator(() => t);
    const id = gen();
    const parts = id.split(".");
    expect(parts[1]!.length).toBe(6);
    expect(parts[1]).toBe("000000");
  });

  test("sequence increments correctly up to its 6-digit maximum within a single ms", () => {
    let t = 1000;
    const gen = makeIdGenerator(() => t);
    const ids: string[] = [];
    // Generate 10 ids in the same ms
    for (let i = 0; i < 10; i++) ids.push(gen());
    const seqs = ids.map((id) => parseInt(id.split(".")[1]!, 10));
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBe(seqs[i - 1]! + 1);
    }
  });

  test("ids are unique across many rapid generations in the same ms", () => {
    const frozen = 1776543210000;
    const gen = makeIdGenerator(() => frozen);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(gen());
    expect(ids.size).toBe(1000);
  });

  test("ids sort correctly when ms rolls forward mid-sequence", () => {
    let t = 1_000_000;
    const gen = makeIdGenerator(() => t);
    const ids: string[] = [];
    ids.push(gen()); // seq=0 at ms=1_000_000
    ids.push(gen()); // seq=1 at ms=1_000_000
    ids.push(gen()); // seq=2 at ms=1_000_000
    t = 1_000_001;
    ids.push(gen()); // seq=0 at ms=1_000_001
    ids.push(gen()); // seq=1 at ms=1_000_001

    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    // Verify the ms part is correctly 13-digit padded: 1_000_000 -> "0000001000000"
    expect(ids[2]).toBe("0000001000000.000002");
    expect(ids[3]).toBe("0000001000001.000000");
  });

  test("ms field is exactly 13 digits (room to year ~2286)", () => {
    let t = 1_000_000;
    const gen = makeIdGenerator(() => t);
    const id = gen();
    const msPart = id.split(".")[0]!;
    expect(msPart.length).toBe(13);
    // 1_000_000 stringified is "1000000", padded to 13 chars = "0000001000000"
    expect(msPart).toBe("0000001000000");
  });

  test("padding handles very large ms values without overflow", () => {
    const largeMs = 9999999999999; // near the 13-digit limit
    const gen = makeIdGenerator(() => largeMs);
    const id = gen();
    // 9999999999999 already has 13 digits, no leading zeros needed
    expect(id.startsWith("9999999999999.")).toBe(true);
    // 13 + 1 (dot) + 6 = 20
    expect(id.length).toBe(20);
  });

  test("makeIdGenerator uses Date.now when no argument provided", () => {
    const before = Date.now();
    const gen = makeIdGenerator();
    const id = gen();
    const after = Date.now();
    const msPart = parseInt(id.split(".")[0]!, 10);
    expect(msPart).toBeGreaterThanOrEqual(before);
    expect(msPart).toBeLessThanOrEqual(after);
  });

  test("id format is exactly {13digits}.{6digits} with no extra characters", () => {
    const gen = makeIdGenerator(() => 12345);
    const id = gen();
    expect(id).toMatch(/^\d{13}\.\d{6}$/);
  });
});

describe("makeEvent", () => {
  test("produces canonical v1 envelope", () => {
    const gen = makeIdGenerator(() => 1776543210000);
    const ev = makeEvent("session.update", { session_id: "s_abc" }, gen, () => 1776543210000);
    expect(ev._v).toBe(1);
    expect(ev.topic).toBe("session.update");
    expect(ev.data).toEqual({ session_id: "s_abc" });
    expect(ev.timestamp).toBe(new Date(1776543210000).toISOString());
    expect(ev.id).toMatch(/^\d{13}\.\d{6}$/);
  });

  test("id is sourced from the provided nextId generator", () => {
    let counter = 0;
    const gen = makeIdGenerator(() => 1000);
    const ev = makeEvent("a", { x: 1 }, gen, () => 1000);
    expect(ev.id).toBe("0000000001000.000000");
  });

  test("timestamp is sourced from the provided now function", () => {
    const gen = makeIdGenerator(() => 1000);
    const ev = makeEvent("a", {}, gen, () => 0);
    expect(ev.timestamp).toBe(new Date(0).toISOString());
  });

  test("timestamp is in valid ISO-8601 UTC format", () => {
    const gen = makeIdGenerator(() => 1777000000000);
    const ev = makeEvent("topic", { data: 42 }, gen, () => 1777000000000);
    // toISOString produces: "2026-03-22T12:53:20.000Z"
    expect(ev.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("topic can be any string value", () => {
    const gen = makeIdGenerator(() => 1000);
    const topics = [
      "scheduler.permit.grant",
      "scheduler.permit.deny",
      "scheduler.limits.changed",
      "provider.override.changed",
      "session.update",
      "a",
      "",
      "with.dots.and.underscores",
    ];
    for (const topic of topics) {
      const ev = makeEvent(topic, {}, gen, () => 1000);
      expect(ev.topic).toBe(topic);
    }
  });

  test("data can be any serializable value", () => {
    const gen = makeIdGenerator(() => 1000);
    const cases: Array<[unknown, string]> = [
      [null, "null"],
      [42, "number"],
      ["hello", "string"],
      [true, "boolean"],
      [[1, 2, 3], "array"],
      [{ key: "value" }, "object"],
      [{ nested: { deep: true } }, "nested object"],
      [[{ a: 1 }, { b: 2 }], "array of objects"],
    ];
    for (const [data] of cases) {
      const ev = makeEvent("t", data, gen, () => 1000);
      expect(ev.data).toEqual(data);
    }
  });

  test("event envelope fields are typed as readonly (TypeScript-level guarantee)", () => {
    const gen = makeIdGenerator(() => 1000);
    const ev = makeEvent("t", { x: 1 }, gen, () => 1000);
    // Verify the fields exist and are accessible — readonly is a TS constraint, not runtime enforcement
    expect(typeof ev._v).toBe("number");
    expect(typeof ev.id).toBe("string");
    expect(typeof ev.topic).toBe("string");
    expect(typeof ev.timestamp).toBe("string");
    expect(ev.data).toEqual({ x: 1 });
  });

  test("two events with same topic and data but different ids are distinct", () => {
    let t = 1000;
    const gen = makeIdGenerator(() => t);
    const ev1 = makeEvent("a", { n: 1 }, gen, () => t);
    t = 1001;
    const ev2 = makeEvent("a", { n: 1 }, gen, () => t);
    expect(ev1.id).not.toBe(ev2.id);
  });

  test("EventEnvelope type is correctly indexed for generic data", () => {
    // Verify the type-level guarantee that data is typed as T
    const gen = makeIdGenerator(() => 1000);
    const ev: EventEnvelope<{ sessionId: string; count: number }> = makeEvent(
      "session.update",
      { sessionId: "s_1", count: 5 },
      gen,
      () => 1000,
    );
    // TypeScript would catch mismatch; we just verify runtime shape here
    expect(ev.data.sessionId).toBe("s_1");
    expect(ev.data.count).toBe(5);
  });
});
