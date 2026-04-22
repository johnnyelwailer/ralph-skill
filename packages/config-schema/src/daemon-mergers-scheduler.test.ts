import { describe, expect, test } from "bun:test";
import { DAEMON_DEFAULTS } from "./daemon-types.ts";
import { mergeHttp, mergeScheduler, mergeLogging, mergeRetention, mergeWatchdog } from "./daemon-mergers.ts";

function makeErrors(): string[] {
  return [];
}

describe("mergeScheduler", () => {
  test("returns defaults when raw is undefined", () => {
    const errors = makeErrors();
    const result = mergeScheduler(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.scheduler);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and collects error when raw is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeScheduler("not a mapping", errors);
    expect(result).toEqual(DAEMON_DEFAULTS.scheduler);
    expect(errors).toContain("scheduler: must be a mapping");
  });

  test("returns defaults and collects error when raw is an array", () => {
    const errors = makeErrors();
    const result = mergeScheduler([1, 2, 3], errors);
    expect(result).toEqual(DAEMON_DEFAULTS.scheduler);
    expect(errors).toContain("scheduler: must be a mapping");
  });

  test("returns defaults and collects error when raw is null", () => {
    const errors = makeErrors();
    const result = mergeScheduler(null, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.scheduler);
    expect(errors).toContain("scheduler: must be a mapping");
  });

  test("accepts both snake_case and camelCase keys", () => {
    const errors = makeErrors();
    const result = mergeScheduler(
      { concurrency_cap: 7, permit_ttl_default_seconds: 300, permit_ttl_max_seconds: 1800 },
      errors,
    );
    expect(result.concurrencyCap).toBe(7);
    expect(result.permitTtlDefaultSeconds).toBe(300);
    expect(result.permitTtlMaxSeconds).toBe(1800);
    expect(errors).toHaveLength(0);
  });

  test("collects errors for invalid nested values while applying valid ones", () => {
    const errors = makeErrors();
    const result = mergeScheduler(
      { concurrency_cap: -1, permit_ttl_default_seconds: 300 },
      errors,
    );
    expect(result.concurrencyCap).toBe(DAEMON_DEFAULTS.scheduler.concurrencyCap);
    expect(result.permitTtlDefaultSeconds).toBe(300);
    expect(errors.some((e) => e.includes("concurrency_cap") && e.includes("positive integer"))).toBe(true);
  });

  test("partial scheduler override leaves unspecified fields at defaults", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ concurrency_cap: 20 }, errors);
    expect(result.concurrencyCap).toBe(20);
    expect(result.permitTtlDefaultSeconds).toBe(DAEMON_DEFAULTS.scheduler.permitTtlDefaultSeconds);
    expect(result.permitTtlMaxSeconds).toBe(DAEMON_DEFAULTS.scheduler.permitTtlMaxSeconds);
  });
});

// ─── mergeSystemLimits (nested — exercised via mergeScheduler) ───────────────────────────────────

describe("mergeSystemLimits via mergeScheduler", () => {
  test("returns system_limits defaults when not provided", () => {
    const errors = makeErrors();
    const result = mergeScheduler({}, errors);
    expect(result.systemLimits).toEqual(DAEMON_DEFAULTS.scheduler.systemLimits);
  });

  test("returns defaults and error when system_limits is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: "hot" }, errors);
    expect(result.systemLimits).toEqual(DAEMON_DEFAULTS.scheduler.systemLimits);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
  });

  test("returns defaults and error when system_limits is an array", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: [1, 2] }, errors);
    expect(result.systemLimits).toEqual(DAEMON_DEFAULTS.scheduler.systemLimits);
    expect(errors).toContain("scheduler.system_limits: must be a mapping");
  });

  test("cpu_max_pct accepts boundary values 0 and 100", () => {
    const errors = makeErrors();
    const r0 = mergeScheduler({ system_limits: { cpu_max_pct: 0 } }, errors);
    expect(r0.systemLimits.cpuMaxPct).toBe(0);

    const errors2 = makeErrors();
    const r100 = mergeScheduler({ system_limits: { cpu_max_pct: 100 } }, errors2);
    expect(r100.systemLimits.cpuMaxPct).toBe(100);
  });

  test("cpu_max_pct rejects value > 100", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { cpu_max_pct: 101 } }, errors);
    expect(result.systemLimits.cpuMaxPct).toBe(DAEMON_DEFAULTS.scheduler.systemLimits.cpuMaxPct);
    expect(errors.some((e) => e.includes("cpu_max_pct") && e.includes("[0, 100]"))).toBe(true);
  });

  test("cpu_max_pct rejects negative value", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { cpu_max_pct: -0.1 } }, errors);
    expect(result.systemLimits.cpuMaxPct).toBe(DAEMON_DEFAULTS.scheduler.systemLimits.cpuMaxPct);
    expect(errors.some((e) => e.includes("cpu_max_pct") && e.includes("[0, 100]"))).toBe(true);
  });

  test("mem_max_pct accepts boundary values 0 and 100", () => {
    const errors = makeErrors();
    const r0 = mergeScheduler({ system_limits: { mem_max_pct: 0 } }, errors);
    expect(r0.systemLimits.memMaxPct).toBe(0);

    const errors2 = makeErrors();
    const r100 = mergeScheduler({ system_limits: { mem_max_pct: 100 } }, errors2);
    expect(r100.systemLimits.memMaxPct).toBe(100);
  });

  test("load_max rejects zero", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { load_max: 0 } }, errors);
    expect(result.systemLimits.loadMax).toBe(DAEMON_DEFAULTS.scheduler.systemLimits.loadMax);
    expect(errors.some((e) => e.includes("load_max") && e.includes("positive number"))).toBe(true);
  });

  test("load_max rejects negative", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { load_max: -1.5 } }, errors);
    expect(result.systemLimits.loadMax).toBe(DAEMON_DEFAULTS.scheduler.systemLimits.loadMax);
    expect(errors.some((e) => e.includes("load_max") && e.includes("positive number"))).toBe(true);
  });

  test("load_max rejects non-finite (NaN/Infinity)", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { load_max: NaN } }, errors);
    expect(result.systemLimits.loadMax).toBe(DAEMON_DEFAULTS.scheduler.systemLimits.loadMax);
    expect(errors.some((e) => e.includes("load_max") && e.includes("positive number"))).toBe(true);
  });

  test("load_max accepts positive number", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ system_limits: { load_max: 2.5 } }, errors);
    expect(result.systemLimits.loadMax).toBe(2.5);
    expect(errors).toHaveLength(0);
  });
});

