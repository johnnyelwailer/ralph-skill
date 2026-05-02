import { describe, expect, test } from "bun:test";
import {
  applyProviderFailure,
  applyProviderSuccess,
  createUnknownHealth,
  isProviderAvailable,
  type ProviderFailureClass,
} from "./health.ts";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

function unknown(providerId = "test"): ReturnType<typeof createUnknownHealth> {
  return createUnknownHealth(providerId, NOW);
}

describe("applyProviderFailure", () => {
  test("increments consecutiveFailures", () => {
    const prev = { ...unknown(), consecutiveFailures: 0 };
    const next = applyProviderFailure(prev, "timeout", NOW);
    expect(next.consecutiveFailures).toBe(1);
  });

  test("sets lastFailure and failureReason", () => {
    const prev = unknown();
    const next = applyProviderFailure(prev, "rate_limit", NOW);
    expect(next.lastFailure).toBe(new Date(NOW).toISOString());
    expect(next.failureReason).toBe("rate_limit");
  });

  test("auth failure sets status to degraded and cooldownUntil to null", () => {
    const prev = unknown();
    const next = applyProviderFailure(prev, "auth", NOW);
    expect(next.status).toBe("degraded");
    expect(next.cooldownUntil).toBeNull();
  });

  test("non-auth failure with no backoff and no quota-reset sets status to healthy", () => {
    // consecutiveFailures=0 → backoff=0 → no cooldown
    const prev = { ...unknown(), consecutiveFailures: 0 };
    const next = applyProviderFailure(prev, "timeout", NOW);
    expect(next.status).toBe("healthy");
    expect(next.cooldownUntil).toBeNull();
  });

  test("non-auth failure with backoff sets status to cooldown", () => {
    // consecutiveFailures=2 → backoff=2min
    const prev = { ...unknown(), consecutiveFailures: 1 };
    const next = applyProviderFailure(prev, "timeout", NOW);
    expect(next.status).toBe("cooldown");
    expect(next.cooldownUntil).not.toBeNull();
  });

  test("cooldownUntil reflects backoff duration", () => {
    const prev = { ...unknown(), consecutiveFailures: 1 };
    const next = applyProviderFailure(prev, "timeout", NOW);
    // backoff[2] = 2 minutes = 120000ms
    const expectedCooldown = new Date(NOW + 120_000).toISOString();
    expect(next.cooldownUntil).toBe(expectedCooldown);
  });

  test("backoff table caps at last entry for high failure counts", () => {
    // consecutiveFailures=99 → backoff[min(100, 6)] = backoff[6] = 60 min
    const prev = { ...unknown(), consecutiveFailures: 99 };
    const next = applyProviderFailure(prev, "timeout", NOW);
    expect(next.status).toBe("cooldown");
    const expected = new Date(NOW + 60 * 60_000).toISOString();
    expect(next.cooldownUntil).toBe(expected);
  });

  test("quotaRemaining is preserved when not provided in options", () => {
    const prev = { ...unknown(), quotaRemaining: 500 };
    const next = applyProviderFailure(prev, "timeout", NOW, {});
    expect(next.quotaRemaining).toBe(500);
  });

  test("quotaRemaining is updated when provided in options", () => {
    const prev = { ...unknown(), quotaRemaining: 500 };
    const next = applyProviderFailure(prev, "timeout", NOW, { quotaRemaining: 42 });
    expect(next.quotaRemaining).toBe(42);
  });

  // quotaRemaining: explicit null-to-null not supported by current options merge;
  // options.quotaRemaining = null is treated as "not provided" → prev value kept

  test("quotaResetsAt is set when quotaResetsAtMs is provided", () => {
    const prev = unknown();
    const next = applyProviderFailure(prev, "timeout", NOW, { quotaResetsAtMs: NOW + 3_600_000 });
    expect(next.quotaResetsAt).toBe(new Date(NOW + 3_600_000).toISOString());
  });

  test("quotaResetsAt is preserved when quotaResetsAtMs is not provided", () => {
    const prev = { ...unknown(), quotaResetsAt: "2026-01-01T02:00:00.000Z" };
    const next = applyProviderFailure(prev, "timeout", NOW, {});
    expect(next.quotaResetsAt).toBe("2026-01-01T02:00:00.000Z");
  });

  test("quotaResetsAt is preserved when quotaResetsAtMs is null", () => {
    const prev = { ...unknown(), quotaResetsAt: "2026-01-01T02:00:00.000Z" };
    const next = applyProviderFailure(prev, "timeout", NOW, { quotaResetsAtMs: null });
    expect(next.quotaResetsAt).toBe("2026-01-01T02:00:00.000Z");
  });

  test("cooldownUntil uses max of backoff and quotaResetsAtMs when both are set", () => {
    // quotaResetsAtMs = NOW + 5 min = 300_000ms
    // backoff[2] = 2 min = 120_000ms
    // max = 300_000ms
    const prev = { ...unknown(), consecutiveFailures: 1 };
    const next = applyProviderFailure(prev, "timeout", NOW, {
      quotaResetsAtMs: NOW + 300_000,
    });
    expect(next.status).toBe("cooldown");
    expect(next.cooldownUntil).toBe(new Date(NOW + 300_000).toISOString());
  });

  test("auth failure does not set cooldownUntil even when quotaResetsAtMs is set", () => {
    const prev = unknown();
    const next = applyProviderFailure(prev, "auth", NOW, {
      quotaResetsAtMs: NOW + 300_000,
    });
    expect(next.status).toBe("degraded");
    expect(next.cooldownUntil).toBeNull();
  });

  test("updatedAt reflects nowMs", () => {
    const prev = unknown();
    const next = applyProviderFailure(prev, "timeout", NOW + 5_000);
    expect(next.updatedAt).toBe(new Date(NOW + 5_000).toISOString());
  });

  test("custom backoffMsByFailureCount overrides default", () => {
    const prev = { ...unknown(), consecutiveFailures: 0 };
    // Index 1 with 3-entry table = backoff of 10_000ms
    const next = applyProviderFailure(prev, "timeout", NOW, {
      backoffMsByFailureCount: [0, 10_000, 20_000],
    });
    expect(next.status).toBe("cooldown");
    expect(next.cooldownUntil).toBe(new Date(NOW + 10_000).toISOString());
  });

  test("cooldownMultiplier of 2.0 doubles the backoff duration", () => {
    const prev = { ...unknown(), consecutiveFailures: 1 }; // backoff[2] = 2 min = 120_000ms
    const next = applyProviderFailure(prev, "timeout", NOW, {
      cooldownMultiplier: 2.0,
    });
    expect(next.status).toBe("cooldown");
    // 120_000ms * 2.0 = 240_000ms
    expect(next.cooldownUntil).toBe(new Date(NOW + 240_000).toISOString());
  });

  test("cooldownMultiplier of 0.5 halves the backoff duration", () => {
    const prev = { ...unknown(), consecutiveFailures: 2 }; // backoff[3] = 5 min = 300_000ms
    const next = applyProviderFailure(prev, "timeout", NOW, {
      cooldownMultiplier: 0.5,
    });
    expect(next.status).toBe("cooldown");
    // 300_000ms * 0.5 = 150_000ms
    expect(next.cooldownUntil).toBe(new Date(NOW + 150_000).toISOString());
  });

  test("cooldownMultiplier defaults to 1.0 when not provided", () => {
    const prev = { ...unknown(), consecutiveFailures: 1 }; // backoff[2] = 2 min
    const next = applyProviderFailure(prev, "timeout", NOW, {});
    expect(next.status).toBe("cooldown");
    expect(next.cooldownUntil).toBe(new Date(NOW + 120_000).toISOString());
  });

  test("cooldownMultiplier of 4.0 (max) quadruples the backoff", () => {
    const prev = { ...unknown(), consecutiveFailures: 1 }; // backoff[2] = 2 min = 120_000ms
    const next = applyProviderFailure(prev, "timeout", NOW, {
      cooldownMultiplier: 4.0,
    });
    expect(next.status).toBe("cooldown");
    // 120_000ms * 4.0 = 480_000ms = 8 min
    expect(next.cooldownUntil).toBe(new Date(NOW + 480_000).toISOString());
  });

  test("cooldownMultiplier works with custom backoff schedule", () => {
    const prev = { ...unknown(), consecutiveFailures: 0 };
    const next = applyProviderFailure(prev, "timeout", NOW, {
      backoffMsByFailureCount: [0, 10_000, 20_000],
      cooldownMultiplier: 3.0,
    });
    expect(next.status).toBe("cooldown");
    // backoff[1] = 10_000ms * 3.0 = 30_000ms
    expect(next.cooldownUntil).toBe(new Date(NOW + 30_000).toISOString());
  });
});

