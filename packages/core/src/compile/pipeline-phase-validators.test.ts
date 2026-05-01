import { describe, expect, test } from "bun:test";
import {
  parseTransition,
  validateProvider,
  validateReasoning,
} from "./pipeline-phase-validators.ts";
import {
  validatePipelineArray,
  validateStringArray,
  validateStringMap,
} from "./pipeline-validators.ts";

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

describe("validatePipelineArray", () => {
  test("returns undefined when value is undefined", () => {
    const errors: string[] = [];
    expect(validatePipelineArray(undefined, "pipeline", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("rejects non-array values", () => {
    const errors: string[] = [];
    expect(validatePipelineArray(null, "pipeline", errors)).toBeUndefined();
    expect(validatePipelineArray("not-an-array", "pipeline", errors)).toBeUndefined();
    expect(validatePipelineArray(42, "pipeline", errors)).toBeUndefined();
    expect(validatePipelineArray({}, "pipeline", errors)).toBeUndefined();
    expect(errors[0]).toBe("pipeline: expected an array of phase objects");
  });

  test("rejects empty array", () => {
    const errors: string[] = [];
    expect(validatePipelineArray([], "pipeline", errors)).toBeUndefined();
    expect(errors[0]).toBe("pipeline: must contain at least one phase");
  });

  test("accepts a valid single-phase pipeline", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build" }], "pipeline", errors);
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({ agent: "build" });
    expect(errors).toHaveLength(0);
  });

  test("accepts a valid multi-phase pipeline with all optional fields", () => {
    const errors: string[] = [];
    const result = validatePipelineArray(
      [
        { agent: "build", repeat: 3, provider: "opencode", model: "o4-mini", reasoning: "high", timeout: "10m" },
        { agent: "test", onFailure: "retry" },
        { agent: "deploy", onFailure: "goto build" },
      ],
      "pipeline",
      errors,
    );
    expect(result).toHaveLength(3);
    expect(errors).toHaveLength(0);
  });

  test("rejects phase missing agent", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ provider: "opencode" }], "pipeline", errors);
    // Returns empty array (phase not added), not undefined — errors are still pushed
    expect(result).toEqual([]);
    expect(errors[0]).toBe(
      "pipeline[0]: phase must have either an 'agent' or 'exec' key (non-empty string)",
    );
  });

  test("rejects phase with empty agent string", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "" }], "pipeline", errors);
    expect(result).toEqual([]);
    expect(errors[0]).toBe(
      "pipeline[0]: phase must have either an 'agent' or 'exec' key (non-empty string)",
    );
  });

  test("rejects invalid repeat value (non-integer)", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", repeat: 1.5 }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("repeat");
    expect(errors[0]).toBe("pipeline[0].repeat: must be a positive integer");
  });

  test("rejects invalid repeat value (zero)", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", repeat: 0 }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("repeat");
    expect(errors[0]).toBe("pipeline[0].repeat: must be a positive integer");
  });

  test("rejects invalid repeat value (negative)", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", repeat: -1 }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("repeat");
    expect(errors[0]).toBe("pipeline[0].repeat: must be a positive integer");
  });

  test("accepts valid repeat", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", repeat: 5 }], "pipeline", errors);
    expect(result![0]).toHaveProperty("repeat", 5);
    expect(errors).toHaveLength(0);
  });

  test("rejects non-object phase", () => {
    const errors: string[] = [];
    const result = validatePipelineArray(["build", null, 42], "pipeline", errors);
    // All invalid phases are skipped; result is empty array with errors pushed
    expect(result).toEqual([]);
    expect(errors[0]).toBe("pipeline[0]: expected a mapping");
  });

  test("rejects phase with non-string model", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", model: 123 }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("model");
    expect(errors[0]).toBe("pipeline[0].model: must be a non-empty string");
  });

  test("rejects phase with empty model string", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", model: "" }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("model");
    expect(errors[0]).toBe("pipeline[0].model: must be a non-empty string");
  });

  test("rejects phase with non-string timeout", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", timeout: 300 }], "pipeline", errors);
    expect(result![0]).not.toHaveProperty("timeout");
    expect(errors[0]).toBe("pipeline[0].timeout: must be a string like \"30m\" or \"2h\"");
  });

  test("continues validating all phases even after errors", () => {
    const errors: string[] = [];
    const result = validatePipelineArray(
      [
        { agent: "build", repeat: -1 },
        { agent: "test", model: "" },
        { agent: "deploy" },
      ],
      "pipeline",
      errors,
    );
    // Third phase still gets validated even if first two have errors
    expect(result).toHaveLength(3);
    expect(result![2]).toEqual({ agent: "deploy" });
    expect(errors).toContain("pipeline[0].repeat: must be a positive integer");
    expect(errors).toContain("pipeline[1].model: must be a non-empty string");
  });

  test("validates onFailure transition via parseTransition", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", onFailure: "goto test" }], "pipeline", errors);
    expect(result![0]).toHaveProperty("onFailure");
    expect(result![0].onFailure).toEqual({ type: "goto", target: "test" });
    expect(errors).toHaveLength(0);
  });

  test("validates provider via validateProvider", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", provider: "opencode" }], "pipeline", errors);
    expect(result![0]).toHaveProperty("provider", "opencode");
    expect(errors).toHaveLength(0);
  });

  test("pushes path-qualified error for nested phase index", () => {
    const errors: string[] = [];
    validatePipelineArray([{ agent: "" }], "agents[2].pipeline", errors);
    expect(errors[0]).toBe(
      "agents[2].pipeline[0]: phase must have either an 'agent' or 'exec' key (non-empty string)",
    );
  });
});

