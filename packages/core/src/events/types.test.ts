import { describe, expect, test } from "bun:test";
import { makeIdGenerator, makeEvent } from "./types";

describe("makeIdGenerator", () => {
  test("generates unique ids within same millisecond", () => {
    const now = () => 1700000000000;
    const gen = makeIdGenerator(now);
    const id1 = gen();
    const id2 = gen();
    const id3 = gen();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).toBe("1700000000000.000000");
    expect(id2).toBe("1700000000000.000001");
    expect(id3).toBe("1700000000000.000002");
  });

  test("resets sequence when millisecond advances", () => {
    let ms = 1700000000000;
    const now = () => ms;
    const gen = makeIdGenerator(now);

    expect(gen()).toBe("1700000000000.000000");
    ms = 1700000000001;
    expect(gen()).toBe("1700000000001.000000");
  });

  test("ids are lexicographically sortable within same ms", () => {
    let ms = 1700000000000;
    const now = () => ms;
    const gen = makeIdGenerator(now);

    const ids = [gen(), gen(), gen()];
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

describe("makeEvent", () => {
  test("envelope has correct _v and structure", () => {
    const nextId = () => "id-456";
    // Use current time to avoid confusion with epoch
    const now = () => Date.now();
    const envelope = makeEvent("agent.chunk", { session_id: "s1" }, nextId, now);

    // _v is always 1 (v1 stable per spec)
    expect(envelope._v).toBe(1);
    expect(envelope.id).toBe("id-456");
    expect(envelope.topic).toBe("agent.chunk");
    expect(envelope.data).toEqual({ session_id: "s1" });
    // Timestamp must be valid ISO-8601
    expect(envelope.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});