import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore } from "./health-store.ts";

const NOW = Date.parse("2026-01-01T00:00:00.000Z");

describe("InMemoryProviderHealthStore", () => {
  test("initializes unknown state for known providers", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    expect(store.get("opencode").status).toBe("unknown");
    expect(store.list()).toHaveLength(1);
  });

  test("noteSuccess and noteFailure update state", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.noteFailure("opencode", "timeout", NOW + 1_000);
    expect(store.get("opencode").consecutiveFailures).toBe(1);
    store.noteSuccess("opencode", NOW + 2_000);
    expect(store.get("opencode").status).toBe("healthy");
    expect(store.get("opencode").consecutiveFailures).toBe(0);
  });

  test("setQuota updates quota fields", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    store.setQuota(
      "opencode",
      {
        remaining: 42,
        total: 100,
        resetsAt: new Date(NOW + 60_000).toISOString(),
        probedAt: new Date(NOW).toISOString(),
      },
      NOW + 1_000,
    );
    const state = store.get("opencode");
    expect(state.quotaRemaining).toBe(42);
    expect(state.quotaResetsAt).toBe(new Date(NOW + 60_000).toISOString());
  });

  test("peek reads existing state without creating unknown providers", () => {
    const store = new InMemoryProviderHealthStore(["opencode"], NOW);
    expect(store.peek("opencode")?.providerId).toBe("opencode");
    expect(store.peek("missing")).toBeUndefined();
    expect(store.list().map((state) => state.providerId)).toEqual(["opencode"]);
  });
});
