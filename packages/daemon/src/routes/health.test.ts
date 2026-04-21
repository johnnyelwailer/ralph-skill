import { describe, expect, test } from "bun:test";
import { buildHealth } from "./health.ts";
import { VERSION } from "../version.ts";

describe("buildHealth", () => {
  test("returns canonical v1 shape", () => {
    const startedAt = Date.now() - 5000;
    const payload = buildHealth(startedAt);
    expect(payload._v).toBe(1);
    expect(payload.status).toBe("ok");
    expect(payload.version).toBe(VERSION);
    expect(payload.uptime_seconds).toBeGreaterThanOrEqual(5);
    expect(payload.uptime_seconds).toBeLessThan(10);
  });

  test("uptime_seconds is never negative", () => {
    const future = Date.now() + 60_000;
    const payload = buildHealth(future);
    expect(payload.uptime_seconds).toBe(0);
  });

  test("uptime_seconds floors fractional seconds", () => {
    const now = 10_000_999;
    const startedAt = 10_000_000;
    const payload = buildHealth(startedAt, now);
    expect(payload.uptime_seconds).toBe(0);
  });

  test("uptime_seconds counts elapsed whole seconds", () => {
    const now = 10_003_500;
    const startedAt = 10_000_000;
    const payload = buildHealth(startedAt, now);
    expect(payload.uptime_seconds).toBe(3);
  });
});
