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
  overrides: ProviderOverrides;
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
      probes: { systemSample: () => ({ cpuPct: 99, memPct: 90, loadAvg: 9 }) },
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
      probes: {
        systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }),
        providerQuota: async () => ({
          ok: false,
          reason: "provider_quota_exceeded",
          retryAfterSeconds: 120,
          remaining: 0,
        }),
      },
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
      probes: {
        systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }),
        burnRate: async () => ({
          tokensSinceLastCommit: DEFAULT_LIMITS.burnRate.maxTokensSinceCommit + 1,
          commitsPerHour: 100,
        }),
      },
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

// ─── Overrides gate ─────────────────────────────────────────────────────────

describe("SchedulerService overrides gate", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-overrides-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("force override bypasses provider selection", async () => {
    const h = makeHarness(home, {
      overrides: { allow: null, deny: null, force: "anthropic" },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_force",
      providerCandidate: "opencode",
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.permit.providerId).toBe("anthropic");
    }
    await h.close();
  });

  test("deny list rejects provider at service level", async () => {
    const h = makeHarness(home, {
      overrides: { allow: null, deny: ["opencode"], force: null },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_deny",
      providerCandidate: "opencode",
    });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.gate).toBe("overrides");
      expect(decision.reason).toBe("provider_denied");
    }
    await h.close();
  });

  test("allow list rejects provider not in list at service level", async () => {
    const h = makeHarness(home, {
      overrides: { allow: ["anthropic", "cohere"], deny: null, force: null },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_allow",
      providerCandidate: "opencode",
    });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.gate).toBe("overrides");
      expect(decision.reason).toBe("provider_not_allowed");
    }
    await h.close();
  });
});

// ─── Concurrency cap gate ────────────────────────────────────────────────────

describe("SchedulerService concurrency cap gate", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-concurrency-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("denies when concurrency cap is reached", async () => {
    const cap = 2;
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, concurrencyCap: cap },
    });

    // Fill the concurrency slots
    for (let i = 0; i < cap; i++) {
      const decision = await h.service.acquirePermit({
        sessionId: `s_cap_${i}`,
        providerCandidate: "opencode",
      });
      expect(decision.granted).toBe(true);
    }

    // One more should be denied
    const overflow = await h.service.acquirePermit({
      sessionId: "s_overflow",
      providerCandidate: "opencode",
    });
    expect(overflow.granted).toBe(false);
    if (!overflow.granted) {
      expect(overflow.gate).toBe("concurrency");
      expect(overflow.reason).toBe("concurrency_cap_reached");
      expect(overflow.details).toEqual({
        active_permits: cap,
        concurrency_cap: cap,
      });
    }
    await h.close();
  });

  test("permits are counted correctly across sessions", async () => {
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, concurrencyCap: 3 },
    });
    expect(h.permits.countActive()).toBe(0);

    const d1 = await h.service.acquirePermit({ sessionId: "s1", providerCandidate: "opencode" });
    expect(d1.granted).toBe(true);
    expect(h.permits.countActive()).toBe(1);

    const d2 = await h.service.acquirePermit({ sessionId: "s2", providerCandidate: "codex" });
    expect(d2.granted).toBe(true);
    expect(h.permits.countActive()).toBe(2);

    await h.close();
  });
});

// ─── TTL resolution ─────────────────────────────────────────────────────────

describe("SchedulerService TTL resolution", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-ttl-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("uses default TTL when none requested", async () => {
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, permitTtlDefaultSeconds: 300, permitTtlMaxSeconds: 3600 },
    });
    const decision = await h.service.acquirePermit({ sessionId: "s_ttl", providerCandidate: "opencode" });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      const expectedExpiryMs = Date.parse(decision.permit.grantedAt) + 300 * 1000;
      expect(new Date(decision.permit.expiresAt).getTime()).toBe(expectedExpiryMs);
    }
    await h.close();
  });

  test("caps requested TTL at permitTtlMaxSeconds", async () => {
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 1800 },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_ttl_cap",
      providerCandidate: "opencode",
      ttlSeconds: 9999,
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      const expectedExpiryMs = Date.parse(decision.permit.grantedAt) + 1800 * 1000;
      expect(new Date(decision.permit.expiresAt).getTime()).toBe(expectedExpiryMs);
    }
    await h.close();
  });

  test("honors requested TTL when below max", async () => {
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600 },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_ttl_ok",
      providerCandidate: "opencode",
      ttlSeconds: 120,
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      const expectedExpiryMs = Date.parse(decision.permit.grantedAt) + 120 * 1000;
      expect(new Date(decision.permit.expiresAt).getTime()).toBe(expectedExpiryMs);
    }
    await h.close();
  });
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe("SchedulerService happy path", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-happy-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("grants permit when all gates pass", async () => {
    const h = makeHarness(home, {
      probes: { systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }) },
    });
    const decision = await h.service.acquirePermit({
      sessionId: "s_happy",
      providerCandidate: "opencode",
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) {
      expect(decision.permit.sessionId).toBe("s_happy");
      expect(decision.permit.providerId).toBe("opencode");
      expect(decision.permit.id).toMatch(/^perm_/);
    }
    await h.close();
  });

  test("listPermits returns all active permits", async () => {
    const h = makeHarness(home, {});
    await h.service.acquirePermit({ sessionId: "s_a", providerCandidate: "opencode" });
    await h.service.acquirePermit({ sessionId: "s_b", providerCandidate: "anthropic" });
    const permits = h.service.listPermits();
    expect(permits.length).toBe(2);
    await h.close();
  });

  test("currentLimits returns the scheduler limits", async () => {
    const h = makeHarness(home, {});
    const limits = h.service.currentLimits();
    expect(limits.concurrencyCap).toBe(DEFAULT_LIMITS.concurrencyCap);
    expect(limits.systemLimits.cpuMaxPct).toBe(DEFAULT_LIMITS.systemLimits.cpuMaxPct);
    await h.close();
  });
});

