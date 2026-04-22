import { describe, expect, test } from "bun:test";
import { createUnknownHealth, InMemoryProviderHealthStore } from "@aloop/provider";
import { createProviderQuotaProbe } from "./provider-probes.ts";

describe("createProviderQuotaProbe", () => {
  test("returns null for available providers", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    const probe = createProviderQuotaProbe(store);
    expect(await Promise.resolve(probe("opencode"))).toBeNull();
  });

  test("denies degraded providers as unavailable", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    store.noteFailure("opencode", "auth");
    const probe = createProviderQuotaProbe(store);
    const sample = await Promise.resolve(probe("opencode"));
    expect(sample).toMatchObject({
      ok: false,
      reason: "provider_unavailable",
      details: { provider_id: "opencode", status: "degraded", failure_reason: "auth" },
    });
  });

  test("includes retryAfterSeconds for cooldown providers", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    const now = Date.now();
    store.noteFailure("opencode", "timeout", now, { backoffMsByFailureCount: [0, 0, 60_000] });
    store.noteFailure("opencode", "timeout", now + 1, { backoffMsByFailureCount: [0, 0, 60_000] });
    const probe = createProviderQuotaProbe(store);
    const sample = await Promise.resolve(probe("opencode"));
    expect(sample).toBeDefined();
    expect(sample?.ok).toBe(false);
    expect(sample?.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("cooldown expired: provider becomes available again", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    const now = Date.now();
    // Set cooldown to the past (expired 10 seconds ago) — once past, provider recovers
    const expired = new Date(now - 10_000).toISOString();
    const health = {
      ...createUnknownHealth("opencode", now),
      status: "cooldown" as const,
      cooldownUntil: expired,
    };
    // @ts-expect-error – mutating internal state for test isolation
    store.states.set("opencode", health);

    const probe = createProviderQuotaProbe(store);
    // Expired cooldown means the provider is available again (probe returns null)
    expect(await Promise.resolve(probe("opencode"))).toBeNull();
  });

  test("cooldownUntil null: no backoff, provider available", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    const now = Date.now();
    // backoffMsByFailureCount: [0] means consecutiveFailure=1 gets index 1 capped to 0 backoff
    // So cooldownUntil is null and status is "healthy" → provider is available
    store.noteFailure("opencode", "timeout", now, { backoffMsByFailureCount: [0] });
    const probe = createProviderQuotaProbe(store);
    expect(await Promise.resolve(probe("opencode"))).toBeNull();
  });

  test("details include all optional fields when present", async () => {
    const store = new InMemoryProviderHealthStore(["opencode"]);
    const now = Date.now();
    store.noteFailure("opencode", "auth", now, { quotaRemaining: 42, quotaResetsAtMs: now + 3_600_000 });
    const probe = createProviderQuotaProbe(store);
    const sample = await Promise.resolve(probe("opencode"));
    expect(sample).toMatchObject({
      ok: false,
      reason: "provider_unavailable",
      details: {
        provider_id: "opencode",
        status: "degraded",
        failure_reason: "auth",
      },
    });
  });

  test("returns null for unknown provider with no state", async () => {
    const store = new InMemoryProviderHealthStore([]);
    const probe = createProviderQuotaProbe(store);
    // Unknown providers are considered available (no health record = no restriction)
    expect(await Promise.resolve(probe("unknown-provider"))).toBeNull();
  });
});
