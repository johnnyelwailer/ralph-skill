import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAEMON_DEFAULTS, loadDaemonConfig, parseDaemonConfig } from "./daemon.ts";

describe("parseDaemonConfig", () => {
  test("returns defaults for empty/null input", () => {
    expect(parseDaemonConfig(null)).toEqual({ ok: true, value: DAEMON_DEFAULTS });
    expect(parseDaemonConfig(undefined)).toEqual({ ok: true, value: DAEMON_DEFAULTS });
    expect(parseDaemonConfig({})).toEqual({ ok: true, value: DAEMON_DEFAULTS });
  });

  test("rejects non-mapping at top level", () => {
    const r = parseDaemonConfig([1, 2]);
    expect(r.ok).toBe(false);
  });

  test("rejects unknown top-level fields fail-loud", () => {
    const r = parseDaemonConfig({ http: { port: 8080 }, mystery: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e: string) => e.includes("unknown top-level field: mystery")),
      ).toBe(true);
    }
  });

  test("merges http overrides while keeping other defaults", () => {
    const r = parseDaemonConfig({ http: { port: 8080, bind: "0.0.0.0" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.http.port).toBe(8080);
      expect(r.value.http.bind).toBe("0.0.0.0");
      expect(r.value.http.autostart).toBe(DAEMON_DEFAULTS.http.autostart);
      expect(r.value.scheduler).toEqual(DAEMON_DEFAULTS.scheduler);
    }
  });

  test("port: null means 'pick available' (0)", () => {
    const r = parseDaemonConfig({ http: { port: null } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.http.port).toBe(0);
  });

  test("port: out of range rejected", () => {
    const r = parseDaemonConfig({ http: { port: 70000 } });
    expect(r.ok).toBe(false);
  });

  test("scheduler accepts both snake_case and camelCase keys", () => {
    const r = parseDaemonConfig({
      scheduler: { concurrency_cap: 5, permitTtlDefaultSeconds: 900 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.scheduler.concurrencyCap).toBe(5);
      expect(r.value.scheduler.permitTtlDefaultSeconds).toBe(900);
      expect(r.value.scheduler.permitTtlMaxSeconds).toBe(
        DAEMON_DEFAULTS.scheduler.permitTtlMaxSeconds,
      );
    }
  });

  test("scheduler: rejects negative concurrency_cap", () => {
    const r = parseDaemonConfig({ scheduler: { concurrency_cap: 0 } });
    expect(r.ok).toBe(false);
  });

  test("system_limits.cpu_max_pct enforces 0-100 range", () => {
    expect(parseDaemonConfig({ scheduler: { system_limits: { cpu_max_pct: 150 } } }).ok).toBe(
      false,
    );
    expect(parseDaemonConfig({ scheduler: { system_limits: { cpu_max_pct: -1 } } }).ok).toBe(
      false,
    );
    const r = parseDaemonConfig({ scheduler: { system_limits: { cpu_max_pct: 75 } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scheduler.systemLimits.cpuMaxPct).toBe(75);
  });

  test("watchdog accepts duration strings", () => {
    const r = parseDaemonConfig({
      watchdog: { tick_interval: "30s", stuck_threshold: "5m", quota_poll_interval: "1h" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.watchdog.tickIntervalSeconds).toBe(30);
      expect(r.value.watchdog.stuckThresholdSeconds).toBe(300);
      expect(r.value.watchdog.quotaPollIntervalSeconds).toBe(3600);
    }
  });

  test("watchdog accepts numeric duration as seconds", () => {
    const r = parseDaemonConfig({ watchdog: { tick_interval: 45 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.watchdog.tickIntervalSeconds).toBe(45);
  });

  test("watchdog rejects malformed duration string", () => {
    const r = parseDaemonConfig({ watchdog: { tick_interval: "soon" } });
    expect(r.ok).toBe(false);
  });

  test("retention enforces non-negative integers", () => {
    expect(
      parseDaemonConfig({ retention: { completed_sessions_days: -1 } }).ok,
    ).toBe(false);
    const r = parseDaemonConfig({ retention: { completed_sessions_days: 0 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.retention.completedSessionsDays).toBe(0);
  });

  test("logging.level enum enforced", () => {
    expect(parseDaemonConfig({ logging: { level: "verbose" } }).ok).toBe(false);
    const r = parseDaemonConfig({ logging: { level: "debug" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.logging.level).toBe("debug");
  });

  test("collects multiple errors across sections", () => {
    const r = parseDaemonConfig({
      http: { port: 99999 },
      scheduler: { concurrency_cap: -1 },
      logging: { level: "loud" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("loadDaemonConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-cfg-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns defaults when file does not exist", () => {
    const r = loadDaemonConfig(join(dir, "missing.yml"));
    expect(r).toEqual({ ok: true, value: DAEMON_DEFAULTS });
  });

  test("parses an existing file", () => {
    const path = join(dir, "daemon.yml");
    writeFileSync(path, "http:\n  port: 8888\n  bind: 0.0.0.0\n");
    const r = loadDaemonConfig(path);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.http.port).toBe(8888);
      expect(r.value.http.bind).toBe("0.0.0.0");
    }
  });

  test("propagates yaml parse errors", () => {
    const path = join(dir, "bad.yml");
    writeFileSync(path, "http: [bad");
    const r = loadDaemonConfig(path);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("yaml parse error");
  });
});
