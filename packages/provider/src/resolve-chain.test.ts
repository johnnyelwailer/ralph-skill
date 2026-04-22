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
