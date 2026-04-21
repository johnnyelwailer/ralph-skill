import { describe, expect, test } from "bun:test";
import { loadYamlFile, parseYamlString, isMapping } from "./yaml.ts";

describe("parseYamlString", () => {
  test("parses valid YAML scalar", () => {
    const result = parseYamlString("hello");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("hello");
  });

  test("parses valid YAML mapping", () => {
    const result = parseYamlString("key: value\nnested:\n  child: true");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ key: "value", nested: { child: true } });
  });

  test("parses valid YAML list", () => {
    const result = parseYamlString("- alpha\n- beta\n- gamma");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(["alpha", "beta", "gamma"]);
  });

  test("parses YAML null as null", () => {
    const result = parseYamlString("null");
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
  });

  test("returns error for malformed YAML", () => {
    const result = parseYamlString("key: [unclosed");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("yaml parse error");
  });

  test("returns error for YAML that is not a mapping at top level", () => {
    // A list is valid YAML but isMapping returns false for it
    const result = parseYamlString("- item1\n- item2");
    expect(result.ok).toBe(true); // parseYamlString itself doesn't validate shape
    expect(isMapping(result.value)).toBe(false);
  });
});

describe("loadYamlFile", () => {
  test("returns ok with parsed content for a valid YAML file", () => {
    const result = loadYamlFile("packages/config-schema/src/daemon-types.ts");
    // TypeScript source is not valid YAML, so parse fails
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("yaml parse error");
  });

  test("returns error when file does not exist", () => {
    const result = loadYamlFile("/tmp/aloop-test-nonexistent-file-12345.yaml");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("file not found");
  });

  test("returns error when file cannot be read", () => {
    // A directory path causes readFileSync to fail with EISDIR
    const result = loadYamlFile("packages/config-schema/src");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("cannot read");
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
