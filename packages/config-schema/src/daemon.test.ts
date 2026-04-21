import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAEMON_DEFAULTS, daemonConfigToRaw, loadDaemonConfig, parseDaemonConfig, saveDaemonConfig } from "./daemon.ts";

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

describe("daemonConfigToRaw", () => {
  test("converts full config to snake_case raw object", () => {
    const raw = daemonConfigToRaw(DAEMON_DEFAULTS);
    expect(raw.http).toEqual({
      bind: "127.0.0.1",
      port: 7777,
      autostart: true,
    });
    expect(raw.scheduler).toEqual({
      concurrency_cap: 3,
      permit_ttl_default_seconds: 600,
      permit_ttl_max_seconds: 3600,
      system_limits: {
        cpu_max_pct: 80,
        mem_max_pct: 85,
        load_max: 4.0,
      },
      burn_rate: {
        max_tokens_since_commit: 1_000_000,
        min_commits_per_hour: 1,
      },
    });
    expect(raw.watchdog).toEqual({
      tick_interval: 15,
      stuck_threshold: 600,
      quota_poll_interval: 60,
    });
    expect(raw.retention).toEqual({
      completed_sessions_days: 30,
      interrupted_sessions_days: 90,
      abandoned_setup_days: 14,
    });
    expect(raw.logging).toEqual({ level: "info" });
  });

  test("uses canonical snake_case keys throughout", () => {
    const raw = daemonConfigToRaw(DAEMON_DEFAULTS);
    // Verify no camelCase leaks through
    const flat = JSON.stringify(raw);
    expect(flat).not.toContain("camel");
    expect(flat).not.toContain("concurrencyCap");
    expect(flat).not.toContain("permitTtl");
    expect(flat).not.toContain("cpuMaxPct");
    expect(flat).not.toContain("tickIntervalSeconds");
  });

  test("round-trips through parseDaemonConfig identically", () => {
    const raw = daemonConfigToRaw(DAEMON_DEFAULTS);
    const reParsed = parseDaemonConfig(raw);
    expect(reParsed.ok).toBe(true);
    if (reParsed.ok) {
      expect(reParsed.value).toEqual(DAEMON_DEFAULTS);
    }
  });
});

describe("saveDaemonConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-save-cfg-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes a valid YAML file that can be re-loaded", () => {
    const path = join(dir, "saved.yml");
    saveDaemonConfig(path, DAEMON_DEFAULTS);
    const reLoaded = loadDaemonConfig(path);
    expect(reLoaded.ok).toBe(true);
    if (reLoaded.ok) {
      expect(reLoaded.value).toEqual(DAEMON_DEFAULTS);
    }
  });

  test("round-trips a modified config", () => {
    const path = join(dir, "modified.yml");
    const modified: typeof DAEMON_DEFAULTS = {
      ...DAEMON_DEFAULTS,
      http: { ...DAEMON_DEFAULTS.http, port: 9999, bind: "0.0.0.0" },
      scheduler: {
        ...DAEMON_DEFAULTS.scheduler,
        concurrencyCap: 10,
        permitTtlDefaultSeconds: 300,
      },
    };
    saveDaemonConfig(path, modified);
    const reLoaded = loadDaemonConfig(path);
    expect(reLoaded.ok).toBe(true);
    if (reLoaded.ok) {
      expect(reLoaded.value.http.port).toBe(9999);
      expect(reLoaded.value.http.bind).toBe("0.0.0.0");
      expect(reLoaded.value.scheduler.concurrencyCap).toBe(10);
      expect(reLoaded.value.scheduler.permitTtlDefaultSeconds).toBe(300);
    }
  });
});
