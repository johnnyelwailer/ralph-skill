import { describe, expect, test } from "bun:test";
import { resolveOpencodeModel, toSdkModel } from "./opencode-model.ts";
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

// ─── resolveOpencodeModel ─────────────────────────────────────────────────────

describe("resolveOpencodeModel", () => {
  test("parses opencode provider ref with track/model", () => {
    const result = resolveOpencodeModel("opencode/gpt-4o/reasoning");
    expect(result.providerId).toBe("opencode");
    expect(result.modelId).toBe("gpt-4o/reasoning");
  });

  test("parses opencode provider ref with track/model and version", () => {
    const result = resolveOpencodeModel("opencode/gpt-4o/reasoning@2.0");
    expect(result.providerId).toBe("opencode");
    expect(result.modelId).toBe("gpt-4o/reasoning@2.0");
    expect(result.version).toBe("2.0");
  });

  test("returns default model id when ref has no track", () => {
    const result = resolveOpencodeModel("opencode");
    expect(result.providerId).toBe("opencode");
    expect(result.modelId).toBe("opencode/default");
  });

  test("accepts custom default model id", () => {
    const result = resolveOpencodeModel("opencode", "opencode/custom");
    expect(result.modelId).toBe("opencode/custom");
  });

  test("throws when ref is for a different provider", () => {
    expect(() => resolveOpencodeModel("anthropic/sonnet")).toThrow(
      "opencode adapter cannot resolve provider ref",
    );
  });

  test("throws when ref has no provider id", () => {
    expect(() => resolveOpencodeModel("")).toThrow(
      "provider ref cannot be empty",
    );
  });

  test("parses track-only ref (no model)", () => {
    const result = resolveOpencodeModel("opencode/sonnet");
    expect(result.providerId).toBe("opencode");
    expect(result.modelId).toBe("sonnet");
  });

  test("track is included in returned model when present", () => {
    const result = resolveOpencodeModel("opencode/gpt-4o@1.0");
    expect(result.track).toBe("gpt-4o");
    expect(result.version).toBe("1.0");
    expect(result.modelId).toBe("gpt-4o@1.0");
  });

  test("empty track/model with version uses default model id", () => {
    // "opencode@1.0" — version only, no track → uses default
    const result = resolveOpencodeModel("opencode@1.0");
    expect(result.providerId).toBe("opencode");
    expect(result.modelId).toBe("opencode/default");
    expect(result.version).toBe("1.0");
  });
});
