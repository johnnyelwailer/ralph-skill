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
});
