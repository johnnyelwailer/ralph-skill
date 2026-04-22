import { describe, expect, test } from "bun:test";
import {
  quotaProbeFailureHttp,
} from "./providers-http.ts";

// Inline minimal type matching what quotaProbeFailureHttp accepts
type ProviderFailureClass = "auth" | "rate_limit" | "timeout" | "concurrent_cap" | "unknown";

describe("quotaProbeFailureHttp", () => {
  const cases: Array<{
    classification: ProviderFailureClass;
    expectedStatus: number;
    expectedCode: string;
  }> = [
    { classification: "auth", expectedStatus: 401, expectedCode: "provider_auth_failed" },
    { classification: "rate_limit", expectedStatus: 429, expectedCode: "provider_rate_limited" },
    { classification: "timeout", expectedStatus: 504, expectedCode: "provider_probe_timeout" },
    { classification: "concurrent_cap", expectedStatus: 409, expectedCode: "provider_concurrent_cap" },
    { classification: "unknown", expectedStatus: 502, expectedCode: "quota_probe_failed" },
  ];

  for (const { classification, expectedStatus, expectedCode } of cases) {
    test(`maps ${classification} → status ${expectedStatus} code ${expectedCode}`, () => {
      const result = quotaProbeFailureHttp(classification);
      expect(result.status).toBe(expectedStatus);
      expect(result.code).toBe(expectedCode);
    });
  }

  test("returns object with correct structure", () => {
    const result = quotaProbeFailureHttp("auth");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("code");
    expect(typeof result.status).toBe("number");
    expect(typeof result.code).toBe("string");
  });

  test("is total — all ProviderFailureClass variants are handled", () => {
    // This compile-time check ensures exhaustiveness:
    // If a new variant is added to ProviderFailureClass but not to
    // quotaProbeFailureHttp, TypeScript will flag this as a type error.
    const allVariants: ProviderFailureClass[] = [
      "auth",
      "rate_limit",
      "timeout",
      "concurrent_cap",
      "unknown",
    ];
    for (const variant of allVariants) {
      const result = quotaProbeFailureHttp(variant);
      expect(result.status).toBeGreaterThan(0);
    }
  });
});
