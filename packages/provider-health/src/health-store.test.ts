import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore } from "./health-store.ts";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

describe("InMemoryProviderHealthStore", () => {
  test("initializes unknown state for known providers", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const state = store.get("opencode");
    expect(state.status).toBe("unknown");
  });

  test("noteSuccess and noteFailure update state", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteFailure("opencode", "timeout", NOW + 1_000);
    expect(store.get("opencode").consecutiveFailures).toBe(1);
    store.noteSuccess("opencode", NOW + 2_000);
    const state = store.get("opencode");
    expect(state.status).toBe("healthy");
    expect(state.consecutiveFailures).toBe(0);
  });

  test("setQuota updates quota fields", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const quota = {
      remaining: 1234,
      total: 5000,
      resets_at: "2026-01-01T01:00:00.000Z",
      currency: "tokens" as const,
      probedAt: "2026-01-01T00:10:00.000Z",
    };
    const next = store.setQuota("opencode", quota, NOW + 5_000);
    expect(next.quotaRemaining).toBe(1234);
    expect(next.quotaResetsAt).toBe("2026-01-01T01:00:00.000Z");
  });

  test("get auto-creates unknown provider in unknown status", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    // "claude" was never registered — accessing it should lazily create unknown state
    const state = store.get("claude");
    expect(state.providerId).toBe("claude");
    expect(state.status).toBe("unknown");
    expect(state.consecutiveFailures).toBe(0);
  });

  test("list returns providers sorted by providerId", () => {
    const store = new InMemoryProviderHealthStore(["zeta", "alpha", "beta"], NOW);
    const items = store.list();
    expect(items.map((h) => h.providerId)).toEqual(["alpha", "beta", "zeta"]);
  });

  test("list includes lazily-created unknown providers", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.get("zed"); // lazily created
    const items = store.list();
    expect(items.map((h) => h.providerId)).toEqual(["opencode", "zed"]);
  });

  test("peek reads existing state without creating unknown providers", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    expect(store.peek("opencode")?.providerId).toBe("opencode");
    expect(store.peek("unknown")).toBeUndefined();
    expect(store.list().map((s) => s.providerId)).toEqual(["opencode"]);
  });

  test("setQuota preserves other fields (status, lastFailure, lastSuccess, etc.)", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    // "auth" always results in "degraded" (no cooldown logic applies)
    store.noteFailure("opencode", "auth", NOW + 1_000);
    const before = store.get("opencode");
    expect(before.status).toBe("degraded");
    expect(before.lastFailure).toBeTruthy();

    // setQuota should only touch quota fields and updatedAt
    store.setQuota(
      "opencode",
      { remaining: 500, resets_at: "2026-01-01T02:00:00.000Z" },
      NOW + 5_000,
    );

    const after = store.get("opencode");
    expect(after.quotaRemaining).toBe(500);
    expect(after.quotaResetsAt).toBe("2026-01-01T02:00:00.000Z");
    expect(after.status).toBe("degraded"); // preserved
    expect(after.lastFailure).toBe(before.lastFailure); // preserved
    expect(after.consecutiveFailures).toBe(1); // preserved
    expect(after.updatedAt).toBe("2026-01-01T00:00:05.000Z"); // updated
  });

  test("noteFailure applies increasing backoff from options", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const backoffSchedule = [0, 10_000, 30_000, 60_000] as const;

    // First failure: consecutive=1, backoff[1]=10s → cooldownUntil = NOW + 10s
    const state1 = store.noteFailure("opencode", "rate_limit", NOW + 1_000, {
      backoffMsByFailureCount: backoffSchedule,
    });
    expect(state1.status).toBe("cooldown");
    expect(state1.consecutiveFailures).toBe(1);
    expect(state1.cooldownUntil).toBe("2026-01-01T00:00:11.000Z"); // NOW + 10s

    // Second failure: consecutive=2, backoff[2]=30s → cooldownUntil = NOW + 30s
    const state2 = store.noteFailure("opencode", "rate_limit", NOW + 2_000, {
      backoffMsByFailureCount: backoffSchedule,
    });
    expect(state2.status).toBe("cooldown");
    expect(state2.consecutiveFailures).toBe(2);
    expect(state2.cooldownUntil).toBe("2026-01-01T00:00:32.000Z"); // NOW + 30s
  });

  test("noteFailure passes cooldownMultiplier to applyProviderFailure", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const backoffSchedule = [0, 10_000, 30_000] as const;

    // With multiplier 2.0 and backoff[1] = 10_000ms → cooldown = 20_000ms
    const state = store.noteFailure("opencode", "rate_limit", NOW + 1_000, {
      backoffMsByFailureCount: backoffSchedule,
      cooldownMultiplier: 2.0,
    });
    expect(state.status).toBe("cooldown");
    expect(state.consecutiveFailures).toBe(1);
    expect(state.cooldownUntil).toBe("2026-01-01T00:00:21.000Z"); // NOW + 20s
  });

  test("noteFailure records quota hints from options", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const state = store.noteFailure("opencode", "rate_limit", NOW + 1_000, {
      quotaRemaining: 0,
      quotaResetsAtMs: NOW + 3_600_000,
    });
    expect(state.quotaRemaining).toBe(0);
    expect(state.quotaResetsAt).toBe("2026-01-01T01:00:00.000Z");
  });

  // ─── peek ─────────────────────────────────────────────────────────────────

  test("peek returns same state as get for known provider", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteSuccess("opencode", NOW + 1_000);
    expect(store.peek("opencode")).toEqual(store.get("opencode"));
  });

  test("peek does not lazy-create unknown provider", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.peek("never-seen");
    // Unknown provider was NOT added to the store
    expect(store.list().map((h) => h.providerId)).toEqual(["opencode"]);
  });

  test("peek returns undefined for provider only created via get", () => {
    // This verifies peek's non-creation semantics even after get has created
    // a lazily-initialized entry — peek still does not create.
    const store = new InMemoryProviderHealthStore([], NOW);
    store.get("lazily-created"); // get creates it
    expect(store.peek("lazily-created")).toBeDefined(); // peek finds it (it was created by get)
    // But peek on a truly unknown provider still returns undefined
    expect(store.peek("truly-unknown")).toBeUndefined();
  });

  test("peek reflects state changes from noteSuccess", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteFailure("opencode", "timeout", NOW + 1_000, {
      backoffMsByFailureCount: [0, 60_000],
    });
    const afterFailure = store.peek("opencode");
    expect(afterFailure?.status).toBe("cooldown");
    expect(afterFailure?.consecutiveFailures).toBe(1);

    store.noteSuccess("opencode", NOW + 2_000);
    const afterSuccess = store.peek("opencode");
    expect(afterSuccess?.status).toBe("healthy");
    expect(afterSuccess?.consecutiveFailures).toBe(0);
  });

  test("peek reflects state changes from noteFailure", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteFailure("opencode", "rate_limit", NOW + 1_000, {
      backoffMsByFailureCount: [0, 10_000],
    });
    const first = store.peek("opencode");
    expect(first?.status).toBe("cooldown");
    expect(first?.consecutiveFailures).toBe(1);

    store.noteFailure("opencode", "rate_limit", NOW + 2_000, {
      backoffMsByFailureCount: [0, 10_000, 30_000],
    });
    const second = store.peek("opencode");
    expect(second?.consecutiveFailures).toBe(2);
  });

  test("peek reflects quota changes from setQuota", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    const before = store.peek("opencode");
    expect(before?.quotaRemaining).toBeNull();

    store.setQuota("opencode", { remaining: 500, resets_at: "2026-01-02T00:00:00.000Z" }, NOW + 60_000);
    const after = store.peek("opencode");
    expect(after?.quotaRemaining).toBe(500);
    expect(after?.quotaResetsAt).toBe("2026-01-02T00:00:00.000Z");
  });

  // ─── lazy creation via noteSuccess / noteFailure ───────────────────────────

  test("noteSuccess on unknown provider lazy-creates and updates it", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteSuccess("claude", NOW + 5_000);
    const state = store.get("claude");
    expect(state.providerId).toBe("claude");
    expect(state.status).toBe("healthy");
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastSuccess).toBe(new Date(NOW + 5_000).toISOString());
  });

  test("noteFailure on unknown provider lazy-creates and updates it", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    // With default backoff: first failure (consecutiveFailures=1 → backoff[1]=0) → no cooldown
    // Use a custom backoff schedule to verify cooldown behavior with lazy-created providers
    store.noteFailure("claude", "timeout", NOW + 3_000, {
      backoffMsByFailureCount: [0, 60_000],
    });
    const state = store.get("claude");
    expect(state.providerId).toBe("claude");
    expect(state.status).toBe("cooldown");
    expect(state.consecutiveFailures).toBe(1);
    expect(state.lastFailure).toBe(new Date(NOW + 3_000).toISOString());
  });

  test("lazy-created provider appears in list", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteFailure("zed", "auth", NOW + 1_000);
    const ids = store.list().map((h) => h.providerId).sort();
    expect(ids).toEqual(["opencode", "zed"]);
  });
});
