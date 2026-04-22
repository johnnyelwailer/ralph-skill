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
