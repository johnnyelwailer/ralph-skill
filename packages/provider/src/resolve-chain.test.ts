import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore } from "./health-store.ts";
import { parseRequestedProviderChain, resolveProviderChain } from "./resolve-chain.ts";

describe("parseRequestedProviderChain", () => {
  test("accepts undefined and returns null chain", () => {
    expect(parseRequestedProviderChain(undefined)).toEqual({ ok: true, value: null });
  });

  test("rejects non-array inputs", () => {
    expect(parseRequestedProviderChain("opencode")).toEqual({
      ok: false,
      error: "provider_chain must be an array of provider refs",
    });
  });
});

describe("resolveProviderChain", () => {
  test("applies overrides and health availability", () => {
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
});
