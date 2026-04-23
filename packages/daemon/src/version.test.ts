import { describe, expect, test } from "bun:test";
import { VERSION } from "./version.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("VERSION", () => {
  test("is exported as a string", () => {
    expect(typeof VERSION).toBe("string");
  });

  test("matches the version field in package.json", () => {
    const packageJsonPath = resolve(import.meta.dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  test("is a non-empty string", () => {
    expect(VERSION.length).toBeGreaterThan(0);
  });

  test("matches the expected semver-like format", () => {
    // Format: major.minor.patch (e.g. "1.0.0", "0.9.3-beta")
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
  });
});
