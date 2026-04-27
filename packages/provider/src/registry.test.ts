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
});
