import { describe, expect, test } from "bun:test";
import { pick } from "./daemon-mergers-pick.ts";

describe("pick", () => {
  test("returns value for snake_case key when present", () => {
    const obj = { max_tokens: 1000 };
    expect(pick(obj, "max_tokens", "maxTokens")).toBe(1000);
  });

  test("returns value for camelCase key when present", () => {
    const obj = { maxTokens: 2000 };
    expect(pick(obj, "max_tokens", "maxTokens")).toBe(2000);
  });

  test("prefers snake_case when both keys are present", () => {
    const obj = { max_tokens: 1000, maxTokens: 2000 };
    expect(pick(obj, "max_tokens", "maxTokens")).toBe(1000);
  });

  test("returns undefined when neither key exists", () => {
    const obj = { other_key: "foo" };
    expect(pick(obj, "max_tokens", "maxTokens")).toBeUndefined();
  });

  test("handles empty object", () => {
    expect(pick({}, "max_tokens", "maxTokens")).toBeUndefined();
  });

  test("works with boolean value", () => {
    expect(pick({ bool_val: true }, "bool_val", "boolVal")).toBe(true);
  });

  test("works with numeric zero value", () => {
    expect(pick({ num_val: 0 }, "num_val", "numVal")).toBe(0);
  });

  test("works with array value", () => {
    expect(pick({ arr_val: [1, 2] }, "arr_val", "arrVal")).toEqual([1, 2]);
  });

  test("works with object value", () => {
    const val = { nested: true };
    expect(pick({ obj_val: val }, "obj_val", "objVal")).toEqual(val);
  });
});
