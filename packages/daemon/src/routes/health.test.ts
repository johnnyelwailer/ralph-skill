import { describe, expect, test } from "bun:test";
import { buildHealth, type HealthPayload } from "./health.ts";
import { VERSION } from "../version.ts";

describe("buildHealth", () => {
  test("returns canonical v1 health envelope", () => {
    const now = Date.now();
    const result = buildHealth(now - 5000, now);

    expect(result._v).toBe(1);
    expect(result.status).toBe("ok");
    expect(result.version).toBe(VERSION);
    expect(typeof result.uptime_seconds).toBe("number");
  });

  test("computes correct uptime_seconds from startedAt and now", () => {
    const startedAt = Date.now() - 30_000; // 30 seconds ago
    const now = Date.now();
    const result = buildHealth(startedAt, now);

    // Allow 1 second tolerance for test execution time
    expect(result.uptime_seconds).toBeGreaterThanOrEqual(29);
    expect(result.uptime_seconds).toBeLessThanOrEqual(31);
  });

  test("uptime_seconds is zero when now equals startedAt", () => {
    const timestamp = Date.now();
    const result = buildHealth(timestamp, timestamp);

    expect(result.uptime_seconds).toBe(0);
  });

  test("uptime_seconds never goes negative", () => {
    // Simulate clock skew where `now` appears before `startedAt`
    const startedAt = Date.now();
    const earlier = startedAt - 1000;
    const result = buildHealth(startedAt, earlier);

    expect(result.uptime_seconds).toBe(0);
  });


});
