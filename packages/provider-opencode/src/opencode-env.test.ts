import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildRuntimeEnvironment,
  resolveVariant,
  sanitizeProviderEnvironment,
  withTemporaryEnvironment,
} from "./opencode-env";

describe("sanitizeProviderEnvironment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Snapshot and restore process.env between tests
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("copies all string values from process.env", () => {
    process.env.FOO = "bar";
    process.env.PATH = "/usr/bin";
    process.env.NUMBER_NOT_STRING = "123";

    const result = sanitizeProviderEnvironment();

    expect(result.FOO).toBe("bar");
    expect(result.PATH).toBe("/usr/bin");
    expect(result.NUMBER_NOT_STRING).toBe("123");
  });

  test("excludes CLAUDECODE from the copied environment", () => {
    process.env.CLAUDECODE = "secret-token";
    process.env.OTHER_VAR = "kept";

    const result = sanitizeProviderEnvironment();

    expect(result.CLAUDECODE).toBeUndefined();
    expect(result.OTHER_VAR).toBe("kept");
  });

  test("applies extra overrides after copying process.env", () => {
    process.env.EXISTING = "original";
    process.env.NEW_VAR = "should-be-overwritten";

    const result = sanitizeProviderEnvironment({
      EXISTING: "overridden",
      NEW_VAR: "added",
      EXTRA: "brand-new",
    });

    expect(result.EXISTING).toBe("overridden");
    expect(result.NEW_VAR).toBe("added");
    expect(result.EXTRA).toBe("brand-new");
  });

  test("returns a plain object not connected to process.env", () => {
    const result = sanitizeProviderEnvironment();
    result.SHOULD_NOT_AFFECT_PROCESS_ENV = "isolated";
    expect(process.env.SHOULD_NOT_AFFECT_PROCESS_ENV).toBeUndefined();
  });

  test("handles undefined extra (no-op)", () => {
    process.env.VAR_ONE = "a";

    const result = sanitizeProviderEnvironment(undefined);

    expect(result.VAR_ONE).toBe("a");
  });
});

describe("buildRuntimeEnvironment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("sets AUTH_HANDLE from input", () => {
    const result = buildRuntimeEnvironment({
      sessionId: "s_test",
      authHandle: "user@example.com",
      cwd: "/project",
    });

    expect(result.AUTH_HANDLE).toBe("user@example.com");
  });

  test("sets ALOOP_SESSION_ID from input", () => {
    const result = buildRuntimeEnvironment({
      sessionId: "s_abc123",
      authHandle: "user",
      cwd: "/project",
    });

    expect(result.ALOOP_SESSION_ID).toBe("s_abc123");
  });

  test("sets ALOOP_PROJECT_PATH and ALOOP_WORKTREE to cwd", () => {
    const result = buildRuntimeEnvironment({
      sessionId: "s_test",
      authHandle: "user",
      cwd: "/home/user/my-project",
    });

    expect(result.ALOOP_PROJECT_PATH).toBe("/home/user/my-project");
    expect(result.ALOOP_WORKTREE).toBe("/home/user/my-project");
  });

  test("extra environment variables are merged and can override built-ins", () => {
    const result = buildRuntimeEnvironment({
      sessionId: "s_test",
      authHandle: "user",
      cwd: "/project",
      environment: {
        CUSTOM_VAR: "custom-value",
        AUTH_HANDLE: "overridden@example.com",
      },
    });

    expect(result.AUTH_HANDLE).toBe("overridden@example.com");
    expect(result.CUSTOM_VAR).toBe("custom-value");
  });

  test("copies existing process.env entries excluding CLAUDECODE", () => {
    process.env.KEEP_ME = "preserved";
    process.env.CLAUDECODE = "should-be-removed";

    const result = buildRuntimeEnvironment({
      sessionId: "s_test",
      authHandle: "user",
      cwd: "/project",
    });

    expect(result.KEEP_ME).toBe("preserved");
    expect(result.CLAUDECODE).toBeUndefined();
  });

  test("extra environment takes precedence over process.env entries", () => {
    process.env.EXISTING = "original";

    const result = buildRuntimeEnvironment({
      sessionId: "s_test",
      authHandle: "user",
      cwd: "/project",
      environment: {
        EXISTING: "from-extra",
      },
    });

    expect(result.EXISTING).toBe("from-extra");
  });
});

