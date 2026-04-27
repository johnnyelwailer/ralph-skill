import { describe, expect, test } from "bun:test";
import { ProviderRegistry } from "./registry";

describe("ProviderRegistry", () => {
  test("require throws for unregistered provider id", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.require("nope")).toThrow(
      "provider adapter not registered: nope",
    );
  });

  test("register throws when adapter id is already registered", () => {
    const registry = new ProviderRegistry();
    registry.register({ id: "opencode", name: "OpenCode" } as any);
    expect(() =>
      registry.register({ id: "opencode", name: "OpenCode" } as any),
    ).toThrow("provider adapter already registered: opencode");
  });

  test("get returns undefined for unregistered provider id", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("nope")).toBeUndefined();
  });

  test("get returns adapter for registered provider id", () => {
    const registry = new ProviderRegistry();
    const adapter = { id: "codex", name: "Codex" } as any;
    registry.register(adapter);
    expect(registry.get("codex")).toBe(adapter);
  });

  test("require returns adapter when registered", () => {
    const registry = new ProviderRegistry();
    const adapter = { id: "claude", name: "Claude" } as any;
    registry.register(adapter);
    expect(registry.require("claude")).toBe(adapter);
  });

  test("list returns all registered adapters", () => {
    const registry = new ProviderRegistry();
    const a1 = { id: "a", name: "A" } as any;
    const a2 = { id: "b", name: "B" } as any;
    registry.register(a1);
    registry.register(a2);
    expect(registry.list()).toEqual([a1, a2]);
  });

  test("list returns empty array when nothing registered", () => {
    const registry = new ProviderRegistry();
    expect(registry.list()).toEqual([]);
  });

  test("list returns readonly snapshot of current adapters", () => {
    const registry = new ProviderRegistry();
    const a1 = { id: "p1", name: "P1" } as any;
    const a2 = { id: "p2", name: "P2" } as any;
    registry.register(a1);
    registry.register(a2);

    const list1 = registry.list();
    expect(list1).toEqual([a1, a2]);
    // list() returns a new snapshot each call — callers get an isolated copy
    const list2 = registry.list();
    expect(list2).toEqual([a1, a2]);
    expect(list1).not.toBe(list2);
    expect(list1.length).toBe(2);
    expect(list2.length).toBe(2);
  });
});

describe("resolve", () => {
  test("resolve parses ref and returns adapter when registered", () => {
    const registry = new ProviderRegistry();
    const adapter = { id: "opencode", name: "OpenCode" } as any;
    registry.register(adapter);
    const result = registry.resolve("opencode");
    expect(result.ref.providerId).toBe("opencode");
    expect(result.adapter).toBe(adapter);
  });

  test("resolve throws when provider id in ref is not registered", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.resolve("nope")).toThrow(
      "provider adapter not registered: nope",
    );
  });

  test("resolve parses provider id from ref and require-throws when not registered", () => {
    const registry = new ProviderRegistry();
    // The ref "opencode" parses to providerId "opencode", but nothing is registered.
    expect(() => registry.resolve("opencode")).toThrow(
      "provider adapter not registered: opencode",
    );
  });
});
