/**
 * Tests for checkProjectGate — project-scoped concurrency and daily-cost gates.
 */
import { describe, expect, test } from "bun:test";
import { checkProjectGate } from "./gates.ts";
import type { SchedulerProbes } from "./probes.ts";

const makeProbes = (overrides: Partial<SchedulerProbes> = {}): SchedulerProbes => ({
  systemSample: () => ({ cpuPct: 10, memPct: 20, loadAvg: 0.5 }),
  ...overrides,
});

describe("checkProjectGate — concurrency cap", () => {
  const probes = makeProbes();

  test("passes when concurrencyCap is not configured", async () => {
    const result = await checkProjectGate("proj_1", 99, {}, probes);
    expect(result).toEqual({ ok: true });
  });

  test("passes when concurrencyCap is 0 (disabled)", async () => {
    const result = await checkProjectGate("proj_1", 99, { concurrencyCap: 0 }, probes);
    expect(result).toEqual({ ok: true });
  });

  test("passes when active permits are exactly at the concurrency cap", async () => {
    const result = await checkProjectGate("proj_1", 5, { concurrencyCap: 5 }, probes);
    expect(result).toEqual({ ok: true });
  });

  test("denies when active permits exceed the concurrency cap", async () => {
    const result = await checkProjectGate("proj_1", 6, { concurrencyCap: 5 }, probes);
    expect(result).toEqual({
      ok: false,
      reason: "project_concurrency_cap_exceeded",
      details: {
        project_id: "proj_1",
        active_permits: 6,
        concurrency_cap: 5,
      },
    });
  });

  test("denies with correct details when multiple permits over cap", async () => {
    const result = await checkProjectGate("proj_x", 100, { concurrencyCap: 10 }, probes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.project_id).toBe("proj_x");
      expect(result.details.active_permits).toBe(100);
      expect(result.details.concurrency_cap).toBe(10);
    }
  });

  test("concurrency check uses the projectId in denial details", async () => {
    const result = await checkProjectGate("my-project", 50, { concurrencyCap: 10 }, probes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.project_id).toBe("my-project");
    }
  });
});

describe("checkProjectGate — daily cost cap", () => {
  const probes = makeProbes();

  test("passes when dailyCostCapCents is not configured", async () => {
    const result = await checkProjectGate("proj_1", 0, {}, probes);
    expect(result).toEqual({ ok: true });
  });

  test("passes when dailyCostCapCents is 0 (disabled)", async () => {
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 0 }, probes);
    expect(result).toEqual({ ok: true });
  });

  test("passes when daily cost is exactly at the cap", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 500, tokens: 1_000_000 }),
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 500 }, probesWithCost);
    expect(result).toEqual({ ok: true });
  });

  test("denies when daily cost exceeds the cap", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 501, tokens: 1_000_000 }),
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 500 }, probesWithCost);
    expect(result).toEqual({
      ok: false,
      reason: "project_daily_cost_cap_exceeded",
      details: {
        project_id: "proj_1",
        cost_usd_cents: 501,
        daily_cost_cap_cents: 500,
      },
    });
  });

  test("passes when projectDailyCost probe returns null", async () => {
    const probesWithNull = makeProbes({
      projectDailyCost: () => null,
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 100 }, probesWithNull);
    expect(result).toEqual({ ok: true });
  });

  test("passes when projectDailyCost probe returns undefined", async () => {
    const probesWithUndefined = makeProbes({
      projectDailyCost: undefined,
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 100 }, probesWithUndefined);
    expect(result).toEqual({ ok: true });
  });

  test("denies with correct projectId in details when cost exceeded", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 9999, tokens: 20_000_000 }),
    });
    const result = await checkProjectGate("expensive-project", 0, { dailyCostCapCents: 100 }, probesWithCost);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.project_id).toBe("expensive-project");
    }
  });
});

describe("checkProjectGate — combined limits", () => {
  const probes = makeProbes();

  test("passes when both concurrency and cost are within limits", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 50, tokens: 100_000 }),
    });
    const result = await checkProjectGate(
      "proj_1",
      2,
      { concurrencyCap: 5, dailyCostCapCents: 100 },
      probesWithCost,
    );
    expect(result).toEqual({ ok: true });
  });

  test("denies on concurrency even when cost is within limits", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 1, tokens: 1_000 }),
    });
    const result = await checkProjectGate(
      "proj_1",
      10,
      { concurrencyCap: 5, dailyCostCapCents: 100 },
      probesWithCost,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("project_concurrency_cap_exceeded");
    }
  });

  test("denies on cost even when concurrency is within limits", async () => {
    const probesWithCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 200, tokens: 5_000_000 }),
    });
    const result = await checkProjectGate(
      "proj_1",
      1,
      { concurrencyCap: 5, dailyCostCapCents: 100 },
      probesWithCost,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("project_daily_cost_cap_exceeded");
    }
  });

  test("concurrency check is evaluated before cost check", async () => {
    // If concurrency is over limit, cost should not be checked at all.
    // We verify this by passing a probe that would deny cost, but the
    // concurrency denial should be returned (not cost denial).
    const costProbeThatWouldDeny = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 9999, tokens: 99_999 }),
    });
    const result = await checkProjectGate(
      "proj_1",
      99, // over concurrency cap of 5
      { concurrencyCap: 5, dailyCostCapCents: 1 },
      costProbeThatWouldDeny,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should be concurrency denial, not cost denial (order of checks)
      expect(result.reason).toBe("project_concurrency_cap_exceeded");
    }
  });
});

describe("checkProjectGate — edge cases", () => {
  test("concurrencyCap undefined with activePermits=0 passes", async () => {
    const result = await checkProjectGate("proj_1", 0, {}, makeProbes());
    expect(result).toEqual({ ok: true });
  });

  test("active permits at 0 with cap of 1 passes", async () => {
    const result = await checkProjectGate("proj_1", 0, { concurrencyCap: 1 }, makeProbes());
    expect(result).toEqual({ ok: true });
  });

  test("projectDailyCost returning a Promise resolves correctly", async () => {
    const probesWithAsyncCost = makeProbes({
      projectDailyCost: async () => ({ costUsdCents: 50, tokens: 100_000 }),
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 100 }, probesWithAsyncCost);
    expect(result).toEqual({ ok: true });
  });

  test("projectDailyCost returning a Promise that exceeds cap denies", async () => {
    const probesWithAsyncCost = makeProbes({
      projectDailyCost: async () => ({ costUsdCents: 501, tokens: 10_000_000 }),
    });
    const result = await checkProjectGate("proj_1", 0, { dailyCostCapCents: 500 }, probesWithAsyncCost);
    expect(result).toEqual({
      ok: false,
      reason: "project_daily_cost_cap_exceeded",
      details: {
        project_id: "proj_1",
        cost_usd_cents: 501,
        daily_cost_cap_cents: 500,
      },
    });
  });

  test("zero dailyCostCapCents allows any cost through (disabled)", async () => {
    const probesWithHighCost = makeProbes({
      projectDailyCost: () => ({ costUsdCents: 999_999_999, tokens: 999_999_999 }),
    });
    const result = await checkProjectGate(
      "proj_1",
      0,
      { concurrencyCap: 0, dailyCostCapCents: 0 },
      probesWithHighCost,
    );
    expect(result).toEqual({ ok: true });
  });
});
