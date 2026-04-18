import { describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator } from "./types.ts";

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
});
