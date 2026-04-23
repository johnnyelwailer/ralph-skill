import { describe, expect, test } from "bun:test";
import { classifyOpencodeFailure } from "./opencode-classify.ts";

describe("classifyOpencodeFailure", () => {
  test("classifies rate limit errors", () => {
    const result = classifyOpencodeFailure({ stderr: "HTTP 429 rate limit exceeded" });
    expect(result.classification).toBe("rate_limit");
    expect(result.retriable).toBe(true);
  });

  test("classifies auth errors as non-retriable", () => {
    const result = classifyOpencodeFailure({ stderr: "unauthorized: invalid api key" });
    expect(result.classification).toBe("auth");
    expect(result.retriable).toBe(false);
  });

  test("classifies timeout", () => {
    const result = classifyOpencodeFailure({ timedOut: true });
    expect(result.classification).toBe("timeout");
  });

  test("falls back to unknown", () => {
    const result = classifyOpencodeFailure({ stderr: "unexpected failure" });
    expect(result.classification).toBe("unknown");
    expect(result.retriable).toBe(true);
  });

  test("classifies timeout via stderr 'timed out'", () => {
    const result = classifyOpencodeFailure({ stderr: "process timed out" });
    expect(result.classification).toBe("timeout");
    expect(result.retriable).toBe(true);
  });

  test("classifies timeout via stderr 'etimedout'", () => {
    const result = classifyOpencodeFailure({ stderr: "Error: etimedout" });
    expect(result.classification).toBe("timeout");
    expect(result.retriable).toBe(true);
  });

  test("classifies timeout via stderr 'timeout' (lowercase)", () => {
    const result = classifyOpencodeFailure({ stderr: "timeout: connection stalled" });
    expect(result.classification).toBe("timeout");
    expect(result.retriable).toBe(true);
  });

  test("classifies concurrent_cap via 'another session'", () => {
    const result = classifyOpencodeFailure({ stderr: "error: another session is already running" });
    expect(result.classification).toBe("concurrent_cap");
    expect(result.retriable).toBe(true);
  });

  test("classifies concurrent_cap via 'already running'", () => {
    const result = classifyOpencodeFailure({ stderr: "opencode: already running in another session" });
    expect(result.classification).toBe("concurrent_cap");
    expect(result.retriable).toBe(true);
  });

  test("classifies concurrent_cap via 'concurrent'", () => {
    const result = classifyOpencodeFailure({ stderr: "concurrent process limit reached" });
    expect(result.classification).toBe("concurrent_cap");
    expect(result.retriable).toBe(true);
  });

  test("classifies auth via 'forbidden'", () => {
    const result = classifyOpencodeFailure({ stderr: "403 forbidden" });
    expect(result.classification).toBe("auth");
    expect(result.retriable).toBe(false);
  });

  test("classifies auth via 'invalid api key'", () => {
    const result = classifyOpencodeFailure({ stderr: "invalid api key provided" });
    expect(result.classification).toBe("auth");
    expect(result.retriable).toBe(false);
  });

  test("classifies auth via generic 'auth'", () => {
    const result = classifyOpencodeFailure({ stderr: "authentication required" });
    expect(result.classification).toBe("auth");
    expect(result.retriable).toBe(false);
  });

  test("classification is case-insensitive", () => {
    const result = classifyOpencodeFailure({ stderr: "UNAUTHORIZED" });
    expect(result.classification).toBe("auth");
  });

  test("matches in stdout over stderr priority (text combined)", () => {
    // Both stderr and stdout are lowercased and concatenated; first match wins
    const result = classifyOpencodeFailure({ stderr: "normal output", stdout: "rate limit exceeded" });
    expect(result.classification).toBe("rate_limit");
  });

  test("timeout flag takes priority over stderr match", () => {
    // timedOut: true short-circuits before text check
    const result = classifyOpencodeFailure({ timedOut: true, stderr: "rate limit" });
    expect(result.classification).toBe("timeout");
  });

  test("rate_limit takes priority over timeout text match", () => {
    const result = classifyOpencodeFailure({ stderr: "429 timeout exceeded" });
    expect(result.classification).toBe("rate_limit");
  });
});