describe("validateStringArray", () => {
  test("returns undefined when value is undefined", () => {
    const errors: string[] = [];
    expect(validateStringArray(undefined, "tags", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("rejects non-array values", () => {
    const errors: string[] = [];
    expect(validateStringArray(null, "tags", errors)).toBeUndefined();
    expect(validateStringArray("hello", "tags", errors)).toBeUndefined();
    expect(validateStringArray({ a: "b" }, "tags", errors)).toBeUndefined();
    expect(errors[0]).toBe("tags: expected an array of strings");
  });

  test("rejects array containing non-string entries", () => {
    const errors: string[] = [];
    expect(validateStringArray(["valid", 42, "also-valid"], "tags", errors)).toBeUndefined();
    expect(errors[0]).toBe("tags[1]: must be a non-empty string");
  });

  test("rejects array containing empty string", () => {
    const errors: string[] = [];
    expect(validateStringArray(["tag1", "", "tag3"], "tags", errors)).toBeUndefined();
    expect(errors[0]).toBe("tags[1]: must be a non-empty string");
  });

  test("accepts valid string array", () => {
    const errors: string[] = [];
    const result = validateStringArray(["tag-a", "tag-b"], "tags", errors);
    expect(result).toEqual(["tag-a", "tag-b"]);
    expect(errors).toHaveLength(0);
  });

  test("pushes path-qualified error message", () => {
    const errors: string[] = [];
    validateStringArray(["ok", ""], "phases[3].tags", errors);
    expect(errors[0]).toBe("phases[3].tags[1]: must be a non-empty string");
  });
});

describe("validateStringMap", () => {
  test("returns undefined when value is undefined", () => {
    const errors: string[] = [];
    expect(validateStringMap(undefined, "env", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("rejects non-object values", () => {
    const errors: string[] = [];
    expect(validateStringMap(null, "env", errors)).toBeUndefined();
    expect(validateStringMap("KEY=VALUE", "env", errors)).toBeUndefined();
    expect(validateStringMap(["KEY", "VALUE"], "env", errors)).toBeUndefined();
    expect(validateStringMap(42, "env", errors)).toBeUndefined();
    expect(errors[0]).toBe("env: expected a mapping of string → string");
  });

  test("rejects object with non-string value", () => {
    const errors: string[] = [];
    expect(validateStringMap({ KEY: 123 }, "env", errors)).toBeUndefined();
    expect(errors[0]).toBe("env.KEY: must be a non-empty string");
  });

  test("rejects object with empty-string value", () => {
    const errors: string[] = [];
    expect(validateStringMap({ KEY: "" }, "env", errors)).toBeUndefined();
    expect(errors[0]).toBe("env.KEY: must be a non-empty string");
  });

  test("accepts valid string map", () => {
    const errors: string[] = [];
    const result = validateStringMap({ KEY1: "value1", KEY2: "value2" }, "env", errors);
    expect(result).toEqual({ KEY1: "value1", KEY2: "value2" });
    expect(errors).toHaveLength(0);
  });

  test("pushes path-qualified error with key suffix", () => {
    const errors: string[] = [];
    validateStringMap({ SOME_KEY: "" }, "phases[2].env", errors);
    expect(errors[0]).toBe("phases[2].env.SOME_KEY: must be a non-empty string");
  });
});
