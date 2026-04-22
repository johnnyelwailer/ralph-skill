import { beforeEach, describe, expect, test } from "bun:test";
import * as probes from "./probes.ts";

describe("DEFAULT_SCHEDULER_PROBES", () => {
  let sample: probes.SystemSample;

  beforeEach(() => {
    sample = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
  });

  test("systemSample is a function", () => {
    expect(typeof probes.DEFAULT_SCHEDULER_PROBES.systemSample).toBe("function");
  });

  test("returns a SystemSample with cpuPct in [0, 100]", () => {
    expect(sample.cpuPct).toBeGreaterThanOrEqual(0);
    expect(sample.cpuPct).toBeLessThanOrEqual(100);
  });

  test("returns a SystemSample with memPct in [0, 100]", () => {
    expect(sample.memPct).toBeGreaterThanOrEqual(0);
    expect(sample.memPct).toBeLessThanOrEqual(100);
  });

  test("returns a SystemSample with loadAvg >= 0", () => {
    expect(sample.loadAvg).toBeGreaterThanOrEqual(0);
  });

  test("cpuPct, memPct, and loadAvg are numbers", () => {
    expect(typeof sample.cpuPct).toBe("number");
    expect(typeof sample.memPct).toBe("number");
    expect(typeof sample.loadAvg).toBe("number");
  });
});

describe("SystemSample type shape", () => {
  test("sample has all required readonly fields", () => {
    const sample = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(sample.cpuPct).toBeDefined();
    expect(sample.memPct).toBeDefined();
    expect(sample.loadAvg).toBeDefined();
  });

  test("cpuPct is clamped to [0, 100] even under extreme loadavg values", () => {
    for (let i = 0; i < 10; i++) {
      const s = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
      expect(s.cpuPct).toBeGreaterThanOrEqual(0);
      expect(s.cpuPct).toBeLessThanOrEqual(100);
    }
  });

  test("memPct is clamped to [0, 100]", () => {
    for (let i = 0; i < 10; i++) {
      const s = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
      expect(s.memPct).toBeGreaterThanOrEqual(0);
      expect(s.memPct).toBeLessThanOrEqual(100);
    }
  });
});
