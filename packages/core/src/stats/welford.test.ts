import { describe, expect, test } from "bun:test";
import {
  welfordInit,
  welfordMean,
  welfordMerge,
  welfordPopulationVariance,
  welfordSampleStdDev,
  welfordSampleVariance,
  welfordUpdate,
} from "./welford.ts";

function fold(xs: readonly number[]) {
  let s = welfordInit();
  for (const x of xs) s = welfordUpdate(s, x);
  return s;
}

function naiveMean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function naiveSampleVariance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = naiveMean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

describe("welford", () => {
  test("init state is zeros", () => {
    const s = welfordInit();
    expect(s.count).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.m2).toBe(0);
    expect(welfordSampleVariance(s)).toBe(0);
    expect(welfordPopulationVariance(s)).toBe(0);
    expect(welfordSampleStdDev(s)).toBe(0);
  });

  test("single value", () => {
    const s = welfordUpdate(welfordInit(), 42);
    expect(s.count).toBe(1);
    expect(welfordMean(s)).toBe(42);
    expect(welfordSampleVariance(s)).toBe(0); // undefined in theory, returns 0 by convention
    expect(welfordPopulationVariance(s)).toBe(0);
  });

  test("matches naive computation on small sample", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s = fold(xs);
    expect(welfordMean(s)).toBeCloseTo(naiveMean(xs), 12);
    expect(welfordSampleVariance(s)).toBeCloseTo(naiveSampleVariance(xs), 12);
  });

  test("numerically stable for values with large offset (classic Welford advantage)", () => {
    // The naive sum-of-squares formula loses precision when values share a
    // huge constant offset. Welford handles it.
    const offset = 1e9;
    const xs = [offset + 4, offset + 7, offset + 13, offset + 16];
    const s = fold(xs);
    // Expected variance of [4, 7, 13, 16] (offset is irrelevant): naive mean = 10.
    // deviations: -6, -3, 3, 6; squares: 36, 9, 9, 36 = 90; sample var = 90/3 = 30.
    expect(welfordSampleVariance(s)).toBeCloseTo(30, 6);
    expect(welfordMean(s)).toBeCloseTo(offset + 10, 6);
  });

  test("merge is equivalent to concatenation", () => {
    const left = [1, 2, 3, 4, 5];
    const right = [6, 7, 8, 9, 10, 11, 12];
    const a = fold(left);
    const b = fold(right);
    const merged = welfordMerge(a, b);
    const whole = fold([...left, ...right]);
    expect(merged.count).toBe(whole.count);
    expect(merged.mean).toBeCloseTo(whole.mean, 12);
    expect(merged.m2).toBeCloseTo(whole.m2, 10);
  });

  test("merge with empty state is identity", () => {
    const s = fold([1, 2, 3]);
    expect(welfordMerge(welfordInit(), s)).toEqual(s);
    expect(welfordMerge(s, welfordInit())).toEqual(s);
  });

  test("handles negative values and zero crossings", () => {
    const xs = [-10, -5, 0, 5, 10];
    const s = fold(xs);
    expect(welfordMean(s)).toBeCloseTo(0, 12);
    expect(welfordSampleVariance(s)).toBeCloseTo(naiveSampleVariance(xs), 12);
  });

  test("std dev is sqrt of sample variance", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    const s = fold(xs);
    expect(welfordSampleStdDev(s)).toBeCloseTo(Math.sqrt(welfordSampleVariance(s)), 12);
  });
});
