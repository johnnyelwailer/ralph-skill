import { describe, expect, test } from "bun:test";
import { extractErrorMessage, isAbortError } from "./opencode-errors.ts";

// ─── extractErrorMessage ──────────────────────────────────────────────────────

describe("extractErrorMessage", () => {
  test("returns Error.message when error is an Error with a non-empty message", () => {
    const err = new Error("something went wrong");
    expect(extractErrorMessage(err)).toBe("something went wrong");
  });

  test("returns empty string when Error.message is empty", () => {
    // Edge case: Error with empty message falls through to other checks
    const err = new Error("");
    expect(extractErrorMessage(err)).toBe("opencode invocation failed");
  });

  test("returns string as-is when passed a non-empty string", () => {
    expect(extractErrorMessage("raw error string")).toBe("raw error string");
  });

  test("returns generic message when passed an empty string", () => {
    expect(extractErrorMessage("")).toBe("opencode invocation failed");
  });

  test("returns record.stderr when error is an object with non-empty stderr", () => {
    const err = { stderr: "server returned 500", data: {} };
    expect(extractErrorMessage(err)).toBe("server returned 500");
  });

  test("returns record.stdout when stderr is absent/empty but stdout is non-empty", () => {
    const err = { stdout: "server output here", data: {} };
    expect(extractErrorMessage(err)).toBe("server output here");
  });

  test("prefers stderr over stdout when both are present", () => {
    const err = { stderr: "error output", stdout: "normal output", data: {} };
    expect(extractErrorMessage(err)).toBe("error output");
  });

  test("returns data.message when record has no stderr/stdout but data.message exists", () => {
    const err = { data: { message: "inner error message" } };
    expect(extractErrorMessage(err)).toBe("inner error message");
  });

  test("prefers stderr > stdout > data.message > record.message", () => {
    // stderr wins
    expect(extractErrorMessage({ stderr: "e", stdout: "o", data: { message: "d" }, message: "r" })).toBe("e");
    // stdout wins over data.message
    expect(extractErrorMessage({ stdout: "o", data: { message: "d" }, message: "r" })).toBe("o");
    // data.message wins over record.message
    expect(extractErrorMessage({ data: { message: "d" }, message: "r" })).toBe("d");
    // record.message is fallback
    expect(extractErrorMessage({ message: "fallback" })).toBe("fallback");
  });

  test("returns generic message when error has no extractable message fields", () => {
    expect(extractErrorMessage({ code: 42 })).toBe("opencode invocation failed");
    expect(extractErrorMessage(null)).toBe("opencode invocation failed");
    expect(extractErrorMessage(undefined)).toBe("opencode invocation failed");
    expect(extractErrorMessage({})).toBe("opencode invocation failed");
  });

  test("prefers Error.message over record fields", () => {
    const err = new Error("error message");
    (err as Record<string, unknown>).stderr = "should not be used";
    (err as Record<string, unknown>).stdout = "should not be used";
    expect(extractErrorMessage(err)).toBe("error message");
  });

  test("string error takes precedence over record fields", () => {
    const err = "direct string error";
    expect(extractErrorMessage(err)).toBe("direct string error");
  });
});

// ─── isAbortError ─────────────────────────────────────────────────────────────

describe("isAbortError", () => {
  test("returns true for DOMException with AbortError name", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  test("returns true for DOMException with TimeoutError name", () => {
    const err = new DOMException("timed out", "TimeoutError");
    expect(isAbortError(err)).toBe(true);
  });

  test("returns true for Error with AbortError name", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  test("returns true for Error with TimeoutError name", () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    expect(isAbortError(err)).toBe(true);
  });

  test("returns false for Error with other names", () => {
    const err = new Error("network error");
    err.name = "NetworkError";
    expect(isAbortError(err)).toBe(false);
  });

  test("returns false for plain objects", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });

  test("returns false for null and undefined", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  test("returns false for strings", () => {
    expect(isAbortError("AbortError")).toBe(false);
  });

  test("returns false for numbers", () => {
    expect(isAbortError(42)).toBe(false);
  });
});
