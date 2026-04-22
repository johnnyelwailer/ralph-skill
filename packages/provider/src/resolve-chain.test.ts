import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore } from "@aloop/provider-health";
import { parseRequestedProviderChain, resolveProviderChain } from "./resolve-chain.ts";

describe("parseRequestedProviderChain", () => {
  test("accepts undefined and returns null chain", () => {
    expect(parseRequestedProviderChain(undefined)).toEqual({ ok: true, value: null });
  });

  test("accepts a valid string array", () => {
    expect(parseRequestedProviderChain(["opencode", "claude/opus"])).toEqual({
      ok: true,
      value: ["opencode", "claude/opus"],
    });
  });

  test("rejects non-array inputs", () => {
    expect(parseRequestedProviderChain("opencode")).toEqual({
      ok: false,
      error: "provider_chain must be an array of provider refs",
    });
    expect(parseRequestedProviderChain(null)).toEqual({
      ok: false,
      error: "provider_chain must be an array of provider refs",
    });
    expect(parseRequestedProviderChain({})).toEqual({
      ok: false,
      error: "provider_chain must be an array of provider refs",
    });
  });

  test("rejects array containing non-string elements", () => {
    expect(parseRequestedProviderChain(["opencode", 123 as unknown as string])).toEqual({
      ok: false,
      error: "provider_chain must only contain non-empty strings",
    });
  });

  test("rejects array containing empty strings", () => {
    expect(parseRequestedProviderChain(["opencode", ""])).toEqual({
      ok: false,
      error: "provider_chain must only contain non-empty strings",
    });
  });

  test("rejects array containing whitespace-only strings", () => {
    expect(parseRequestedProviderChain(["opencode", "   "])).toEqual({
      ok: false,
      error: "provider_chain must only contain non-empty strings",
    });
  });
});

