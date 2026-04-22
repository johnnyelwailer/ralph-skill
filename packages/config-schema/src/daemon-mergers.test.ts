import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DAEMON_DEFAULTS,
  loadDaemonConfig,
} from "./daemon.ts";
import {
  mergeHttp,
  mergeWatchdog,
  mergeRetention,
  mergeLogging,
} from "./daemon-mergers.ts";

// We test the individual merger functions in isolation (unit tests),
// unlike daemon.test.ts which tests parseDaemonConfig end-to-end.

describe("mergeHttp", () => {
  test("returns defaults when input is undefined", () => {
    const errors: string[] = [];
    const result = mergeHttp(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and adds error when input is not a mapping", () => {
    const errors: string[] = [];
    const result = mergeHttp("not a mapping", errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toContain("http: must be a mapping");
  });

  test("returns defaults and adds error when input is null", () => {
    const errors: string[] = [];
    const result = mergeHttp(null, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toContain("http: must be a mapping");
  });

  test("returns defaults and adds error when input is an array", () => {
    const errors: string[] = [];
    const result = mergeHttp([{ port: 8080 }], errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toContain("http: must be a mapping");
  });

  test("accepts valid partial input and fills in remaining defaults", () => {
    const errors: string[] = [];
    const result = mergeHttp({ bind: "0.0.0.0", port: 9000 }, errors);
    expect(result.bind).toBe("0.0.0.0");
    expect(result.port).toBe(9000);
    expect(result.autostart).toBe(DAEMON_DEFAULTS.http.autostart);
    expect(errors).toHaveLength(0);
  });

  test("accepts all valid fields", () => {
    const errors: string[] = [];
    const result = mergeHttp({
      bind: "127.0.0.1",
      port: 7777,
      autostart: false,
    }, errors);
    expect(result.bind).toBe("127.0.0.1");
    expect(result.port).toBe(7777);
    expect(result.autostart).toBe(false);
    expect(errors).toHaveLength(0);
  });

  test("adds error for invalid port type (string)", () => {
    const errors: string[] = [];
    const result = mergeHttp({ port: "8080" }, errors);
    expect(result.port).toBe(DAEMON_DEFAULTS.http.port);
    expect(errors.some((e) => e.includes("http.port"))).toBe(true);
  });

  test("adds error for out-of-range port", () => {
    const errors: string[] = [];
    const result = mergeHttp({ port: 70000 }, errors);
    expect(result.port).toBe(DAEMON_DEFAULTS.http.port);
    expect(errors.some((e) => e.includes("http.port"))).toBe(true);
  });

  test("adds error for negative port", () => {
    const errors: string[] = [];
    const result = mergeHttp({ port: -1 }, errors);
    expect(result.port).toBe(DAEMON_DEFAULTS.http.port);
    expect(errors.some((e) => e.includes("http.port"))).toBe(true);
  });

  test("accepts port 0 (ephemeral)", () => {
    const errors: string[] = [];
    const result = mergeHttp({ port: 0 }, errors);
    expect(result.port).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("adds error for invalid bind type", () => {
    const errors: string[] = [];
    const result = mergeHttp({ bind: 123 }, errors);
    expect(result.bind).toBe(DAEMON_DEFAULTS.http.bind);
    expect(errors.some((e) => e.includes("http.bind"))).toBe(true);
  });

  test("adds error for invalid autostart type", () => {
    const errors: string[] = [];
    const result = mergeHttp({ autostart: "yes" }, errors);
    expect(result.autostart).toBe(DAEMON_DEFAULTS.http.autostart);
    expect(errors.some((e) => e.includes("http.autostart"))).toBe(true);
  });
});

describe("mergeWatchdog", () => {
  const def = DAEMON_DEFAULTS.watchdog;

  test("returns defaults when input is undefined", () => {
    const errors: string[] = [];
    const result = mergeWatchdog(undefined, errors);
    expect(result).toEqual(def);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and adds error when input is not a mapping", () => {
    const errors: string[] = [];
    const result = mergeWatchdog("not a mapping", errors);
    expect(result).toEqual(def);
    expect(errors).toContain("watchdog: must be a mapping");
  });

  test("accepts valid partial input", () => {
    const errors: string[] = [];
    const result = mergeWatchdog({ tick_interval: 90 }, errors);
    expect(result.tickIntervalSeconds).toBe(90);
    expect(result.stuckThresholdSeconds).toBe(def.stuckThresholdSeconds);
    expect(result.quotaPollIntervalSeconds).toBe(def.quotaPollIntervalSeconds);
    expect(errors).toHaveLength(0);
  });

  test("accepts camelCase variant of tickIntervalSeconds", () => {
    const errors: string[] = [];
    const result = mergeWatchdog({ tickIntervalSeconds: 120 }, errors);
    expect(result.tickIntervalSeconds).toBe(120);
    expect(errors).toHaveLength(0);
  });

  test("accepts all valid fields", () => {
    const errors: string[] = [];
    const result = mergeWatchdog({
      tick_interval: 45,
      stuck_threshold: 600,
      quota_poll_interval: 30,
    }, errors);
    expect(result.tickIntervalSeconds).toBe(45);
    expect(result.stuckThresholdSeconds).toBe(600);
    expect(result.quotaPollIntervalSeconds).toBe(30);
    expect(errors).toHaveLength(0);
  });

  test("accepts tick_interval of 0 (edge case — 0 is treated as valid by durationField)", () => {
    // durationField treats 0 as a valid non-negative integer, so mergeWatchdog
    // accepts it. The watchdog implementation clamps it to 1000ms minimum.
    const errors: string[] = [];
    const result = mergeWatchdog({ tick_interval: 0 }, errors);
    expect(result.tickIntervalSeconds).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("adds error for negative tick_interval", () => {
    const errors: string[] = [];
    const result = mergeWatchdog({ tick_interval: -10 }, errors);
    expect(result.tickIntervalSeconds).toBe(def.tickIntervalSeconds);
    expect(errors.some((e) => e.includes("watchdog.tick_interval"))).toBe(true);
  });

  test("adds error for non-duration tick_interval string", () => {
    const errors: string[] = [];
    const result = mergeWatchdog({ tick_interval: "soon" }, errors);
    expect(result.tickIntervalSeconds).toBe(def.tickIntervalSeconds);
    expect(errors.some((e) => e.includes("watchdog.tick_interval"))).toBe(true);
  });
});

describe("mergeRetention", () => {
  const def = DAEMON_DEFAULTS.retention;

  test("returns defaults when input is undefined", () => {
    const errors: string[] = [];
    const result = mergeRetention(undefined, errors);
    expect(result).toEqual(def);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and adds error when input is not a mapping", () => {
    const errors: string[] = [];
    const result = mergeRetention(42, errors);
    expect(result).toEqual(def);
    expect(errors).toContain("retention: must be a mapping");
  });

  test("accepts valid partial input", () => {
    const errors: string[] = [];
    const result = mergeRetention({ completed_sessions_days: 30 }, errors);
    expect(result.completedSessionsDays).toBe(30);
    expect(result.interruptedSessionsDays).toBe(def.interruptedSessionsDays);
    expect(result.abandonedSetupDays).toBe(def.abandonedSetupDays);
    expect(errors).toHaveLength(0);
  });

  test("accepts all valid fields", () => {
    const errors: string[] = [];
    const result = mergeRetention({
      completed_sessions_days: 14,
      interrupted_sessions_days: 7,
      abandoned_setup_days: 3,
    }, errors);
    expect(result.completedSessionsDays).toBe(14);
    expect(result.interruptedSessionsDays).toBe(7);
    expect(result.abandonedSetupDays).toBe(3);
    expect(errors).toHaveLength(0);
  });

  test("accepts camelCase variants", () => {
    const errors: string[] = [];
    const result = mergeRetention({
      completedSessionsDays: 21,
      interruptedSessionsDays: 10,
      abandonedSetupDays: 5,
    }, errors);
    expect(result.completedSessionsDays).toBe(21);
    expect(result.interruptedSessionsDays).toBe(10);
    expect(result.abandonedSetupDays).toBe(5);
    expect(errors).toHaveLength(0);
  });

  test("adds error for negative completed_sessions_days", () => {
    const errors: string[] = [];
    const result = mergeRetention({ completed_sessions_days: -1 }, errors);
    expect(result.completedSessionsDays).toBe(def.completedSessionsDays);
    expect(errors.some((e) => e.includes("retention.completed_sessions_days"))).toBe(true);
  });

  test("adds error for negative interrupted_sessions_days", () => {
    const errors: string[] = [];
    const result = mergeRetention({ interrupted_sessions_days: -5 }, errors);
    expect(result.interruptedSessionsDays).toBe(def.interruptedSessionsDays);
    expect(errors.some((e) => e.includes("retention.interrupted_sessions_days"))).toBe(true);
  });

  test("adds error for string value", () => {
    const errors: string[] = [];
    const result = mergeRetention({ completed_sessions_days: "30" }, errors);
    expect(result.completedSessionsDays).toBe(def.completedSessionsDays);
    expect(errors.some((e) => e.includes("retention.completed_sessions_days"))).toBe(true);
  });
});

describe("mergeLogging", () => {
  const def = DAEMON_DEFAULTS.logging;

  test("returns defaults when input is undefined", () => {
    const errors: string[] = [];
    const result = mergeLogging(undefined, errors);
    expect(result).toEqual(def);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and adds error when input is not a mapping", () => {
    const errors: string[] = [];
    const result = mergeLogging(123, errors);
    expect(result).toEqual(def);
    expect(errors).toContain("logging: must be a mapping");
  });

  test("returns defaults when input is empty mapping and no level specified", () => {
    const errors: string[] = [];
    const result = mergeLogging({}, errors);
    expect(result).toEqual(def);
    expect(errors).toHaveLength(0);
  });

  test("accepts all valid log levels", () => {
    const levels = ["debug", "info", "warn", "error"] as const;
    for (const level of levels) {
      const errors: string[] = [];
      const result = mergeLogging({ level }, errors);
      expect(result.level).toBe(level);
      expect(errors).toHaveLength(0);
    }
  });

  test("adds error for invalid log level string", () => {
    const errors: string[] = [];
    const result = mergeLogging({ level: "verbose" }, errors);
    expect(result.level).toBe(def.level);
    expect(errors.some((e) => e.includes("logging.level"))).toBe(true);
  });

  test("adds error for numeric log level", () => {
    const errors: string[] = [];
    const result = mergeLogging({ level: 3 }, errors);
    expect(result.level).toBe(def.level);
    expect(errors.some((e) => e.includes("logging.level"))).toBe(true);
  });

  test("adds error for object log level", () => {
    const errors: string[] = [];
    const result = mergeLogging({ level: { actual: "debug" } }, errors);
    expect(result.level).toBe(def.level);
    expect(errors.some((e) => e.includes("logging.level"))).toBe(true);
  });
});
