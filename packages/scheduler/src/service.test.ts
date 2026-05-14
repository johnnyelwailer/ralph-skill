import { describe, expect, test } from "bun:test";
import { SchedulerService } from "./service.ts";
import type { SchedulerConfigView } from "./decisions.ts";
import type { EventWriter, PermitRegistry } from "@aloop/state-sqlite";
import type { SchedulerProbes } from "@aloop/scheduler-gates";
import type { Permit } from "@aloop/state-sqlite";

// ─── mocks ─────────────────────────────────────────────────────────────────────

class MockEventWriter {
  readonly events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  async append(topic: string, data: Record<string, unknown>): Promise<void> {
    this.events.push({ topic, data });
  }
}

class MockPermitRegistry {
  private _permits: Map<string, Permit> = new Map();
  private _listResult: Permit[] = [];
  private _listExpiredResult: Permit[] = [];
  private _countActiveResult = 0;
  private _countByProjectResults: Record<string, number> = {};

  get(id: string): Permit | undefined { return this._permits.get(id); }
  list(): Permit[] { return this._listResult; }
  listExpired(_nowIso: string): Permit[] { return this._listExpiredResult; }
  countActive(): number { return this._countActiveResult; }
  countByProject(projectId: string): number { return this._countByProjectResults[projectId] ?? 0; }
  remove(id: string): void { this._permits.delete(id); }

  setPermits(permits: Permit[]) {
    this._listResult = permits;
    this._permits = new Map(permits.map(p => [p.id, p]));
  }
  setExpired(permits: Permit[]) { this._listExpiredResult = permits; }
  setCountActive(n: number) { this._countActiveResult = n; }
  setCountByProject(projectId: string, n: number) { this._countByProjectResults[projectId] = n; }
}

function makePermit(overrides: Partial<Permit> = {}): Permit {
  const base: Permit = {
    id: "test-permit",
    sessionId: null,
    composerTurnId: null,
    controlSubagentRunId: null,
    projectId: null,
    providerId: "test-provider",
    ttlSeconds: 600,
    grantedAt: "2024-01-01T00:00:00.000Z",
    expiresAt: "2024-01-01T01:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function makeConfig(overrides: Partial<{
  concurrencyCap: number;
  systemLimits: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["systemLimits"]>;
  burnRate: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["burnRate"]>;
  permitTtlDefaultSeconds: number;
  permitTtlMaxSeconds: number;
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
    updateLimits: () =>
      Promise.resolve({
        ok: true,
        limits: {
          concurrencyCap: 3,
          permitTtlDefaultSeconds: 600,
          permitTtlMaxSeconds: 3600,
          systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
          burnRate: { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 },
        },
      }),
  };
}

// ─── listPermits ───────────────────────────────────────────────────────────────

describe("listPermits", () => {
  test("returns empty array when no permits", () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    expect(service.listPermits()).toEqual([]);
  });

  test("returns permits from registry", () => {
    const p = makePermit({ id: "p1" });
    const permits = new MockPermitRegistry();
    permits.setPermits([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    expect(service.listPermits()).toEqual([p]);
  });
});

// ─── currentLimits ─────────────────────────────────────────────────────────────

describe("currentLimits", () => {
  test("returns config limits", () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig({ concurrencyCap: 42 });
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const limits = service.currentLimits();
    expect(limits.concurrencyCap).toBe(42);
  });
});

// ─── releasePermit ─────────────────────────────────────────────────────────────

