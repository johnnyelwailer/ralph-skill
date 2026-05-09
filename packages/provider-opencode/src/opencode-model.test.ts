import { describe, expect, test } from "bun:test";
import { toSdkModel } from "./opencode-model.ts";
import type { ResolvedModel } from "@aloop/provider";

describe("toSdkModel", () => {
  function makeResolved(modelId: string, providerId = "opencode"): ResolvedModel {
    return { providerId, modelId } as ResolvedModel;
  }

  test("converts modelId with slash by stripping provider prefix", () => {
    // "opencode/default" splits to ["opencode","default"] → strips "opencode/" prefix
    const resolved = makeResolved("opencode/default");
    expect(toSdkModel(resolved)).toEqual({ providerID: "opencode", modelID: "default" });
  });

  test("strips provider prefix from modelId when it matches providerId", () => {
    // "openrouter/claude@3.5" → providerID="openrouter", modelID="claude@3.5"
    const resolved = makeResolved("openrouter/claude@3.5");
    expect(toSdkModel(resolved)).toEqual({ providerID: "openrouter", modelID: "claude@3.5" });
  });

  test("handles modelId with multiple slashes", () => {
    // "openrouter/anthropic/claude-3.5" → providerID="openrouter", modelID="anthropic/claude-3.5"
    const resolved = makeResolved("openrouter/anthropic/claude-3.5");
    expect(toSdkModel(resolved)).toEqual({ providerID: "openrouter", modelID: "anthropic/claude-3.5" });
  });

  test("single-segment modelId falls back to providerId as prefix", () => {
    // "claude" with providerId="opencode" → providerID="opencode", modelID="claude"
    const resolved = makeResolved("claude");
    expect(toSdkModel(resolved)).toEqual({ providerID: "opencode", modelID: "claude" });
  });

  test("modelId that starts with providerId but has no path", () => {
    const resolved = makeResolved("opencode");
    expect(toSdkModel(resolved)).toEqual({ providerID: "opencode", modelID: "opencode" });
  });

  test("modelId with @ version suffix is preserved in modelID", () => {
    const resolved = makeResolved("openrouter/claude@5");
    expect(toSdkModel(resolved)).toEqual({ providerID: "openrouter", modelID: "claude@5" });
  });

  test("result has correct types for SDK consumption", () => {
    const resolved = makeResolved("openrouter/claude@3.5");
    const result = toSdkModel(resolved);
    expect(typeof result.providerID).toBe("string");
    expect(typeof result.modelID).toBe("string");
    expect(result.providerID).toBe("openrouter");
    expect(result.modelID).toBe("claude@3.5");
  });
});
