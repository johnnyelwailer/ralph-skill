import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createProviderQuotaProbe } from "./provider-probes.ts";
import { InMemoryProviderHealthStore } from "@aloop/provider";
import { createUnknownHealth, applyProviderFailure } from "@aloop/provider-health";

describe("createProviderQuotaProbe", () => {
  let store: InMemoryProviderHealthStore;

  beforeEach(() => {
    store = new InMemoryProviderHealthStore(["prov-a", "prov-b"]);
  });

  afterEach(() => {
    // no teardown needed — InMemoryProviderHealthStore has no resources
  });

  function makeProbe() {
    return createProviderQuotaProbe(store);
  }

  // ── available path ──────────────────────────────────────────────────────────

  test("returns null when provider is healthy (unknown status counts as available)", () => {
    // prov-a starts as unknown health, which is available
    const probe = makeProbe();
    expect(probe("prov-a")).toBeNull();
  });

  test("returns null for healthy provider after success", () => {
    store.noteSuccess("prov-a");
    const probe = makeProbe();
    expect(probe("prov-a")).toBeNull();
  });

  test("returns null for unknown status provider that was never updated", () => {
    // prov-b was registered but never updated — status is unknown
    const probe = makeProbe();
    expect(probe("prov-b")).toBeNull();
  });

  test("returns null when cooldown has already expired (provider is available again)", () => {
    // Manually set a cooldown with an already-passed expiry time so the
    // provider transitions back to available.
    const pastCooldown = new Date(Date.now() - 10_000).toISOString();
    store["states"].set("prov-a", {
      providerId: "prov-a",
      status: "cooldown" as const,
      consecutiveFailures: 3,
      lastSuccess: null,
      lastFailure: new Date().toISOString(),
      failureReason: "rate_limit",
      cooldownUntil: pastCooldown,
      quotaRemaining: null,
      quotaResetsAt: null,
      updatedAt: new Date().toISOString(),
    });
    const probe = makeProbe();
    // isProviderAvailable returns true when cooldown has expired
    expect(probe("prov-a")).toBeNull();
  });

  // ── unavailable path ────────────────────────────────────────────────────────

  test("returns result with ok=false for degraded provider (auth failure)", () => {
    store.noteFailure("prov-a", "auth");
    const probe = makeProbe();
    const result = probe("prov-a");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toBe("provider_unavailable");
    expect(result!.details.provider_id).toBe("prov-a");
    expect(result!.details.status).toBe("degraded");
    expect(result!.details.failure_reason).toBe("auth");
  });

  test("returns result with ok=false for cooldown provider (rate_limit with backoff)", () => {
    // Backoff kicks in at 3+ consecutive failures for rate_limit
    store.noteFailure("prov-a", "rate_limit");
    store.noteFailure("prov-a", "rate_limit");
    store.noteFailure("prov-a", "rate_limit");
    const probe = makeProbe();
    const result = probe("prov-a");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.reason).toBe("provider_unavailable");
    expect(result!.details.status).toBe("cooldown");
    expect(result!.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("includes cooldown_until in details for cooldown providers", () => {
    // Set up cooldown with a known future expiry
    const futureCooldown = new Date(Date.now() + 120_000).toISOString();
    store["states"].set("prov-a", {
      providerId: "prov-a",
      status: "cooldown" as const,
      consecutiveFailures: 3,
      lastSuccess: null,
      lastFailure: new Date().toISOString(),
      failureReason: "rate_limit",
      cooldownUntil: futureCooldown,
      quotaRemaining: null,
      quotaResetsAt: null,
      updatedAt: new Date().toISOString(),
    });
    const probe = makeProbe();
    const result = probe("prov-a");
    expect(result!.details.cooldown_until).toBe(futureCooldown);
  });

  test("does not include cooldown_until in details for degraded providers", () => {
    // auth failure → degraded → cooldownUntil is null
    store.noteFailure("prov-a", "auth");
    const probe = makeProbe();
    const result = probe("prov-a");
    expect(result!.details).not.toHaveProperty("cooldown_until");
  });

  test("includes failure_reason in details for degraded providers", () => {
    // auth failures immediately degrade regardless of failure count
    store.noteFailure("prov-a", "auth");
    const probe = makeProbe();
    const result = probe("prov-a");
    expect(result!.details.failure_reason).toBe("auth");
  });

  test("computes retryAfterSeconds as ceiling of remaining cooldown seconds", () => {
    const futureCooldown = new Date(Date.now() + 90_000).toISOString();
    store["states"].set("prov-a", {
      providerId: "prov-a",
      status: "cooldown" as const,
      consecutiveFailures: 3,
      lastSuccess: null,
      lastFailure: new Date().toISOString(),
      failureReason: "rate_limit",
      cooldownUntil: futureCooldown,
      quotaRemaining: null,
      quotaResetsAt: null,
      updatedAt: new Date().toISOString(),
    });
    const probe = makeProbe();
    const result = probe("prov-a");
    // ~90 seconds ± 2s tolerance for test execution time
    expect(result!.retryAfterSeconds).toBeGreaterThanOrEqual(88);
    expect(result!.retryAfterSeconds).toBeLessThanOrEqual(92);
  });

  test("unknown provider id returns null (treats as available)", () => {
    const probe = makeProbe();
    // An unregistered provider id gets a default-constructed health with status=unknown
    expect(probe("unknown-id")).toBeNull();
  });
});
