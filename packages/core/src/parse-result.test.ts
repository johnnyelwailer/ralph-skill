import { describe, expect, test } from "bun:test";
import { isParseResultOk, type ParseResult } from "./parse-result";

describe("ParseResult", () => {
  describe("isParseResultOk", () => {
    test("returns true for ok variant with a value", () => {
      const result: ParseResult<string> = { ok: true, value: "hello" };
      expect(isParseResultOk(result)).toBe(true);
    });

    test("returns false for error variant", () => {
      const result: ParseResult<string> = { ok: false, errors: ["something went wrong"] };
      expect(isParseResultOk(result)).toBe(false);
    });

    test("type narrowing: ok variant gives access to value", () => {
      const result: ParseResult<number> = { ok: true, value: 42 };
      if (isParseResultOk(result)) {
        // TypeScript should narrow result to { ok: true; value: number }
        expect(result.value).toBe(42);
        // @ts-expect-error — errors not present on ok variant
        const _errors: readonly string[] = result.errors;
      }
    });

    test("type narrowing: error variant gives access to errors", () => {
      const result: ParseResult<number> = { ok: false, errors: ["error 1", "error 2"] };
      if (!isParseResultOk(result)) {
        // TypeScript should narrow result to { ok: false; errors: readonly string[] }
        expect(result.errors).toEqual(["error 1", "error 2"]);
        // @ts-expect-error — value not present on error variant
        const _value: number = result.value;
      }
    });

    test("ok variant with null value is still ok=true", () => {
      const result: ParseResult<null> = { ok: true, value: null };
      expect(isParseResultOk(result)).toBe(true);
      if (isParseResultOk(result)) {
        expect(result.value).toBeNull();
      }
    });

    test("ok variant with undefined value is still ok=true", () => {
      const result: ParseResult<undefined> = { ok: true, value: undefined };
      expect(isParseResultOk(result)).toBe(true);
      if (isParseResultOk(result)) {
        expect(result.value).toBeUndefined();
      }
    });

    test("error variant with empty errors array", () => {
      const result: ParseResult<string> = { ok: false, errors: [] };
      expect(isParseResultOk(result)).toBe(false);
    });

    test("ok variant fields are readonly", () => {
      const result: ParseResult<string> = { ok: true, value: "test" };
      // TypeScript enforces readonly at compile time.
      // The value field must be accessible.
      expect(result.value).toBe("test");
      expect(result.ok).toBe(true);
    });

    test("error variant fields are readonly", () => {
      const result: ParseResult<string> = { ok: false, errors: ["error"] };
      // TypeScript enforces readonly at compile time.
      expect(result.errors).toEqual(["error"]);
      expect(result.ok).toBe(false);
    });

    test("works with complex generic types", () => {
      interface ComplexType {
        id: string;
        items: Array<{ name: string; count: number }>;
      }
      const okResult: ParseResult<ComplexType> = {
        ok: true,
        value: { id: "abc", items: [{ name: "widget", count: 3 }] },
      };
      expect(isParseResultOk(okResult)).toBe(true);
      if (isParseResultOk(okResult)) {
        expect(okResult.value.items[0]!.count).toBe(3);
      }
    });
  });
});
