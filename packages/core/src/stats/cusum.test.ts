import { describe, expect, test } from "bun:test";
import {
  cusumInit,
  cusumUpdate,
  cusumReset,
  type CusumState,
} from "./cusum.ts";

const BASE_PARAMS = { target: 10, k: 0.5, h: 4 };

describe("cusumInit", () => {
  test("sHi and sLo start at 0", () => {
    const s = cusumInit(BASE_PARAMS);
    expect(s.sHi).toBe(0);
    expect(s.sLo).toBe(0);
    expect(s.params).toEqual(BASE_PARAMS);
  });
});

describe("cusumUpdate", () => {
  test("no alarm when value equals target", () => {
    let s = cusumInit(BASE_PARAMS);
    // x - target - k = 10 - 10 - 0.5 = -0.5 → max(0, ...) = 0
    const result = cusumUpdate(s, 10);
    expect(result.alarm).toBe("none");
    expect(result.state.sHi).toBe(0);
    expect(result.state.sLo).toBe(0);
  });

  test("value above target increments sHi", () => {
    let s = cusumInit(BASE_PARAMS);
    // x - target - k = 12 - 10 - 0.5 = 1.5
    s = cusumUpdate(s, 12).state;
    expect(s.sHi).toBe(1.5);
    expect(s.sLo).toBe(0);
  });

  test("value below target increments sLo", () => {
    let s = cusumInit(BASE_PARAMS);
    // target - x - k = 10 - 8 - 0.5 = 1.5
    s = cusumUpdate(s, 8).state;
    expect(s.sLo).toBe(1.5);
    expect(s.sHi).toBe(0);
  });

  test("small deviations within k threshold are ignored", () => {
    let s = cusumInit(BASE_PARAMS);
    // x - target - k = 10.4 - 10 - 0.5 = -0.1 → clamped to 0
    const result = cusumUpdate(s, 10.4);
    expect(result.state.sHi).toBe(0);
    expect(result.state.sLo).toBe(0);
    expect(result.alarm).toBe("none");
  });

  test("upward alarm fires when sHi exceeds h", () => {
    let s = cusumInit(BASE_PARAMS);
    // Each update adds (x - target - k) = (15 - 10 - 0.5) = 4.5 to sHi.
    // After first: sHi=4.5 > h=4 → upward alarm.
    const result = cusumUpdate(s, 15);
    expect(result.alarm).toBe("upward");
  });

  test("downward alarm fires when sLo exceeds h", () => {
    let s = cusumInit(BASE_PARAMS);
    // Each update adds (target - x - k) = (10 - 5 - 0.5) = 4.5 to sLo.
    // After first: sLo=4.5 > h=4 → downward alarm.
    const result = cusumUpdate(s, 5);
    expect(result.alarm).toBe("downward");
  });

  test("accumulates over multiple updates before alarm", () => {
    let s = cusumInit(BASE_PARAMS);
    // Each step: (12 - 10 - 0.5) = 1.5 per update.
    // After 2 updates: sHi=3; after 3: sHi=4.5 > h → alarm on 3rd
    s = cusumUpdate(s, 12).state;
    expect(s.sHi).toBe(1.5);
    s = cusumUpdate(s, 12).state;
    expect(s.sHi).toBe(3.0);
    const r3 = cusumUpdate(s, 12);
    expect(r3.alarm).toBe("upward");
    expect(r3.state.sHi).toBe(4.5);
  });

  test("sHi and sLo are independent", () => {
    let s = cusumInit(BASE_PARAMS);
    // x=13: sHi = max(0, 0+(13-10-0.5)) = 2.5
    s = cusumUpdate(s, 13).state;
    // x=8: sLo = max(0, 0+(10-8-0.5)) = 1.5; sHi = max(0, 2.5+(8-10-0.5)) = max(0, 0) = 0
    s = cusumUpdate(s, 8).state;
    expect(s.sHi).toBe(0);   // clamped: 2.5+(8-10-0.5)=0
    expect(s.sLo).toBe(1.5);
  });

  test("alarm is none when both sHi and sLo are below threshold", () => {
    let s = cusumInit(BASE_PARAMS);
    // x=11: sHi = max(0, 0+(11-10-0.5)) = 0.5
    s = cusumUpdate(s, 11).state;
    // x=9: sLo = max(0, 0+(10-9-0.5)) = 0.5; sHi = max(0, 0.5+(9-10-0.5)) = max(0, -1) = 0
    s = cusumUpdate(s, 9).state;
    // x=11: sHi = max(0, 0+(11-10-0.5)) = 0.5; sLo = max(0, 0.5+(10-11-0.5)) = max(0, -1) = 0
    const r = cusumUpdate(s, 11);
    expect(r.alarm).toBe("none");
    expect(r.state.sHi).toBe(0.5);
    expect(r.state.sLo).toBe(0);
  });
});