describe("isProviderAvailable", () => {
  test("healthy provider is available", () => {
    const state = { ...unknown(), status: "healthy" as const };
    expect(isProviderAvailable(state)).toBe(true);
  });

  test("unknown provider is available", () => {
    const state = { ...unknown(), status: "unknown" as const };
    expect(isProviderAvailable(state)).toBe(true);
  });

  test("degraded provider is not available", () => {
    const state = { ...unknown(), status: "degraded" as const };
    expect(isProviderAvailable(state)).toBe(false);
  });

  test("cooldown provider with expired cooldown is available", () => {
    // cooldownUntil = NOW - 1ms (already expired)
    const state = {
      ...unknown(),
      status: "cooldown" as const,
      cooldownUntil: new Date(NOW - 1).toISOString(),
    };
    expect(isProviderAvailable(state, NOW)).toBe(true);
  });

  test("cooldown provider with future cooldown is not available", () => {
    const state = {
      ...unknown(),
      status: "cooldown" as const,
      cooldownUntil: new Date(NOW + 1_000_000).toISOString(),
    };
    expect(isProviderAvailable(state, NOW)).toBe(false);
  });

  test("cooldown provider with null cooldownUntil is available", () => {
    const state = { ...unknown(), status: "cooldown" as const, cooldownUntil: null };
    expect(isProviderAvailable(state, NOW)).toBe(true);
  });
});