describe("withTemporaryEnvironment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clean up any test-specific keys
    delete process.env.TEST_SET_VAR;
    delete process.env.TEST_REMOVE_VAR;
    delete process.env.TEST_RESTORE_VAR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("sets env vars during fn execution and restores after", async () => {
    const result = await withTemporaryEnvironment(
      { TEST_SET_VAR: "temp-value" },
      [],
      async () => {
        expect(process.env.TEST_SET_VAR).toBe("temp-value");
        return "success";
      },
    );

    expect(result).toBe("success");
    expect(process.env.TEST_SET_VAR).toBeUndefined();
  });

  test("removes specified keys during fn execution and restores after", async () => {
    process.env.TEST_REMOVE_VAR = "original-value";

    const result = await withTemporaryEnvironment(
      {},
      ["TEST_REMOVE_VAR"],
      async () => {
        expect(process.env.TEST_REMOVE_VAR).toBeUndefined();
        return "removed";
      },
    );

    expect(result).toBe("removed");
    expect(process.env.TEST_REMOVE_VAR).toBe("original-value");
  });

  test("restores original value even if fn throws", async () => {
    process.env.TEST_RESTORE_VAR = "preserved";

    await expect(
      withTemporaryEnvironment(
        { TEST_RESTORE_VAR: "should-be-removed" },
        [],
        async () => {
          throw new Error("test error");
        },
      ),
    ).rejects.toThrow("test error");

    expect(process.env.TEST_RESTORE_VAR).toBe("preserved");
  });

  test("set and remove can be combined", async () => {
    process.env.EXISTING = "original";
    process.env.TO_REMOVE = "delete-me";

    await withTemporaryEnvironment(
      { NEW_VAR: "added", EXISTING: "overridden" },
      ["TO_REMOVE"],
      async () => {
        expect(process.env.NEW_VAR).toBe("added");
        expect(process.env.EXISTING).toBe("overridden");
        expect(process.env.TO_REMOVE).toBeUndefined();
      },
    );

    expect(process.env.EXISTING).toBe("original");
    expect(process.env.TO_REMOVE).toBe("delete-me");
    expect(process.env.NEW_VAR).toBeUndefined();
  });

  test("handles removing a key that was never set", async () => {
    // Ensure it's not set
    delete process.env.NON_EXISTENT_VAR;

    await withTemporaryEnvironment(
      {},
      ["NON_EXISTENT_VAR"],
      async () => {
        expect(process.env.NON_EXISTENT_VAR).toBeUndefined();
      },
    );

    // Should remain unset
    expect(process.env.NON_EXISTENT_VAR).toBeUndefined();
  });

  test("set keys that overlap with remove keys — remove wins during fn, key absent after", async () => {
    // When a key is in both setValues and removeKeys, the remove loop runs after
    // the set loop, so the key is DELETED (not set) during fn execution.
    await withTemporaryEnvironment(
      { OVERLAP: "temp" },
      ["OVERLAP"],
      async () => {
        // removeKeys delete runs after setValues assignment, so key is absent
        expect(process.env.OVERLAP).toBeUndefined();
      },
    );

    // After fn, OVERLAP is not restored (it was never in the original env)
    expect(process.env.OVERLAP).toBeUndefined();
  });
});

describe("resolveVariant", () => {
  test("returns undefined for undefined reasoningEffort", () => {
    expect(resolveVariant(undefined)).toBeUndefined();
  });

  test("returns undefined for 'none'", () => {
    expect(resolveVariant("none")).toBeUndefined();
  });

  test("returns 'max' for 'xhigh'", () => {
    expect(resolveVariant("xhigh")).toBe("max");
  });

  test("returns the input value for all other reasoning effort strings", () => {
    expect(resolveVariant("low")).toBe("low");
    expect(resolveVariant("medium")).toBe("medium");
    expect(resolveVariant("high")).toBe("high");
  });
});
