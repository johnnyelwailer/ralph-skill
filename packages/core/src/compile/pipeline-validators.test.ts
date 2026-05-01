import { describe, expect, test } from "bun:test";
import {
  validatePipelineArray,
  validateStringArray,
  validateStringMap,
} from "./pipeline-validators.ts";
import type { PipelinePhase } from "./types.ts";

describe("validatePipelineArray", () => {
  test("returns undefined when field is absent", () => {
    const errors: string[] = [];
    expect(validatePipelineArray(undefined, "pipeline", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("parses a valid array of phase objects", () => {
    const errors: string[] = [];
    const phases: unknown[] = [
      { agent: "plan" },
      { agent: "build", repeat: 3 },
      { agent: "review", onFailure: "retry" },
    ];
    const result = validatePipelineArray(phases, "pipeline", errors);
    expect(result).toBeDefined();
    expect(result!.length).toBe(3);
    expect((result as PipelinePhase[])[0]!.agent).toBe("plan");
    expect((result as PipelinePhase[])[1]!.agent).toBe("build");
    expect((result as PipelinePhase[])[1]!.repeat).toBe(3);
    expect((result as PipelinePhase[])[2]!.onFailure).toEqual({ type: "retry" });
    expect(errors).toHaveLength(0);
  });

  test("rejects non-array value", () => {
    const errors: string[] = [];
    expect(validatePipelineArray("not an array", "pipeline", errors)).toBeUndefined();
    expect(errors).toContain("pipeline: expected an array of phase objects");
  });

  test("rejects null", () => {
    const errors: string[] = [];
    expect(validatePipelineArray(null, "pipeline", errors)).toBeUndefined();
    expect(errors).toContain("pipeline: expected an array of phase objects");
  });

  test("rejects empty array", () => {
    const errors: string[] = [];
    expect(validatePipelineArray([], "pipeline", errors)).toBeUndefined();
    expect(errors).toContain("pipeline: must contain at least one phase");
  });

  test("collects multiple errors from multiple invalid phases", () => {
    const errors: string[] = [];
    validatePipelineArray([{ repeat: 5 }, { agent: "" }], "pipeline", errors);
    // Both phases are missing a valid agent/exec key, so both get path-qualified errors
    expect(errors.some((e) => e.startsWith("pipeline[0]:"))).toBe(true);
    expect(errors.some((e) => e.startsWith("pipeline[1]:"))).toBe(true);
  });

  test("accepts valid exec phase with minimal fields", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ exec: "regen-api" }], "pipeline", errors);
    expect(result).toHaveLength(1);
    expect((result as PipelinePhase[])[0]!).toEqual({ exec: "regen-api" });
    expect(errors).toHaveLength(0);
  });

  test("accepts valid exec phase with all optional fields", () => {
    const errors: string[] = [];
    const result = validatePipelineArray(
      [{ exec: "cleanup", args: ["--dry-run"], env: { FOO: "bar" }, cwd: "worktree", timeout: "5m" }],
      "pipeline",
      errors,
    );
    expect(result).toHaveLength(1);
    expect((result as PipelinePhase[])[0]!).toEqual({
      exec: "cleanup",
      args: ["--dry-run"],
      env: { FOO: "bar" },
      cwd: "worktree",
      timeout: "5m",
    });
    expect(errors).toHaveLength(0);
  });

  test("rejects phase with both agent and exec keys", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ agent: "build", exec: "cleanup" }], "pipeline", errors);
    expect(result).toEqual([]);
    expect(errors[0]).toBe(
      "pipeline[0]: phase cannot have both 'agent' and 'exec' keys; they are mutually exclusive",
    );
  });

  test("rejects exec phase with empty exec string", () => {
    const errors: string[] = [];
    const result = validatePipelineArray([{ exec: "" }], "pipeline", errors);
    expect(result).toEqual([]);
    expect(errors[0]).toBe(
      "pipeline[0]: phase must have either an 'agent' or 'exec' key (non-empty string)",
    );
  });

  test("skips phase with missing agent but continues processing remainder", () => {
    const errors: string[] = [];
    const phases: unknown[] = [
      { agent: "plan" },
      { agent: "" },      // invalid — skipped
      { exec: "cleanup" },
    ];
    const result = validatePipelineArray(phases, "pipeline", errors);
    // Returns only valid phases (invalid entries are dropped, errors are still collected)
    expect(result!.length).toBe(2);
    expect((result as PipelinePhase[])[0]!).toEqual({ agent: "plan" });
    expect((result as PipelinePhase[])[1]!).toEqual({ exec: "cleanup" });
  });

  test("rejects non-integer repeat", () => {
    const errors: string[] = [];
    const phases: unknown[] = [{ agent: "build", repeat: 2.5 }];
    validatePipelineArray(phases, "pipeline", errors);
    expect(errors.some((e) => e.includes("repeat"))).toBe(true);
  });

  test("rejects negative repeat", () => {
    const errors: string[] = [];
    const phases: unknown[] = [{ agent: "build", repeat: 0 }];
    validatePipelineArray(phases, "pipeline", errors);
    expect(errors.some((e) => e.includes("repeat"))).toBe(true);
  });

  test("rejects non-string model", () => {
    const errors: string[] = [];
    const phases: unknown[] = [{ agent: "build", model: 123 }];
    validatePipelineArray(phases, "pipeline", errors);
    expect(errors.some((e) => e.includes("model"))).toBe(true);
  });

  test("rejects non-string timeout", () => {
    const errors: string[] = [];
    const phases: unknown[] = [{ agent: "build", timeout: 300 }];
    validatePipelineArray(phases, "pipeline", errors);
    expect(errors.some((e) => e.includes("timeout"))).toBe(true);
  });
});