describe("applyProviderSuccess", () => {
  test("sets status to healthy", () => {
    const prev = { ...unknown(), status: "cooldown" as const };
    const next = applyProviderSuccess(prev, NOW);
    expect(next.status).toBe("healthy");
  });

  test("resets consecutiveFailures to 0", () => {
    const prev = { ...unknown(), consecutiveFailures: 5 };
    const next = applyProviderSuccess(prev, NOW);
    expect(next.consecutiveFailures).toBe(0);
  });

  test("clears failureReason and cooldownUntil", () => {
    const prev = {
      ...unknown(),
      consecutiveFailures: 3,
      failureReason: "timeout" as ProviderFailureClass,
      cooldownUntil: new Date(NOW + 60_000).toISOString(),
    };
    const next = applyProviderSuccess(prev, NOW);
    expect(next.failureReason).toBeNull();
    expect(next.cooldownUntil).toBeNull();
  });

  test("preserves quotaRemaining and quotaResetsAt", () => {
    const prev = {
      ...unknown(),
      quotaRemaining: 999,
      quotaResetsAt: "2026-01-01T03:00:00.000Z",
    };
    const next = applyProviderSuccess(prev, NOW);
    expect(next.quotaRemaining).toBe(999);
    expect(next.quotaResetsAt).toBe("2026-01-01T03:00:00.000Z");
  });

  test("lastSuccess reflects nowMs", () => {
    const prev = unknown();
    const next = applyProviderSuccess(prev, NOW + 500);
    expect(next.lastSuccess).toBe(new Date(NOW + 500).toISOString());
  });

  test("updatedAt reflects nowMs", () => {
    const prev = unknown();
    const next = applyProviderSuccess(prev, NOW + 500);
    expect(next.updatedAt).toBe(new Date(NOW + 500).toISOString());
  });

  test("preserves lastFailure (does not clear it on success)", () => {
    const prev = { ...unknown(), lastFailure: "2026-01-01T00:30:00.000Z" };
    const next = applyProviderSuccess(prev, NOW);
    expect(next.lastFailure).toBe("2026-01-01T00:30:00.000Z");
  });
});
