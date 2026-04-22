import { describe, expect, test } from "bun:test";
import { classifyProviderProbeFailure, errorMessage } from "./probe-failure.ts";

describe("classifyProviderProbeFailure", () => {
  test("classifies auth failures", () => {
    expect(classifyProviderProbeFailure(new Error("unauthorized: invalid api key"))).toBe("auth");
  });

  test("classifies rate limit failures", () => {
    expect(classifyProviderProbeFailure(new Error("rate limit exceeded (429)"))).toBe("rate_limit");
  });

  test("classifies timeout failures", () => {
    expect(classifyProviderProbeFailure(new Error("request timed out"))).toBe("timeout");
  });

  test("classifies concurrent-cap failures", () => {
    expect(classifyProviderProbeFailure(new Error("another session is already running"))).toBe(
      "concurrent_cap",
    );
  });

  test("falls back to unknown classification", () => {
    expect(classifyProviderProbeFailure(new Error("something went wrong"))).toBe("unknown");
  });
});

describe("errorMessage", () => {
  test("extracts message from Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  test("returns string input as-is", () => {
    expect(errorMessage("plain string")).toBe("plain string");
  });

  test("stringifies non-error values", () => {
    expect(errorMessage(404)).toBe("404");
  });
});
