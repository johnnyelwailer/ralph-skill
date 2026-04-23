import { describe, expect, test } from "bun:test";
import {
  applyProviderFailure,
  applyProviderSuccess,
  createUnknownHealth,
  isProviderAvailable,
} from "./health.ts";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

describe("createUnknownHealth", () => {
  test("starts in unknown status", () => {
    const state = createUnknownHealth("opencode", NOW);
    expect(state.providerId).toBe("opencode");
    expect(state.status).toBe("unknown");
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastSuccess).toBeNull();
    expect(state.failureReason).toBeNull();
    expect(state.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("applyProviderSuccess", () => {
  test("resets failure counters and cooldown state", () => {
    const prev = applyProviderFailure(
      createUnknownHealth("claude", NOW),
      "rate_limit",
      NOW + 5_000,
      {
        quotaRemaining: 0,
        quotaResetsAtMs: NOW + 60_000,
      },
    );
    const next = applyProviderSuccess(prev, NOW + 10_000);
    expect(next.status).toBe("healthy");
    expect(next.consecutiveFailures).toBe(0);
    expect(next.failureReason).toBeNull();
    expect(next.cooldownUntil).toBeNull();
  });
});

describe("applyProviderFailure", () => {
  test("auth failure transitions to degraded", () => {
    const next = applyProviderFailure(
      createUnknownHealth("claude", NOW),
      "auth",
      NOW + 1_000,
    );
    expect(next.status).toBe("degraded");
    expect(next.failureReason).toBe("auth");
    expect(next.cooldownUntil).toBeNull();
    expect(isProviderAvailable(next, NOW + 1_500)).toBe(false);
  });

  test("first transient failure is available immediately (no cooldown)", () => {
    const first = applyProviderFailure(
      createUnknownHealth("opencode", NOW),
      "timeout",
      NOW + 1_000,
    );
    expect(first.status).toBe("healthy");
    expect(isProviderAvailable(first, NOW + 2_000)).toBe(true);
  });

  test("second transient failure enters cooldown via backoff", () => {
    const first = applyProviderFailure(
      createUnknownHealth("opencode", NOW),
      "timeout",
      NOW + 1_000,
    );
    const second = applyProviderFailure(first, "timeout", NOW + 2_000);
    expect(second.status).toBe("cooldown");
    expect(second.cooldownUntil).not.toBeNull();
    expect(isProviderAvailable(second, NOW + 60_000)).toBe(false);
    expect(isProviderAvailable(second, NOW + 3 * 60_000)).toBe(true);
  });

  test("quota reset extends cooldown beyond backoff", () => {
    const first = applyProviderFailure(
      createUnknownHealth("gemini", NOW),
      "rate_limit",
      NOW + 1_000,
    );
    const second = applyProviderFailure(first, "rate_limit", NOW + 2_000, {
      quotaResetsAtMs: NOW + 10 * 60_000,
    });
    expect(second.status).toBe("cooldown");
    expect(second.cooldownUntil).toBe(new Date(NOW + 10 * 60_000).toISOString());
    expect(isProviderAvailable(second, NOW + 9 * 60_000)).toBe(false);
    expect(isProviderAvailable(second, NOW + 11 * 60_000)).toBe(true);
  });
});

describe("applyProviderFailure backoff progression", () => {
  const NOW = Date.parse("2026-01-01T00:00:00.000Z");

  test("consecutive failures beyond backoff array length use the last backoff entry", () => {
    // DEFAULT_BACKOFF_MS_BY_FAILURE_COUNT has 7 entries [0, 0, 2m, 5m, 15m, 30m, 60m]
    // Index 6 = 60 minutes is the last entry
    const state = createUnknownHealth("opencode", NOW);
    // Accumulate 10 consecutive failures — index 10 > last index 6
    let s = state;
    for (let i = 0; i < 10; i++) {
      s = applyProviderFailure(s, "timeout", NOW + i * 60_000);
    }
    // Should still have cooldownUntil set (last backoff is 60 minutes)
    expect(s.status).toBe("cooldown");
    expect(s.consecutiveFailures).toBe(10);
    expect(s.cooldownUntil).not.toBeNull();
    // 10th failure at NOW+9min, backoff 60min from that = cooldownUntil far in future
    const cooldownMs = Date.parse(s.cooldownUntil!);
    expect(cooldownMs).toBeGreaterThan(NOW + 9 * 60_000);
  });

  test("quotaRemaining: null option is preserved (not treated as undefined)", () => {
    // When quotaRemaining is explicitly null (not undefined), it should null out quotaRemaining
    const state = createUnknownHealth("opencode", NOW);
    const result = applyProviderFailure(state, "rate_limit", NOW + 1_000, {
      quotaRemaining: null,
      backoffMsByFailureCount: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(result.quotaRemaining).toBeNull();
  });

  test("quotaResetsAtMs: null triggers no-quota-reset cooldown path", () => {
    // When quotaResetsAtMs is null, cooldownUntil is derived from backoff only.
    // consecutiveFailures=1 → backoff[1]=0 (first transient gets no cooldown).
    // consecutiveFailures=2 → backoff[2]=5min (second transient gets 5min).
    const state = createUnknownHealth("opencode", NOW);
    const first = applyProviderFailure(state, "rate_limit", NOW + 1_000, {
      quotaResetsAtMs: null,
      backoffMsByFailureCount: [0, 0, 5 * 60_000],
    });
    expect(first.status).toBe("healthy"); // backoff[1]=0 → no cooldown
    const second = applyProviderFailure(first, "rate_limit", NOW + 2_000, {
      quotaResetsAtMs: null,
      backoffMsByFailureCount: [0, 0, 5 * 60_000],
    });
    expect(second.status).toBe("cooldown"); // backoff[2]=5min
    expect(second.cooldownUntil).not.toBeNull();
    expect(second.quotaResetsAt).toBeNull();
    const cooldownMs = Date.parse(second.cooldownUntil!);
    expect(cooldownMs).toBe(NOW + 2_000 + 5 * 60_000);
  });

  test("quotaResetsAtMs and backoff are both null: cooldownUntil is null", () => {
    const state = createUnknownHealth("opencode", NOW);
    const result = applyProviderFailure(state, "timeout", NOW + 1_000, {
      backoffMsByFailureCount: [0, 0, 0, 0, 0, 0, 0], // 2nd failure = 0ms backoff
    });
    expect(result.status).toBe("healthy"); // no cooldown when backoff is 0
    expect(result.cooldownUntil).toBeNull();
  });

  test("cooldownUntil reflects whichever is later: backoff or quota reset", () => {
    const state = createUnknownHealth("opencode", NOW);
    // 1st failure: backoff[1]=0, quota resets in 1min → cooldownUntil = quota reset (later)
    const first = applyProviderFailure(state, "rate_limit", NOW + 1_000, {
      quotaResetsAtMs: NOW + 60_000, // quota resets in 1 minute
      backoffMsByFailureCount: [0, 0, 5 * 60_000],
    });
    expect(first.status).toBe("cooldown");
    const firstCooldownMs = Date.parse(first.cooldownUntil!);
    // quotaResetsAtMs is the max since backoffUntilMs is null (backoff[1]=0)
    expect(firstCooldownMs).toBe(NOW + 60_000);

    // 2nd failure: backoff[2]=5min, quota resets in 1min → max = 5min backoff
    const second = applyProviderFailure(first, "rate_limit", NOW + 2_000, {
      quotaResetsAtMs: NOW + 60_000,
      backoffMsByFailureCount: [0, 0, 5 * 60_000],
    });
    expect(second.status).toBe("cooldown");
    const cooldownMs = Date.parse(second.cooldownUntil!);
    // Backoff: NOW+2s + 5min = NOW + 302000ms (later than quota reset at NOW+60s)
    expect(cooldownMs).toBe(NOW + 2_000 + 5 * 60_000);
  });
});
