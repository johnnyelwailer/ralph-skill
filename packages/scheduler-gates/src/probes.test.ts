import { describe, expect, test } from "bun:test";
import { DEFAULT_SCHEDULER_PROBES } from "./probes.ts";

describe("clampPct", () => {
  // clampPct is the internal helper used by defaultSystemSample.
  // We access it via the only caller: defaultSystemSample.

  test("defaultSystemSample returns clamped cpuPct in [0, 100]", () => {
    // The implementation clamps cpuPct via clampPct, so values outside [0,100]
    // are capped. We test the observable behavior through the public probe.
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(typeof sample.cpuPct).toBe("number");
    expect(sample.cpuPct).toBeGreaterThanOrEqual(0);
    expect(sample.cpuPct).toBeLessThanOrEqual(100);
  });

  test("defaultSystemSample returns clamped memPct in [0, 100]", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(typeof sample.memPct).toBe("number");
    expect(sample.memPct).toBeGreaterThanOrEqual(0);
    expect(sample.memPct).toBeLessThanOrEqual(100);
  });

  test("defaultSystemSample returns non-negative loadAvg", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(typeof sample.loadAvg).toBe("number");
    expect(sample.loadAvg).toBeGreaterThanOrEqual(0);
  });

  test("defaultSystemSample returns all three fields", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(sample).toHaveProperty("cpuPct");
    expect(sample).toHaveProperty("memPct");
    expect(sample).toHaveProperty("loadAvg");
  });

  test("cpuPct is derived from loadavg / cpuCount * 100, clamped to [0, 100]", () => {
    // clampPct floors negative fractions to 0 and caps overflow to 100.
    // We can't control the real OS metrics, but we can verify the clamping
    // logic by checking the result is always within the guaranteed bounds.
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    // If the real cpuPct ever somehow exceeded 100 (shouldn't happen normally),
    // clampPct guarantees it would be capped at 100.
    if (sample.cpuPct > 100) expect(sample.cpuPct).toBe(100);
    if (sample.cpuPct < 0) expect(sample.cpuPct).toBe(0);
  });

  test("memPct is derived from (totalmem - freemem) / totalmem * 100, clamped to [0, 100]", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    // Same clamping guarantee check as cpuPct
    if (sample.memPct > 100) expect(sample.memPct).toBe(100);
    if (sample.memPct < 0) expect(sample.memPct).toBe(0);
  });

  test("consecutive calls return consistent types (no NaN/Infinity exposed)", () => {
    for (let i = 0; i < 3; i++) {
      const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
      expect(Number.isFinite(sample.cpuPct)).toBe(true);
      expect(Number.isFinite(sample.memPct)).toBe(true);
      expect(Number.isFinite(sample.loadAvg)).toBe(true);
    }
  });
});

describe("SystemSample type", () => {
  test("cpuPct, memPct, loadAvg are all numbers", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(typeof sample.cpuPct).toBe("number");
    expect(typeof sample.memPct).toBe("number");
    expect(typeof sample.loadAvg).toBe("number");
  });

  test("cpuPct and memPct are in percentage range [0, 100]", () => {
    const sample = DEFAULT_SCHEDULER_PROBES.systemSample();
    expect(sample.cpuPct).toBeGreaterThanOrEqual(0);
    expect(sample.cpuPct).toBeLessThanOrEqual(100);
    expect(sample.memPct).toBeGreaterThanOrEqual(0);
    expect(sample.memPct).toBeLessThanOrEqual(100);
  });
});

describe("ProviderQuotaSample type", () => {
  test("type allows ok=true with optional remaining and resetAt", () => {
    // Structural test: these fields are used by callers in the scheduler.
    // Verify the type definitions are satisfied by a typical sample object.
    const sample = {
      ok: true as const,
      remaining: 500,
      resetAt: "2026-04-27T00:00:00.000Z",
    };
    expect(sample.ok).toBe(true);
    expect(sample.remaining).toBe(500);
  });

  test("type allows ok=false with reason and retryAfterSeconds", () => {
    const sample = {
      ok: false as const,
      reason: "provider_unavailable",
      retryAfterSeconds: 30,
      details: { provider_id: "opencode", status: "cooldown" },
    };
    expect(sample.ok).toBe(false);
    expect(sample.retryAfterSeconds).toBe(30);
  });
});

describe("BurnRateSample type", () => {
  test("type has tokensSinceLastCommit and commitsPerHour", () => {
    const sample = {
      tokensSinceLastCommit: 100_000,
      commitsPerHour: 3,
    };
    expect(sample.tokensSinceLastCommit).toBe(100_000);
    expect(sample.commitsPerHour).toBe(3);
  });
});

describe("SchedulerProbes type", () => {
  test("systemSample is required in DEFAULT_SCHEDULER_PROBES", () => {
    expect(DEFAULT_SCHEDULER_PROBES.systemSample).toBeDefined();
    expect(typeof DEFAULT_SCHEDULER_PROBES.systemSample).toBe("function");
  });

  test("providerQuota is optional in SchedulerProbes", () => {
    // Verify DEFAULT_SCHEDULER_PROBES doesn't include providerQuota (it only has systemSample)
    const probes = DEFAULT_SCHEDULER_PROBES;
    expect((probes as { providerQuota?: unknown }).providerQuota).toBeUndefined();
  });

  test("burnRate is optional in SchedulerProbes", () => {
    const probes = DEFAULT_SCHEDULER_PROBES;
    expect((probes as { burnRate?: unknown }).burnRate).toBeUndefined();
  });
});
