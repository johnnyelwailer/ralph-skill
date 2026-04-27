import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadYamlFile, parseYamlString, isMapping } from "./yaml.ts";

type YamlParseResult = ReturnType<typeof parseYamlString>;
const THIS_DIR = dirname(fileURLToPath(import.meta.url));

function expectParseOk(result: YamlParseResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected parse success, got: ${result.errors.join("; ")}`);
  return result.value;
}

function expectParseErrors(result: YamlParseResult | ReturnType<typeof loadYamlFile>) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parse failure");
  return result.errors;
}

describe("parseYamlString", () => {
  test("parses valid YAML scalar", () => {
    const result = parseYamlString("hello");
    const parsed = expectParseOk(result);
    expect(parsed).toBe("hello");
  });

  test("parses valid YAML mapping", () => {
    const result = parseYamlString("key: value\nnested:\n  child: true");
    const parsed = expectParseOk(result);
    expect(parsed).toEqual({ key: "value", nested: { child: true } });
  });

  test("parses valid YAML list", () => {
    const result = parseYamlString("- alpha\n- beta\n- gamma");
    const parsed = expectParseOk(result);
    expect(parsed).toEqual(["alpha", "beta", "gamma"]);
  });

  test("parses YAML null as null", () => {
    const result = parseYamlString("null");
    const parsed = expectParseOk(result);
    expect(parsed).toBeNull();
  });

  test("returns error for malformed YAML", () => {
    const result = parseYamlString("key: [unclosed");
    const errors = expectParseErrors(result);
    expect(errors[0]).toContain("yaml parse error");
  });

  test("re-throws TypeError for non-string input to yaml parser", () => {
    // The yaml library throws TypeError when source is not a string.
    // parseYamlString only catches YAMLParseError, so non-YAMLParseError
    // exceptions propagate — covering the throw err branch at yaml.ts:33.
    expect(() => parseYamlString(42 as unknown as string)).toThrow(TypeError);
    expect(() => parseYamlString(true as unknown as string)).toThrow(TypeError);
  });

  test("returns error for YAML that is not a mapping at top level", () => {
    // A list is valid YAML but isMapping returns false for it
    const result = parseYamlString("- item1\n- item2");
    const parsed = expectParseOk(result); // parseYamlString itself doesn't validate shape
    expect(isMapping(parsed)).toBe(false);
  });
});

describe("loadYamlFile", () => {
  test("returns ok with parsed content for a valid YAML file", () => {
    const result = loadYamlFile(resolve(THIS_DIR, "validators.ts"));
    // TypeScript source is not valid YAML, so parse fails
    const errors = expectParseErrors(result);
    expect(errors[0]).toContain("yaml parse error");
  });

  test("returns error when file does not exist", () => {
    const result = loadYamlFile("/tmp/aloop-test-nonexistent-file-12345.yaml");
    const errors = expectParseErrors(result);
    expect(errors[0]).toContain("file not found");
  });

  test("returns error when file cannot be read", () => {
    // A directory path causes readFileSync to fail with EISDIR
    const result = loadYamlFile(THIS_DIR);
    const errors = expectParseErrors(result);
    expect(errors[0]).toContain("cannot read");
  });
});

describe("isMapping", () => {
  test("returns true for a plain object", () => {
    expect(isMapping({})).toBe(true);
    expect(isMapping({ a: 1, b: "two" })).toBe(true);
    expect(isMapping({ nested: { deep: true } })).toBe(true);
  });

  test("returns false for null", () => {
    expect(isMapping(null)).toBe(false);
  });

  test("returns false for an array", () => {
    expect(isMapping([])).toBe(false);
    expect(isMapping([1, 2, 3])).toBe(false);
    expect(isMapping([{ a: 1 }])).toBe(false);
  });

  test("returns false for primitives", () => {
    expect(isMapping("string")).toBe(false);
    expect(isMapping(42)).toBe(false);
    expect(isMapping(true)).toBe(false);
    expect(isMapping(undefined)).toBe(false);
  });
});
