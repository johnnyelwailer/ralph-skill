import { describe, expect, test } from "bun:test";
import { parseProviderRef, providerIdFromRef } from "./ref.ts";

describe("parseProviderRef", () => {
  test("parses simple provider id", () => {
    const result = parseProviderRef("opencode");
    expect(result.providerId).toBe("opencode");
    expect(result.canonicalRef).toBe("opencode");
    expect(result.track).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.version).toBeUndefined();
  });

  test("parses provider/track", () => {
    const result = parseProviderRef("anthropic/sonnet");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("sonnet");
    expect(result.canonicalRef).toBe("anthropic/sonnet");
    expect(result.model).toBeUndefined();
    expect(result.version).toBeUndefined();
  });

  test("parses provider/track/model", () => {
    const result = parseProviderRef("openai/gpt-4o/reasoning");
    expect(result.providerId).toBe("openai");
    expect(result.track).toBe("gpt-4o");
    expect(result.model).toBe("reasoning");
    expect(result.canonicalRef).toBe("openai/gpt-4o/reasoning");
  });

  test("parses with version suffix", () => {
    const result = parseProviderRef("cohere/command@3.1");
    expect(result.providerId).toBe("cohere");
    expect(result.track).toBe("command");
    expect(result.version).toBe("3.1");
    expect(result.canonicalRef).toBe("cohere/command@3.1");
  });

  test("parses provider/track/model with version", () => {
    const result = parseProviderRef("openai/gpt-4o/reasoning@2.0");
    expect(result.providerId).toBe("openai");
    expect(result.track).toBe("gpt-4o");
    expect(result.model).toBe("reasoning");
    expect(result.version).toBe("2.0");
    expect(result.canonicalRef).toBe("openai/gpt-4o/reasoning@2.0");
  });

  test("canonicalRef drops version when absent", () => {
    const result = parseProviderRef("provider/track/model");
    expect(result.canonicalRef).toBe("provider/track/model");
  });

  test("canonicalRef includes version when present", () => {
    const result = parseProviderRef("provider/track@1.0");
    expect(result.canonicalRef).toBe("provider/track@1.0");
  });

  test("canonicalRef omits model when undefined", () => {
    const result = parseProviderRef("provider/track");
    expect(result.canonicalRef).toBe("provider/track");
  });

  test("trims whitespace from ref", () => {
    const result = parseProviderRef("  opencode  ");
    expect(result.providerId).toBe("opencode");
  });

  test("trims whitespace from segments", () => {
    const result = parseProviderRef("  anthropic  /  sonnet  ");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("sonnet");
  });

  test("filters empty segments from path", () => {
    // double-slash would produce empty segment
    const result = parseProviderRef("opencode//default");
    expect(result.providerId).toBe("opencode");
    expect(result.track).toBe("default");
  });

  test("throws when ref is empty", () => {
    expect(() => parseProviderRef("")).toThrow("provider ref cannot be empty");
  });

  test("throws when ref is only whitespace", () => {
    expect(() => parseProviderRef("   ")).toThrow("provider ref cannot be empty");
  });

  test("throws when ref has too many @ separators", () => {
    expect(() => parseProviderRef("a/b@c@d")).toThrow("too many @ separators");
  });

  test("throws when version is empty string after @", () => {
    expect(() => parseProviderRef("opencode/sonnet@")).toThrow("version cannot be empty");
  });

  test("throws when version is only whitespace", () => {
    expect(() => parseProviderRef("opencode/sonnet@   ")).toThrow("version cannot be empty");
  });

  test("throws when provider id is missing (no segments)", () => {
    expect(() => parseProviderRef("@1.0")).toThrow("provider id is required");
  });

  test("throws when path is only slashes and whitespace", () => {
    expect(() => parseProviderRef("   /   ")).toThrow("provider id is required");
  });

  test("providerIdFromRef is a thin alias for parseProviderRef", () => {
    const result = providerIdFromRef("anthropic/sonnet@3.0");
    expect(result).toBe("anthropic");
  });

  test("canonicalRef preserves model with slashes", () => {
    // model can itself contain slashes (nested model paths)
    const result = parseProviderRef("openai/gpt-4o/reasoning/high@1.0");
    expect(result.model).toBe("reasoning/high");
    expect(result.canonicalRef).toBe("openai/gpt-4o/reasoning/high@1.0");
  });

  test("version without track is accepted (bare version)", () => {
    // "provider@@1.0" — this parses with no track, just version
    // Actually per the logic: split on @ → [provider, , 1.0] if "provider@@1.0"
    // But trim() on empty string gives "", so version.trim().length === 0 → error
    // So "provider@1.0" gives track=undefined, version="1.0"
    const result = parseProviderRef("cohere@3.0");
    expect(result.providerId).toBe("cohere");
    expect(result.track).toBeUndefined();
    expect(result.version).toBe("3.0");
    expect(result.canonicalRef).toBe("cohere@3.0");
  });
});
