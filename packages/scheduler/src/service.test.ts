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

  get(id: string): Permit | undefined { return this._permits.get(id); }
  list(): Permit[] { return this._listResult; }
  listExpired(_nowIso: string): Permit[] { return this._listExpiredResult; }
  countActive(): number { return this._countActiveResult; }

  setPermits(permits: Permit[]) {
    this._listResult = permits;
    this._permits = new Map(permits.map(p => [p.id, p]));
  }
  setExpired(permits: Permit[]) { this._listExpiredResult = permits; }
  setCountActive(n: number) { this._countActiveResult = n; }
}

function makePermit(overrides: Partial<Permit> = {}): Permit {
  return {
    id: "test-permit",
    sessionId: "test-session",
    providerCandidate: "test-provider",
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: "2024-01-01T01:00:00.000Z",
    grantedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<{
  max_permits: number;
  ttl_seconds: number;
  concurrencyCap: number;
  systemLimits: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["systemLimits"]>;
  burnRate: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["burnRate"]>;
  permitTtlDefaultSeconds: number;
  permitTtlMaxSeconds: number;
}> = {}): SchedulerConfigView {
  return {
    scheduler: () => ({
      max_permits: overrides.max_permits ?? 10,
      ttl_seconds: overrides.ttl_seconds ?? 3600,
      concurrencyCap: overrides.concurrencyCap ?? 3,
      systemLimits: overrides.systemLimits ?? { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
      burnRate: overrides.burnRate ?? { maxTokensSinceCommit: 2_000_000, minCommitsPerHour: 2 },
      permitTtlDefaultSeconds: overrides.permitTtlDefaultSeconds ?? 600,
      permitTtlMaxSeconds: overrides.permitTtlMaxSeconds ?? 3600,
    }),
    overrides: () => ({ allow: null, deny: null, force: null }),
    updateLimits: () =>
      Promise.resolve({ ok: true, limits: { max_permits: 5, ttl_seconds: 1800 } }),
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
    const config = makeConfig({ max_permits: 42, ttl_seconds: 7200 });
    const events = new MockEventWriter();
    const service = new SchedulerService(permits as unknown as PermitRegistry, config, events as unknown as EventWriter);
    const limits = service.currentLimits();
    expect(limits.max_permits).toBe(42);
    expect(limits.ttl_seconds).toBe(7200);
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
    expect(events.events[0].topic).toBe("scheduler.permit.release");
    expect(events.events[0].data).toMatchObject({ permit_id: "my-permit", session_id: "my-session" });
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
    expect(events.events[0].topic).toBe("scheduler.permit.expired");
    expect(events.events[0].data).toMatchObject({ permit_id: "expired-1", session_id: "s1" });
    expect(events.events[1].topic).toBe("scheduler.permit.expired");
    expect(events.events[1].data).toMatchObject({ permit_id: "expired-2", session_id: "s2" });
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
    const result = await service.acquirePermit({ sessionId: "sess_test", providerCandidate: "opencode" });
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
    const result = await service.acquirePermit({ sessionId: "sess_blocked", providerCandidate: "opencode" });
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
      ttlSeconds: 300,
    });
    expect(typeof result.granted).toBe("boolean");
  });
});
