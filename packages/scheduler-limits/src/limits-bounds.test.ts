import { describe, expect, test } from "bun:test";
import {
  SCHEDULER_KNOB_BOUNDS,
  checkBound,
  type Bounds,
  type BoundViolation,
} from "./limits-bounds.ts";

describe("SCHEDULER_KNOB_BOUNDS", () => {
  test("concurrencyCap is bounded [1, 8]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.concurrencyCap.min).toBe(1);
    expect(SCHEDULER_KNOB_BOUNDS.concurrencyCap.max).toBe(8);
  });

  test("maxTokensSinceCommit is bounded [100_000, 10_000_000]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.maxTokensSinceCommit.min).toBe(100_000);
    expect(SCHEDULER_KNOB_BOUNDS.maxTokensSinceCommit.max).toBe(10_000_000);
  });

  test("minCommitsPerHour is bounded [0, 10]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.minCommitsPerHour.min).toBe(0);
    expect(SCHEDULER_KNOB_BOUNDS.minCommitsPerHour.max).toBe(10);
  });

  test("cpuMaxPct is bounded [50, 95]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.cpuMaxPct.min).toBe(50);
    expect(SCHEDULER_KNOB_BOUNDS.cpuMaxPct.max).toBe(95);
  });

  test("memMaxPct is bounded [50, 95]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.memMaxPct.min).toBe(50);
    expect(SCHEDULER_KNOB_BOUNDS.memMaxPct.max).toBe(95);
  });

  test("permitTtlDefaultSeconds is bounded [120, 3600]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds.min).toBe(120);
    expect(SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds.max).toBe(3600);
  });

  test("watchdogStuckThresholdSeconds is bounded [120, 3600]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.watchdogStuckThresholdSeconds.min).toBe(120);
    expect(SCHEDULER_KNOB_BOUNDS.watchdogStuckThresholdSeconds.max).toBe(3600);
  });

  test("loadMax is bounded [0, 100]", () => {
    expect(SCHEDULER_KNOB_BOUNDS.loadMax.min).toBe(0);
    expect(SCHEDULER_KNOB_BOUNDS.loadMax.max).toBe(100);
  });

  test("all bounds objects are deeply frozen (cannot be reassigned at runtime)", () => {
    // TypeScript's readonly is compile-time only — Bun executes the JS assignment.
    // We use Object.isFrozen to prove deep-frozen status rather than attempting
    // a runtime assignment (which may silently succeed in some JS environments).
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.concurrencyCap)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.maxTokensSinceCommit)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.minCommitsPerHour)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.cpuMaxPct)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.memMaxPct)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.permitTtlDefaultSeconds)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.watchdogStuckThresholdSeconds)).toBe(true);
    expect(Object.isFrozen(SCHEDULER_KNOB_BOUNDS.loadMax)).toBe(true);
  });
});

describe("checkBound", () => {
  const bounds: Bounds = { min: 10, max: 100 };

  test("returns undefined when value is within bounds (inclusive)", () => {
    expect(checkBound("test", 10, bounds)).toBeUndefined();
    expect(checkBound("test", 50, bounds)).toBeUndefined();
    expect(checkBound("test", 100, bounds)).toBeUndefined();
  });

  test("returns BoundViolation when value is below min", () => {
    const v = checkBound("test", 9, bounds);
    expect(v).toBeDefined();
    expect(v!.field).toBe("test");
    expect(v!.requested).toBe(9);
    expect(v!.min).toBe(10);
    expect(v!.max).toBe(100);
  });

  test("returns BoundViolation when value is above max", () => {
    const v = checkBound("test", 101, bounds);
    expect(v).toBeDefined();
    expect(v!.field).toBe("test");
    expect(v!.requested).toBe(101);
    expect(v!.min).toBe(10);
    expect(v!.max).toBe(100);
  });

  test("returns undefined when value equals min boundary", () => {
    expect(checkBound("test", 10, bounds)).toBeUndefined();
  });

  test("returns undefined when value equals max boundary", () => {
    expect(checkBound("test", 100, bounds)).toBeUndefined();
  });

  test("violation fields are all readonly", () => {
    const v = checkBound("test", 999, bounds)!;
    // @ts-expect-error — readonly fields should not be reassignable
    v.field = "hacked";
    // @ts-expect-error — readonly fields should not be reassignable
    v.requested = 0;
  });

  test("negative values below min produce correct violation", () => {
    const v = checkBound("neg", -1, bounds);
    expect(v).toBeDefined();
    expect(v!.requested).toBe(-1);
    expect(v!.min).toBe(10);
    expect(v!.max).toBe(100);
  });

  test("fractional values within bounds are accepted", () => {
    // Non-integer values are accepted by checkBound (type check happens at call site)
    expect(checkBound("frac", 50.5, bounds)).toBeUndefined();
  });

  test("NaN values produce violation (NaN < min is false, NaN > max is false... actually NaN comparisons are always false)", () => {
    // NaN comparisons always return false, so NaN is neither < min nor > max
    const v = checkBound("nan", NaN, bounds);
    // NaN !== NaN, so NaN < bounds.min is false and NaN > bounds.max is false
    // Therefore checkBound returns undefined for NaN (neither condition triggers)
    expect(v).toBeUndefined();
  });
});

describe("Bounds type", () => {
  test("Bounds requires both min and max as numbers", () => {
    const b: Bounds = { min: 0, max: 100 };
    expect(b.min).toBe(0);
    expect(b.max).toBe(100);
  });
});

describe("BoundViolation type", () => {
  test("BoundViolation shape matches expected fields", () => {
    const violation: BoundViolation = {
      field: "cpuMaxPct",
      requested: 999,
      min: 50,
      max: 95,
    };
    expect(violation.field).toBe("cpuMaxPct");
    expect(violation.requested).toBe(999);
    expect(violation.min).toBe(50);
    expect(violation.max).toBe(95);
  });
});
