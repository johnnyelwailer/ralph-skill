import { describe, expect, test } from "bun:test";
import { resolvePromptParts, toSdkPromptParts } from "./opencode-input-parts.ts";

describe("resolvePromptParts", () => {
  test("returns promptParts when provided and non-empty", () => {
    const promptParts = [{ type: "text" as const, text: "hello" }];
    const result = resolvePromptParts({ prompt: "fallback", promptParts });
    expect(result).toEqual(promptParts);
  });

  test("returns promptParts when empty array (treated as empty)", () => {
    const result = resolvePromptParts({ prompt: "fallback", promptParts: [] });
    expect(result).toEqual([{ type: "text", text: "fallback" }]);
  });

  test("returns text prompt when promptParts is undefined", () => {
    const result = resolvePromptParts({ prompt: "just text" });
    expect(result).toEqual([{ type: "text", text: "just text" }]);
  });

  test("returns text prompt when promptParts is explicitly undefined", () => {
    const result = resolvePromptParts({ prompt: "just text", promptParts: undefined });
    expect(result).toEqual([{ type: "text", text: "just text" }]);
  });

  test("preserves multiple prompt parts in order", () => {
    const promptParts = [
      { type: "text" as const, text: "first" },
      { type: "file" as const, mime: "image/png", url: "file:///test.png" },
    ];
    const result = resolvePromptParts({ prompt: "ignored", promptParts });
    expect(result).toEqual(promptParts);
  });
});

describe("toSdkPromptParts", () => {
  test("converts text prompt part", () => {
    const input = [{ type: "text" as const, text: "hello world" }];
    const result = toSdkPromptParts(input);
    expect(result).toEqual([{ type: "text", text: "hello world" }]);
  });

  test("converts file prompt part without filename", () => {
    const input = [{ type: "file" as const, mime: "image/png", url: "file:///test.png" }];
    const result = toSdkPromptParts(input);
    expect(result).toEqual([{ type: "file", mime: "image/png", url: "file:///test.png" }]);
  });

  test("converts file prompt part with filename", () => {
    const input = [
      { type: "file" as const, mime: "image/png", url: "file:///test.png", filename: "my-image.png" },
    ];
    const result = toSdkPromptParts(input);
    expect(result).toEqual([
      { type: "file", mime: "image/png", url: "file:///test.png", filename: "my-image.png" },
    ]);
  });

  test("converts multiple mixed prompt parts", () => {
    const input = [
      { type: "text" as const, text: "hello" },
      { type: "file" as const, mime: "text/plain", url: "file:///a.txt" },
      { type: "text" as const, text: "world" },
    ];
    const result = toSdkPromptParts(input);
    expect(result).toEqual([
      { type: "text", text: "hello" },
      { type: "file", mime: "text/plain", url: "file:///a.txt" },
      { type: "text", text: "world" },
    ]);
  });

  test("handles empty array", () => {
    const result = toSdkPromptParts([]);
    expect(result).toEqual([]);
  });

  test("preserves readonly input array", () => {
    const input: readonly { type: "text"; text: string }[] = [
      { type: "text", text: "constant" },
    ];
    const result = toSdkPromptParts(input);
    expect(result).toEqual([{ type: "text", text: "constant" }]);
  });
});