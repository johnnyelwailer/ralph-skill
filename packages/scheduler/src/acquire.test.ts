import { describe, expect, test } from "bun:test";
import { acquirePermitDecision } from "./acquire.ts";
import type { AcquirePermitInput, SchedulerConfigView } from "./decisions.ts";
import type { PermitRegistry, EventWriter } from "@aloop/state-sqlite";
import type { SchedulerProbes } from "./probes.ts";

class MockEventWriter {
  readonly events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  async append(topic: string, data: Record<string, unknown>): Promise<void> {
    this.events.push({ topic, data });
  }
}

class MockPermitRegistry {
  private _permits: Map<string, unknown> = new Map();
  get(_permitId: string) {
    return this._permits.get(_permitId) ?? { permit_id: _permitId };
  }
  setPermit(id: string, data: unknown) {
    this._permits.set(id, data);
  }
  countActive() { return 0; }
}

function makeDeps(
  overrides: Partial<{
    events: MockEventWriter;
    permits: MockPermitRegistry;
    config: SchedulerConfigView;
    probes: SchedulerProbes;
  }> = {},
) {
  const events = overrides.events ?? new MockEventWriter();
  const permits = overrides.permits ?? new MockPermitRegistry();
  const config = overrides.config ?? makeConfig();
  const probes = overrides.probes ?? {};
  return { events, permits, config, probes };
}

function makeConfig(overrides: Partial<{
  concurrencyCap: number;
  overrides_: Parameters<SchedulerConfigView["overrides"]>[0];
  systemLimits: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["systemLimits"]>;
  burnRate: NonNullable<ReturnType<SchedulerConfigView["scheduler"]>["burnRate"]>;
  permitTtlDefaultSeconds: number;
  permitTtlMaxSeconds: number;
}> = {}) {
  const cfg: SchedulerConfigView = {
    scheduler: () => ({
      concurrencyCap: overrides.concurrencyCap ?? 3,
      systemLimits: overrides.systemLimits ?? {
        cpuMaxPct: 80,
        memMaxPct: 85,
        loadMax: 4.0,
      },
      burnRate: overrides.burnRate ?? {
        maxTokensSinceCommit: 2_000_000,
        minCommitsPerHour: 2,
      },
      permitTtlDefaultSeconds: overrides.permitTtlDefaultSeconds ?? 600,
      permitTtlMaxSeconds: overrides.permitTtlMaxSeconds ?? 3600,
    }),
    overrides: () => overrides.overrides_ ?? { allow: null, deny: null, force: null },
  };
  return cfg;
}

function makeInput(overrides: Partial<AcquirePermitInput> = {}): AcquirePermitInput {
  return {
    sessionId: overrides.sessionId ?? "sess_1",
    providerCandidate: overrides.providerCandidate ?? "opencode",
    ttlSeconds: overrides.ttlSeconds,
  };
}

// ─── acquirePermitDecision — overrides gate ─────────────────────────────────

