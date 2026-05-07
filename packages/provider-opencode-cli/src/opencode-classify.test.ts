import { describe, expect, test } from "bun:test";
import { classifyOpencodeFailure } from "./opencode-classify.ts";

describe("classifyOpencodeFailure", () => {
  describe("timeout classification", () => {
    test("returns timeout classification when timedOut is true", () => {
      const result = classifyOpencodeFailure({ timedOut: true });
      expect(result.classification).toBe("timeout");
      expect(result.retriable).toBe(true);
    });

    test("returns timeout when stderr contains 'timed out'", () => {
      const result = classifyOpencodeFailure({ stderr: "The request timed out" });
      expect(result.classification).toBe("timeout");
      expect(result.retriable).toBe(true);
    });

    test("returns timeout when stderr contains 'timeout'", () => {
      const result = classifyOpencodeFailure({ stderr: "socket timeout" });
      expect(result.classification).toBe("timeout");
      expect(result.retriable).toBe(true);
    });

    test("returns timeout when stderr contains 'etimedout'", () => {
      const result = classifyOpencodeFailure({ stderr: "ETIMEDOUT error" });
      expect(result.classification).toBe("timeout");
      expect(result.retriable).toBe(true);
    });

    test("timedOut flag takes priority over other signals", () => {
      const result = classifyOpencodeFailure({
        timedOut: true,
        stderr: "unauthorized rate limit concurrent",
      });
      expect(result.classification).toBe("timeout");
      expect(result.retriable).toBe(true);
    });
  });

  describe("rate_limit classification", () => {
    test("classifies 'rate limit' in stderr as rate_limit", () => {
      const result = classifyOpencodeFailure({ stderr: "rate limit exceeded" });
      expect(result.classification).toBe("rate_limit");
      expect(result.retriable).toBe(true);
    });

    test("classifies '429' in stderr as rate_limit", () => {
      const result = classifyOpencodeFailure({ stderr: "HTTP 429" });
      expect(result.classification).toBe("rate_limit");
      expect(result.retriable).toBe(true);
    });

    test("classifies 'quota' in stdout as rate_limit", () => {
      const result = classifyOpencodeFailure({ stdout: "quota exceeded" });
      expect(result.classification).toBe("rate_limit");
      expect(result.retriable).toBe(true);
    });

    test("classifies 'too many requests' as rate_limit", () => {
      const result = classifyOpencodeFailure({ stderr: "too many requests" });
      expect(result.classification).toBe("rate_limit");
      expect(result.retriable).toBe(true);
    });

    test("rate_limit from combined stderr+stdout text", () => {
      const result = classifyOpencodeFailure({ stderr: "stderr", stdout: "rate limit info" });
      expect(result.classification).toBe("rate_limit");
      expect(result.retriable).toBe(true);
    });
  });

  describe("auth classification", () => {
    test("classifies 'unauthorized' as auth", () => {
      const result = classifyOpencodeFailure({ stderr: "unauthorized access" });
      expect(result.classification).toBe("auth");
      expect(result.retriable).toBe(false);
    });

    test("classifies 'forbidden' as auth", () => {
      const result = classifyOpencodeFailure({ stderr: "403 forbidden" });
      expect(result.classification).toBe("auth");
      expect(result.retriable).toBe(false);
    });

    test("classifies 'invalid api key' as auth", () => {
      const result = classifyOpencodeFailure({ stderr: "invalid api key provided" });
      expect(result.classification).toBe("auth");
      expect(result.retriable).toBe(false);
    });

    test("classifies 'auth' keyword as auth", () => {
      const result = classifyOpencodeFailure({ stderr: "authentication failed" });
      expect(result.classification).toBe("auth");
      expect(result.retriable).toBe(false);
    });

    test("classifies insufficient balance as auth", () => {
      const result = classifyOpencodeFailure({
        stdout: '{"type":"error","error":{"type":"CreditsError","message":"Insufficient balance"}}',
      });
      expect(result.classification).toBe("auth");
      expect(result.retriable).toBe(false);
    });

    test("auth classification is non-retriable", () => {
      const result = classifyOpencodeFailure({ stderr: "unauthorized" });
      expect(result.retriable).toBe(false);
    });
  });

  describe("concurrent_cap classification", () => {
    test("classifies 'another session' as concurrent_cap", () => {
      const result = classifyOpencodeFailure({ stderr: "another session is already running" });
      expect(result.classification).toBe("concurrent_cap");
      expect(result.retriable).toBe(true);
    });

    test("classifies 'already running' as concurrent_cap", () => {
      const result = classifyOpencodeFailure({ stderr: "session already running" });
      expect(result.classification).toBe("concurrent_cap");
      expect(result.retriable).toBe(true);
    });

    test("classifies 'concurrent' as concurrent_cap", () => {
      const result = classifyOpencodeFailure({ stderr: "concurrent request limit reached" });
      expect(result.classification).toBe("concurrent_cap");
      expect(result.retriable).toBe(true);
    });
  });

  describe("unknown classification", () => {
    test("returns unknown when no pattern matches", () => {
      const result = classifyOpencodeFailure({ stderr: "something went wrong" });
      expect(result.classification).toBe("unknown");
      expect(result.retriable).toBe(true);
    });

    test("returns unknown for empty stderr and stdout", () => {
      const result = classifyOpencodeFailure({});
      expect(result.classification).toBe("unknown");
      expect(result.retriable).toBe(true);
    });

    test("returns unknown for undefined stderr and stdout", () => {
      const result = classifyOpencodeFailure({ timedOut: false });
      expect(result.classification).toBe("unknown");
      expect(result.retriable).toBe(true);
    });
  });

  describe("priority and ordering", () => {
    test("timeout takes priority over rate_limit", () => {
      const result = classifyOpencodeFailure({
        stderr: "rate limit timeout",
      });
      expect(result.classification).toBe("rate_limit");
    });

    test("timeout takes priority over auth", () => {
      const result = classifyOpencodeFailure({
        timedOut: true,
        stderr: "unauthorized timeout",
      });
      expect(result.classification).toBe("timeout");
    });

    test("auth takes priority over concurrent_cap", () => {
      const result = classifyOpencodeFailure({
        stderr: "unauthorized concurrent",
      });
      expect(result.classification).toBe("auth");
    });

    test("rate_limit takes priority over unknown", () => {
      const result = classifyOpencodeFailure({
        stderr: "rate limit and something else",
      });
      expect(result.classification).toBe("rate_limit");
    });
  });

  describe("case insensitivity", () => {
    test("keywords are matched case-insensitively", () => {
      expect(classifyOpencodeFailure({ stderr: "UNAUTHORIZED" }).classification).toBe("auth");
      expect(classifyOpencodeFailure({ stderr: "RATE LIMIT" }).classification).toBe("rate_limit");
      expect(classifyOpencodeFailure({ stderr: "TIMEOUT" }).classification).toBe("timeout");
      expect(classifyOpencodeFailure({ stderr: "CONCURRENT" }).classification).toBe("concurrent_cap");
    });
  });
});