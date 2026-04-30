import { describe, expect, test } from "bun:test";
import { pick } from "./daemon-mergers-pick.ts";

describe("pick", () => {
  test("returns the snake_case value when present", () => {
    const obj = { http_port: 8080 };
    expect(pick(obj, "http_port", "httpPort")).toBe(8080);
  });

  test("returns the camelCase value when snake_case is absent", () => {
    const obj = { httpPort: 8080 };
    expect(pick(obj, "http_port", "httpPort")).toBe(8080);
  });

  test("prefers snake_case over camelCase when both present", () => {
    const obj = { http_port: 9000, httpPort: 3000 };
    expect(pick(obj, "http_port", "httpPort")).toBe(9000);
  });

  test("returns undefined when neither key is present", () => {
    const obj = {};
    expect(pick(obj, "http_port", "httpPort")).toBeUndefined();
  });

  test("returns undefined when obj is empty regardless of keys", () => {
    expect(pick({}, "a", "b")).toBeUndefined();
  });

  test("works with numeric values", () => {
    const obj = { max_count: 10 };
    expect(pick(obj, "max_count", "maxCount")).toBe(10);
  });

  test("works with null values", () => {
    const obj = { setting: null };
    expect(pick(obj, "setting", "settingAlt")).toBeNull();
  });

  test("works with falsy values (0)", () => {
    const obj = { timeout: 0 };
    expect(pick(obj, "timeout", "timeoutMs")).toBe(0);
  });

  test("works with falsy values (empty string)", () => {
    const obj = { name: "" };
    expect(pick(obj, "name", "nameAlt")).toBe("");
  });

  test("snake key wins over absent camel key even with falsy value", () => {
    const obj = { http_port: 0 };
    expect(pick(obj, "http_port", "httpPort")).toBe(0);
  });
});