describe("cusumReset", () => {
  test("resets sHi and sLo to 0, preserves params", () => {
    let s = cusumInit(BASE_PARAMS);
    s = cusumUpdate(s, 15).state; // triggered alarm
    expect(s.sHi).toBe(4.5);

    const reset = cusumReset(s);
    expect(reset.sHi).toBe(0);
    expect(reset.sLo).toBe(0);
    expect(reset.params).toBe(BASE_PARAMS);
  });

  test("reset then update starts fresh accumulation", () => {
    let s = cusumInit(BASE_PARAMS);
    s = cusumUpdate(s, 15).state; // sHi=4.5, alarm
    s = cusumReset(s);
    // After reset, should need another 3 steps of 1.5 each to exceed h=4
    s = cusumUpdate(s, 12).state; // sHi=1.5
    s = cusumUpdate(s, 12).state; // sHi=3.0
    const r3 = cusumUpdate(s, 12);
    expect(r3.alarm).toBe("upward");
  });
});

describe("cusumUpdate alarm types", () => {
  test("alarm is 'upward' only when sHi > h (not sLo)", () => {
    let s = cusumInit(BASE_PARAMS);
    // x=13: sHi = max(0, 0+(13-10-0.5)) = 2.5
    s = cusumUpdate(s, 13).state;
    // x=8: sLo = max(0, 0+(10-8-0.5)) = 1.5; sHi = max(0, 2.5+(8-10-0.5)) = 0
    s = cusumUpdate(s, 8).state;
    // x=13: sHi = max(0, 0+(13-10-0.5)) = 2.5; sLo = max(0, 1.5+(10-13-0.5)) = 0
    const r = cusumUpdate(s, 13);
    expect(r.alarm).toBe("none"); // sHi=2.5, below h=4
  });

  test("alarm is 'downward' only when sLo > h (not sHi)", () => {
    let s = cusumInit(BASE_PARAMS);
    // x=8: sLo = max(0, 0+(10-8-0.5)) = 1.5
    s = cusumUpdate(s, 8).state;
    // x=13: sHi = max(0, 0+(13-10-0.5)) = 2.5; sLo = max(0, 1.5+(10-13-0.5)) = 0
    s = cusumUpdate(s, 13).state;
    // x=8: sLo = max(0, 0+(10-8-0.5)) = 1.5; sHi = max(0, 2.5+(8-10-0.5)) = 0
    const r = cusumUpdate(s, 8);
    expect(r.alarm).toBe("none"); // sLo=1.5, below h=4
  });

  test("alarm is 'none' when exactly on boundary sHi == h", () => {
    let s = cusumInit({ target: 10, k: 0, h: 4 });
    // Each update adds x - target - k = x - 10
    // After 4 updates of +1 each: sHi=4, equals h, should still be 'none' (strict >)
    for (let i = 0; i < 3; i++) s = cusumUpdate(s, 11).state;
    const r = cusumUpdate(s, 11); // sHi=4, h=4, 4 > 4 = false → none
    expect(r.alarm).toBe("none");
    const r2 = cusumUpdate(r.state, 11); // sHi=5 > 4 → upward
    expect(r2.alarm).toBe("upward");
  });
});

describe(" CusumState immutability", () => {
  test("update returns new state, original unchanged", () => {
    const s0 = cusumInit(BASE_PARAMS);
    const result = cusumUpdate(s0, 12);
    expect(s0.sHi).toBe(0); // original untouched
    expect(result.state.sHi).toBe(1.5);
  });

  test("reset returns new state, original unchanged", () => {
    const s0 = cusumInit(BASE_PARAMS);
    const s1 = cusumUpdate(s0, 12).state;
    const reset = cusumReset(s1);
    expect(s1.sHi).toBe(1.5); // original untouched
    expect(reset.sHi).toBe(0);
  });
});
