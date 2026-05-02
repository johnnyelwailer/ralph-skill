import { describe, expect, test } from "bun:test";
import type { Permit } from "@aloop/state-sqlite";
import type { SchedulerConfigView } from "./decisions.ts";
import type { EventWriter, PermitRegistry } from "@aloop/state-sqlite";
import type { SchedulerProbes } from "@aloop/scheduler-gates";
import { acquirePermitDecision, type AcquirePermitDeps } from "./acquire.ts";

// ─── mocks ─────────────────────────────────────────────────────────────────────

class MockEventWriter {
  readonly events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  async append(topic: string, data: Record<string, unknown>): Promise<void> {
    this.events.push({ topic, data });
  }
}

class MockPermitRegistry {
  private _permits = new Map<string, Permit>();
  private _countActiveResult = 0;
  private _countByProjectResults: Record<string, number> = {};

  get(id: string): Permit | undefined { return this._permits.get(id); }
  list(): Permit[] { return [...this._permits.values()]; }
  listExpired(): Permit[] { return []; }
  countActive(): number { return this._countActiveResult; }
  countByProject(projectId: string): number { return this._countByProjectResults[projectId] ?? 0; }

  setCountActive(n: number) { this._countActiveResult = n; }
  setCountByProject(projectId: string, n: number) { this._countByProjectResults[projectId] = n; }
  addPermit(permit: Permit) { this._permits.set(permit.id, permit); }
}

function makeConfig(overrides: Partial<{
  concurrencyCap: number;
  permitTtlDefaultSeconds: number;
  permitTtlMaxSeconds: number;
  systemLimits: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["systemLimits"]>;
  burnRate: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["burnRate"]>;
}> = {}): SchedulerConfigView {
  return {
    scheduler: () => ({
      concurrencyCap: overrides.concurrencyCap ?? 3,
      permitTtlDefaultSeconds: overrides.permitTtlDefaultSeconds ?? 600,
      permitTtlMaxSeconds: overrides.permitTtlMaxSeconds ?? 3600,
      systemLimits: overrides.systemLimits ?? { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
      burnRate: overrides.burnRate ?? { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 },
    }),
    overrides: () => ({ allow: null, deny: null, force: null }),
    projectLimits: (_projectId: string) => ({}),
    updateLimits: () => Promise.resolve({ ok: true, limits: { concurrencyCap: 3, permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600, systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 }, burnRate: { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 } } }),
  };
}

function makeProbes(overrides: Partial<{
  systemSample: SchedulerProbes["systemSample"];
  providerQuota: SchedulerProbes["providerQuota"];
  burnRate: SchedulerProbes["burnRate"];
  projectDailyCost: SchedulerProbes["projectDailyCost"];
}> = {}): SchedulerProbes {
  return {
    systemSample: overrides.systemSample ?? (() => ({ cpuPct: 10, memPct: 20, loadAvg: 0.5 })),
    providerQuota: overrides.providerQuota,
    burnRate: overrides.burnRate,
    projectDailyCost: overrides.projectDailyCost,
  };
}

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: `perm_${Math.random().toString(36).slice(2)}`,
    sessionId: "test-session",
    providerCandidate: "opencode",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    grantedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDeps(
  opts: Partial<{
    permits: MockPermitRegistry;
    config: SchedulerConfigView;
    events: MockEventWriter;
    probes: SchedulerProbes;
  }> = {},
): AcquirePermitDeps {
  return {
    permits: opts.permits ?? new MockPermitRegistry(),
    config: opts.config ?? makeConfig(),
    events: opts.events ?? new MockEventWriter(),
    probes: opts.probes ?? makeProbes(),
  } as AcquirePermitDeps;
}

const BASE_INPUT = { sessionId: "s_test_01", providerCandidate: "opencode", projectId: null };

// ─── override denial ───────────────────────────────────────────────────────────

