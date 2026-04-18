import { describe, expect, test } from "bun:test";
import { cusumInit, cusumReset, cusumUpdate, type CusumState, type CusumUpdate } from "./cusum.ts";

function run(state: CusumState, xs: readonly number[]): CusumUpdate[] {
  const out: CusumUpdate[] = [];
  let s = state;
  for (const x of xs) {
    const u = cusumUpdate(s, x);
    out.push(u);
    s = u.state;
  }
  return out;
}

describe("cusum", () => {
  test("no alarm on a stable stream at target", () => {
    const state = cusumInit({ target: 10, k: 0.5, h: 5 });
    const xs = Array.from({ length: 100 }, () => 10 + (Math.random() - 0.5) * 0.4);
    const updates = run(state, xs);
    const alarms = updates.filter((u) => u.alarm !== "none");
    expect(alarms.length).toBe(0);
  });

  test("upward alarm fires after a positive step change", () => {
    const state = cusumInit({ target: 10, k: 0.5, h: 5 });
    // First 50 samples at target; then 50 samples shifted up by 3.
    const stable = Array.from({ length: 50 }, () => 10);
    const shifted = Array.from({ length: 50 }, () => 13);
    const updates = run(state, [...stable, ...shifted]);

    const stableAlarms = updates.slice(0, 50).filter((u) => u.alarm !== "none");
    expect(stableAlarms.length).toBe(0);

    const postShift = updates.slice(50);
    const firstAlarm = postShift.findIndex((u) => u.alarm === "upward");
    expect(firstAlarm).toBeGreaterThanOrEqual(0);
    // With shift = 3, k = 0.5, effective drift per sample = 2.5; h = 5 → ~2 samples.
    expect(firstAlarm).toBeLessThanOrEqual(5);
  });

  test("downward alarm fires after a negative step change", () => {
    const state = cusumInit({ target: 100, k: 1, h: 10 });
    const stable = Array.from({ length: 20 }, () => 100);
    const shifted = Array.from({ length: 20 }, () => 90);
    const updates = run(state, [...stable, ...shifted]);
    const postShift = updates.slice(20);
    const first = postShift.findIndex((u) => u.alarm === "downward");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(5);
  });

  test("accumulators never go negative (bounded below at zero)", () => {
    const state = cusumInit({ target: 0, k: 1, h: 100 });
    const xs = [-10, -10, -10, 5, 5, 5]; // sustained below then spike up
    const updates = run(state, xs);
    for (const u of updates) {
      expect(u.state.sHi).toBeGreaterThanOrEqual(0);
      expect(u.state.sLo).toBeGreaterThanOrEqual(0);
    }
  });

  test("reset clears accumulators but preserves params", () => {
    const state = cusumInit({ target: 10, k: 0.5, h: 5 });
    const dirtied = run(state, [15, 15, 15, 15, 15]).slice(-1)[0]!.state;
    expect(dirtied.sHi).toBeGreaterThan(0);
    const reset = cusumReset(dirtied);
    expect(reset.sHi).toBe(0);
    expect(reset.sLo).toBe(0);
    expect(reset.params).toEqual(dirtied.params);
  });

  test("higher k suppresses noise (k = 'slack' parameter)", () => {
    // Same noisy stream; larger k → fewer alarms.
    const noise = Array.from({ length: 200 }, () => 10 + (Math.random() - 0.5) * 2);
    const sensitive = run(cusumInit({ target: 10, k: 0.1, h: 5 }), noise);
    const insensitive = run(cusumInit({ target: 10, k: 1.5, h: 5 }), noise);
    const sensitiveAlarms = sensitive.filter((u) => u.alarm !== "none").length;
    const insensitiveAlarms = insensitive.filter((u) => u.alarm !== "none").length;
    expect(insensitiveAlarms).toBeLessThanOrEqual(sensitiveAlarms);
  });

  test("larger h delays alarm (more sample accumulation required)", () => {
    const xs = Array.from({ length: 30 }, () => 13); // sustained +3 from target=10
    const low = run(cusumInit({ target: 10, k: 0.5, h: 2 }), xs);
    const high = run(cusumInit({ target: 10, k: 0.5, h: 20 }), xs);
    const lowFirst = low.findIndex((u) => u.alarm === "upward");
    const highFirst = high.findIndex((u) => u.alarm === "upward");
    expect(lowFirst).toBeGreaterThanOrEqual(0);
    expect(highFirst).toBeGreaterThanOrEqual(0);
    expect(highFirst).toBeGreaterThan(lowFirst);
  });
});
