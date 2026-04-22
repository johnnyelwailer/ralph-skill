import { describe, expect, test } from "bun:test";
import { ProviderRegistry } from "./registry.ts";
import type { AgentChunk, ProviderAdapter, TurnInput } from "./types.ts";

function makeAdapter(id: string): ProviderAdapter {
  return {
    id,
    capabilities: {
      streaming: false,
      vision: false,
      toolUse: true,
      reasoningEffort: true,
      quotaProbe: false,
      sessionResume: false,
      costReporting: false,
      maxContextTokens: null,
    },
    resolveModel(ref) {
      return { providerId: id, modelId: ref };
    },
    async *sendTurn(_input: TurnInput): AsyncGenerator<AgentChunk> {
      yield { type: "text", content: { delta: "ok" } };
      yield { type: "usage", content: { tokensIn: 1, tokensOut: 1 }, final: true };
    },
  };
}

describe("ProviderRegistry", () => {
  test("register + get + list", () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("opencode"));
    registry.register(makeAdapter("claude"));
    expect(registry.get("opencode")?.id).toBe("opencode");
    expect(registry.list().map((a) => a.id)).toEqual(["opencode", "claude"]);
  });

  test("rejects duplicate registrations", () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("opencode"));
    expect(() => registry.register(makeAdapter("opencode"))).toThrow(
      "already registered",
    );
  });

  test("resolve maps provider refs to registered adapters", () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("gemini"));
    const resolved = registry.resolve("gemini/flash@3.1");
    expect(resolved.ref.providerId).toBe("gemini");
    expect(resolved.ref.track).toBe("flash");
    expect(resolved.ref.version).toBe("3.1");
    expect(resolved.adapter.id).toBe("gemini");
  });

  test("require throws for unknown provider ids", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.require("missing")).toThrow("not registered");
  });
});
