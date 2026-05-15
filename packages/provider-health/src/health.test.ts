import { describe, expect, test } from "bun:test";
import {
  applyProviderFailure,
  applyProviderSuccess,
  createUnknownHealth,
  isProviderAvailable,
  type ProviderHealth,
} from "./health.ts";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

// ─── createUnknownHealth ────────────────────────────────────────────────────

describe("createUnknownHealth", () => {
  test("creates unknown status for a provider", () => {
    const h = createUnknownHealth("opencode", NOW);
    expect(h.providerId).toBe("opencode");
    expect(h.status).toBe("unknown");
    expect(h.consecutiveFailures).toBe(0);
    expect(h.lastSuccess).toBeNull();
    expect(h.lastFailure).toBeNull();
    expect(h.failureReason).toBeNull();
    expect(h.cooldownUntil).toBeNull();
    expect(h.quotaRemaining).toBeNull();
    expect(h.quotaResetsAt).toBeNull();
    expect(h.updatedAt).toBe(iso(NOW));
  });

  test("defaults to Date.now() when nowMs not provided", () => {
    const before = Date.now();
    const h = createUnknownHealth("claude");
    const after = Date.now();
    expect(Date.parse(h.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(h.updatedAt)).toBeLessThanOrEqual(after);
  });
});

// ─── applyProviderSuccess ───────────────────────────────────────────────────

describe("applyProviderSuccess", () => {
  test("resets consecutiveFailures to 0", () => {
    const prev = { ...createUnknownHealth("opencode", NOW), consecutiveFailures: 5 };
    const h = applyProviderSuccess(prev, NOW + 1_000);
    expect(h.consecutiveFailures).toBe(0);
  });

  test("sets status to healthy", () => {
    const prev = { ...createUnknownHealth("opencode", NOW), status: "cooldown" as const };
    const h = applyProviderSuccess(prev, NOW + 1_000);
    expect(h.status).toBe("healthy");
  });

  test("sets lastSuccess to now", () => {
    const prev = createUnknownHealth("opencode", NOW);
    const h = applyProviderSuccess(prev, NOW + 5_000);
    expect(h.lastSuccess).toBe(iso(NOW + 5_000));
  });

  test("clears failureReason and cooldownUntil", () => {
    const prev: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      failureReason: "rate_limit",
      cooldownUntil: iso(NOW + 60_000),
      status: "cooldown",
    };
    const h = applyProviderSuccess(prev, NOW + 1_000);
    expect(h.failureReason).toBeNull();
    expect(h.cooldownUntil).toBeNull();
  });

  test("preserves providerId", () => {
    const prev = createUnknownHealth("anthropic", NOW);
    const h = applyProviderSuccess(prev, NOW + 1_000);
    expect(h.providerId).toBe("anthropic");
  });

  test("updates updatedAt to now", () => {
    const prev = createUnknownHealth("opencode", NOW);
    const h = applyProviderSuccess(prev, NOW + 99_000);
    expect(h.updatedAt).toBe(iso(NOW + 99_000));
  });
});

// ─── applyProviderFailure ───────────────────────────────────────────────────

