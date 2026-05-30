import { describe, expect, test } from "bun:test";
import {
  parseTransition,
  validateProvider,
  validateReasoning,
} from "./pipeline-phase-validators.ts";

describe("validateReasoning", () => {
  const cases: Array<[unknown, boolean]> = [
    ["none", true],
    ["low", true],
    ["medium", true],
    ["high", true],
    ["xhigh", true],
    ["", false],
    ["x-low", false],
    ["None", false],
    ["HIGH", false],
    [null, false],
    [undefined, false],
    [42, false],
    [true, false],
    ["reasoning", false],
  ];

  test.each(cases)("validateReasoning(%j) → valid=%j", (value, expectValid) => {
    const errors: string[] = [];
    const result = validateReasoning(value, "reasoning", errors);
    if (expectValid) {
      expect(result).toBeDefined();
      expect(errors).toHaveLength(0);
    } else {
      expect(result).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0]!).toContain("reasoning");
    }
  });

  test("pushes path-qualified error message", () => {
    const errors: string[] = [];
    validateReasoning("bogus", "/v1/pipeline/0/reasoning", errors);
    expect(errors[0]).toBe("/v1/pipeline/0/reasoning: must be one of none, low, medium, high, xhigh");
  });
});

describe("parseTransition", () => {
  test("parses 'retry' keyword", () => {
    const errors: string[] = [];
    const result = parseTransition("retry", "onFailure", errors);
    expect(result).toEqual({ type: "retry" });
    expect(errors).toHaveLength(0);
  });

  test("parses 'goto <agent>' keyword", () => {
    const errors: string[] = [];
    const result = parseTransition("goto build", "onFailure", errors);
    expect(result).toEqual({ type: "goto", target: "build" });
    expect(errors).toHaveLength(0);
  });

  test("parses 'goto' with extra whitespace", () => {
    const errors: string[] = [];
    const result = parseTransition("goto   review_agent", "onFailure", errors);
    expect(result).toEqual({ type: "goto", target: "review_agent" });
    expect(errors).toHaveLength(0);
  });

  test("trims whitespace before parsing", () => {
    const errors: string[] = [];
    const result = parseTransition("  retry  ", "onFailure", errors);
    expect(result).toEqual({ type: "retry" });
    expect(errors).toHaveLength(0);
  });

  test("rejects non-string values", () => {
    const errors: string[] = [];
    expect(parseTransition(null, "onFailure", errors)).toBeUndefined();
    expect(parseTransition(42, "onFailure", errors)).toBeUndefined();
    expect(parseTransition(["retry"], "onFailure", errors)).toBeUndefined();
    expect(errors[0]).toContain("must be a keyword string");
  });

  test("rejects unknown keyword", () => {
    const errors: string[] = [];
    expect(parseTransition("panic", "onFailure", errors)).toBeUndefined();
    expect(parseTransition("retry_3", "onFailure", errors)).toBeUndefined();
    expect(parseTransition("goto", "onFailure", errors)).toBeUndefined(); // goto without target
    expect(errors[0]).toContain("unknown transition keyword");
  });

  test("pushes path-qualified error message", () => {
    const errors: string[] = [];
    parseTransition("crash", "pipeline[2].onFailure", errors);
    expect(errors[0]).toBe('pipeline[2].onFailure: unknown transition keyword: "crash" (expected "retry" or "goto <agent>")');
  });
});

describe("validateProvider", () => {
  test("accepts a non-empty string as single provider", () => {
    const errors: string[] = [];
    expect(validateProvider("opencode", "provider", errors)).toBe("opencode");
    expect(errors).toHaveLength(0);
  });

  test("accepts a chain array of non-empty strings", () => {
    const errors: string[] = [];
    const result = validateProvider(["opencode", "copilot", "claude"], "provider", errors);
    expect(result).toEqual(["opencode", "copilot", "claude"]);
    expect(errors).toHaveLength(0);
  });

  test("accepts a chain of exactly 10 entries (MAX_CHAIN_LENGTH)", () => {
    const errors: string[] = [];
    const chain = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = validateProvider(chain, "provider", errors);
    expect(result).toHaveLength(10);
    expect(errors).toHaveLength(0);
  });

  test("rejects a chain longer than 10 entries", () => {
    const errors: string[] = [];
    const chain = Array.from({ length: 11 }, (_, i) => `p${i}`);
    const result = validateProvider(chain, "provider", errors);
    expect(result).toBeUndefined();
    expect(errors[0]).toContain("chain length 11 exceeds cap of 10");
  });

  test("rejects empty string as single provider", () => {
    const errors: string[] = [];
    expect(validateProvider("", "provider", errors)).toBeUndefined();
    expect(errors[0]).toContain("provider string cannot be empty");
  });

  test("rejects empty chain array", () => {
    const errors: string[] = [];
    expect(validateProvider([], "provider", errors)).toBeUndefined();
    expect(errors[0]).toContain("chain cannot be empty");
  });

  test("rejects chain containing empty string", () => {
    const errors: string[] = [];
    expect(validateProvider(["opencode", "", "claude"], "provider", errors)).toBeUndefined();
    expect(errors[0]).toContain("[1]: each chain entry must be a non-empty string");
  });

  test("rejects chain containing non-string entries", () => {
    const errors: string[] = [];
    expect(validateProvider(["opencode", 42, "claude"], "provider", errors)).toBeUndefined();
    expect(errors[0]).toContain("[1]: each chain entry must be a non-empty string");
  });

  test("rejects non-string non-array values", () => {
    const errors: string[] = [];
    expect(validateProvider(null, "provider", errors)).toBeUndefined();
    expect(validateProvider(123, "provider", errors)).toBeUndefined();
    expect(validateProvider(true, "provider", errors)).toBeUndefined();
    expect(errors[0]).toContain("must be a string or an array of strings");
  });

  test("pushes path-qualified error messages", () => {
    const errors: string[] = [];
    validateProvider(["a", "b"], "pipeline[3].provider", errors);
    // Valid — no errors

    const errors2: string[] = [];
    validateProvider(["", "b"], "pipeline[3].provider", errors2);
    expect(errors2[0]).toBe("pipeline[3].provider[0]: each chain entry must be a non-empty string");
  });
});
