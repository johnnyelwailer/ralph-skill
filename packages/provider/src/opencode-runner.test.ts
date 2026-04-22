import { describe, expect, test } from "bun:test";
import { sanitizeProviderEnvironment } from "./opencode-runner.ts";

describe("sanitizeProviderEnvironment", () => {
  test("returns a copy of process.env (does not mutate original)", () => {
    const original = { ...process.env };
    const result = sanitizeProviderEnvironment(undefined);
    // result should have same keys as process.env (minus CLAUDECODE if present)
    // but must be a new object
    expect(result).not.toBe(process.env);
    expect(result).toEqual(expect.objectContaining(original));
  });

  test("deletes CLAUDECODE from the returned environment", () => {
    // Even if CLAUDECODE is in process.env, it must not appear in result
    const result = sanitizeProviderEnvironment(undefined);
    expect(result).not.toHaveProperty("CLAUDECODE");
  });

  test("accepts undefined extra env (returns sanitized process env)", () => {
    const result = sanitizeProviderEnvironment(undefined);
    expect(typeof result).toBe("object");
    expect(result).not.toHaveProperty("CLAUDECODE");
  });

  test("merges extra environment variables into the result", () => {
    const extra = {
      OPENAI_API_KEY: "sk-test-key",
      MY_CUSTOM_VAR: "custom-value",
    };
    const result = sanitizeProviderEnvironment(extra);
    expect(result.OPENAI_API_KEY).toBe("sk-test-key");
    expect(result.MY_CUSTOM_VAR).toBe("custom-value");
  });

  test("extra env CLAUDECODE overrides any inherited CLAUDECODE (caller's explicit choice is respected)", () => {
    // The function strips inherited CLAUDECODE from process.env but allows
    // callers to explicitly pass their own via extra — that is intentional.
    const extra = {
      CLAUDECODE: "caller-provided-token",
      OTHER_VAR: "present",
    };
    const result = sanitizeProviderEnvironment(extra);
    expect(result.CLAUDECODE).toBe("caller-provided-token");
    expect(result.OTHER_VAR).toBe("present");
  });

  test("extra env keys override matching process.env keys", () => {
    const extra = {
      PATH: "/custom/path",
      HOME: "/custom/home",
    };
    const result = sanitizeProviderEnvironment(extra);
    expect(result.PATH).toBe("/custom/path");
    expect(result.HOME).toBe("/custom/home");
  });

  test("extra env values are copied (not referenced)", () => {
    const extra = {
      MY_VAR: "original-value",
    };
    const result = sanitizeProviderEnvironment(extra);
    // Mutating extra after the call must not affect result
    extra.MY_VAR = "mutated-value";
    expect(result.MY_VAR).toBe("original-value");
  });

  test("non-string values in process.env are skipped", () => {
    // Bun's process.env can have non-string values in edge cases
    // The function explicitly checks typeof value !== "string" and skips
    const result = sanitizeProviderEnvironment(undefined);
    for (const [key, value] of Object.entries(result)) {
      expect(typeof value).toBe("string");
    }
  });
});
