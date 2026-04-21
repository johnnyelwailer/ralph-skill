import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  loadBundledMigrations,
  migrate,
  PermitProjector,
  PermitRegistry,
  readAllEvents,
} from "@aloop/state-sqlite";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderOverrides, SchedulerConfigView, SchedulerLimits } from "./decisions.ts";
import type { SchedulerProbes } from "./probes.ts";
import { SchedulerService } from "./service.ts";

type Harness = {
  service: SchedulerService;
  permits: PermitRegistry;
  logPath: string;
  close(): Promise<void>;
};

const DEFAULT_LIMITS: SchedulerLimits = {
  concurrencyCap: 3,
  permitTtlDefaultSeconds: 600,
  permitTtlMaxSeconds: 3600,
  systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
  burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
};

const DEFAULT_OVERRIDES: ProviderOverrides = {
  allow: null,
  deny: null,
  force: null,
};

describe("SchedulerService gates", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-scheduler-service-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("system gate denies when host limits are exceeded", async () => {
    const h = makeHarness(home, {
      systemSample: () => ({ cpuPct: 99, memPct: 90, loadAvg: 9 }),
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_sys",
      providerCandidate: "opencode",
    });

    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.gate).toBe("system");
      expect(decision.reason).toBe("system_limit_exceeded");
    }
    expect(h.permits.list()).toEqual([]);
    await h.close();
  });

  test("provider gate denies when quota probe reports unavailable", async () => {
    const h = makeHarness(home, {
      systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }),
      providerQuota: async () => ({
        ok: false,
        reason: "provider_quota_exceeded",
        retryAfterSeconds: 120,
        remaining: 0,
      }),
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_quota",
      providerCandidate: "opencode",
    });

    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.gate).toBe("provider");
      expect(decision.reason).toBe("provider_quota_exceeded");
      expect(decision.retryAfterSeconds).toBe(120);
    }
    await h.close();
  });

  test("burn-rate gate denies and emits scheduler.burn_rate_exceeded", async () => {
    const h = makeHarness(home, {
      systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }),
      burnRate: async () => ({
        tokensSinceLastCommit: DEFAULT_LIMITS.burnRate.maxTokensSinceCommit + 1,
        commitsPerHour: 100,
      }),
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_burn",
      providerCandidate: "opencode",
    });

    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.gate).toBe("burn_rate");
      expect(decision.reason).toBe("burn_rate_exceeded");
    }

    const events = await readAllEvents(h.logPath);
    expect(events.some((e) => e.topic === "scheduler.burn_rate_exceeded")).toBe(true);
    await h.close();
  });
});

function makeHarness(home: string, probes: SchedulerProbes): Harness {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const logPath = join(home, "aloopd.log");
  const eventStore = new JsonlEventStore(logPath);
  const events = createEventWriter({
    db,
    store: eventStore,
    projectors: [new EventCountsProjector(), new PermitProjector()],
    nextId: () => `evt_${crypto.randomUUID()}`,
  });
  const permits = new PermitRegistry(db);
  const limits = DEFAULT_LIMITS;
  const schedulerConfig: SchedulerConfigView = {
    scheduler: () => limits,
    overrides: () => DEFAULT_OVERRIDES,
    updateLimits: async () => ({ ok: true, limits }),
  };
  const service = new SchedulerService(permits, schedulerConfig, events, probes);

  return {
    service,
    permits,
    logPath,
    async close() {
      await eventStore.close();
      db.close();
    },
  };
}
