import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore } from "@aloop/provider";
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
});
