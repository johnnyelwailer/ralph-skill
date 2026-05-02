import { describe, expect, test } from "bun:test";
import type {
  AcquirePermitInput,
  LimitsUpdateResult,
  PermitDecision,
  PermitOwner,
  ProviderOverrides,
  SchedulerConfigView,
  SchedulerLimits,
} from "./decisions.ts";

/**
 * decisions.ts is pure TypeScript type definitions — no runtime logic to execute.
 * These tests validate:
 *  1. The type shapes are what callers expect (type-level contracts).
 *  2. Discriminated union narrowing behaves correctly at the type level.
 *  3. Objects satisfying these types have the expected property shapes.
 *
 * Runtime behaviour of these types is exercised through SchedulerService and
 * gates tests; this file covers the type-level surface directly.
 */

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

// ─── SchedulerLimits ─────────────────────────────────────────────────────────

describe("SchedulerLimits", () => {
  test("has all required readonly fields", () => {
    const limits: SchedulerLimits = { ...DEFAULT_LIMITS };
    expect(typeof limits.concurrencyCap).toBe("number");
    expect(typeof limits.permitTtlDefaultSeconds).toBe("number");
    expect(typeof limits.permitTtlMaxSeconds).toBe("number");
    expect(typeof limits.systemLimits).toBe("object");
    expect(typeof limits.burnRate).toBe("object");
  });

  test("systemLimits has required fields", () => {
    const { systemLimits } = DEFAULT_LIMITS;
    expect(typeof systemLimits.cpuMaxPct).toBe("number");
    expect(typeof systemLimits.memMaxPct).toBe("number");
    expect(typeof systemLimits.loadMax).toBe("number");
  });

  test("burnRate has required fields", () => {
    const { burnRate } = DEFAULT_LIMITS;
    expect(typeof burnRate.maxTokensSinceCommit).toBe("number");
    expect(typeof burnRate.minCommitsPerHour).toBe("number");
  });

  test("all fields are readonly at the type level", () => {
    const limits: SchedulerLimits = { ...DEFAULT_LIMITS };
    // TypeScript enforces readonly — this assignment would fail to compile:
    // (limits as any).concurrencyCap = 99;
    expect(limits.concurrencyCap).toBe(3);
  });
});

// ─── ProviderOverrides ───────────────────────────────────────────────────────

describe("ProviderOverrides", () => {
  test("allow can be a string array or null", () => {
    const withArray: ProviderOverrides = { ...DEFAULT_OVERRIDES, allow: ["opencode", "copilot"] };
    const withNull: ProviderOverrides = { ...DEFAULT_OVERRIDES, allow: null };
    expect(withArray.allow).toEqual(["opencode", "copilot"]);
    expect(withNull.allow).toBeNull();
  });

  test("deny can be a string array or null", () => {
    const withArray: ProviderOverrides = { ...DEFAULT_OVERRIDES, deny: ["claude"] };
    const withNull: ProviderOverrides = { ...DEFAULT_OVERRIDES, deny: null };
    expect(withArray.deny).toEqual(["claude"]);
    expect(withNull.deny).toBeNull();
  });

  test("force can be a string or null", () => {
    const withForce: ProviderOverrides = { ...DEFAULT_OVERRIDES, force: "anthropic/claude-3.5" };
    const withNull: ProviderOverrides = { ...DEFAULT_OVERRIDES, force: null };
    expect(withForce.force).toBe("anthropic/claude-3.5");
    expect(withNull.force).toBeNull();
  });

  test("all fields are readonly at the type level", () => {
    const overrides: ProviderOverrides = { ...DEFAULT_OVERRIDES };
    expect(overrides.allow).toBeNull();
  });
});

// ─── AcquirePermitInput ──────────────────────────────────────────────────────