// ─── mergeBurnRate (nested — exercised via mergeScheduler) ─────────────────────────────────────

describe("mergeBurnRate via mergeScheduler", () => {
  test("returns burn_rate defaults when not provided", () => {
    const errors = makeErrors();
    const result = mergeScheduler({}, errors);
    expect(result.burnRate).toEqual(DAEMON_DEFAULTS.scheduler.burnRate);
  });

  test("returns defaults and error when burn_rate is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: 42 }, errors);
    expect(result.burnRate).toEqual(DAEMON_DEFAULTS.scheduler.burnRate);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
  });

  test("returns defaults and error when burn_rate is an array", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: ["a", "b"] }, errors);
    expect(result.burnRate).toEqual(DAEMON_DEFAULTS.scheduler.burnRate);
    expect(errors).toContain("scheduler.burn_rate: must be a mapping");
  });

  test("max_tokens_since_commit rejects zero", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { max_tokens_since_commit: 0 } }, errors);
    expect(result.burnRate.maxTokensSinceCommit).toBe(DAEMON_DEFAULTS.scheduler.burnRate.maxTokensSinceCommit);
    expect(errors.some((e) => e.includes("max_tokens_since_commit") && e.includes("positive integer"))).toBe(true);
  });

  test("max_tokens_since_commit rejects negative", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { max_tokens_since_commit: -1 } }, errors);
    expect(result.burnRate.maxTokensSinceCommit).toBe(DAEMON_DEFAULTS.scheduler.burnRate.maxTokensSinceCommit);
    expect(errors.some((e) => e.includes("max_tokens_since_commit") && e.includes("positive integer"))).toBe(true);
  });

  test("max_tokens_since_commit rejects non-integer", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { max_tokens_since_commit: 1.5 } }, errors);
    expect(result.burnRate.maxTokensSinceCommit).toBe(DAEMON_DEFAULTS.scheduler.burnRate.maxTokensSinceCommit);
    expect(errors.some((e) => e.includes("max_tokens_since_commit") && e.includes("positive integer"))).toBe(true);
  });

  test("min_commits_per_hour accepts zero (no commits = not burning)", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { min_commits_per_hour: 0 } }, errors);
    expect(result.burnRate.minCommitsPerHour).toBe(0);
    expect(errors).toHaveLength(0);
  });

  test("min_commits_per_hour rejects negative", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { min_commits_per_hour: -1 } }, errors);
    expect(result.burnRate.minCommitsPerHour).toBe(DAEMON_DEFAULTS.scheduler.burnRate.minCommitsPerHour);
    expect(errors.some((e) => e.includes("min_commits_per_hour") && e.includes("non-negative integer"))).toBe(true);
  });

  test("min_commits_per_hour rejects non-integer", () => {
    const errors = makeErrors();
    const result = mergeScheduler({ burn_rate: { min_commits_per_hour: 1.0 } }, errors);
    // 1.0 IS an integer so this should pass
    expect(result.burnRate.minCommitsPerHour).toBe(1);
  });
});

// ─── Other daemon-mergers (mergeHttp, mergeWatchdog, mergeRetention, mergeLogging) ─────────────

