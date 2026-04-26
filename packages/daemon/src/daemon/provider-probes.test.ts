import { describe, expect, test } from "bun:test";
import { createProviderQuotaProbe } from "./provider-probes.ts";
import {
  InMemoryProviderHealthStore,
  type ProviderHealth,
} from "@aloop/provider";
import { createUnknownHealth } from "@aloop/provider-health";

describe("createProviderQuotaProbe", () => {
  test("available (healthy) provider returns null probe result", () => {
    const store = new InMemoryProviderHealthStore();
    store.noteSuccess("myprovider");
    const probe = createProviderQuotaProbe(store);
    expect(probe("myprovider")).toBeNull();
  });

  test("available (unknown) provider returns null probe result", () => {
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    const probe = createProviderQuotaProbe(store);
    // unknown providers are treated as available
    expect(probe("myprovider")).toBeNull();
  });

  test("unavailable (cooldown) returns ok:false with cooldown status", () => {
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    // Default backoff table: [0, 0, 2min, ...]
    // Failure 1 → consecutiveFailures=1 → backoff[1]=0 → healthy
    // Failure 2 → consecutiveFailures=2 → backoff[2]=2min → cooldown
    store.noteFailure("myprovider", "timeout", Date.now());
    store.noteFailure("myprovider", "timeout", Date.now());
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toBe("provider_unavailable");
    expect(result!.details.provider_id).toBe("myprovider");
    expect(result!.details.status).toBe("cooldown");
  });

  test("unavailable (cooldown) returns retryAfterSeconds when cooldownUntil is set", () => {
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    store.noteFailure("myprovider", "timeout", Date.now(), {
      backoffMsByFailureCount: [0, 30_000],
    });
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.retryAfterSeconds).toBeGreaterThan(0);
    expect(result!.retryAfterSeconds).toBeLessThanOrEqual(31);
    expect(result!.details.cooldown_until).toBeDefined();
  });

  test("unavailable (degraded) returns ok:false with degraded status and failureReason", () => {
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    // auth failure sets status to degraded (no cooldown)
    store.noteFailure("myprovider", "auth", Date.now());
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toBe("provider_unavailable");
    expect(result!.details.provider_id).toBe("myprovider");
    expect(result!.details.status).toBe("degraded");
    expect(result!.details.failure_reason).toBe("auth");
    expect(result!.retryAfterSeconds).toBeUndefined();
  });

  test("unknown provider ID returns null (treats as available)", () => {
    const store = new InMemoryProviderHealthStore();
    const probe = createProviderQuotaProbe(store);
    // get() on unknown provider creates unknown health (available)
    expect(probe("nonexistent")).toBeNull();
  });

  test("cooldown with zero backoff (index 0) has no retryAfterSeconds", () => {
    // When all backoff entries are 0, cooldownUntil remains null
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    store.noteFailure("myprovider", "timeout", Date.now(), {
      backoffMsByFailureCount: [0],
    });
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    // With 0 backoff, status is "healthy" not "cooldown" — probe returns null
    expect(probe("myprovider")).toBeNull();
  });

  test("degraded provider has no retryAfterSeconds", () => {
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    store.noteFailure("myprovider", "auth", Date.now());
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    expect(result!.details.status).toBe("degraded");
    expect(result!.retryAfterSeconds).toBeUndefined();
  });

  test("cooldown retryAfterSeconds reflects remaining time until expiry", () => {
    // Use a large enough backoff that we're guaranteed a future cooldownUntil
    const store = new InMemoryProviderHealthStore(["myprovider"]);
    store.noteFailure("myprovider", "timeout", Date.now(), {
      backoffMsByFailureCount: [0, 60_000],
    });
    const probe = createProviderQuotaProbe(store);
    const result = probe("myprovider");
    // 60s backoff minus some wall clock elapsed → somewhere between 58-60s
    expect(result!.retryAfterSeconds).toBeGreaterThanOrEqual(58);
    expect(result!.retryAfterSeconds).toBeLessThanOrEqual(61);
  });
});