describe("applyProviderFailure", () => {
  const basePrev: ProviderHealth = {
    ...createUnknownHealth("opencode", NOW),
    status: "healthy",
  };

  // ── auth failures always land in "degraded" ──────────────────────────────

  test("auth failure sets status to degraded regardless of backoff", () => {
    const h = applyProviderFailure(basePrev, "auth", NOW + 1_000);
    expect(h.status).toBe("degraded");
  });

  test("auth failure does NOT set cooldownUntil", () => {
    const h = applyProviderFailure(basePrev, "auth", NOW + 1_000);
    expect(h.cooldownUntil).toBeNull();
  });

  test("auth failure increments consecutiveFailures", () => {
    const prev = { ...basePrev, consecutiveFailures: 3 };
    const h = applyProviderFailure(prev, "auth", NOW + 1_000);
    expect(h.consecutiveFailures).toBe(4);
  });

  test("auth failure sets failureReason to auth", () => {
    const h = applyProviderFailure(basePrev, "auth", NOW + 1_000);
    expect(h.failureReason).toBe("auth");
  });

  test("auth failure records quotaRemaining from options", () => {
    const h = applyProviderFailure(basePrev, "auth", NOW + 1_000, {
      quotaRemaining: 0,
      quotaResetsAtMs: NOW + 3_600_000,
    });
    expect(h.quotaRemaining).toBe(0);
    expect(h.quotaResetsAt).toBe(iso(NOW + 3_600_000));
  });

  // ── non-auth failures use backoff schedule ──────────────────────────────────

  test("first rate_limit failure (consecutive=0→1) applies zero backoff", () => {
    const h = applyProviderFailure(basePrev, "rate_limit", NOW + 1_000);
    expect(h.status).toBe("healthy"); // backoff[1]=0 → no cooldown
    expect(h.cooldownUntil).toBeNull();
    expect(h.consecutiveFailures).toBe(1);
  });

  test("second rate_limit failure (consecutive=1→2) applies 2-minute backoff", () => {
    const prev = { ...basePrev, consecutiveFailures: 1 };
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000);
    expect(h.status).toBe("cooldown");
    expect(h.cooldownUntil).toBe(iso(NOW + 1_000 + 2 * 60_000)); // backoff[2] = 2 min
  });

  test("timeout failure increments consecutiveFailures", () => {
    const prev = { ...basePrev, consecutiveFailures: 2 };
    const h = applyProviderFailure(prev, "timeout", NOW + 1_000);
    expect(h.consecutiveFailures).toBe(3);
    expect(h.failureReason).toBe("timeout");
  });

  test("unknown failure increments consecutiveFailures", () => {
    const prev = { ...basePrev, consecutiveFailures: 5 };
    const h = applyProviderFailure(prev, "unknown", NOW + 1_000);
    expect(h.consecutiveFailures).toBe(6);
    expect(h.failureReason).toBe("unknown");
  });

  // ── cooldownMultiplier ──────────────────────────────────────────────────

  test("cooldownMultiplier scales the backoff", () => {
    // prev.consecutiveFailures=1 → after increment=2 → backoff[2]=2 min → *3.0 = 6 min
    const prev = { ...basePrev, consecutiveFailures: 1 };
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000, {
      cooldownMultiplier: 3.0,
    });
    // 2 min * 3.0 = 6 min
    expect(h.cooldownUntil).toBe(iso(NOW + 1_000 + 6 * 60_000));
  });

  // ── quotaResetsAtMs vs cooldownUntil ───────────────────────────────────

  test("quotaResetsAtMs alone sets cooldownUntil (no backoff)", () => {
    const prev = { ...basePrev, consecutiveFailures: 0 };
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000, {
      quotaResetsAtMs: NOW + 5 * 60_000,
    });
    expect(h.cooldownUntil).toBe(iso(NOW + 5 * 60_000));
    expect(h.status).toBe("cooldown");
  });

  test("quotaRemaining is preserved from previous state when not overridden", () => {
    const prev: ProviderHealth = {
      ...basePrev,
      quotaRemaining: 500,
      quotaResetsAt: iso(NOW + 60_000),
    };
    const h = applyProviderFailure(prev, "timeout", NOW + 1_000);
    expect(h.quotaRemaining).toBe(500);
    expect(h.quotaResetsAt).toBe(iso(NOW + 60_000));
  });

  // ── lastFailure and updatedAt ──────────────────────────────────────────

  test("lastFailure is set to now on every failure", () => {
    const h = applyProviderFailure(basePrev, "rate_limit", NOW + 42_000);
    expect(h.lastFailure).toBe(iso(NOW + 42_000));
  });

  test("updatedAt is set to now on every failure", () => {
    const h = applyProviderFailure(basePrev, "auth", NOW + 42_000);
    expect(h.updatedAt).toBe(iso(NOW + 42_000));
  });

  // ── backoff schedule bounds ───────────────────────────────────────────────

  test("consecutiveFailures beyond backoff array length uses last entry", () => {
    // Default backoff array has 7 entries (indices 0-6).
    // Consecutive=99 → Math.min(99, 6) = 6 → backoff[6] = 60 min.
    const prev = { ...basePrev, consecutiveFailures: 99 };
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000);
    expect(h.consecutiveFailures).toBe(100);
    expect(h.cooldownUntil).toBe(iso(NOW + 1_000 + 60 * 60_000));
  });

  test("custom backoff schedule is respected", () => {
    const prev = { ...basePrev, consecutiveFailures: 0 }; // schedule[0] = 0
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000, {
      backoffMsByFailureCount: [0, 0, 30_000, 60_000],
    });
    // consecutive=1 → schedule[1] = 0 → no cooldown
    expect(h.consecutiveFailures).toBe(1);
    expect(h.cooldownUntil).toBeNull();
  });

  test("custom backoff at consecutive=2 uses schedule index 2", () => {
    const prev = { ...basePrev, consecutiveFailures: 1 }; // schedule[1] = 0
    const h = applyProviderFailure(prev, "rate_limit", NOW + 1_000, {
      backoffMsByFailureCount: [0, 0, 30_000, 60_000],
    });
    // consecutive=2 → schedule[2] = 30s
    expect(h.consecutiveFailures).toBe(2);
    expect(h.cooldownUntil).toBe(iso(NOW + 1_000 + 30_000));
  });
});