describe("acquirePermitDecision", () => {
  describe("overrides gate", () => {
    test("returns deny when provider is in deny list", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({
        events,
        config: makeConfig({ overrides_: { force: null, deny: ["opencode"], allow: null } }),
      });
      const result = await acquirePermitDecision(deps, makeInput({ providerCandidate: "opencode" }));
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("overrides");
      expect(events.events).toHaveLength(1);
      expect(events.events[0]!.topic).toBe("scheduler.permit.deny");
    });

    test("returns deny when provider is not in allow list", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({
        events,
        config: makeConfig({ overrides_: { force: null, deny: null, allow: ["anthropic"] } }),
      });
      const result = await acquirePermitDecision(deps, makeInput({ providerCandidate: "opencode" }));
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("overrides");
    });

    test("force field redirects to the forced provider", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({
        events,
        config: makeConfig({ overrides_: { force: "anthropic", deny: null, allow: null } }),
      });
      const result = await acquirePermitDecision(deps, makeInput({ providerCandidate: "opencode" }));
      // Force overrides to anthropic — permit should be granted (no other gates blocking)
      expect(result.granted).toBe(true);
    });

    test("deny takes priority over allow", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({
        events,
        config: makeConfig({ overrides_: { force: null, deny: ["opencode"], allow: ["opencode"] } }),
      });
      const result = await acquirePermitDecision(deps, makeInput({ providerCandidate: "opencode" }));
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("overrides");
    });
  });

  // ─── acquirePermitDecision — concurrency gate ──────────────────────────────

  describe("concurrency gate", () => {
    test("returns deny when active permits meet concurrency cap", async () => {
      const events = new MockEventWriter();
      const permits = new MockPermitRegistry();
      permits.countActive = () => 3;
      const deps = makeDeps({
        events,
        permits,
        config: makeConfig({ concurrencyCap: 3 }),
      });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("concurrency");
      expect((result as any).details.active_permits).toBe(3);
      expect((result as any).details.concurrency_cap).toBe(3);
      expect(events.events).toHaveLength(1);
      expect(events.events[0]!.topic).toBe("scheduler.permit.deny");
    });

    test("allows request when active permits are below cap", async () => {
      const events = new MockEventWriter();
      const permits = new MockPermitRegistry();
      permits.countActive = () => 2;
      const deps = makeDeps({ events, permits, config: makeConfig({ concurrencyCap: 3 }) });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });
  });

  // ─── acquirePermitDecision — system gate ───────────────────────────────────

  describe("system gate", () => {
    test("returns deny when system sample exceeds cpu limit", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        systemSample: () => ({ cpuPct: 95, memPct: 50, loadAvg: 1.0 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("system");
      expect((result as any).reason).toBe("system_limit_exceeded");
    });

    test("returns deny when system sample exceeds memory limit", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        systemSample: () => ({ cpuPct: 10, memPct: 99, loadAvg: 0.5 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("system");
    });

    test("returns deny when system sample exceeds load limit", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 9.0 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("system");
    });

    test("allows request when system metrics are all within limits", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        systemSample: () => ({ cpuPct: 50, memPct: 50, loadAvg: 1.0 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });

    test("allows request when systemSample is undefined (optional probe)", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, probes: {} });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });
  });

  // ─── acquirePermitDecision — provider quota gate ────────────────────────────

  describe("provider quota gate", () => {
    test("returns deny when providerQuota probe returns not-ok", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        systemSample: () => ({ cpuPct: 10, memPct: 10, loadAvg: 0.5 }),
        providerQuota: () => ({ ok: false, reason: "rate_limited", remaining: 0 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput({ providerCandidate: "opencode" }));
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("provider");
      expect((result as any).reason).toBe("rate_limited");
      expect((result as any).details.provider_id).toBe("opencode");
      expect((result as any).details.remaining).toBe(0);
    });

    test("includes retryAfterSeconds in deny when quota provides it", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({ ok: false, reason: "rate_limited", retryAfterSeconds: 60 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).retryAfterSeconds).toBe(60);
    });

    test("includes resetAt in details when quota provides it", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({
          ok: false,
          reason: "rate_limited",
          remaining: 0,
          resetAt: "2026-04-27T12:00:00Z",
        }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).details.reset_at).toBe("2026-04-27T12:00:00Z");
    });

    test("uses default reason when quota.reason is absent", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({
          ok: false,
          remaining: 0,
        }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).reason).toBe("provider_quota_exceeded");
    });

    test("includes resetAt but omits remaining when quota.resetAt is set but remaining is absent", async () => {
      // Covers acquire.ts: extra spread branch for resetAt when remaining is undefined.
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({
          ok: false,
          reason: "rate_limited",
          resetAt: "2026-04-27T12:00:00Z",
        }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).details.reset_at).toBe("2026-04-27T12:00:00Z");
      expect((result as any).details).not.toHaveProperty("remaining");
    });

    test("merges extra details from quota response into deny details", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({
          ok: false,
          reason: "token_limit",
          details: { model: "gpt-4o", window: "1h" },
        }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).details.model).toBe("gpt-4o");
      expect((result as any).details.window).toBe("1h");
    });

    test("allows request when providerQuota returns ok=true", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => ({ ok: true, remaining: 500 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });

    test("allows request when providerQuota probe is undefined", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, probes: {} });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });

    test("allows request when providerQuota returns null", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        providerQuota: () => null,
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });
  });

  // ─── acquirePermitDecision — burn rate gate ────────────────────────────────

  describe("burn rate gate", () => {
    test("returns deny when burnRate probe indicates tokens exceeded", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        burnRate: () => ({ tokensSinceLastCommit: 5_000_000, commitsPerHour: 10 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("burn_rate");
      expect((result as any).reason).toBe("burn_rate_exceeded");
    });

    test("returns deny when burnRate probe indicates commits below minimum", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        burnRate: () => ({ tokensSinceLastCommit: 0, commitsPerHour: 0 }),
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(false);
      expect((result as any).gate).toBe("burn_rate");
    });

    test("allows request when burnRate probe is undefined", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, probes: {} });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });

    test("allows request when burnRate probe returns null", async () => {
      const events = new MockEventWriter();
      const probes: SchedulerProbes = {
        burnRate: () => null,
      };
      const deps = makeDeps({ events, probes });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
    });
  });

  // ─── acquirePermitDecision — grant path ────────────────────────────────────

  describe("grant path", () => {
    test("grants permit and emits scheduler.permit.grant event", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events });
      const result = await acquirePermitDecision(deps, makeInput());
      expect(result.granted).toBe(true);
      expect(result.permit).toBeDefined();
      expect(events.events).toHaveLength(1);
      expect(events.events[0]!.topic).toBe("scheduler.permit.grant");
      expect(events.events[0]!.data.provider_id).toBe("opencode");
      expect(events.events[0]!.data.session_id).toBe("sess_1");
    });

    test("uses default ttlSeconds when not provided", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, config: makeConfig({ permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600 }) });
      await acquirePermitDecision(deps, makeInput({ ttlSeconds: undefined }));
      expect(events.events[0]!.data.ttl_seconds).toBe(600);
    });

    test("caps ttlSeconds at maxTtlSeconds when requested exceeds max", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, config: makeConfig({ permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600 }) });
      await acquirePermitDecision(deps, makeInput({ ttlSeconds: 9999 }));
      expect(events.events[0]!.data.ttl_seconds).toBe(3600);
    });

    test("accepts ttlSeconds within the allowed range", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, config: makeConfig({ permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600 }) });
      await acquirePermitDecision(deps, makeInput({ ttlSeconds: 1200 }));
      expect(events.events[0]!.data.ttl_seconds).toBe(1200);
    });

    test("includes expires_at in grant event computed from ttl", async () => {
      const events = new MockEventWriter();
      const deps = makeDeps({ events, config: makeConfig({ permitTtlDefaultSeconds: 60, permitTtlMaxSeconds: 60 }) });
      const before = new Date().toISOString();
      await acquirePermitDecision(deps, makeInput({ ttlSeconds: 60 }));
      const after = new Date(Date.now() + 60 * 1000 + 1000).toISOString();
      const grantedAt = events.events[0]!.data.granted_at as string;
      const expiresAt = events.events[0]!.data.expires_at as string;
      expect(grantedAt >= before).toBe(true);
      expect(grantedAt <= after).toBe(true);
      expect(expiresAt > grantedAt).toBe(true);
    });
  });
});
