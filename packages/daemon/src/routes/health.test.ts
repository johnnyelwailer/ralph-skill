import { describe, expect, test } from "bun:test";
import { buildHealth, type HealthCounters } from "./health.ts";
import { VERSION } from "../version.ts";

describe("buildHealth", () => {
  test("returns _v of 1", () => {
    const result = buildHealth(Date.now() - 60_000);
    expect(result._v).toBe(1);
  });

  test("returns status 'ok'", () => {
    const result = buildHealth(Date.now() - 60_000);
    expect(result.status).toBe("ok");
  });

  test("returns the VERSION constant", () => {
    const result = buildHealth(Date.now() - 60_000);
    expect(result.version).toBe(VERSION);
  });

  test("uptime_seconds is floor of (now - startedAt) / 1000", () => {
    const startedAt = Date.now() - 123_456; // 123.456 seconds ago
    const result = buildHealth(startedAt, startedAt + 123_456);
    expect(result.uptime_seconds).toBe(123);
  });

  test("uptime_seconds is 0 when now equals startedAt", () => {
    const now = Date.now();
    const result = buildHealth(now, now);
    expect(result.uptime_seconds).toBe(0);
  });

  test("uptime_seconds is 0 when now is before startedAt (clock skew)", () => {
    const startedAt = Date.now();
    const before = startedAt - 1_000;
    const result = buildHealth(startedAt, before);
    expect(result.uptime_seconds).toBe(0);
  });

  test("uses provided now parameter over Date.now()", () => {
    const startedAt = 1_700_000_000_000; // fixed point
    const fixedNow = startedAt + 90_000; // 90 seconds later
    const result = buildHealth(startedAt, fixedNow);
    expect(result.uptime_seconds).toBe(90);
  });

  test("defaults now to Date.now() when not provided", () => {
    const before = Date.now();
    const result = buildHealth(before);
    const after = Date.now();
    // uptime_seconds should be at least 0 and at most a few seconds
    expect(result.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(result.uptime_seconds).toBeLessThanOrEqual(5);
  });

  describe("counters transformation", () => {
    test("defaults to zero counters when counters is undefined", () => {
      const result = buildHealth(Date.now() - 60_000, Date.now(), undefined);
      expect(result.counters).toEqual({
        sessions_total: 0,
        sessions_by_status: {},
        permits_in_flight: 0,
      });
    });

    test("defaults to zero counters when counters is null", () => {
      const result = buildHealth(Date.now() - 60_000, Date.now(), null);
      expect(result.counters).toEqual({
        sessions_total: 0,
        sessions_by_status: {},
        permits_in_flight: 0,
      });
    });

    test("maps sessionsTotal to sessions_total", () => {
      const counters: HealthCounters = {
        sessionsTotal: 42,
        sessionsByStatus: {},
        permitsInFlight: 0,
      };
      const result = buildHealth(Date.now() - 60_000, Date.now(), counters);
      expect(result.counters.sessions_total).toBe(42);
    });

    test("maps sessionsByStatus to sessions_by_status", () => {
      const counters: HealthCounters = {
        sessionsTotal: 3,
        sessionsByStatus: { running: 2, stopped: 1 },
        permitsInFlight: 5,
      };
      const result = buildHealth(Date.now() - 60_000, Date.now(), counters);
      expect(result.counters.sessions_by_status).toEqual({ running: 2, stopped: 1 });
    });

    test("maps permitsInFlight to permits_in_flight", () => {
      const counters: HealthCounters = {
        sessionsTotal: 0,
        sessionsByStatus: {},
        permitsInFlight: 7,
      };
      const result = buildHealth(Date.now() - 60_000, Date.now(), counters);
      expect(result.counters.permits_in_flight).toBe(7);
    });

    test("maps all counter fields together", () => {
      const counters: HealthCounters = {
        sessionsTotal: 10,
        sessionsByStatus: { active: 6, idle: 4 },
        permitsInFlight: 3,
      };
      const result = buildHealth(Date.now() - 60_000, Date.now(), counters);
      expect(result.counters).toEqual({
        sessions_total: 10,
        sessions_by_status: { active: 6, idle: 4 },
        permits_in_flight: 3,
      });
    });
  });
});