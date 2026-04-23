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
      resetsAt: "2026-01-01T01:00:00.000Z",
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
});
