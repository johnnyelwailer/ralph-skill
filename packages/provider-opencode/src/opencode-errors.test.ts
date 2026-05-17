import { describe, expect, test } from "bun:test";
import { createErrorChunk, extractErrorMessage, isAbortError } from "./opencode-errors.ts";

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
    (err as unknown as Record<string, unknown>).stderr = "should not be used";
    (err as unknown as Record<string, unknown>).stdout = "should not be used";
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

// ─── createErrorChunk ─────────────────────────────────────────────────────────

describe("createErrorChunk", () => {
  test("returns error chunk with timeout classification when timedOut is true", () => {
    const result = createErrorChunk(new Error("test"), true);
    expect(result.type).toBe("error");
    expect(result.content.classification).toBe("timeout");
    expect(result.content.retriable).toBe(true);
    expect(result.content.message).toBe("test");
  });

  test("returns error chunk with extracted message from Error", () => {
    const result = createErrorChunk(new Error("connection failed"), false);
    expect(result.type).toBe("error");
    expect(result.content.message).toBe("connection failed");
  });

  test("returns error chunk with extracted message from plain string", () => {
    const result = createErrorChunk("raw error string", false);
    expect(result.content.message).toBe("raw error string");
  });

  test("returns error chunk with extracted message from record.stderr", () => {
    const result = createErrorChunk({ stderr: "server error output" }, false);
    expect(result.content.message).toBe("server error output");
  });

  test("returns error chunk with extracted message from record.data.message", () => {
    const result = createErrorChunk({ data: { message: "inner error" } }, false);
    expect(result.content.message).toBe("inner error");
  });

  test("returns error chunk with unknown classification for unrecognized errors", () => {
    const result = createErrorChunk({ code: 42 }, false);
    expect(result.content.classification).toBe("unknown");
    expect(result.content.retriable).toBe(true);
  });

  test("returns rate_limit classification for rate limit errors", () => {
    const result = createErrorChunk({ stderr: "rate limit exceeded" }, false);
    expect(result.content.classification).toBe("rate_limit");
    expect(result.content.retriable).toBe(true);
  });

  test("returns auth classification for auth errors with non-retriable flag", () => {
    const result = createErrorChunk({ stderr: "unauthorized" }, false);
    expect(result.content.classification).toBe("auth");
    expect(result.content.retriable).toBe(false);
  });

  test("returns concurrent_cap classification for concurrent session errors", () => {
    const result = createErrorChunk({ stderr: "another session is already running" }, false);
    expect(result.content.classification).toBe("concurrent_cap");
    expect(result.content.retriable).toBe(true);
  });

  test("timedOut flag takes priority over error content", () => {
    const result = createErrorChunk({ stderr: "unauthorized" }, true);
    expect(result.content.classification).toBe("timeout");
    expect(result.content.retriable).toBe(true);
  });
});
