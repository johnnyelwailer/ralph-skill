import { describe, expect, test } from "bun:test";
import {
  cusumInit,
  cusumReset,
  cusumUpdate,
  type CusumParams,
  type CusumState,
} from "./cusum.ts";

const PARAMS: CusumParams = { target: 100, k: 2, h: 10 };

function sHi(s: CusumState): number {
  return s.sHi;
}
function sLo(s: CusumState): number {
  return s.sLo;
}

describe("cusumInit", () => {
  test("returns state with zero accumulators and given params", () => {
    const state = cusumInit(PARAMS);
    expect(state.params).toBe(PARAMS);
    expect(state.sHi).toBe(0);
    expect(state.sLo).toBe(0);
  });

  test("params are preserved on the returned state", () => {
    const params: CusumParams = { target: 50, k: 1, h: 8 };
    const state = cusumInit(params);
    expect(state.params.target).toBe(50);
    expect(state.params.k).toBe(1);
    expect(state.params.h).toBe(8);
  });
});

describe("cusumUpdate", () => {
  test("no alarm when values stay close to target (within k slack)", () => {
    // target=100, k=2 → x within [98, 102] produces no drift
    let state = cusumInit(PARAMS);
    for (let i = 0; i < 20; i++) {
      const x = 100 + (Math.random() - 0.5); // ~100 ± 0.5
      const result = cusumUpdate(state, x);
      expect(result.alarm).toBe("none");
      state = result.state;
    }
  });

  test("sHi accumulates when x is above target + k", () => {
    // target=100, k=2 → x > 102: each step adds (x - 100 - 2) to sHi
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 106).state; // +4
    expect(sHi(state)).toBe(4);
    state = cusumUpdate(state, 106).state; // +4 → total 8
    expect(sHi(state)).toBe(8);
  });

  test("sLo accumulates when x is below target - k", () => {
    // target=100, k=2 → x < 98: each step adds (100 - x - 2) to sLo
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 94).state; // +4
    expect(sLo(state)).toBe(4);
    state = cusumUpdate(state, 94).state; // +4 → total 8
    expect(sLo(state)).toBe(8);
  });

  test("sHi resets to zero when x falls below the drift threshold", () => {
    // Build up sHi first with repeated x=110 (+8 each)
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 110).state; // sHi=8
    state = cusumUpdate(state, 110).state; // sHi=16
    expect(sHi(state)).toBe(16);
    // Bring it below the threshold so the cumulative excess decays to zero
    state = cusumUpdate(state, 101).state; // 16 + (101-100-2) = 15
    state = cusumUpdate(state, 100).state; // 15 + (100-100-2) = 13
    state = cusumUpdate(state, 99).state; // 13 + (99-100-2) = 10
    state = cusumUpdate(state, 98).state; // 10 + (98-100-2) = max(0, 6) = 6
    state = cusumUpdate(state, 97).state; // 6 + (97-100-2) = max(0, 1) = 1
    state = cusumUpdate(state, 96).state; // 1 + (96-100-2) = max(0, -5) = 0
    expect(sHi(state)).toBe(0);
  });

  test("upward alarm fires when sHi exceeds h", () => {
    // x=106 adds +4 per step. Need cumulative +10 to exceed h=10.
    let state = cusumInit(PARAMS);
    let result = cusumUpdate(state, 106); // sHi=4, no alarm
    expect(result.alarm).toBe("none");
    expect(sHi(result.state)).toBe(4);

    result = cusumUpdate(result.state, 106); // sHi=8, no alarm
    expect(result.alarm).toBe("none");
    expect(sHi(result.state)).toBe(8);

    result = cusumUpdate(result.state, 106); // sHi=12 > h=10, upward
    expect(result.alarm).toBe("upward");
    expect(sHi(result.state)).toBe(12);
  });

  test("downward alarm fires when sLo exceeds h", () => {
    // x=94 subtracts 4 per step. Need cumulative +10 to exceed h=10.
    let state = cusumInit(PARAMS);
    let result = cusumUpdate(state, 94); // sLo=4, no alarm
    expect(result.alarm).toBe("none");

    result = cusumUpdate(result.state, 94); // sLo=8, no alarm
    expect(result.alarm).toBe("none");

    result = cusumUpdate(result.state, 94); // sLo=12 > h=10, downward
    expect(result.alarm).toBe("downward");
  });

  test("alarm is 'none' when neither sHi nor sLo exceeds h", () => {
    let state = cusumInit(PARAMS);
    // x=104 adds +2 each step → 5 steps = 10, still no alarm (not > 10)
    for (let i = 0; i < 5; i++) {
      const result = cusumUpdate(state, 104);
      expect(result.alarm).toBe("none");
      state = result.state;
    }
    expect(sHi(state)).toBe(10); // at threshold but not above
  });

  test("upward alarm fires again after accumulating above-target observations", () => {
    // After an upward alarm, keep feeding above-target values to stay above h
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 106).state; // sHi=4
    state = cusumUpdate(state, 106).state; // sHi=8
    const upResult = cusumUpdate(state, 106); // sHi=12 → upward
    expect(upResult.alarm).toBe("upward");
    state = upResult.state; // sHi=12

    // Continue feeding above-target → sHi keeps growing, alarm fires every step
    // x=106 → each step adds 4: 12→16→20
    const again = cusumUpdate(state, 106);
    expect(again.alarm).toBe("upward");
    expect(sHi(again.state)).toBe(16);
  });

  test("state.params are preserved across updates", () => {
    let state = cusumInit(PARAMS);
    for (let i = 0; i < 5; i++) {
      const result = cusumUpdate(state, 100 + (i % 2 === 0 ? 5 : -5));
      expect(result.state.params).toBe(PARAMS);
      state = result.state;
    }
  });

  test("params object is not mutated", () => {
    const params: CusumParams = { target: 100, k: 2, h: 10 };
    const initial = cusumInit(params);
    cusumUpdate(initial, 110);
    cusumUpdate(initial, 90);
    expect(params.target).toBe(100);
    expect(params.k).toBe(2);
    expect(params.h).toBe(10);
  });

});

