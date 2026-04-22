import { describe, expect, test } from "bun:test";
import { sanitizeProviderEnvironment } from "./opencode-runner.ts";

describe("sanitizeProviderEnvironment", () => {
  test("returns a copy of process.env as baseline", () => {
    const result = sanitizeProviderEnvironment(undefined);
    // All string-valued process.env entries must be present
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        expect(result[key]).toBe(value);
      }
    }
  });

  test("removes CLAUDECODE from the environment", () => {
    // Set a fake CLAUDECODE value for this test
    process.env.CLAUDECODE = "test-session-id";
    try {
      const result = sanitizeProviderEnvironment(undefined);
      expect(result.CLAUDECODE).toBeUndefined();
    } finally {
      delete process.env.CLAUDECODE;
    }
  });

  test("extra entries are layered on top of process.env", () => {
    const result = sanitizeProviderEnvironment({
      MY_CUSTOM_VAR: "custom-value",
      ANOTHER_VAR: "another",
    });
    expect(result.MY_CUSTOM_VAR).toBe("custom-value");
    expect(result.ANOTHER_VAR).toBe("another");
  });

  test("extra entries override process.env entries with the same key", () => {
    // Set a baseline in process.env, then override via extra
    process.env.EXISTING_VAR = "original";
    try {
      const result = sanitizeProviderEnvironment({
        EXISTING_VAR: "overridden",
      });
      expect(result.EXISTING_VAR).toBe("overridden");
    } finally {
      delete process.env.EXISTING_VAR;
    }
  });

  test("extra entries are applied after CLAUDECODE deletion, so extra can restore it", () => {
    // The function deletes CLAUDECODE first, then applies extra on top.
    // So if extra also contains CLAUDECODE, the extra value wins.
    const result = sanitizeProviderEnvironment({
      CLAUDECODE: "restored-from-extra",
    });
    expect(result.CLAUDECODE).toBe("restored-from-extra");
  });

  test("returns a plain object (not frozen or a proxy)", () => {
    const result = sanitizeProviderEnvironment(undefined);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    // Should be extensible
    (result as Record<string, string>).TEST = "ok";
    expect((result as Record<string, string>).TEST).toBe("ok");
  });
});
