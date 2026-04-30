import { describe, expect, test } from "bun:test";
import {
  parseRequestedProviderChain,
  resolveProviderChain,
  type ProviderOverrides,
} from "./resolve-chain.ts";
import { type InMemoryProviderHealthStore, type ProviderHealth } from "@aloop/provider-health";

function makeHealthStore(initial: Record<string, ProviderHealth> = {}): InMemoryProviderHealthStore {
  const store: Map<string, ProviderHealth> = new Map(Object.entries(initial));
  return {
    peek(id) { return store.get(id) ?? undefined; },
    recordSuccess() {},
    recordFailure() {},
    clear() {},
  };
}

function healthy(id: string): ProviderHealth {
  return {
    providerId: id,
    status: "healthy",
    consecutiveFailures: 0,
    lastSuccess: new Date().toISOString(),
    lastFailure: null,
    failureReason: null,
    cooldownUntil: null,
    quotaRemaining: null,
    quotaResetsAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function degraded(id: string): ProviderHealth {
  return {
    providerId: id,
    status: "degraded",
    consecutiveFailures: 1,
    lastSuccess: null,
    lastFailure: new Date().toISOString(),
    failureReason: "unknown",
    cooldownUntil: null,
    quotaRemaining: null,
    quotaResetsAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function cooldown(id: string, until: string): ProviderHealth {
  return {
    providerId: id,
    status: "cooldown",
    consecutiveFailures: 1,
    lastSuccess: null,
    lastFailure: new Date().toISOString(),
    failureReason: "rate_limit",
    cooldownUntil: until,
    quotaRemaining: null,
    quotaResetsAt: null,
    updatedAt: new Date().toISOString(),
  };
}

describe("parseRequestedProviderChain", () => {
  test("undefined returns ok:true with null value", () => {
    const result = parseRequestedProviderChain(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  test("valid string array returns ok:true", () => {
    const result = parseRequestedProviderChain(["opencode", "anthropic"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(["opencode", "anthropic"]);
  });

  test("empty array returns ok:true", () => {
    const result = parseRequestedProviderChain([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  test("non-array returns ok:false", () => {
    const result = parseRequestedProviderChain("opencode");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("must be an array");
  });

  test("array with non-string entry returns ok:false", () => {
    const result = parseRequestedProviderChain(["opencode", 123 as unknown as string]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-empty strings");
  });

  test("array with empty string entry returns ok:false", () => {
    const result = parseRequestedProviderChain(["opencode", ""]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-empty strings");
  });

  test("array with whitespace-only string returns ok:false", () => {
    const result = parseRequestedProviderChain(["opencode", "   "]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-empty strings");
  });
});

describe("resolveProviderChain", () => {
  const baseRefs = ["opencode", "anthropic", "cohere"] as const;

  test("force override replaces the entire chain", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: "anthropic" };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["anthropic"]);
    expect(result.excludedOverrides).toEqual([]);
    expect(result.excludedHealth).toEqual([]);
  });

  test("force with null allow/deny includes forced provider with health filtering", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: "cohere" };
    const health = makeHealthStore({ cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["cohere"]);
  });

  test("deny list removes denied providers", () => {
    const overrides: ProviderOverrides = { allow: null, deny: ["opencode"], force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["anthropic", "cohere"]);
    expect(result.excludedOverrides).toEqual(["opencode"]);
  });

  test("allow list filters to only allowed providers", () => {
    const overrides: ProviderOverrides = { allow: ["cohere"], deny: null, force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["cohere"]);
    expect(result.excludedOverrides).toEqual(["opencode", "anthropic"]);
  });

  test("both allow and deny — deny takes priority over allow for the same provider", () => {
    // opencode is in both allow and deny; deny is checked first so opencode is excluded.
    // cohere is in allow but not in deny → passes through.
    // anthropic is in neither → excluded by allow filter.
    const overrides: ProviderOverrides = { allow: ["opencode", "cohere"], deny: ["opencode"], force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["cohere"]);
    expect(result.excludedOverrides).toEqual(["opencode", "anthropic"]);
  });

  test("degraded health providers are excluded from chain", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: degraded("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["opencode", "cohere"]);
    expect(result.excludedHealth).toEqual(["anthropic"]);
  });

  test("cooldown providers are excluded from chain", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const futureCooldown = new Date(Date.now() + 60_000).toISOString();
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: cooldown("anthropic", futureCooldown), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual(["opencode", "cohere"]);
    expect(result.excludedHealth).toEqual(["anthropic"]);
  });

  test("excludedOverrides and excludedHealth are tracked separately", () => {
    const overrides: ProviderOverrides = { allow: null, deny: ["opencode"], force: null };
    const health = makeHealthStore({ anthropic: degraded("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.excludedOverrides).toEqual(["opencode"]);
    expect(result.excludedHealth).toEqual(["anthropic"]);
    expect(result.chain).toEqual(["cohere"]);
  });

  test("empty chain when all providers filtered out", () => {
    const overrides: ProviderOverrides = { allow: null, deny: ["opencode", "anthropic", "cohere"], force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(baseRefs, overrides, health);
    expect(result.chain).toEqual([]);
    expect(result.excludedOverrides).toEqual(["opencode", "anthropic", "cohere"]);
  });

  test("unknown providers (not in health store) are treated as available", () => {
    // Unknown status (neither degraded nor cooldown) → isProviderAvailable returns true.
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const health = makeHealthStore({ opencode: healthy("opencode") }); // only opencode explicitly healthy
    const result = resolveProviderChain(baseRefs, overrides, health);
    // anthropic and cohere are unknown → treated as available
    expect(result.chain).toEqual(["opencode", "anthropic", "cohere"]);
    expect(result.excludedHealth).toEqual([]);
  });

  test("healthy provider in health store passes through", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic") });
    const result = resolveProviderChain(["opencode", "anthropic"] as readonly string[], overrides, health);
    expect(result.chain).toEqual(["opencode", "anthropic"]);
  });

  test("chain order preserved from input refs after filtering", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const health = makeHealthStore({ opencode: healthy("opencode"), anthropic: healthy("anthropic"), cohere: healthy("cohere") });
    const result = resolveProviderChain(["cohere", "opencode", "anthropic"] as readonly string[], overrides, health);
    expect(result.chain).toEqual(["cohere", "opencode", "anthropic"]);
  });

  test("degraded then healthy provider — degraded excluded from chain", () => {
    const overrides: ProviderOverrides = { allow: null, deny: null, force: null };
    const health = makeHealthStore({ opencode: degraded("opencode"), anthropic: healthy("anthropic") });
    const result = resolveProviderChain(["opencode", "anthropic"] as readonly string[], overrides, health);
    expect(result.chain).toEqual(["anthropic"]);
    expect(result.excludedHealth).toEqual(["opencode"]);
  });
});