describe("cusumReset", () => {
  test("resets sHi and sLo to zero while preserving params", () => {
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 110).state;
    state = cusumUpdate(state, 110).state;
    expect(sHi(state)).toBeGreaterThan(0);

    const reset = cusumReset(state);
    expect(reset.sHi).toBe(0);
    expect(reset.sLo).toBe(0);
    expect(reset.params).toBe(state.params);
  });

  test("reset state can be updated normally", () => {
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 110).state;
    const reset = cusumReset(state);
    const result = cusumUpdate(reset, 110);
    expect(result.alarm).toBe("none"); // fresh start, only 8 accumulated (not > 10)
    expect(sHi(result.state)).toBe(8);
  });

  test("reset does not modify the original state (immutability)", () => {
    let state = cusumInit(PARAMS);
    state = cusumUpdate(state, 110).state;
    const originalHi = sHi(state);
    cusumReset(state);
    expect(sHi(state)).toBe(originalHi); // unchanged
  });
});

describe("CusumUpdate return shape", () => {
  test("alarm is one of the three expected string literals", () => {
    let state = cusumInit(PARAMS);
    const noneResult = cusumUpdate(state, 100);
    expect(["none", "upward", "downward"]).toContain(noneResult.alarm);

    // Build to alarm
    state = noneResult.state;
    state = cusumUpdate(state, 106).state;
    state = cusumUpdate(state, 106).state;
    const alarmResult = cusumUpdate(state, 106);
    expect(alarmResult.alarm).toBe("upward");
  });

  test("state is always present in the return", () => {
    const state = cusumInit(PARAMS);
    const result = cusumUpdate(state, 50);
    expect(result.state).toBeDefined();
    expect(typeof result.state.sHi).toBe("number");
    expect(typeof result.state.sLo).toBe("number");
  });
});
