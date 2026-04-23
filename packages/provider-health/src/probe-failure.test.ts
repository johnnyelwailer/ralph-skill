import { describe, expect, test } from "bun:test";
import { classifyProviderProbeFailure, errorMessage } from "./probe-failure.ts";

describe("classifyProviderProbeFailure", () => {
  test("classifies auth failures", () => {
    expect(classifyProviderProbeFailure(new Error("unauthorized: invalid api key"))).toBe("auth");
    expect(classifyProviderProbeFailure(new Error("HTTP 403 forbidden"))).toBe("auth");
  });

  test("classifies rate limit failures", () => {
    expect(classifyProviderProbeFailure(new Error("rate limit exceeded (429)"))).toBe("rate_limit");
    expect(classifyProviderProbeFailure(new Error("too many requests"))).toBe("rate_limit");
  });

  test("classifies timeout failures", () => {
    expect(classifyProviderProbeFailure(new Error("request timed out"))).toBe("timeout");
    expect(classifyProviderProbeFailure(new Error("ECONNRESET"))).toBe("timeout");
  });

  test("classifies concurrent-cap failures", () => {
    expect(classifyProviderProbeFailure(new Error("another session is already running"))).toBe(
      "concurrent_cap",
    );
  });

  test("falls back to unknown classification", () => {
    expect(classifyProviderProbeFailure(new Error("something went wrong"))).toBe("unknown");
  });

  test("classifies concurrent_cap with 'concurrent' keyword", () => {
    expect(classifyProviderProbeFailure(new Error("concurrent request limit reached"))).toBe("concurrent_cap");
  });

  test("auth keywords are case-insensitive", () => {
    expect(classifyProviderProbeFailure(new Error("UNAUTHORIZED"))).toBe("auth");
    expect(classifyProviderProbeFailure(new Error("403 Forbidden"))).toBe("auth");
    expect(classifyProviderProbeFailure(new Error("INVALID API KEY"))).toBe("auth");
  });

  test("timeout keywords are case-insensitive", () => {
    expect(classifyProviderProbeFailure(new Error("ETIMEDOUT"))).toBe("timeout");
    expect(classifyProviderProbeFailure(new Error("EAI_AGAIN"))).toBe("timeout");
  });

  test("classifies null as unknown (stringifies to 'null')", () => {
    expect(classifyProviderProbeFailure(null)).toBe("unknown");
  });

  test("classifies undefined as unknown (stringifies to 'undefined')", () => {
    expect(classifyProviderProbeFailure(undefined)).toBe("unknown");
  });

  test("classifies a plain object as unknown", () => {
    expect(classifyProviderProbeFailure({ code: "ERR_NETWORK" })).toBe("unknown");
  });

  test("classifies a number as unknown (does not contain error keywords)", () => {
    expect(classifyProviderProbeFailure(0)).toBe("unknown");
  });
});

describe("errorMessage", () => {
  test("extracts message from Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  test("returns string input as-is", () => {
    expect(errorMessage("oops")).toBe("oops");
  });

  test("stringifies non-error values", () => {
    expect(errorMessage({ code: 42 })).toContain("[object Object]");
  });
});