describe("override denial", () => {
  test("denies when override deny list includes the requested provider", async () => {
    const deps = makeDeps({
      config: {
        ...makeConfig(),
        overrides: () => ({ allow: null, deny: ["opencode"], force: null }),
      },
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("overrides");
    expect((result as { reason: string }).reason).toBe("provider_denied");
  });

  test("denies when override allow list does not include the requested provider", async () => {
    const deps = makeDeps({
      config: {
        ...makeConfig(),
        overrides: () => ({ allow: ["codex"], deny: null, force: null }),
      },
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("overrides");
    expect((result as { reason: string }).reason).toBe("provider_not_allowed");
  });

  test("allows when override force redirects to a different provider", async () => {
    // force means "use this specific provider instead" — not a denial.
    // The grant event data contains the redirected providerId.
    const events = new MockEventWriter();
    const deps = makeDeps({
      events,
      config: {
        ...makeConfig(),
        overrides: () => ({ allow: null, deny: null, force: "anthropic/claude-3.5" }),
      },
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
    // Verify the grant event carries the redirected providerId (not the original)
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { provider_id: string } }).data.provider_id).toBe("anthropic/claude-3.5");
  });
});

// ─── concurrency cap denial ───────────────────────────────────────────────────

describe("concurrency cap denial", () => {
  test("denies when active permits >= concurrencyCap", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountActive(3); // cap is 3 by default

    const deps = makeDeps({ permits });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("concurrency");
    expect((result as { reason: string }).reason).toBe("concurrency_cap_reached");
    expect((result as { details: { active_permits: number; concurrency_cap: number } }).details.active_permits).toBe(3);
    expect((result as { details: { active_permits: number; concurrency_cap: number } }).details.concurrency_cap).toBe(3);
  });

  test("allows when active permits < concurrencyCap", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountActive(2); // cap is 3, so 2 < 3

    const deps = makeDeps({ permits });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
  });

  test("denies when concurrencyCap is 1 and 1 permit is already active", async () => {
    const deps = makeDeps({
      config: makeConfig({ concurrencyCap: 1 }),
      permits: new MockPermitRegistry(),
    });
    deps.permits.setCountActive(1);

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("concurrency");
  });
});

// ─── system gate denial ───────────────────────────────────────────────────────

describe("system gate denial", () => {
  test("denies when systemSample returns cpu above limit", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        systemSample: () => ({ cpuPct: 95, memPct: 20, loadAvg: 5.0 }), // cpuMaxPct=80 exceeded
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("system");
    expect((result as { reason: string }).reason).toBe("system_limit_exceeded");
  });

  test("denies when systemSample returns mem above limit", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        systemSample: () => ({ cpuPct: 10, memPct: 95, loadAvg: 0.5 }), // memMaxPct=85 exceeded
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("system");
  });

  test("denies when systemSample returns load above limit", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        systemSample: () => ({ cpuPct: 10, memPct: 20, loadAvg: 8.0 }), // loadMax=4.0 exceeded
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("system");
  });

  test("allows when systemSample returns all values within limits", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        systemSample: () => ({ cpuPct: 50, memPct: 50, loadAvg: 2.0 }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
  });
});

// ─── provider quota denial ───────────────────────────────────────────────────

