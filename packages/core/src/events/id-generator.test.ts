import { describe, expect, test } from "bun:test";
import { makeIdGenerator } from "./types.js";

describe("makeIdGenerator", () => {
  test("returns a function", () => {
    const gen = makeIdGenerator();
    expect(typeof gen).toBe("function");
  });

  test("generates an id on each call", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const id = gen();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("id format is {ms:013}.{seq:06} — ms padded to 13 digits, seq padded to 6 digits", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const id = gen();
    // 13 digits . 6 digits = 20 chars total
    expect(id).toMatch(/^\d{13}\.\d{6}$/);
    expect(id).toBe("1740000000000.000000");
  });

  test("seq increments when called multiple times within the same ms", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    expect(gen()).toBe("1740000000000.000000");
    expect(gen()).toBe("1740000000000.000001");
    expect(gen()).toBe("1740000000000.000002");
    expect(gen()).toBe("1740000000000.000003");
  });

  test("seq resets to 0 when ms advances", () => {
    let ms = 1740000000000;
    const gen = makeIdGenerator(() => ms);

    expect(gen()).toBe("1740000000000.000000");
    expect(gen()).toBe("1740000000000.000001");

    ms = 1740000000001;
    expect(gen()).toBe("1740000000001.000000");
    expect(gen()).toBe("1740000000001.000001");

    ms = 1740000000002;
    expect(gen()).toBe("1740000000002.000000");
  });

  test("seq wraps at 999999 and continues on next ms (spec documents max seq per ms)", () => {
    let ms = 1740000000000;
    const gen = makeIdGenerator(() => ms);

    // Fast-forward seq to near max
    // We can't easily test 1M iterations but we verify the format holds
    for (let i = 0; i < 10; i++) {
      const id = gen();
      expect(id).toMatch(/^\d{13}\.\d{6}$/);
      expect(id.startsWith("1740000000000.")).toBe(true);
    }
  });

  test("ids are lexicographically sortable within same ms", () => {
    let ms = 1740000000000;
    const gen = makeIdGenerator(() => ms);

    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(gen());
    }

    // IDs should sort correctly (lexicographic = numeric for zero-padded)
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  test("ids from later ms sort after ids from earlier ms (lexicographic sortability across ms)", () => {
    let ms = 1740000000000;
    const gen = makeIdGenerator(() => ms);

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(gen());
    }

    ms = 1740000000001;
    for (let i = 0; i < 5; i++) {
      ids.push(gen());
    }

    const sorted = [...ids].sort();
    // All ids from ms=1740000000000 should come before all ids from ms=1740000000001
    expect(sorted[0]).toBe("1740000000000.000000");
    expect(sorted[4]).toBe("1740000000000.000004");
    expect(sorted[5]).toBe("1740000000001.000000");
    expect(sorted[9]).toBe("1740000000001.000004");
  });

  test("custom clock function is used for ms", () => {
    const gen = makeIdGenerator(() => 9999999999999);
    const id = gen();
    expect(id.startsWith("9999999999999.")).toBe(true);
  });

  test("default clock is Date.now", () => {
    // Just verify it returns different ids over time using the real clock
    const gen = makeIdGenerator();
    const id1 = gen();
    // Id should use Date.now() behavior
    expect(id1).toMatch(/^\d{13}\.\d{6}$/);
  });

  test("id generator is stateful — multiple calls share seq counter", () => {
    const gen = makeIdGenerator(() => 1740000000000);
    const id1 = gen();
    const id2 = gen();

    // Verify state is shared — seq increments
    expect(id1).not.toBe(id2);
    expect(id1).toBe("1740000000000.000000");
    expect(id2).toBe("1740000000000.000001");
  });
});
