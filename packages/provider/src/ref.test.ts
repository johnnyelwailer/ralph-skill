import { describe, expect, test } from "bun:test";
import { parseProviderRef, providerIdFromRef } from "./ref.ts";

describe("parseProviderRef", () => {
  test("parses bare provider id", () => {
    const result = parseProviderRef("opencode");
    expect(result.providerId).toBe("opencode");
    expect(result.canonicalRef).toBe("opencode");
    expect(result.track).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.version).toBeUndefined();
  });

  test("parses provider id with version", () => {
    const result = parseProviderRef("opencode@3");
    expect(result.providerId).toBe("opencode");
    expect(result.version).toBe("3");
    expect(result.canonicalRef).toBe("opencode@3");
  });

  test("parses provider/track", () => {
    const result = parseProviderRef("anthropic/claude");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.canonicalRef).toBe("anthropic/claude");
  });

  test("parses provider/track with version", () => {
    const result = parseProviderRef("anthropic/claude@4");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.version).toBe("4");
    expect(result.canonicalRef).toBe("anthropic/claude@4");
  });

  test("parses provider/track/model", () => {
    const result = parseProviderRef("anthropic/claude/opus");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.model).toBe("opus");
    expect(result.canonicalRef).toBe("anthropic/claude/opus");
  });

  test("parses provider/track/model with version", () => {
    const result = parseProviderRef("anthropic/claude/opus@4");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.model).toBe("opus");
    expect(result.version).toBe("4");
    expect(result.canonicalRef).toBe("anthropic/claude/opus@4");
  });

  test("parses provider/track/model/submodel with version", () => {
    const result = parseProviderRef("anthropic/claude/opus/4@20260101");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.model).toBe("opus/4");
    expect(result.version).toBe("20260101");
    expect(result.canonicalRef).toBe("anthropic/claude/opus/4@20260101");
  });

  test("strips leading/trailing whitespace from ref", () => {
    const result = parseProviderRef("  opencode  ");
    expect(result.providerId).toBe("opencode");
  });

  test("strips whitespace from segments", () => {
    const result = parseProviderRef("  anthropic  /  claude  /  opus  ");
    expect(result.providerId).toBe("anthropic");
    expect(result.track).toBe("claude");
    expect(result.model).toBe("opus");
  });

  test("version is not trimmed — whitespace inside version is preserved", () => {
    const result = parseProviderRef("opencode  @  3");
    expect(result.version).toBe("  3");
  });

  test("canonicalRef omits version when undefined", () => {
    const result = parseProviderRef("opencode");
    expect(result.canonicalRef).toBe("opencode");
  });

  test("canonicalRef includes version when present", () => {
    const result = parseProviderRef("opencode@3");
    expect(result.canonicalRef).toBe("opencode@3");
  });

  test("throws for empty string", () => {
    expect(() => parseProviderRef("")).toThrow("provider ref cannot be empty");
  });

  test("throws for whitespace-only string", () => {
    expect(() => parseProviderRef("   ")).toThrow("provider ref cannot be empty");
  });

  test("throws for ref with only whitespace, @, and version — missing provider id", () => {
    // After whitespace trim of "  @3  " → "@3" → split gives ["", "3"] → rawPath="" → segments=[] → throws "provider id is required"
    expect(() => parseProviderRef("  @3  ")).toThrow("provider id is required");
  });

  test("throws when version is empty after @", () => {
    expect(() => parseProviderRef("opencode@")).toThrow("version cannot be empty");
  });

  test("throws when version is whitespace-only after @", () => {
    expect(() => parseProviderRef("opencode@   ")).toThrow("version cannot be empty");
  });

  test("throws for too many @ separators", () => {
    expect(() => parseProviderRef("a@b@c")).toThrow("too many @ separators");
  });

  test("leading slash is ignored — /claude is treated as 'claude'", () => {
    // "/" splits to ["", "claude"] → filter removes empty string → segments=["claude"] → valid
    const result = parseProviderRef("/claude");
    expect(result.providerId).toBe("claude");
  });

  test("throws when all segments are whitespace", () => {
    expect(() => parseProviderRef("  /  /  ")).toThrow("provider id is required");
  });

  test("canonicalRef is stable for model with slashes inside version", () => {
    // When model contains slashes and version is present, everything after first @ is version
    const result = parseProviderRef("anthropic/claude/opus@4");
    expect(result.model).toBe("opus");
    expect(result.version).toBe("4");
  });
});

describe("providerIdFromRef", () => {
  test("returns provider id from bare ref", () => {
    expect(providerIdFromRef("opencode")).toBe("opencode");
  });

  test("returns provider id from ref with version", () => {
    expect(providerIdFromRef("opencode@3")).toBe("opencode");
  });

  test("returns provider id from provider/track ref", () => {
    expect(providerIdFromRef("anthropic/claude")).toBe("anthropic");
  });

  test("returns provider id from provider/track/model ref", () => {
    expect(providerIdFromRef("anthropic/claude/opus")).toBe("anthropic");
  });

  test("returns provider id from provider/track/model@version ref", () => {
    expect(providerIdFromRef("anthropic/claude/opus@4")).toBe("anthropic");
  });

  test("throws for empty string", () => {
    expect(() => providerIdFromRef("")).toThrow("provider ref cannot be empty");
  });

  test("throws for whitespace-only string", () => {
    expect(() => providerIdFromRef("   ")).toThrow("provider ref cannot be empty");
  });

  test("throws for too many @ separators", () => {
    expect(() => providerIdFromRef("a@b@c")).toThrow("too many @ separators");
  });

  test("throws for empty provider id — bare slash", () => {
    expect(() => providerIdFromRef("/")).toThrow("provider id is required");
  });
});
