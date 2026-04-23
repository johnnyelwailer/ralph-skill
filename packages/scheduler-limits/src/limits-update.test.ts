import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  loadBundledMigrations,
  migrate,
  PermitProjector,
  readAllEvents,
} from "@aloop/state-sqlite";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DAEMON_DEFAULTS,
  createConfigStore,
  resolveDaemonPaths,
  type ConfigStore,
} from "@aloop/daemon-config";
import { updateSchedulerLimits } from "./limits-update";

type Harness = {
  home: string;
  events: ReturnType<typeof createEventWriter>;
  config: ConfigStore;
  logPath: string;
  close(): Promise<void>;
};

function makeHarness(): Harness {
  const home = mkdtempSync(join(tmpdir(), "aloop-limits-update-"));
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const logPath = join(home, "aloopd.log");
  const store = new JsonlEventStore(logPath);
  const events = createEventWriter({
    db,
    store,
    projectors: [new EventCountsProjector(), new PermitProjector()],
    nextId: () => `evt_${crypto.randomUUID()}`,
  });
  const paths = resolveDaemonPaths({ ALOOP_HOME: home });
  const config = createConfigStore({
    daemon: DAEMON_DEFAULTS,
    overrides: { allow: null, deny: null, force: null },
    paths,
  });
  return { home, events, config, logPath, async close() { await store.close(); db.close(); } };
}

describe("updateSchedulerLimits", () => {
  let h: Harness;

  beforeEach(() => { h = makeHarness(); });
  afterEach(async () => { await h.close(); rmSync(h.home, { recursive: true, force: true }); });

  test("returns ok=true and emits scheduler.limits.changed event", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(7);
    }
    const events = await readAllEvents(h.logPath);
    expect(events.some((e) => e.topic === "scheduler.limits.changed")).toBe(true);
  });

  test("accepts snake_case patch fields", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      concurrency_cap: 5,
      permit_ttl_default_seconds: 300,
      permit_ttl_max_seconds: 1800,
      cpu_max_pct: 75,
      mem_max_pct: 80,
      load_max: 3.5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(5);
      expect(result.limits.permitTtlDefaultSeconds).toBe(300);
      expect(result.limits.permitTtlMaxSeconds).toBe(1800);
      expect(result.limits.systemLimits.cpuMaxPct).toBe(75);
      expect(result.limits.systemLimits.memMaxPct).toBe(80);
      expect(result.limits.systemLimits.loadMax).toBe(3.5);
    }
  });

  test("accepts camelCase patch fields", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      concurrencyCap: 9,
      permitTtlDefaultSeconds: 600,
      permitTtlMaxSeconds: 3600,
      cpuMaxPct: 90,
      memMaxPct: 95,
      loadMax: 8.0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(9);
      expect(result.limits.permitTtlDefaultSeconds).toBe(600);
      expect(result.limits.permitTtlMaxSeconds).toBe(3600);
      expect(result.limits.systemLimits.cpuMaxPct).toBe(90);
      expect(result.limits.systemLimits.memMaxPct).toBe(95);
      expect(result.limits.systemLimits.loadMax).toBe(8.0);
    }
  });

  test("accepts nested system_limits and burn_rate objects", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      system_limits: { cpu_max_pct: 70, memMaxPct: 85, load_max: 4.0 },
      burn_rate: { min_commits_per_hour: 2, maxTokensSinceCommit: 2_000_000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.systemLimits.cpuMaxPct).toBe(70);
      expect(result.limits.systemLimits.memMaxPct).toBe(85);
      expect(result.limits.systemLimits.loadMax).toBe(4.0);
      expect(result.limits.burnRate.minCommitsPerHour).toBe(2);
      expect(result.limits.burnRate.maxTokensSinceCommit).toBe(2_000_000);
    }
  });

  test("top-level field shadows nested system_limits.cpu_max_pct", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      cpu_max_pct: 60,
      system_limits: { cpu_max_pct: 85 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.limits.systemLimits.cpuMaxPct).toBe(60);
  });

  test("returns ok=false when patch has unknown top-level field", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { nope: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("unknown scheduler limits field");
    }
  });

  test("returns ok=false when system_limits has unknown nested field", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      system_limits: { nope: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("unknown scheduler.system_limits field");
    }
  });

  test("returns ok=false when burn_rate has unknown nested field", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      burn_rate: { nope: 1 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("unknown scheduler.burn_rate field");
    }
  });

  test("returns ok=false when system_limits is not a mapping", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      system_limits: "not-a-map",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("scheduler.system_limits: must be a mapping");
    }
  });

  test("returns ok=false when burn_rate is not a mapping", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      burn_rate: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("scheduler.burn_rate: must be a mapping");
    }
  });

  test("empty patch {} is a no-op — returns current limits without error", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {});
    // normalizeLimitsPatch always returns an object (with undefined values) for valid keys,
    // so {} is treated as a valid no-op patch — it succeeds and returns current limits.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(DAEMON_DEFAULTS.scheduler.concurrencyCap);
    }
  });

  test("returns ok=false when permit_ttl_default_seconds > permit_ttl_max_seconds", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      permit_ttl_default_seconds: 3600,
      permit_ttl_max_seconds: 1800,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("permit_ttl_default_seconds must be <= permit_ttl_max_seconds");
    }
  });

  test("updates in-memory config immediately (subsequent calls see new values)", async () => {
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 4 });
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 6 });
    expect(h.config.daemon().scheduler.concurrencyCap).toBe(6);
  });

  test("validates out-of-range cpu_max_pct through parseDaemonConfig step", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { cpu_max_pct: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("cpu_max_pct");
    }
  });

  test("burn_rate.max_tokens_since_commit top-level is rejected as unknown field", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      max_tokens_since_commit: 500_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("unknown scheduler limits field");
    }
  });

  test("top-level burn_rate: 42 (non-map) is rejected with mapping error", async () => {
    // Top-level burn_rate IS validated as a mapping in normalizeLimitsPatch (line ~90).
    // Unlike system_limits which silently ignores non-map values, burn_rate is enforced.
    const result = await updateSchedulerLimits(h.config, h.events, {
      burn_rate: 42 as unknown as Record<string, unknown>,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("scheduler.burn_rate: must be a mapping");
    }
  });

  test("burn_rate.min_commits_per_hour top-level is rejected as unknown field", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      min_commits_per_hour: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("unknown scheduler limits field");
    }
  });

  test("multiple updates accumulate (each emits its own event)", async () => {
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 2 });
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 3 });
    const events = await readAllEvents(h.logPath);
    const changedEvents = events.filter((e) => e.topic === "scheduler.limits.changed");
    expect(changedEvents.length).toBe(2);
  });
});