describe("AcquirePermitInput", () => {
  test("required fields: one owner variant + projectId + providerCandidate", () => {
    const input: AcquirePermitInput = {
      sessionId: "s_test_01",
      projectId: null,
      providerCandidate: "opencode",
    };
    expect(input.sessionId).toBe("s_test_01");
    expect(input.projectId).toBeNull();
    expect(input.providerCandidate).toBe("opencode");
  });

  test("ttlSeconds is optional", () => {
    const withoutTtl: AcquirePermitInput = {
      sessionId: "s_no_ttl",
      projectId: null,
      providerCandidate: "copilot",
    };
    const withTtl: AcquirePermitInput = {
      sessionId: "s_with_ttl",
      projectId: null,
      providerCandidate: "copilot",
      ttlSeconds: 300,
    };
    expect(withoutTtl.ttlSeconds).toBeUndefined();
    expect(withTtl.ttlSeconds).toBe(300);
  });

  test("research_run_id is a valid owner variant", () => {
    const input: AcquirePermitInput = {
      researchRunId: "rr_01",
      projectId: null,
      providerCandidate: "opencode",
    };
    expect(input.researchRunId).toBe("rr_01");
    expect((input as { sessionId?: string }).sessionId).toBeUndefined();
  });

  test("composer_turn_id is a valid owner variant", () => {
    const input: AcquirePermitInput = {
      composerTurnId: "ct_01",
      projectId: null,
      providerCandidate: "opencode",
    };
    expect(input.composerTurnId).toBe("ct_01");
  });

  test("control_subagent_run_id is a valid owner variant", () => {
    const input: AcquirePermitInput = {
      controlSubagentRunId: "csar_01",
      projectId: null,
      providerCandidate: "opencode",
    };
    expect(input.controlSubagentRunId).toBe("csar_01");
  });

  test("TypeScript: providing both sessionId and researchRunId is a type error", () => {
    // This test documents the constraint — the intersection enforces exactly-one-owner.
    // The following would not compile:
    // const bad: AcquirePermitInput = { sessionId: "s", researchRunId: "r", projectId: null, providerCandidate: "x" };
    const valid: AcquirePermitInput = {
      sessionId: "s_only",
      projectId: null,
      providerCandidate: "x",
    };
    expect(valid.sessionId).toBe("s_only");
  });
});

// ─── PermitOwner discriminated union ───────────────────────────────────────────

describe("PermitOwner", () => {
  test("sessionId variant", () => {
    const owner: PermitOwner = { sessionId: "sess_1" };
    expect(owner.sessionId).toBe("sess_1");
  });

  test("researchRunId variant", () => {
    const owner: PermitOwner = { researchRunId: "rr_1" };
    expect(owner.researchRunId).toBe("rr_1");
  });

  test("composerTurnId variant", () => {
    const owner: PermitOwner = { composerTurnId: "ct_1" };
    expect(owner.composerTurnId).toBe("ct_1");
  });

  test("controlSubagentRunId variant", () => {
    const owner: PermitOwner = { controlSubagentRunId: "csar_1" };
    expect(owner.controlSubagentRunId).toBe("csar_1");
  });

  test("TypeScript: only one field may be set per union branch", () => {
    // The following would not compile (cross-variant pollution):
    // const bad: PermitOwner = { sessionId: "s", researchRunId: "r" };
    const session: PermitOwner = { sessionId: "s_only" };
    expect(session.sessionId).toBe("s_only");
    expect((session as { researchRunId?: string }).researchRunId).toBeUndefined();
  });
});

// ─── PermitDecision discriminated union ───────────────────────────────────────

describe("PermitDecision", () => {
  test("PermitGranted variant has granted=true and permit", () => {
    const granted: PermitDecision = {
      granted: true,
      permit: {
        id: "perm_abc123",
        sessionId: "s_1",
        providerId: "opencode",
        ttlSeconds: 600,
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:10:00.000Z",
      },
    };
    expect(granted.granted).toBe(true);
    expect(granted.permit.id).toBe("perm_abc123");
  });

  test("PermitDenied variant has granted=false and denial fields", () => {
    const denied: PermitDecision = {
      granted: false,
      reason: "concurrency_cap_reached",
      gate: "concurrency",
      details: { active_permits: 3, concurrency_cap: 3 },
    };
    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("concurrency_cap_reached");
    expect(denied.gate).toBe("concurrency");
    expect(denied.details).toEqual({ active_permits: 3, concurrency_cap: 3 });
  });

  test("PermitDenied may include retryAfterSeconds", () => {
    const denied: PermitDecision = {
      granted: false,
      reason: "provider_quota_exceeded",
      gate: "provider",
      details: { provider_id: "opencode", remaining: 0 },
      retryAfterSeconds: 120,
    };
    expect(denied.retryAfterSeconds).toBe(120);
  });

  test("narrowing: check granted before accessing permit", () => {
    const decision: PermitDecision = {
      granted: true,
      permit: {
        id: "perm_x",
        sessionId: "s_1",
        providerId: "opencode",
        ttlSeconds: 600,
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T00:10:00.000Z",
      },
    };
    if (decision.granted) {
      expect(decision.permit.id).toBe("perm_x");
    } else {
      // This branch should be unreachable for this input
      expect(true).toBe(false);
    }
  });

  test("narrowing: denied path does not have permit property", () => {
    const decision: PermitDecision = {
      granted: false,
      reason: "system_limit_exceeded",
      gate: "system",
      details: { cpu_pct: 99 },
    };
    if (!decision.granted) {
      expect(decision.reason).toBe("system_limit_exceeded");
      // @ts-expect-error — permit only exists on granted variant
      const _permit: string = decision.permit;
    }
  });
});

