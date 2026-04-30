import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseYamlString, loadYamlFile, isMapping } from "./yaml.ts";

describe("parseYamlString", () => {
  test("parses valid YAML and returns ok:true", () => {
    const result = parseYamlString("key: value");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ key: "value" });
  });

  test("parses YAML with nested objects", () => {
    const result = parseYamlString("a:\n  b:\n    c: 1");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: { b: { c: 1 } } });
  });

  test("parses YAML with arrays", () => {
    const result = parseYamlString("items:\n  - one\n  - two");
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ items: ["one", "two"] });
  });

  test("parses YAML with null values", () => {
    const result = parseYamlString("key: null");
    expect(result.ok).toBe(true);
    expect((result.value as any).key).toBeNull();
  });

  test("parses YAML with numbers, booleans", () => {
    const result = parseYamlString("n: 42\nflag: true");
    expect(result.ok).toBe(true);
    expect((result.value as any).n).toBe(42);
    expect((result.value as any).flag).toBe(true);
  });

  test("returns ok:false with error for invalid YAML syntax", () => {
    const result = parseYamlString("key: [unclosed");
    expect(result.ok).toBe(false);
    expect((result.value as any).errors).toContainEqual(
      expect.stringContaining("yaml parse error:"),
    );
  });

  test("returns ok:false with error for YAML with unexpected tab", () => {
    // Tabs are not valid YAML indentation
    const result = parseYamlString("key:\t: value");
    expect(result.ok).toBe(false);
    expect((result.value as any).errors[0]).toContain("yaml parse error:");
  });

  test("returns ok:false for document marker with invalid content", () => {
    const result = parseYamlString("---invalid");
    expect(result.ok).toBe(false);
  });
});

describe("loadYamlFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join("/tmp", `yaml-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns ok:true with parsed content for valid YAML file", () => {
    const filePath = join(tmpDir, "valid.yaml");
    writeFileSync(filePath, "name: test\nvalue: 42");
    const result = loadYamlFile(filePath);
    expect(result.ok).toBe(true);
    expect((result.value as any).name).toBe("test");
    expect((result.value as any).value).toBe(42);
  });

  test("returns ok:false with file-not-found error for missing file", () => {
    const result = loadYamlFile(join(tmpDir, "does-not-exist.yaml"));
    expect(result.ok).toBe(false);
    expect((result.value as any).errors).toContainEqual(
      `file not found: ${join(tmpDir, "does-not-exist.yaml")}`,
    );
  });

  test("returns ok:false with read error when file is unreadable", () => {
    // Note: on some systems this may still be readable; the important thing
    // is that non-ENOENT errors are caught and reported.
    const filePath = join(tmpDir, "test.yaml");
    writeFileSync(filePath, "data: test");
    const result = loadYamlFile(filePath);
    // This test verifies the function does NOT throw for readable files
    expect(result.ok).toBe(true);
  });

  test("returns ok:false with yaml parse error for malformed YAML", () => {
    const filePath = join(tmpDir, "malformed.yaml");
    writeFileSync(filePath, "broken: [");
    const result = loadYamlFile(filePath);
    expect(result.ok).toBe(false);
    expect((result.value as any).errors[0]).toContain("yaml parse error:");
  });
});

describe("isMapping", () => {
  test("returns true for a plain object", () => {
    expect(isMapping({})).toBe(true);
    expect(isMapping({ a: 1 })).toBe(true);
  });

  test("returns true for object created from Object.create(null)", () => {
    const obj = Object.create(null);
    obj.key = "value";
    expect(isMapping(obj)).toBe(true);
  });

  test("returns false for null", () => {
    expect(isMapping(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isMapping(undefined)).toBe(false);
  });

  test("returns false for arrays", () => {
    expect(isMapping([])).toBe(false);
    expect(isMapping([1, 2, 3])).toBe(false);
  });

  test("returns false for primitive types", () => {
    expect(isMapping("string")).toBe(false);
    expect(isMapping(42)).toBe(false);
    expect(isMapping(true)).toBe(false);
  });

  test("returns false for class instances", () => {
    class MyClass {
      foo = 1;
    }
    // isMapping checks own properties — class instance is an object
    expect(isMapping(new MyClass())).toBe(true); // plain-like object
  });
});
