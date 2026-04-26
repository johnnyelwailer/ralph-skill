import { describe, expect, test } from "bun:test";
import {
  welfordInit,
  welfordUpdate,
  welfordMean,
  welfordSampleVariance,
  welfordPopulationVariance,
  welfordSampleStdDev,
  welfordMerge,
} from "./welford.ts";

describe("welfordInit", () => {
  test("returns count=0, mean=0, m2=0", () => {
    const s = welfordInit();
    expect(s.count).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.m2).toBe(0);
  });
});

describe("welfordUpdate", () => {
  test("first value: mean equals x, m2 resets to 0", () => {
    const s0 = welfordInit();
    const s1 = welfordUpdate(s0, 10);
    expect(s1.count).toBe(1);
    expect(s1.mean).toBe(10);
    expect(s1.m2).toBe(0);
  });

  test("second value updates mean correctly", () => {
    const s0 = welfordInit();
    const s1 = welfordUpdate(s0, 10);
    const s2 = welfordUpdate(s1, 14);
    expect(s2.count).toBe(2);
    // mean = 10 + (14-10)/2 = 12
    expect(s2.mean).toBe(12);
    // m2 = 0 + (14-10)*(14-12) = 4*2 = 8
    expect(s2.m2).toBe(8);
  });

  test("third value accumulates correctly", () => {
    let s = welfordInit();
    s = welfordUpdate(s, 2);
    s = welfordUpdate(s, 4);
    s = welfordUpdate(s, 6);
    expect(s.count).toBe(3);
    // Welford: mean = 2+(4-2)/2+(6-4)/3 = 4; m2 = 8
    expect(s.mean).toBeCloseTo(4, 5);
    expect(s.m2).toBeCloseTo(8, 3);
  });

  test("identical values keep m2 at 0", () => {
    let s = welfordInit();
    s = welfordUpdate(s, 5);
    s = welfordUpdate(s, 5);
    s = welfordUpdate(s, 5);
    expect(s.count).toBe(3);
    expect(s.mean).toBe(5);
    expect(s.m2).toBe(0);
  });
});

describe("welfordMean", () => {
  test("returns current mean", () => {
    let s = welfordInit();
    s = welfordUpdate(s, 10);
    s = welfordUpdate(s, 20);
    expect(welfordMean(s)).toBe(15);
  });

  test("init state returns 0", () => {
    expect(welfordMean(welfordInit())).toBe(0);
  });
});

describe("welfordSampleVariance", () => {
  test("returns 0 when count < 2", () => {
    const s0 = welfordInit();
    expect(welfordSampleVariance(s0)).toBe(0);

    const s1 = welfordUpdate(s0, 42);
    expect(welfordSampleVariance(s1)).toBe(0);
  });

  test("matches population variance formula for n=2", () => {
    let s = welfordInit();
    s = welfordUpdate(s, 2);
    s = welfordUpdate(s, 4);
    // sample_variance = m2 / (n-1) = 2 / 1 = 2
    expect(welfordSampleVariance(s)).toBe(2);
  });

  test("correct for known dataset", () => {
    // Values: 2, 4, 4, 4, 5 — n=5, mean=3.8
    // deviations: -1.8, 0.2, 0.2, 0.2, 1.2
    // squared: 3.24, 0.04, 0.04, 0.04, 1.44 → sum=4.8
    // population var = 4.8/5 = 0.96; sample var = 4.8/4 = 1.2
    let s = welfordInit();
    for (const x of [2, 4, 4, 4, 5]) s = welfordUpdate(s, x);
    expect(welfordMean(s)).toBeCloseTo(3.8, 5);
    expect(welfordPopulationVariance(s)).toBeCloseTo(0.96, 2);
    expect(welfordSampleVariance(s)).toBeCloseTo(1.2, 2);
  });
});

describe("welfordPopulationVariance", () => {
  test("returns 0 when count < 1", () => {
    expect(welfordPopulationVariance(welfordInit())).toBe(0);
  });

  test("correct for known dataset", () => {
    // Values: 2, 4, 4, 4, 5 — n=5, mean=3.8, population var=0.96
    let s = welfordInit();
    for (const x of [2, 4, 4, 4, 5]) s = welfordUpdate(s, x);
    expect(welfordPopulationVariance(s)).toBeCloseTo(0.96, 2);
  });
});

describe("welfordSampleStdDev", () => {
  test("sqrt of sample variance", () => {
    let s = welfordInit();
    s = welfordUpdate(s, 2);
    s = welfordUpdate(s, 4);
    // sampleVariance = 2, stdDev = sqrt(2)
    expect(welfordSampleStdDev(s)).toBeCloseTo(Math.sqrt(2), 5);
  });

  test("returns 0 for n < 2", () => {
    const s = welfordUpdate(welfordInit(), 42);
    expect(welfordSampleStdDev(s)).toBe(0);
  });
});

describe("welfordMerge", () => {
  test("returns b when a is empty", () => {
    const a = welfordInit();
    let b = welfordInit();
    b = welfordUpdate(b, 10);
    b = welfordUpdate(b, 20);
    const merged = welfordMerge(a, b);
    expect(merged.count).toBe(2);
    expect(merged.mean).toBe(15);
    expect(merged.m2).toBe(50);
  });

  test("returns a when b is empty", () => {
    let a = welfordInit();
    a = welfordUpdate(a, 5);
    const b = welfordInit();
    const merged = welfordMerge(a, b);
    expect(merged.count).toBe(1);
    expect(merged.mean).toBe(5);
    expect(merged.m2).toBe(0);
  });

  test("merges two non-empty batches correctly", () => {
    // Batch A: 2, 4, 4, 4, 5 — n=5, mean=3.8
    let a = welfordInit();
    for (const x of [2, 4, 4, 4, 5]) a = welfordUpdate(a, x);
    // Batch B: 0, 2, 5 — n=3, mean=7/3≈2.333
    let b = welfordInit();
    for (const x of [0, 2, 5]) b = welfordUpdate(b, x);

    const merged = welfordMerge(a, b);

    expect(merged.count).toBe(8);
    // Combined mean: (19 + 7) / 8 = 26/8 = 3.25
    expect(merged.mean).toBeCloseTo(3.25, 5);
    // Combined deviations squared sum = 21.5 → sample m2 = 21.5
    expect(merged.m2).toBeCloseTo(21.5, 1);
  });

  test("merging then updating equals incremental update", () => {
    // Start with batch A then B, compare to merge
    let a = welfordInit();
    for (const x of [2, 4, 4]) a = welfordUpdate(a, x);

    let b = welfordInit();
    for (const x of [6, 8]) b = welfordUpdate(b, x);

    const merged = welfordMerge(a, b);

    // Verify by running all values sequentially
    let seq = welfordInit();
    for (const x of [2, 4, 4, 6, 8]) seq = welfordUpdate(seq, x);

    expect(merged.count).toBe(seq.count);
    expect(merged.mean).toBeCloseTo(seq.mean, 10);
    expect(merged.m2).toBeCloseTo(seq.m2, 10);
  });

  test("empty merge empty returns empty", () => {
    const merged = welfordMerge(welfordInit(), welfordInit());
    expect(merged.count).toBe(0);
    expect(merged.mean).toBe(0);
    expect(merged.m2).toBe(0);
  });
});