describe("validateStringArray", () => {
  test("returns undefined when field is absent", () => {
    const errors: string[] = [];
    expect(validateStringArray(undefined, "tags", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("parses a valid string array", () => {
    const errors: string[] = [];
    const result = validateStringArray(["a", "b", "c"], "tags", errors);
    expect(result).toEqual(["a", "b", "c"]);
    expect(errors).toHaveLength(0);
  });

  test("rejects non-array value", () => {
    const errors: string[] = [];
    expect(validateStringArray("not array", "tags", errors)).toBeUndefined();
    expect(errors).toContain("tags: expected an array of strings");
  });

  test("rejects array with empty string", () => {
    const errors: string[] = [];
    expect(validateStringArray(["a", "", "c"], "tags", errors)).toBeUndefined();
    expect(errors).toContain("tags[1]: must be a non-empty string");
  });

  test("rejects array with non-string entry", () => {
    const errors: string[] = [];
    expect(validateStringArray(["a", 42, "c"], "tags", errors)).toBeUndefined();
    expect(errors).toContain("tags[1]: must be a non-empty string");
  });
});

describe("validateStringMap", () => {
  test("returns undefined when field is absent", () => {
    const errors: string[] = [];
    expect(validateStringMap(undefined, "env", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("parses a valid string→string map", () => {
    const errors: string[] = [];
    const input = { FOO: "bar", BAZ: "qux" };
    const result = validateStringMap(input, "env", errors);
    expect(result).toEqual(input);
    expect(errors).toHaveLength(0);
  });

  test("rejects non-object value", () => {
    const errors: string[] = [];
    expect(validateStringMap("not an object", "env", errors)).toBeUndefined();
    expect(validateStringMap(null, "env", errors)).toBeUndefined();
    expect(validateStringMap([1, 2], "env", errors)).toBeUndefined();
    expect(errors[0]).toContain("expected a mapping of string → string");
  });

  test("rejects map with non-string value", () => {
    const errors: string[] = [];
    expect(validateStringMap({ FOO: 123 }, "env", errors)).toBeUndefined();
    expect(errors).toContain("env.FOO: must be a non-empty string");
  });

  test("rejects map with empty-string value", () => {
    const errors: string[] = [];
    expect(validateStringMap({ FOO: "" }, "env", errors)).toBeUndefined();
    expect(errors).toContain("env.FOO: must be a non-empty string");
  });
});