describe("resolveProviderChain", () => {
  test("empty refs returns empty chain", () => {
    const health = new InMemoryProviderHealthStore();
    const resolved = resolveProviderChain([], { allow: null, deny: null, force: null }, health);
    expect(resolved.chain).toEqual([]);
    expect(resolved.excludedOverrides).toEqual([]);
    expect(resolved.excludedHealth).toEqual([]);
  });

  test("force override replaces chain with single provider", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude"]);
    const resolved = resolveProviderChain(
      ["opencode", "claude"],
      { allow: null, deny: null, force: "gemini" },
      health,
    );
    // force=gemini replaces the chain entirely; only gemini is in the resolved chain.
    // opencode/claude are NOT in excludedOverrides because force short-circuits
    // the override filter — the original refs are not evaluated against allow/deny.
    expect(resolved.chain).toEqual(["gemini"]);
    expect(resolved.excludedOverrides).toEqual([]);
  });

  test("allow list filters out non-allowed providers", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude", "gemini"]);
    const resolved = resolveProviderChain(
      ["opencode", "claude", "gemini"],
      { allow: ["opencode"], deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode"]);
    expect(resolved.excludedOverrides).toEqual(["claude", "gemini"]);
  });

  test("deny list filters out denied providers", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude", "gemini"]);
    const resolved = resolveProviderChain(
      ["opencode", "claude", "gemini"],
      { allow: null, deny: ["claude"], force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode", "gemini"]);
    expect(resolved.excludedOverrides).toEqual(["claude"]);
  });

  test("allow and deny together: allow is checked first, then deny", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude", "gemini"]);
    // allow=["opencode","claude"], deny=["claude"] → only opencode survives overrides
    const resolved = resolveProviderChain(
      ["opencode", "claude", "gemini"],
      { allow: ["opencode", "claude"], deny: ["claude"], force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode"]);
    expect(resolved.excludedOverrides).toEqual(["claude", "gemini"]);
  });

  test("degraded status makes provider unavailable", () => {
    // Auth failures transition to "degraded" immediately and isProviderAvailable=false
    const health = new InMemoryProviderHealthStore(["opencode", "claude"]);
    health.noteFailure("claude", "auth");
    const resolved = resolveProviderChain(
      ["opencode", "claude"],
      { allow: null, deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode"]);
    expect(resolved.excludedHealth).toEqual(["claude"]);
  });

  // Note: cooldown timing requires real elapsed time — testing via resolveProviderChain
  // alone is fragile. The auth/degraded path is the primary health exclusion mechanism
  // and is tested above. Deeper cooldown timing tests belong in health.test.ts.

  test("unknown provider defaults to available (not excluded)", () => {
    // Provider not in initial list — peek returns undefined → createUnknownHealth → available
    const health = new InMemoryProviderHealthStore(["opencode"]);
    const resolved = resolveProviderChain(
      ["opencode", "unknown"],
      { allow: null, deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode", "unknown"]);
    expect(resolved.excludedHealth).toEqual([]);
  });

  test("all providers excluded by overrides yields empty chain", () => {
    const health = new InMemoryProviderHealthStore(["opencode"]);
    const resolved = resolveProviderChain(
      ["opencode"],
      { allow: null, deny: ["opencode"], force: null },
      health,
    );
    expect(resolved.chain).toEqual([]);
    expect(resolved.excludedOverrides).toEqual(["opencode"]);
  });

  test("health exclusion removes degraded providers from chain", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude", "gemini"]);
    health.noteFailure("claude", "auth");
    health.noteFailure("gemini", "auth");
    const resolved = resolveProviderChain(
      ["opencode", "claude", "gemini"],
      { allow: null, deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode"]);
    expect(resolved.excludedHealth).toEqual(["claude", "gemini"]);
  });

  test("combined overrides and health filtering", () => {
    const health = new InMemoryProviderHealthStore(["opencode", "claude", "gemini"]);
    health.noteFailure("claude", "auth");
    const resolved = resolveProviderChain(
      ["opencode", "claude", "gemini"],
      { allow: null, deny: ["gemini"], force: null },
      health,
    );
    // gemini denied by override, claude degraded by health
    expect(resolved.chain).toEqual(["opencode"]);
    expect(resolved.excludedOverrides).toEqual(["gemini"]);
    expect(resolved.excludedHealth).toEqual(["claude"]);
  });

  test("preserve input order — only available providers remain in position order", () => {
    const health = new InMemoryProviderHealthStore(["a", "b", "c"]);
    health.noteFailure("b", "auth");
    const resolved = resolveProviderChain(
      ["a", "b", "c"],
      { allow: null, deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["a", "c"]);
    expect(resolved.excludedHealth).toEqual(["b"]);
  });

  test("unknown health status is available", () => {
    // Default-constructed (no failures) provider has "unknown" status which is available
    const health = new InMemoryProviderHealthStore(["opencode"], Date.now());
    // No failures recorded — status is "unknown" → available
    const state = health.peek("opencode")!;
    expect(state.status).toBe("unknown");
    const resolved = resolveProviderChain(
      ["opencode"],
      { allow: null, deny: null, force: null },
      health,
    );
    expect(resolved.chain).toEqual(["opencode"]);
  });
});

describe("safeProviderId fallback in resolveProviderChain", () => {
  // safeProviderId silently falls back to the raw ref string when parseProviderRef throws.
  // This means malformed refs (that would throw from parseProviderRef) are used as-is as provider IDs.
  // This is intentional backward-compatibility behavior.

  test("malformed ref causing providerIdFromRef to throw is used as raw provider ID", () => {
    const health = new InMemoryProviderHealthStore(["not-a-valid-ref"]);
    // "not-a-valid-ref@" has an empty version (split gives ["not-a-valid-ref", ""])
    // which triggers "version cannot be empty" from parseProviderRef
    const resolved = resolveProviderChain(
      ["not-a-valid-ref@"],
      { allow: null, deny: null, force: null },
      health,
    );
    // The raw string was used as the provider ID since it couldn't be parsed
    expect(resolved.chain).toEqual(["not-a-valid-ref@"]);
  });

  test("double @ sign causes parseProviderRef to throw, raw ref used as provider ID", () => {
    const health = new InMemoryProviderHealthStore(["claude@4@7"]);
    const resolved = resolveProviderChain(
      ["claude@4@7"],
      { allow: null, deny: null, force: null },
      health,
    );
    // parseProviderRef throws "too many @ separators" — safeProviderId catches and returns raw ref
    expect(resolved.chain).toEqual(["claude@4@7"]);
  });

  test("empty string ref causes parseProviderRef to throw, raw ref used as provider ID", () => {
    const health = new InMemoryProviderHealthStore([""]);
    // parseProviderRef throws "provider ref cannot be empty" for empty string
    const resolved = resolveProviderChain(
      [""],
      { allow: null, deny: null, force: null },
      health,
    );
    // safeProviderId catches the throw and returns "", which is then filtered by trim().length === 0 check
    // Actually empty string is filtered out... let me check the actual behavior
    // Looking at safeProviderId: it returns ref (empty string) when parseProviderRef throws
    // Then in resolveProviderChain: overridden = force ? [force] : [...refs]
    // But empty string is filtered by the override filter: if (overrides.allow && !overrides.allow.includes(providerId))
    // For empty string providerId "", when allow is null, this passes through
    // But then healthStore.peek("") - unknown provider defaults to available
    // So the empty string actually ends up in the chain.
    expect(resolved.chain).toEqual([""]);
  });

  test("whitespace-only ref causes parseProviderRef throw, used as raw provider ID", () => {
    const health = new InMemoryProviderHealthStore(["   "]);
    const resolved = resolveProviderChain(
      ["   "],
      { allow: null, deny: null, force: null },
      health,
    );
    // parseProviderRef trims to "" which fails "provider ref cannot be empty"
    // safeProviderId returns "   " as-is
    // healthStore.peek("   ") → unknown → available
    expect(resolved.chain).toEqual(["   "]);
  });
});
