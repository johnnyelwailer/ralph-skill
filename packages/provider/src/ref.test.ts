import { describe, expect, test } from "bun:test";
import { parseProviderRef, providerIdFromRef } from "./ref.ts";

describe("parseProviderRef", () => {
  test("parses bare provider id", () => {
    const parsed = parseProviderRef("opencode");
    expect(parsed).toEqual({
      providerId: "opencode",
      canonicalRef: "opencode",
    });
  });

  test("parses provider with track + model + version", () => {
    const parsed = parseProviderRef("opencode/openrouter/glm@5.1");
    expect(parsed.providerId).toBe("opencode");
    expect(parsed.track).toBe("openrouter");
    expect(parsed.model).toBe("glm");
    expect(parsed.version).toBe("5.1");
    expect(parsed.canonicalRef).toBe("opencode/openrouter/glm@5.1");
  });

  test("normalizes whitespace and empty path fragments", () => {
    const parsed = parseProviderRef("  claude//opus  @4.7");
    expect(parsed.canonicalRef).toBe("claude/opus@4.7");
  });

  test("rejects empty refs", () => {
    expect(() => parseProviderRef("")).toThrow("provider ref cannot be empty");
  });

  test("rejects malformed version separators", () => {
    expect(() => parseProviderRef("claude@4@7")).toThrow("too many @");
  });

  test("rejects empty version", () => {
    expect(() => parseProviderRef("claude@")).toThrow("version cannot be empty");
  });
});

describe("providerIdFromRef", () => {
  test("returns first path segment", () => {
    expect(providerIdFromRef("gemini/flash@3.1")).toBe("gemini");
  });
});