// ─── isProviderAvailable ───────────────────────────────────────────────────

describe("isProviderAvailable", () => {
  test("returns true for healthy status", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "healthy",
    };
    expect(isProviderAvailable(h, NOW + 1)).toBe(true);
  });

  test("returns true for unknown status (not yet probed)", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "unknown",
    };
    expect(isProviderAvailable(h, NOW + 1)).toBe(true);
  });

  test("returns false for degraded status", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "degraded",
    };
    expect(isProviderAvailable(h, NOW + 1)).toBe(false);
  });

  test("returns false for cooldown when current time is before cooldownUntil", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "cooldown",
      cooldownUntil: iso(NOW + 5 * 60_000),
    };
    expect(isProviderAvailable(h, NOW + 1)).toBe(false);
  });

  test("returns true for cooldown when current time has reached cooldownUntil", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "cooldown",
      cooldownUntil: iso(NOW + 5 * 60_000),
    };
    expect(isProviderAvailable(h, NOW + 5 * 60_000)).toBe(true);
  });

  test("degraded provider remains unavailable regardless of time", () => {
    const h: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "degraded",
      failureReason: "auth",
    };
    expect(isProviderAvailable(h, NOW + 999_999_999)).toBe(false);
  });

  test("healthy then degraded then healthy lifecycle", () => {
    let h = createUnknownHealth("opencode", NOW);
    h = applyProviderSuccess(h, NOW + 1_000);
    expect(isProviderAvailable(h, NOW + 1_001)).toBe(true);

    h = applyProviderFailure(h, "auth", NOW + 2_000);
    expect(h.status).toBe("degraded");
    expect(isProviderAvailable(h, NOW + 2_001)).toBe(false);

    h = applyProviderSuccess(h, NOW + 3_000);
    expect(isProviderAvailable(h, NOW + 3_001)).toBe(true);
  });

  test("available after cooldownUntil expires", () => {
    const prev: ProviderHealth = {
      ...createUnknownHealth("opencode", NOW),
      status: "cooldown",
      cooldownUntil: iso(NOW + 10_000),
    };
    expect(isProviderAvailable(prev, NOW + 9_000)).toBe(false);
    expect(isProviderAvailable(prev, NOW + 11_000)).toBe(true);
  });
});
