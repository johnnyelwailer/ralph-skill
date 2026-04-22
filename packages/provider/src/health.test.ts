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
    expect(state.status).toBe("unknown");
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastSuccess).toBeNull();
    expect(state.lastFailure).toBeNull();
  });
});

describe("applyProviderSuccess", () => {
  test("resets failure counters and cooldown state", () => {
    const degraded = applyProviderFailure(
      createUnknownHealth("claude", NOW),
      "auth",
      NOW + 1_000,
    );
    const success = applyProviderSuccess(degraded, NOW + 2_000);
    expect(success.status).toBe("healthy");
    expect(success.consecutiveFailures).toBe(0);
    expect(success.failureReason).toBeNull();
    expect(success.cooldownUntil).toBeNull();
  });
});

describe("applyProviderFailure", () => {
  test("auth failure transitions to degraded", () => {
    const state = applyProviderFailure(
      createUnknownHealth("claude", NOW),
      "auth",
      NOW + 1_000,
    );
    expect(state.status).toBe("degraded");
    expect(state.consecutiveFailures).toBe(1);
    expect(state.failureReason).toBe("auth");
  });

  test("first transient failure is available immediately (no cooldown)", () => {
    const state = applyProviderFailure(
      createUnknownHealth("opencode", NOW),
      "timeout",
      NOW + 1_000,
    );
    expect(state.status).toBe("healthy");
    expect(isProviderAvailable(state, NOW + 1_500)).toBe(true);
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
    expect(isProviderAvailable(second, NOW + 9 * 60_000)).toBe(false);
    expect(isProviderAvailable(second, NOW + 11 * 60_000)).toBe(true);
  });
});