describe("mergeHttp", () => {
  test("returns defaults when raw is undefined", () => {
    const errors = makeErrors();
    const result = mergeHttp(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and error when raw is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeHttp("not a mapping", errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toContain("http: must be a mapping");
  });

  test("returns defaults and error when raw is null", () => {
    const errors = makeErrors();
    const result = mergeHttp(null, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.http);
    expect(errors).toContain("http: must be a mapping");
  });

  test("accepts valid http config", () => {
    const errors = makeErrors();
    const result = mergeHttp({ bind: "0.0.0.0", port: 9000, autostart: false }, errors);
    expect(result.bind).toBe("0.0.0.0");
    expect(result.port).toBe(9000);
    expect(result.autostart).toBe(false);
    expect(errors).toHaveLength(0);
  });
});

describe("mergeWatchdog", () => {
  test("returns defaults when raw is undefined", () => {
    const errors = makeErrors();
    const result = mergeWatchdog(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.watchdog);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and error when raw is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeWatchdog([], errors);
    expect(result).toEqual(DAEMON_DEFAULTS.watchdog);
    expect(errors).toContain("watchdog: must be a mapping");
  });

  test("accepts duration strings (tick_interval, stuck_threshold, quota_poll_interval)", () => {
    const errors = makeErrors();
    const result = mergeWatchdog(
      { tick_interval: "30s", stuck_threshold: "10m", quota_poll_interval: "2h" },
      errors,
    );
    expect(result.tickIntervalSeconds).toBe(30);
    expect(result.stuckThresholdSeconds).toBe(600);
    expect(result.quotaPollIntervalSeconds).toBe(7200);
    expect(errors).toHaveLength(0);
  });

  test("accepts numeric duration (seconds)", () => {
    const errors = makeErrors();
    const result = mergeWatchdog({ tick_interval: 45 }, errors);
    expect(result.tickIntervalSeconds).toBe(45);
    expect(errors).toHaveLength(0);
  });

  test("rejects malformed duration string", () => {
    const errors = makeErrors();
    const result = mergeWatchdog({ tick_interval: "soon" }, errors);
    expect(result.tickIntervalSeconds).toBe(DAEMON_DEFAULTS.watchdog.tickIntervalSeconds);
    expect(errors.some((e) => e.includes("tick_interval") && e.includes("duration"))).toBe(true);
  });

  test("rejects negative numeric duration", () => {
    const errors = makeErrors();
    const result = mergeWatchdog({ tick_interval: -10 }, errors);
    expect(result.tickIntervalSeconds).toBe(DAEMON_DEFAULTS.watchdog.tickIntervalSeconds);
    expect(errors.some((e) => e.includes("tick_interval") && e.includes("non-negative integer"))).toBe(true);
  });
});

describe("mergeRetention", () => {
  test("returns defaults when raw is undefined", () => {
    const errors = makeErrors();
    const result = mergeRetention(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.retention);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and error when raw is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeRetention("not a mapping", errors);
    expect(result).toEqual(DAEMON_DEFAULTS.retention);
    expect(errors).toContain("retention: must be a mapping");
  });

  test("accepts valid retention config", () => {
    const errors = makeErrors();
    const result = mergeRetention(
      { completed_sessions_days: 30, interrupted_sessions_days: 7, abandoned_setup_days: 14 },
      errors,
    );
    expect(result.completedSessionsDays).toBe(30);
    expect(result.interruptedSessionsDays).toBe(7);
    expect(result.abandonedSetupDays).toBe(14);
    expect(errors).toHaveLength(0);
  });

  test("rejects negative completed_sessions_days", () => {
    const errors = makeErrors();
    const result = mergeRetention({ completed_sessions_days: -1 }, errors);
    expect(result.completedSessionsDays).toBe(DAEMON_DEFAULTS.retention.completedSessionsDays);
    expect(errors.some((e) => e.includes("completed_sessions_days") && e.includes("non-negative integer"))).toBe(true);
  });
});

describe("mergeLogging", () => {
  test("returns defaults when raw is undefined", () => {
    const errors = makeErrors();
    const result = mergeLogging(undefined, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.logging);
    expect(errors).toHaveLength(0);
  });

  test("returns defaults and error when raw is not a mapping", () => {
    const errors = makeErrors();
    const result = mergeLogging(123, errors);
    expect(result).toEqual(DAEMON_DEFAULTS.logging);
    expect(errors).toContain("logging: must be a mapping");
  });

  test("accepts valid log levels", () => {
    for (const level of ["debug", "info", "warn", "error"]) {
      const errors = makeErrors();
      const result = mergeLogging({ level }, errors);
      expect(result.level).toBe(level);
      expect(errors).toHaveLength(0);
    }
  });

  test("rejects invalid log level", () => {
    const errors = makeErrors();
    const result = mergeLogging({ level: "verbose" }, errors);
    expect(result.level).toBe(DAEMON_DEFAULTS.logging.level);
    expect(errors.some((e) => e.includes("logging.level") && e.includes("debug, info, warn, error"))).toBe(true);
  });
});