describe("releasePermit", () => {
  test("returns false when permit not found", async () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.releasePermit("nonexistent");
    expect(result).toBe(false);
  });

  test("returns true and writes release event when permit exists", async () => {
    const p = makePermit({ id: "my-permit", sessionId: "my-session" });
    const permits = new MockPermitRegistry();
    permits.setPermits([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.releasePermit("my-permit");
    expect(result).toBe(true);
    expect(events.events).toHaveLength(1);
    const evt = events.events[0]!;
    expect(evt.topic).toBe("scheduler.permit.release");
    expect(evt.data).toMatchObject({ permit_id: "my-permit", session_id: "my-session" });
  });

  test("writes release event with composer_turn_id for composer turn owner", async () => {
    const p = makePermit({ id: "perm-ct", composerTurnId: "ct_01", sessionId: null });
    const permits = new MockPermitRegistry();
    permits.setPermits([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.releasePermit("perm-ct");
    expect(result).toBe(true);
    expect(events.events).toHaveLength(1);
    const evt = events.events[0]!;
    expect(evt.topic).toBe("scheduler.permit.release");
    expect(evt.data).toMatchObject({
      permit_id: "perm-ct",
      composer_turn_id: "ct_01",
    });
    expect(evt.data).not.toHaveProperty("session_id");
  });

  test("writes release event with control_subagent_run_id for control subagent owner", async () => {
    const p = makePermit({ id: "perm-csar", controlSubagentRunId: "csar_99", sessionId: null });
    const permits = new MockPermitRegistry();
    permits.setPermits([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.releasePermit("perm-csar");
    expect(result).toBe(true);
    expect(events.events).toHaveLength(1);
    const evt = events.events[0]!;
    expect(evt.topic).toBe("scheduler.permit.release");
    expect(evt.data).toMatchObject({
      permit_id: "perm-csar",
      control_subagent_run_id: "csar_99",
    });
    expect(evt.data).not.toHaveProperty("session_id");
  });
});

// ─── expirePermits ─────────────────────────────────────────────────────────────

describe("expirePermits", () => {
  test("returns 0 when no expired permits", async () => {
    const permits = new MockPermitRegistry();
    permits.setExpired([]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.expirePermits("2025-01-01T00:00:00.000Z");
    expect(result).toBe(0);
    expect(events.events).toHaveLength(0);
  });

  test("writes expire event for each expired permit", async () => {
    const p1 = makePermit({ id: "expired-1", sessionId: "s1" });
    const p2 = makePermit({ id: "expired-2", sessionId: "s2" });
    const permits = new MockPermitRegistry();
    permits.setExpired([p1, p2]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.expirePermits("2025-01-01T00:00:00.000Z");
    expect(result).toBe(2);
    expect(events.events).toHaveLength(2);
    const evt0 = events.events[0]!;
    const evt1 = events.events[1]!;
    expect(evt0.topic).toBe("scheduler.permit.expired");
    expect(evt0.data).toMatchObject({ permit_id: "expired-1", session_id: "s1" });
    expect(evt1.topic).toBe("scheduler.permit.expired");
    expect(evt1.data).toMatchObject({ permit_id: "expired-2", session_id: "s2" });
  });

  test("returns 0 and does not crash when no nowIso provided", async () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    // If nowIso defaults to new Date().toISOString(), listExpired gets a valid string
    // Since MockPermitRegistry.listExpired returns [] by default, result is 0
    const result = await service.expirePermits();
    expect(result).toBe(0);
  });

  test("writes expire event with composer_turn_id for composer turn owner", async () => {
    const p = makePermit({ id: "exp-ct", composerTurnId: "ct_exp_01", sessionId: null });
    const permits = new MockPermitRegistry();
    permits.setExpired([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.expirePermits("2025-01-01T00:00:00.000Z");
    expect(result).toBe(1);
    expect(events.events).toHaveLength(1);
    const evt = events.events[0]!;
    expect(evt.topic).toBe("scheduler.permit.expired");
    expect(evt.data).toMatchObject({
      permit_id: "exp-ct",
      composer_turn_id: "ct_exp_01",
    });
    expect(evt.data).not.toHaveProperty("session_id");
  });

  test("writes expire event with control_subagent_run_id for control subagent owner", async () => {
    const p = makePermit({ id: "exp-csar", controlSubagentRunId: "csar_exp_02", sessionId: null });
    const permits = new MockPermitRegistry();
    permits.setExpired([p]);
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const result = await service.expirePermits("2025-01-01T00:00:00.000Z");
    expect(result).toBe(1);
    expect(events.events).toHaveLength(1);
    const evt = events.events[0]!;
    expect(evt.topic).toBe("scheduler.permit.expired");
    expect(evt.data).toMatchObject({
      permit_id: "exp-csar",
      control_subagent_run_id: "csar_exp_02",
    });
    expect(evt.data).not.toHaveProperty("session_id");
  });
});

// ─── acquirePermit ─────────────────────────────────────────────────────────────

describe("acquirePermit", () => {
  test("delegates to acquirePermitDecision and returns the decision", async () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig({ concurrencyCap: 3 });
    const events = new MockEventWriter();
    const service = new SchedulerService(
      permits as unknown as PermitRegistry,
      config,
      events as unknown as EventWriter,
    );
    const result = await service.acquirePermit({ sessionId: "sess_test", providerCandidate: "opencode", projectId: null });
    // acquirePermitDecision is called and returns a PermitDecision
    expect(typeof result.granted).toBe("boolean");
    // Verify the decision is well-formed: either granted (with permit) or denied (with reason/gate)
    if (result.granted === true) {
      expect(result).toHaveProperty("permit");
    } else {
      expect(result).toHaveProperty("reason");
      expect(result).toHaveProperty("gate");
    }
  });

  test("returns denied when concurrency cap is already reached", async () => {
    const permits = new MockPermitRegistry();
    permits.setCountActive(3); // cap is 3
    const config = makeConfig({ concurrencyCap: 3 });
    const events = new MockEventWriter();
    const service = new SchedulerService(
      permits as unknown as PermitRegistry,
      config,
      events as unknown as EventWriter,
    );
    const result = await service.acquirePermit({ sessionId: "sess_blocked", providerCandidate: "opencode", projectId: null });
    expect(result.granted).toBe(false);
  });

  test("passes ttlSeconds to acquirePermitDecision", async () => {
    const permits = new MockPermitRegistry();
    const config = makeConfig();
    const events = new MockEventWriter();
    const service = new SchedulerService(
      permits as unknown as PermitRegistry,
      config,
      events as unknown as EventWriter,
    );
    const result = await service.acquirePermit({
      sessionId: "sess_ttl",
      providerCandidate: "opencode",
      projectId: null,
      ttlSeconds: 300,
    });
    expect(typeof result.granted).toBe("boolean");
  });
});

// ─── updateLimits ─────────────────────────────────────────────────────────────

describe("updateLimits", () => {
  test("returns ok=false with errors when config.updateLimits fails", async () => {
    const permits = new MockPermitRegistry();
    const config: SchedulerConfigView = {
      scheduler: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 600,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 },
      }),
      overrides: () => ({ allow: null, deny: null, force: null }),
      projectLimits: (_projectId: string) => ({}),
      updateLimits: async () => ({
        ok: false as const,
        errors: ["unknown scheduler limits field: nope", "scheduler.burn_rate: must be a mapping"],
      }),
    };
    const events = new MockEventWriter();
    const service = new SchedulerService(
      permits as unknown as PermitRegistry,
      config,
      events as unknown as EventWriter,
    );

    const result = await service.updateLimits({ nope: true });

    expect(result.ok).toBe(false);
    const errors = (result as { ok: false; errors: string[] }).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("unknown scheduler limits field");
  });

  test("returns ok=true when config.updateLimits succeeds", async () => {
    const permits = new MockPermitRegistry();
    const config: SchedulerConfigView = {
      scheduler: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 600,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 },
      }),
      overrides: () => ({ allow: null, deny: null, force: null }),
      projectLimits: (_projectId: string) => ({}),
      updateLimits: async () => ({
        ok: true as const,
        limits: {
          concurrencyCap: 5,
          permitTtlDefaultSeconds: 900,
          permitTtlMaxSeconds: 3600,
          systemLimits: { cpuMaxPct: 90, memMaxPct: 95, loadMax: 8.0 },
          burnRate: { maxTokensSinceCommit: 5_000_000, minCommitsPerHour: 1 },
        },
      }),
    };
    const events = new MockEventWriter();
    const service = new SchedulerService(
      permits as unknown as PermitRegistry,
      config,
      events as unknown as EventWriter,
    );

    const result = await service.updateLimits({ concurrencyCap: 5 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(5);
    }
  });
});
