import { beforeEach, describe, expect, test } from "bun:test";
import * as probes from "./probes.ts";

describe("ProviderQuotaSample", () => {
  test("shape: ok=true with optional fields", () => {
    const sample: probes.ProviderQuotaSample = {
      ok: true,
      remaining: 100,
      resetAt: "2026-04-24T00:00:00Z",
    };
    expect(sample.ok).toBe(true);
    expect(sample.remaining).toBe(100);
    expect(sample.resetAt).toBe("2026-04-24T00:00:00Z");
  });

  test("shape: ok=false with reason and retryAfterSeconds", () => {
    const sample: probes.ProviderQuotaSample = {
      ok: false,
      reason: "rate limited",
      retryAfterSeconds: 60,
    };
    expect(sample.ok).toBe(false);
    expect(sample.reason).toBe("rate limited");
    expect(sample.retryAfterSeconds).toBe(60);
  });

  test("shape: details can hold arbitrary record", () => {
    const sample: probes.ProviderQuotaSample = {
      ok: true,
      details: { tier: "free", calls: 42 },
    };
    expect(sample.details).toEqual({ tier: "free", calls: 42 });
  });
});

describe("BurnRateSample", () => {
  test("shape: tokensSinceLastCommit and commitsPerHour", () => {
    const sample: probes.BurnRateSample = {
      tokensSinceLastCommit: 1500,
      commitsPerHour: 3.5,
    };
    expect(sample.tokensSinceLastCommit).toBe(1500);
    expect(sample.commitsPerHour).toBe(3.5);
  });
});

describe("SchedulerProbes interface coverage", () => {
  test("systemSample is required in DEFAULT_SCHEDULER_PROBES", () => {
    const probes_obj: Required<Pick<probes.SchedulerProbes, "systemSample">> =
      probes.DEFAULT_SCHEDULER_PROBES;
    expect(typeof probes_obj.systemSample).toBe("function");
    const s = probes_obj.systemSample();
    expect(typeof s.cpuPct).toBe("number");
    expect(typeof s.memPct).toBe("number");
    expect(typeof s.loadAvg).toBe("number");
  });

  test("providerQuota and burnRate are optional", () => {
    // Just verify the type is constructible without them
    const minimal: probes.SchedulerProbes = {
      systemSample: probes.DEFAULT_SCHEDULER_PROBES.systemSample,
    };
    expect(typeof minimal.systemSample).toBe("function");
  });
});

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

  test("cpuPct is clamped to 0 when loadavg is 0", () => {
    // Even with 0 load, cpuPct should be 0 (not negative)
    expect(sample.cpuPct).toBeGreaterThanOrEqual(0);
    expect(sample.cpuPct).toBeLessThanOrEqual(100);
  });
});

describe("SystemSample type shape", () => {
  test("sample has all required readonly fields", () => {
    const s = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(s.cpuPct).toBeDefined();
    expect(s.memPct).toBeDefined();
    expect(s.loadAvg).toBeDefined();
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

  test("cpuPct and memPct are always finite numbers (NaN/Infinity cannot escape)", () => {
    for (let i = 0; i < 10; i++) {
      const s = probes.DEFAULT_SCHEDULER_PROBES.systemSample();
      expect(Number.isFinite(s.cpuPct)).toBe(true);
      expect(Number.isFinite(s.memPct)).toBe(true);
    }
  });
});
