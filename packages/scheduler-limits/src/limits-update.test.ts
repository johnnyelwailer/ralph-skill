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
      concurrencyCap: 7,
      permitTtlDefaultSeconds: 600,
      permitTtlMaxSeconds: 3600,
      cpuMaxPct: 90,
      memMaxPct: 95,
      loadMax: 8.0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(7);
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

  test("validates out-of-range cpu_max_pct through bounds check", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { cpu_max_pct: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
    }
  });

  test("burn_rate.max_tokens_since_commit top-level is accepted as alternative to nested", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      max_tokens_since_commit: 500_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.limits.burnRate.maxTokensSinceCommit).toBe(500_000);
  });

  test("burn_rate.min_commits_per_hour top-level is accepted as alternative to nested", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      min_commits_per_hour: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.limits.burnRate.minCommitsPerHour).toBe(5);
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

  test("multiple updates accumulate (each emits its own event)", async () => {
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 2 });
    await updateSchedulerLimits(h.config, h.events, { concurrency_cap: 3 });
    const events = await readAllEvents(h.logPath);
    const changedEvents = events.filter((e) => e.topic === "scheduler.limits.changed");
    expect(changedEvents.length).toBe(2);
  });

  // ─── Bounds enforcement (self-improvement.md §Level-2) ───────────────────────

  test("rejects concurrencyCap below min (1)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { concurrencyCap: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
      expect(result.violations[0].field).toBe("concurrencyCap");
      expect(result.violations[0].requested).toBe(0);
    }
  });

  test("rejects concurrencyCap above max (8)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { concurrencyCap: 9 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
      expect(result.violations[0].field).toBe("concurrencyCap");
      expect(result.violations[0].requested).toBe(9);
    }
  });

  test("accepts concurrencyCap at min (1) and max (8) boundaries", async () => {
    const r1 = await updateSchedulerLimits(h.config, h.events, { concurrencyCap: 1 });
    expect(r1.ok).toBe(true);
    const r2 = await updateSchedulerLimits(h.config, h.events, { concurrencyCap: 8 });
    expect(r2.ok).toBe(true);
  });

  test("rejects maxTokensSinceCommit below min (100_000)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      maxTokensSinceCommit: 99_999,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
    }
  });

  test("rejects maxTokensSinceCommit above max (10_000_000)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      maxTokensSinceCommit: 10_000_001,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
    }
  });

  test("rejects cpuMaxPct below min (50) and above max (95)", async () => {
    const below = await updateSchedulerLimits(h.config, h.events, { cpuMaxPct: 49 });
    expect(below.ok).toBe(false);
    if (!below.ok && "code" in below) expect(below.code).toBe("tune_out_of_bounds");

    const above = await updateSchedulerLimits(h.config, h.events, { cpuMaxPct: 96 });
    expect(above.ok).toBe(false);
    if (!above.ok && "code" in above) expect(above.code).toBe("tune_out_of_bounds");
  });

  test("rejects memMaxPct below min (50) and above max (95)", async () => {
    const below = await updateSchedulerLimits(h.config, h.events, { memMaxPct: 49 });
    expect(below.ok).toBe(false);
    if (!below.ok && "code" in below) expect(below.code).toBe("tune_out_of_bounds");

    const above = await updateSchedulerLimits(h.config, h.events, { memMaxPct: 96 });
    expect(above.ok).toBe(false);
    if (!above.ok && "code" in above) expect(above.code).toBe("tune_out_of_bounds");
  });

  test("rejects permitTtlDefaultSeconds below min (120) and above max (3600)", async () => {
    const below = await updateSchedulerLimits(h.config, h.events, {
      permitTtlDefaultSeconds: 119,
    });
    expect(below.ok).toBe(false);
    if (!below.ok && "code" in below) expect(below.code).toBe("tune_out_of_bounds");

    const above = await updateSchedulerLimits(h.config, h.events, {
      permitTtlDefaultSeconds: 3601,
    });
    expect(above.ok).toBe(false);
    if (!above.ok && "code" in above) expect(above.code).toBe("tune_out_of_bounds");
  });

  test("rejects watchdogStuckThresholdSeconds below min (120) and above max (3600)", async () => {
    const below = await updateSchedulerLimits(h.config, h.events, {
      watchdogStuckThresholdSeconds: 119,
    });
    expect(below.ok).toBe(false);
    if (!below.ok && "code" in below) expect(below.code).toBe("tune_out_of_bounds");

    const above = await updateSchedulerLimits(h.config, h.events, {
      watchdogStuckThresholdSeconds: 3601,
    });
    expect(above.ok).toBe(false);
    if (!above.ok && "code" in above) expect(above.code).toBe("tune_out_of_bounds");
  });

  test("accepts all knobs at their boundary values", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      concurrencyCap: 8,
      maxTokensSinceCommit: 10_000_000,
      minCommitsPerHour: 10,
      cpuMaxPct: 95,
      memMaxPct: 95,
      permitTtlDefaultSeconds: 3600,
      watchdogStuckThresholdSeconds: 3600,
    });
    expect(result.ok).toBe(true);
  });

  test("accepts watchdogStuckThresholdSeconds at max boundary (3600)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      watchdogStuckThresholdSeconds: 3600,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits).toBeDefined();
    }
  });

  test("accepts watchdogStuckThresholdSeconds at min boundary (120)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      watchdogStuckThresholdSeconds: 120,
    });
    expect(result.ok).toBe(true);
  });

  test("reports all violations when multiple knobs are out of bounds", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, {
      concurrencyCap: 100,
      cpuMaxPct: 200,
      permitTtlDefaultSeconds: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("violations include field name, requested value, and bound limits", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { concurrencyCap: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      const v = result.violations[0];
      expect(v.field).toBe("concurrencyCap");
      expect(v.requested).toBe(999);
      expect(v.min).toBe(1);
      expect(v.max).toBe(8);
    }
  });

  // ─── loadMax bounds enforcement ─────────────────────────────────────────────

  test("rejects loadMax out-of-range values via tune_out_of_bounds", async () => {
    // loadMax is a Level-2 tunable knob and must be bounds-checked like all other knobs.
    // A value of 999 is outside any reasonable load average range.
    const result = await updateSchedulerLimits(h.config, h.events, { loadMax: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
    }
  });

  test("rejects loadMax at negative value via tune_out_of_bounds", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { loadMax: -0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      expect(result.code).toBe("tune_out_of_bounds");
    }
  });

  test("accepts loadMax at the default daemon value (4.0)", async () => {
    // daemon.md §system_limits defines load_max: 4.0 as default.
    // This verifies the knob accepts a value within its operational range.
    const result = await updateSchedulerLimits(h.config, h.events, { loadMax: 4.0 });
    expect(result.ok).toBe(true);
  });

  test("accepts loadMax at zero (no load threshold)", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { loadMax: 0 });
    expect(result.ok).toBe(true);
  });

  test("loadMax violations include field name and requested value", async () => {
    const result = await updateSchedulerLimits(h.config, h.events, { loadMax: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok && "code" in result) {
      const v = result.violations.find((violation) => violation.field === "loadMax");
      expect(v).toBeDefined();
      if (v) {
        expect(v.field).toBe("loadMax");
        expect(v.requested).toBe(999);
        expect(typeof v.min).toBe("number");
        expect(typeof v.max).toBe("number");
      }
    }
  });
});
