import { describe, expect, test } from "bun:test";
import { makeSchedulerConfig } from "./scheduler-config.ts";
import type { ConfigStore, DaemonConfig } from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";

const BASE_DAEMON_CONFIG: DaemonConfig = {
  http: { bind: "127.0.0.1", port: 7777, autostart: true },
  watchdog: {
    tickIntervalSeconds: 15,
    stuckThresholdSeconds: 600,
    quotaPollIntervalSeconds: 60,
  },
  scheduler: {
    concurrencyCap: 3,
    permitTtlDefaultSeconds: 300,
    permitTtlMaxSeconds: 3600,
    systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
    burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
  },
  retention: {
    completedSessionsDays: 30,
    interruptedSessionsDays: 90,
    abandonedSetupDays: 14,
  },
  logging: { level: "info" },
  features: { daemonConfigWrite: false },
  contexts: {},
};

const DEFAULT_OVERRIDES = {
  allow: null as readonly string[] | null,
  deny: null as readonly string[] | null,
  force: null as string | null,
};

function mockConfigStore(
  schedulerOverrides?: Partial<DaemonConfig["scheduler"]>,
): ConfigStore {
  let daemonConfig: DaemonConfig = {
    ...BASE_DAEMON_CONFIG,
    scheduler: {
      ...BASE_DAEMON_CONFIG.scheduler,
      ...schedulerOverrides,
    },
  };
  return {
    daemon: () => daemonConfig,
    overrides: () => DEFAULT_OVERRIDES,
    paths: () => ({
      home: "/tmp/aloop-home",
      stateDir: "/tmp/aloop-home/state",
      logFile: "/tmp/aloop-home/state/aloopd.log",
      socketFile: "/tmp/aloop-home/aloopd.sock",
      pidFile: "/tmp/aloop-home/aloopd.pid",
      daemonConfigFile: "/tmp/aloop-home/daemon.yml",
      overridesFile: "/tmp/aloop-home/overrides.yml",
    }),
    reload: () => ({ ok: true, daemon: daemonConfig, overrides: DEFAULT_OVERRIDES }),
    setDaemon(next: DaemonConfig): DaemonConfig {
      daemonConfig = next;
      return daemonConfig;
    },
    setOverrides: () => DEFAULT_OVERRIDES,
  };
}

function mockEventWriter(): EventWriter {
  return {
    append: async <T>(topic: string, data: T) => ({
      _v: 1,
      id: "evt_test",
      timestamp: new Date(0).toISOString(),
      topic,
      data,
    }),
  };
}

describe("makeSchedulerConfig", () => {
  test("returns a SchedulerConfigView", () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    expect(typeof view.scheduler).toBe("function");
    expect(typeof view.overrides).toBe("function");
    expect(typeof view.updateLimits).toBe("function");
  });

  test("scheduler() delegates to config.daemon().scheduler", () => {
    const config = mockConfigStore({ concurrencyCap: 99 });
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    expect(view.scheduler().concurrencyCap).toBe(99);
  });

  test("scheduler() reads live config at call time", () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    // Initial value
    expect(view.scheduler().concurrencyCap).toBe(3);
    // Mutating via setDaemon reflects in scheduler()
    config.setDaemon({ ...config.daemon(), scheduler: { ...config.daemon().scheduler, concurrencyCap: 77 } });
    expect(view.scheduler().concurrencyCap).toBe(77);
  });

  test("overrides() returns the overrides from config", () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    expect(view.overrides()).toEqual(DEFAULT_OVERRIDES);
  });

  test("updateLimits with concurrency_cap: 7 succeeds", async () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    const result = await view.updateLimits({ concurrency_cap: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(7);
    }
  });

  test("updateLimits with unknown field returns errors", async () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    const result = await view.updateLimits({ nope: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test("updateLimits with empty patch is a no-op (ok, no fields changed)", async () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    const result = await view.updateLimits({});
    // normalizeLimitsPatch assigns undefined to all 8 fields for empty input,
    // so Object.keys(patch).length > 0 and the update proceeds as a no-op.
    expect(result.ok).toBe(true);
    if (result.ok) {
      // No fields were actually changed (all picks returned undefined)
      expect(result.limits).toBeDefined();
    }
  });

  test("multiple updateLimits calls are independent", async () => {
    const config = mockConfigStore();
    const events = mockEventWriter();
    const view = makeSchedulerConfig(config, events);
    const r1 = await view.updateLimits({ concurrency_cap: 4 });
    const r2 = await view.updateLimits({ concurrency_cap: 6 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.limits.concurrencyCap).toBe(4);
      expect(r2.limits.concurrencyCap).toBe(6);
    }
  });
});