// ─── LimitsUpdateResult discriminated union ───────────────────────────────────

describe("LimitsUpdateResult", () => {
  test("ok=true variant has limits", () => {
    const ok: LimitsUpdateResult = {
      ok: true,
      limits: DEFAULT_LIMITS,
    };
    expect(ok.ok).toBe(true);
    expect(ok.limits.concurrencyCap).toBe(3);
  });

  test("ok=false variant has errors array", () => {
    const err: LimitsUpdateResult = {
      ok: false,
      errors: ["unknown scheduler limits field: nope", "scheduler.burn_rate: must be a mapping"],
    };
    expect(err.ok).toBe(false);
    expect(err.errors).toHaveLength(2);
    expect(err.errors[0]).toContain("unknown scheduler limits field");
  });

  test("narrowing: check ok before accessing limits", () => {
    const result: LimitsUpdateResult = { ok: true, limits: DEFAULT_LIMITS };
    if (result.ok) {
      expect(result.limits.concurrencyCap).toBe(3);
    } else {
      expect(true).toBe(false);
    }
  });

  test("errors are readonly array", () => {
    const result: LimitsUpdateResult = {
      ok: false,
      errors: ["only one error"],
    };
    // errors is readonly — TypeScript enforces immutability at compile time
    expect(result.errors[0]).toBe("only one error");
  });
});

// ─── SchedulerConfigView interface ───────────────────────────────────────────

describe("SchedulerConfigView", () => {
  test("minimal implementation satisfies the interface", async () => {
    const configView: SchedulerConfigView = {
      scheduler: () => DEFAULT_LIMITS,
      overrides: () => DEFAULT_OVERRIDES,
      updateLimits: async () => ({ ok: true, limits: DEFAULT_LIMITS }),
    };
    expect(configView.scheduler().concurrencyCap).toBe(3);
    expect(configView.overrides().allow).toBeNull();
    const result = await configView.updateLimits({ concurrencyCap: 5 });
    expect(result.ok).toBe(true);
  });

  test("updateLimits returns LimitsUpdateResult", async () => {
    const configView: SchedulerConfigView = {
      scheduler: () => DEFAULT_LIMITS,
      overrides: () => DEFAULT_OVERRIDES,
      updateLimits: async (patch) => {
        if (patch["nope"]) return { ok: false, errors: ["unknown field"] };
        return { ok: true, limits: DEFAULT_LIMITS };
      },
    };

    const ok = await configView.updateLimits({ concurrencyCap: 10 });
    expect(ok.ok).toBe(true);

    const fail = await configView.updateLimits({ nope: true });
    expect(fail.ok).toBe(false);
    if (!fail.ok) {
      expect(fail.errors[0]).toContain("unknown field");
    }
  });

  test("scheduler() returns current limits", () => {
    const configView: SchedulerConfigView = {
      scheduler: () => ({ ...DEFAULT_LIMITS, concurrencyCap: 99 }),
      overrides: () => DEFAULT_OVERRIDES,
      updateLimits: async () => ({ ok: true, limits: DEFAULT_LIMITS }),
    };
    expect(configView.scheduler().concurrencyCap).toBe(99);
  });

  test("overrides() returns current provider overrides", () => {
    const configView: SchedulerConfigView = {
      scheduler: () => DEFAULT_LIMITS,
      overrides: () => ({ allow: ["codex"], deny: null, force: null }),
      updateLimits: async () => ({ ok: true, limits: DEFAULT_LIMITS }),
    };
    expect(configView.overrides().allow).toEqual(["codex"]);
  });
});
