import { describe, expect, test } from "bun:test";
import { validateContext } from "./pipeline-validators.ts";

describe("validateContext", () => {
  test("returns undefined when value is undefined", () => {
    const errors: string[] = [];
    expect(validateContext(undefined, "phase.context", errors)).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  test("accepts a plain string as shorthand for a context id", () => {
    const errors: string[] = [];
    const result = validateContext("orch_recall", "phase.context", errors);
    expect(result).toEqual([{ id: "orch_recall" }]);
    expect(errors).toHaveLength(0);
  });

  test("rejects an empty string", () => {
    const errors: string[] = [];
    const result = validateContext("", "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context: context id must be a non-empty string");
  });

  test("accepts an object with just an id", () => {
    const errors: string[] = [];
    const result = validateContext({ id: "task_recall" }, "phase.context", errors);
    expect(result).toEqual([{ id: "task_recall" }]);
    expect(errors).toHaveLength(0);
  });

  test("accepts an object with id and budgetTokens", () => {
    const errors: string[] = [];
    const result = validateContext(
      { id: "orch_recall", budgetTokens: 8000 },
      "phase.context",
      errors,
    );
    expect(result).toEqual([{ id: "orch_recall", budgetTokens: 8000 }]);
    expect(errors).toHaveLength(0);
  });

  test("rejects object with empty id", () => {
    const errors: string[] = [];
    const result = validateContext({ id: "" }, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.id: must be a non-empty string");
  });

  test("rejects object with non-string id", () => {
    const errors: string[] = [];
    const result = validateContext({ id: 123 } as unknown, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.id: must be a non-empty string");
  });

  test("rejects object with invalid budgetTokens (zero)", () => {
    const errors: string[] = [];
    const result = validateContext(
      { id: "test", budgetTokens: 0 },
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.budgetTokens: must be a positive integer");
  });

  test("rejects object with invalid budgetTokens (negative)", () => {
    const errors: string[] = [];
    const result = validateContext(
      { id: "test", budgetTokens: -100 },
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.budgetTokens: must be a positive integer");
  });

  test("rejects object with invalid budgetTokens (non-integer)", () => {
    const errors: string[] = [];
    const result = validateContext(
      { id: "test", budgetTokens: 1.5 },
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.budgetTokens: must be a positive integer");
  });

  test("rejects object with invalid budgetTokens (string)", () => {
    const errors: string[] = [];
    const result = validateContext(
      { id: "test", budgetTokens: "5000" } as unknown,
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context.budgetTokens: must be a positive integer");
  });

  test("accepts an array of string ids", () => {
    const errors: string[] = [];
    const result = validateContext(
      ["orch_recall", "task_recall"],
      "phase.context",
      errors,
    );
    expect(result).toEqual([
      { id: "orch_recall" },
      { id: "task_recall" },
    ]);
    expect(errors).toHaveLength(0);
  });

  test("accepts an array of object ids", () => {
    const errors: string[] = [];
    const result = validateContext(
      [{ id: "a" }, { id: "b", budgetTokens: 5000 }],
      "phase.context",
      errors,
    );
    expect(result).toEqual([
      { id: "a" },
      { id: "b", budgetTokens: 5000 },
    ]);
    expect(errors).toHaveLength(0);
  });

  test("accepts a mixed array of strings and objects", () => {
    const errors: string[] = [];
    const result = validateContext(
      ["orch_recall", { id: "task_recall", budgetTokens: 3000 }],
      "phase.context",
      errors,
    );
    expect(result).toEqual([
      { id: "orch_recall" },
      { id: "task_recall", budgetTokens: 3000 },
    ]);
    expect(errors).toHaveLength(0);
  });

  test("rejects an empty array", () => {
    const errors: string[] = [];
    const result = validateContext([], "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context: context array must not be empty");
  });

  test("rejects array with empty string", () => {
    const errors: string[] = [];
    const result = validateContext(["valid", ""], "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context[1]: context id must be a non-empty string");
  });

  test("rejects array with invalid item (number)", () => {
    const errors: string[] = [];
    const result = validateContext(["valid", 42] as unknown, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain(
      "phase.context[1]: must be a string or a context object with id",
    );
  });

  test("rejects array with invalid item (null)", () => {
    const errors: string[] = [];
    const result = validateContext(["valid", null] as unknown, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain(
      "phase.context[1]: must be a string or a context object with id",
    );
  });

  test("rejects non-array non-string non-object value (number)", () => {
    const errors: string[] = [];
    const result = validateContext(42 as unknown, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain(
      "phase.context: must be a context id string, an object with id, or an array of these",
    );
  });

  test("rejects non-array non-string non-object value (boolean)", () => {
    const errors: string[] = [];
    const result = validateContext(true as unknown, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain(
      "phase.context: must be a context id string, an object with id, or an array of these",
    );
  });

  test("rejects null", () => {
    const errors: string[] = [];
    const result = validateContext(null, "phase.context", errors);
    expect(result).toBeUndefined();
    expect(errors).toContain(
      "phase.context: must be a context id string, an object with id, or an array of these",
    );
  });

  test("collects multiple errors from array items", () => {
    const errors: string[] = [];
    const result = validateContext(
      ["", { id: "" }, { id: "valid", budgetTokens: -1 }],
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toContain("phase.context[0]: context id must be a non-empty string");
    expect(errors).toContain("phase.context[1].id: must be a non-empty string");
    expect(errors).toContain(
      "phase.context[2].budgetTokens: must be a positive integer",
    );
  });

  test("collects errors from multiple invalid array items without returning", () => {
    const errors: string[] = [];
    const result = validateContext(
      ["", 42, { id: "x", budgetTokens: 0 }],
      "phase.context",
      errors,
    );
    expect(result).toBeUndefined();
    expect(errors).toHaveLength(3);
  });
});