// ─── releasePermit ──────────────────────────────────────────────────────────

describe("SchedulerService releasePermit", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-release-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("returns true and emits release event when permit exists", async () => {
    const h = makeHarness(home, {});
    const grant = await h.service.acquirePermit({ sessionId: "s_rel", providerCandidate: "opencode" });
    expect(grant.granted).toBe(true);
    if (!grant.granted) throw new Error("permit should have been granted");
    const permitId = grant.permit.id;

    const released = await h.service.releasePermit(permitId);
    expect(released).toBe(true);

    const events = await readAllEvents(h.logPath);
    expect(events.some((e) => e.topic === "scheduler.permit.release")).toBe(true);
    await h.close();
  });

  test("returns false when permit does not exist", async () => {
    const h = makeHarness(home, {});
    const result = await h.service.releasePermit("nonexistent_perm_id");
    expect(result).toBe(false);
    await h.close();
  });
});

// ─── expirePermits ───────────────────────────────────────────────────────────

describe("SchedulerService expirePermits", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-expire-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("returns 0 when no permits are expired", async () => {
    const h = makeHarness(home, {});
    await h.service.acquirePermit({ sessionId: "s_exp", providerCandidate: "opencode" });
    const expired = await h.service.expirePermits(new Date().toISOString());
    expect(expired).toBe(0);
    await h.close();
  });

  test("returns count of expired permits and emits events", async () => {
    const h = makeHarness(home, {});
    await h.service.acquirePermit({ sessionId: "s_exp", providerCandidate: "opencode" });

    const expiredCount = await h.service.expirePermits("2099-01-01T00:00:00.000Z");
    expect(expiredCount).toBe(1);

    const events = await readAllEvents(h.logPath);
    expect(events.some((e) => e.topic === "scheduler.permit.expired")).toBe(true);
    await h.close();
  });

  test("provider quota denial emits scheduler.permit.deny event with retry_after_seconds", async () => {
    const h = makeHarness(home, {
      probes: {
        systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.1 }),
        providerQuota: async () => ({
          ok: false,
          reason: "rate_limit_exceeded",
          retryAfterSeconds: 300,
          remaining: 0,
        }),
      },
    });
    await h.service.acquirePermit({ sessionId: "s_quota_deny", providerCandidate: "opencode" });

    const events = await readAllEvents(h.logPath);
    const denyEvents = events.filter((e) => e.topic === "scheduler.permit.deny");
    expect(denyEvents.length).toBe(1);
    const denyData = denyEvents[0]!.data as Record<string, unknown>;
    expect(denyData).toMatchObject({
      session_id: "s_quota_deny",
      reason: "rate_limit_exceeded",
      gate: "provider",
      retry_after_seconds: 300,
    });
    await h.close();
  });
});

// ─── Deny events ────────────────────────────────────────────────────────────

describe("SchedulerService deny events", () => {
  let home: string;

  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "aloop-deny-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  test("deny emits scheduler.permit.deny event with gate info", async () => {
    const h = makeHarness(home, {
      overrides: { allow: null, deny: ["opencode"], force: null },
    });
    await h.service.acquirePermit({ sessionId: "s_deny_evt", providerCandidate: "opencode" });

    const events = await readAllEvents(h.logPath);
    const denyEvents = events.filter((e) => e.topic === "scheduler.permit.deny");
    expect(denyEvents.length).toBe(1);
    const denyData = denyEvents[0]!.data as Record<string, unknown>;
    expect(denyData).toMatchObject({
      session_id: "s_deny_evt",
      reason: "provider_denied",
      gate: "overrides",
    });
    await h.close();
  });

  test("concurrency denial emits scheduler.permit.deny event", async () => {
    const h = makeHarness(home, {
      limits: { ...DEFAULT_LIMITS, concurrencyCap: 1 },
    });
    await h.service.acquirePermit({ sessionId: "s_c1", providerCandidate: "opencode" });
    await h.service.acquirePermit({ sessionId: "s_c2", providerCandidate: "opencode" });

    const events = await readAllEvents(h.logPath);
    const denyEvents = events.filter((e) => e.topic === "scheduler.permit.deny");
    expect(denyEvents.length).toBe(1);
    const denyData = denyEvents[0]!.data as Record<string, unknown>;
    expect(denyData).toMatchObject({
      session_id: "s_c2",
      reason: "concurrency_cap_reached",
      gate: "concurrency",
    });
    await h.close();
  });
});

function makeHarness(
  home: string,
  opts: {
    probes?: SchedulerProbes;
    limits?: Partial<SchedulerLimits>;
    overrides?: ProviderOverrides;
  } = {},
): Harness {
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
  const effectiveLimits: SchedulerLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const effectiveOverrides: ProviderOverrides = opts.overrides ?? DEFAULT_OVERRIDES;
  const schedulerConfig: SchedulerConfigView = {
    scheduler: () => effectiveLimits,
    overrides: () => effectiveOverrides,
    updateLimits: async () => ({ ok: true, limits: effectiveLimits }),
  };
  const service = new SchedulerService(permits, schedulerConfig, events, opts.probes ?? {});

  return {
    service,
    permits,
    logPath,
    overrides: effectiveOverrides,
    async close() {
      await eventStore.close();
      db.close();
    },
  };
}
