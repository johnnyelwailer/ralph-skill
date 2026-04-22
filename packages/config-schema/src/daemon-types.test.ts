import { describe, expect, test } from "bun:test";
import { DAEMON_DEFAULTS, type DaemonConfig } from "./daemon-types.ts";

function isDaemonConfig(val: unknown): val is DaemonConfig {
  if (typeof val !== "object" || val === null) return false;
  const o = val as Record<string, unknown>;
  return (
    typeof o.http === "object" &&
    typeof o.scheduler === "object" &&
    typeof o.watchdog === "object" &&
    typeof o.retention === "object" &&
    typeof o.logging === "object"
  );
}

describe("DAEMON_DEFAULTS", () => {
  test("DAEMON_DEFAULTS is a valid DaemonConfig", () => {
    expect(isDaemonConfig(DAEMON_DEFAULTS)).toBe(true);
  });

  describe("http", () => {
    test("bind defaults to 127.0.0.1", () => {
      expect(DAEMON_DEFAULTS.http.bind).toBe("127.0.0.1");
    });

    test("port defaults to 7777", () => {
      expect(DAEMON_DEFAULTS.http.port).toBe(7777);
    });

    test("autostart defaults to true", () => {
      expect(DAEMON_DEFAULTS.http.autostart).toBe(true);
    });
  });

  describe("scheduler", () => {
    test("concurrencyCap defaults to 3", () => {
      expect(DAEMON_DEFAULTS.scheduler.concurrencyCap).toBe(3);
    });

    test("permitTtlDefaultSeconds defaults to 600", () => {
      expect(DAEMON_DEFAULTS.scheduler.permitTtlDefaultSeconds).toBe(600);
    });

    test("permitTtlMaxSeconds defaults to 3600", () => {
      expect(DAEMON_DEFAULTS.scheduler.permitTtlMaxSeconds).toBe(3600);
    });

    test("permitTtlMaxSeconds is greater than permitTtlDefaultSeconds", () => {
      expect(DAEMON_DEFAULTS.scheduler.permitTtlMaxSeconds)
        .toBeGreaterThan(DAEMON_DEFAULTS.scheduler.permitTtlDefaultSeconds);
    });

    describe("systemLimits", () => {
      test("cpuMaxPct defaults to 80", () => {
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.cpuMaxPct).toBe(80);
      });

      test("memMaxPct defaults to 85", () => {
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.memMaxPct).toBe(85);
      });

      test("loadMax defaults to 4.0", () => {
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.loadMax).toBe(4.0);
      });

      test("cpuMaxPct is between 0 and 100", () => {
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.cpuMaxPct).toBeGreaterThan(0);
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.cpuMaxPct).toBeLessThanOrEqual(100);
      });

      test("memMaxPct is between 0 and 100", () => {
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.memMaxPct).toBeGreaterThan(0);
        expect(DAEMON_DEFAULTS.scheduler.systemLimits.memMaxPct).toBeLessThanOrEqual(100);
      });
    });

    describe("burnRate", () => {
      test("maxTokensSinceCommit defaults to 1_000_000", () => {
        expect(DAEMON_DEFAULTS.scheduler.burnRate.maxTokensSinceCommit).toBe(1_000_000);
      });

      test("minCommitsPerHour defaults to 1", () => {
        expect(DAEMON_DEFAULTS.scheduler.burnRate.minCommitsPerHour).toBe(1);
      });

      test("minCommitsPerHour is positive", () => {
        expect(DAEMON_DEFAULTS.scheduler.burnRate.minCommitsPerHour).toBeGreaterThan(0);
      });
    });
  });

  describe("watchdog", () => {
    test("tickIntervalSeconds defaults to 15", () => {
      expect(DAEMON_DEFAULTS.watchdog.tickIntervalSeconds).toBe(15);
    });

    test("stuckThresholdSeconds defaults to 600", () => {
      expect(DAEMON_DEFAULTS.watchdog.stuckThresholdSeconds).toBe(600);
    });

    test("quotaPollIntervalSeconds defaults to 60", () => {
      expect(DAEMON_DEFAULTS.watchdog.quotaPollIntervalSeconds).toBe(60);
    });

    test("stuckThresholdSeconds is greater than tickIntervalSeconds", () => {
      expect(DAEMON_DEFAULTS.watchdog.stuckThresholdSeconds)
        .toBeGreaterThan(DAEMON_DEFAULTS.watchdog.tickIntervalSeconds);
    });
  });

  describe("retention", () => {
    test("completedSessionsDays defaults to 30", () => {
      expect(DAEMON_DEFAULTS.retention.completedSessionsDays).toBe(30);
    });

    test("interruptedSessionsDays defaults to 90", () => {
      expect(DAEMON_DEFAULTS.retention.interruptedSessionsDays).toBe(90);
    });

    test("abandonedSetupDays defaults to 14", () => {
      expect(DAEMON_DEFAULTS.retention.abandonedSetupDays).toBe(14);
    });

    test("interruptedSessionsDays is greater than completedSessionsDays", () => {
      expect(DAEMON_DEFAULTS.retention.interruptedSessionsDays)
        .toBeGreaterThan(DAEMON_DEFAULTS.retention.completedSessionsDays);
    });

    test("completedSessionsDays is greater than abandonedSetupDays", () => {
      expect(DAEMON_DEFAULTS.retention.completedSessionsDays)
        .toBeGreaterThan(DAEMON_DEFAULTS.retention.abandonedSetupDays);
    });
  });

  describe("logging", () => {
    test("level defaults to info", () => {
      expect(DAEMON_DEFAULTS.logging.level).toBe("info");
    });

    test("level is a valid log level", () => {
      const validLevels = ["debug", "info", "warn", "error"] as const;
      expect(validLevels).toContain(DAEMON_DEFAULTS.logging.level);
    });
  });
});