describe("provider quota denial", () => {
  test("denies when providerQuota returns ok=false", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        providerQuota: () => ({ ok: false, reason: "provider_quota_exceeded", remaining: 0 }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("provider");
    expect((result as { reason: string }).reason).toBe("provider_quota_exceeded");
    expect((result as { details: { provider_id: string } }).details.provider_id).toBe("opencode");
  });

  test("denies when providerQuota returns ok=false with retryAfterSeconds", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        providerQuota: () => ({ ok: false, reason: "rate_limit", remaining: 0, retryAfterSeconds: 120 }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect((result as { retryAfterSeconds?: number }).retryAfterSeconds).toBe(120);
  });

  test("proceeds (not denied at provider gate) when providerQuota returns ok=true", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        providerQuota: () => ({ ok: true, remaining: 100 }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    if (!result.granted) {
      expect(result.gate).not.toBe("provider");
    }
  });

  test("proceeds when providerQuota is not defined", async () => {
    const deps = makeDeps({
      probes: makeProbes({ providerQuota: undefined }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    if (!result.granted) {
      expect(result.gate).not.toBe("provider");
    }
  });
});

// ─── burn rate denial ─────────────────────────────────────────────────────────

describe("burn rate denial", () => {
  test("denies when burnRate probe exceeds maxTokensSinceCommit", async () => {
    // config burnRate: maxTokensSinceCommit=2_000_000, minCommitsPerHour=2
    const deps = makeDeps({
      config: makeConfig({ burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 } }),
      probes: makeProbes({
        burnRate: () => ({
          tokensSinceLastCommit: 2_000_000, // above maxTokensSinceCommit=1_000_000
          commitsPerHour: 10,
        }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("burn_rate");
    expect((result as { reason: string }).reason).toBe("burn_rate_exceeded");
  });

  test("denies when burnRate probe falls below minCommitsPerHour", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        burnRate: () => ({
          tokensSinceLastCommit: 0,
          commitsPerHour: 0, // below minCommitsPerHour=2 (from config)
        }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("burn_rate");
  });

  test("allows when burnRate probe is within both limits", async () => {
    const deps = makeDeps({
      probes: makeProbes({
        burnRate: () => ({
          tokensSinceLastCommit: 100_000,
          commitsPerHour: 10,
        }),
      }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    if (!result.granted) {
      expect(result.gate).not.toBe("burn_rate");
    }
  });

  test("proceeds when burnRate probe is not defined", async () => {
    const deps = makeDeps({
      probes: makeProbes({ burnRate: undefined }),
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    if (!result.granted) {
      expect(result.gate).not.toBe("burn_rate");
    }
  });
});

// ─── successful grant ─────────────────────────────────────────────────────────

describe("successful grant", () => {
  test("returns granted=true when all gates pass", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({ events });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
  });

  test("grants permit with requested ttlSeconds when below max", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({ events });

    const result = await acquirePermitDecision(deps, {
      ...BASE_INPUT,
      ttlSeconds: 300,
    });

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(300);
  });

  test("grants permit with default TTL when ttlSeconds is undefined", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({
      config: makeConfig({ permitTtlDefaultSeconds: 900 }),
      events,
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(900);
  });

  test("caps requested ttlSeconds at permitTtlMaxSeconds", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({
      config: makeConfig({ permitTtlMaxSeconds: 1800 }),
      events,
    });

    const result = await acquirePermitDecision(deps, {
      ...BASE_INPUT,
      ttlSeconds: 9999,
    });

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(1800);
  });

  test("appends scheduler.permit.grant event on success", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({ events });

    await acquirePermitDecision(deps, BASE_INPUT);

    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { session_id: string; provider_id: string } }).data.session_id).toBe(BASE_INPUT.sessionId);
  });

  test("appends scheduler.permit.deny event on override denial", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({
      events,
      config: {
        ...makeConfig(),
        overrides: () => ({ allow: null, deny: ["opencode"], force: null }),
      },
    });

    await acquirePermitDecision(deps, BASE_INPUT);

    const denyEvent = events.events.find(e => e.topic === "scheduler.permit.deny");
    expect(denyEvent).toBeDefined();
    expect((denyEvent as { data: { reason: string } }).data.reason).toBe("provider_denied");
  });

  test("appendPermitGrant appends grant event with correct fields", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({ events });

    await acquirePermitDecision(deps, BASE_INPUT);

    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect(grantEvent).toBeDefined();
    expect((grantEvent as { data: { session_id: string; provider_id: string } }).data.session_id).toBe(BASE_INPUT.sessionId);
  });
});

// ─── TTL resolution ────────────────────────────────────────────────────────────

describe("TTL resolution", () => {
  test("uses default TTL when ttlSeconds is undefined", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({
      config: makeConfig({ permitTtlDefaultSeconds: 720 }),
      events,
    });

    const result = await acquirePermitDecision(deps, BASE_INPUT);

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(720);
  });

  test("caps requested ttlSeconds at permitTtlMaxSeconds", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({
      config: makeConfig({ permitTtlMaxSeconds: 900 }),
      events,
    });

    const result = await acquirePermitDecision(deps, {
      ...BASE_INPUT,
      ttlSeconds: 9999,
    });

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(900);
  });

  test("uses requested ttlSeconds when below both default and max", async () => {
    const events = new MockEventWriter();
    const deps = makeDeps({ events });

    const result = await acquirePermitDecision(deps, {
      ...BASE_INPUT,
      ttlSeconds: 300,
    });

    expect(result.granted).toBe(true);
    const grantEvent = events.events.find(e => e.topic === "scheduler.permit.grant");
    expect((grantEvent as { data: { ttl_seconds: number } }).data.ttl_seconds).toBe(300);
  });
});

// ─── project gate ────────────────────────────────────────────────────────────

describe("project gate", () => {
  // BASE_INPUT has projectId: null, so project gate is never evaluated.
  // Use a PROJECT_INPUT to exercise the project gate path.
  const PROJECT_INPUT = { sessionId: "s_proj_01", providerCandidate: "opencode", projectId: "proj_test_1" };

  test("skips project gate when projectId is null", async () => {
    const permits = new MockPermitRegistry();
    // Even with a restrictive project config, null projectId should bypass
    const deps = makeDeps({
      permits,
      config: makeConfig({
        // This would deny if evaluated: concurrencyCap=1 but project has 99 active permits
      }),
    });
    // Override projectLimits to return a restrictive config — but it should never be called
    // because projectId is null, so the gate is skipped entirely.
    (deps.config as { projectLimits: (id: string) => { concurrencyCap: number } }).projectLimits = (id: string) => {
      throw new Error("projectLimits should not be called when projectId is null");
    };

    const result = await acquirePermitDecision(deps, BASE_INPUT);
    expect(result.granted).toBe(true);
  });

  test("denies when project concurrency cap is exceeded", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountByProject("proj_test_1", 5); // 5 active in project

    const deps = makeDeps({
      permits,
      config: makeConfig(),
    });
    // Override projectLimits to return a concurrency cap of 3
    (deps.config as { projectLimits: (id: string) => { concurrencyCap: number } }).projectLimits = (id: string) => ({
      concurrencyCap: 3,
    });

    const result = await acquirePermitDecision(deps, PROJECT_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("project");
    expect((result as { reason: string }).reason).toBe("project_concurrency_cap_exceeded");
    expect((result as { details: { project_id: string; active_permits: number; concurrency_cap: number } }).details.project_id).toBe("proj_test_1");
    expect((result as { details: { active_permits: number; concurrency_cap: number } }).details.active_permits).toBe(5);
    expect((result as { details: { active_permits: number; concurrency_cap: number } }).details.concurrency_cap).toBe(3);
  });

  test("allows when project concurrency is below cap", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountByProject("proj_test_1", 2); // 2 active in project, cap is 5

    const deps = makeDeps({
      permits,
      config: makeConfig(),
    });
    (deps.config as { projectLimits: (id: string) => { concurrencyCap: number } }).projectLimits = (id: string) => ({
      concurrencyCap: 5,
    });

    const result = await acquirePermitDecision(deps, PROJECT_INPUT);

    expect(result.granted).toBe(true);
  });

  test("allows when project has no limits configured", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountByProject("proj_test_1", 999);

    const deps = makeDeps({
      permits,
      config: makeConfig(),
    });
    // projectLimits returns empty config — no caps enforced
    (deps.config as { projectLimits: (id: string) => Record<string, never> }).projectLimits = () => ({});

    const result = await acquirePermitDecision(deps, PROJECT_INPUT);

    expect(result.granted).toBe(true);
  });

  test("denies when project daily cost cap is exceeded", async () => {
    const permits = new MockPermitRegistry();
    const deps = makeDeps({
      permits,
      config: makeConfig(),
      probes: makeProbes({
        projectDailyCost: () => ({ costUsdCents: 500, tokens: 1_000_000 }),
      }),
    });
    (deps.config as { projectLimits: (id: string) => { dailyCostCapCents: number } }).projectLimits = () => ({
      dailyCostCapCents: 300,
    });

    const result = await acquirePermitDecision(deps, PROJECT_INPUT);

    expect(result.granted).toBe(false);
    expect(result.gate).toBe("project");
    expect((result as { reason: string }).reason).toBe("project_daily_cost_cap_exceeded");
  });

  test("allows when project daily cost is below cap", async () => {
    const permits = new MockPermitRegistry();
    const deps = makeDeps({
      permits,
      config: makeConfig(),
      probes: makeProbes({
        projectDailyCost: () => ({ costUsdCents: 100, tokens: 200_000 }),
      }),
    });
    (deps.config as { projectLimits: (id: string) => { dailyCostCapCents: number } }).projectLimits = () => ({
      dailyCostCapCents: 300,
    });

    const result = await acquirePermitDecision(deps, PROJECT_INPUT);

    expect(result.granted).toBe(true);
  });
});
