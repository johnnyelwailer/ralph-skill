import { describe, expect, test } from "bun:test";
import {
  appendPermitDeny,
  appendPermitExpired,
  appendPermitGrant,
  appendPermitRelease,
  resolvePermitTtl,
} from "./permit-events.ts";

function mockEventWriter() {
  const events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  return {
    events,
    append: async (topic: string, data: Record<string, unknown>) => {
      events.push({ topic, data });
      return { _v: 1 as const, id: "evt_test", timestamp: "2024-01-01T00:00:00.000Z", topic, data };
    },
  };
}

// ─── resolvePermitTtl ─────────────────────────────────────────────────────────

describe("resolvePermitTtl", () => {
  test("returns defaultTtlSeconds when requested is undefined", () => {
    expect(resolvePermitTtl(undefined, 600, 3600)).toBe(600);
    expect(resolvePermitTtl(undefined, 300, 1800)).toBe(300);
  });

  test("returns requested value when it is below max", () => {
    expect(resolvePermitTtl(500, 600, 3600)).toBe(500);
    expect(resolvePermitTtl(100, 600, 3600)).toBe(100);
  });

  test("returns maxTtlSeconds when requested exceeds it", () => {
    expect(resolvePermitTtl(7200, 600, 3600)).toBe(3600);
    expect(resolvePermitTtl(3600, 600, 3600)).toBe(3600);
  });

  test("returns requested when it equals max exactly", () => {
    expect(resolvePermitTtl(3600, 600, 3600)).toBe(3600);
  });

  test("handles edge case of zero default", () => {
    expect(resolvePermitTtl(undefined, 0, 3600)).toBe(0);
  });

  test("handles edge case of zero max", () => {
    // when requested is undefined, defaultTtlSeconds is returned regardless of max
    expect(resolvePermitTtl(undefined, 600, 0)).toBe(600);
    // when requested is defined, Math.min(requested, maxTtlSeconds) is used
    expect(resolvePermitTtl(100, 600, 0)).toBe(0);
    expect(resolvePermitTtl(0, 600, 0)).toBe(0);
  });
});

// ─── appendPermitGrant ────────────────────────────────────────────────────────

describe("appendPermitGrant", () => {
  test("appends scheduler.permit.grant event with correct fields", async () => {
    const { events, append } = mockEventWriter();
    const mockEvents = { append };
    await appendPermitGrant(mockEvents, {
      permitId: "perm_abc",
      owner: { sessionId: "sess_123" },
      providerId: "opencode",
      ttlSeconds: 600,
      grantedAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2024-01-01T00:10:00.000Z",
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.topic).toBe("scheduler.permit.grant");
    expect(events[0]!.data).toEqual({
      permit_id: "perm_abc",
      session_id: "sess_123",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2024-01-01T00:00:00.000Z",
      expires_at: "2024-01-01T00:10:00.000Z",
    });
  });

  test("returns void (undefined)", async () => {
    const { append } = mockEventWriter();
    const result = await appendPermitGrant({ append }, {
      permitId: "p1",
      owner: { sessionId: "s1" },
      providerId: "prov",
      ttlSeconds: 300,
      grantedAt: "t1",
      expiresAt: "t2",
    });
    expect(result).toBeUndefined();
  });

  test("serialises research_run_id owner to event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitGrant({ append }, {
      permitId: "perm_r",
      owner: { researchRunId: "rr_test_01" },
      providerId: "opencode",
      ttlSeconds: 300,
      grantedAt: "t1",
      expiresAt: "t2",
    });
    expect(events[0]!.data).toEqual({
      permit_id: "perm_r",
      research_run_id: "rr_test_01",
      provider_id: "opencode",
      ttl_seconds: 300,
      granted_at: "t1",
      expires_at: "t2",
    });
    expect(events[0]!.data).not.toHaveProperty("session_id");
  });

  test("serialises composer_turn_id owner to event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitGrant({ append }, {
      permitId: "perm_c",
      owner: { composerTurnId: "ct_01" },
      providerId: "opencode",
      ttlSeconds: 300,
      grantedAt: "t1",
      expiresAt: "t2",
    });
    expect(events[0]!.data).toEqual({
      permit_id: "perm_c",
      composer_turn_id: "ct_01",
      provider_id: "opencode",
      ttl_seconds: 300,
      granted_at: "t1",
      expires_at: "t2",
    });
  });

  test("serialises control_subagent_run_id owner to event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitGrant({ append }, {
      permitId: "perm_cs",
      owner: { controlSubagentRunId: "csar_01" },
      providerId: "opencode",
      ttlSeconds: 300,
      grantedAt: "t1",
      expiresAt: "t2",
    });
    expect(events[0]!.data).toEqual({
      permit_id: "perm_cs",
      control_subagent_run_id: "csar_01",
      provider_id: "opencode",
      ttl_seconds: 300,
      granted_at: "t1",
      expires_at: "t2",
    });
  });
});

// ─── appendPermitRelease ────────────────────────────────────────────────────

describe("appendPermitRelease", () => {
  test("appends scheduler.permit.release event with correct fields", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitRelease({ append }, {
      permitId: "perm_xyz",
      owner: { sessionId: "sess_456" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.topic).toBe("scheduler.permit.release");
    expect(events[0]!.data).toEqual({
      permit_id: "perm_xyz",
      session_id: "sess_456",
    });
  });

  test("returns void", async () => {
    const { append } = mockEventWriter();
    const result = await appendPermitRelease({ append }, {
      permitId: "p1",
      owner: { sessionId: "s1" },
    });
    expect(result).toBeUndefined();
  });

  test("serialises research_run_id owner to event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitRelease({ append }, {
      permitId: "perm_r",
      owner: { researchRunId: "rr_02" },
    });
    expect(events[0]!.data).toEqual({
      permit_id: "perm_r",
      research_run_id: "rr_02",
    });
    expect(events[0]!.data).not.toHaveProperty("session_id");
  });
});

// ─── appendPermitExpired ──────────────────────────────────────────────────────

describe("appendPermitExpired", () => {
  test("appends scheduler.permit.expired event with correct fields", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitExpired({ append }, {
      permitId: "perm_old",
      owner: { sessionId: "sess_old" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.topic).toBe("scheduler.permit.expired");
    expect(events[0]!.data).toEqual({
      permit_id: "perm_old",
      session_id: "sess_old",
    });
  });

  test("returns void", async () => {
    const { append } = mockEventWriter();
    const result = await appendPermitExpired({ append }, {
      permitId: "p1",
      owner: { sessionId: "s1" },
    });
    expect(result).toBeUndefined();
  });

  test("serialises composer_turn_id owner to event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitExpired({ append }, {
      permitId: "perm_c",
      owner: { composerTurnId: "ct_03" },
    });
    expect(events[0]!.data).toEqual({
      permit_id: "perm_c",
      composer_turn_id: "ct_03",
    });
  });
});

// ─── appendPermitDeny ────────────────────────────────────────────────────────

describe("appendPermitDeny", () => {
  test("appends scheduler.permit.deny event and returns PermitDenied without retryAfterSeconds", async () => {
    const { events, append } = mockEventWriter();
    const result = await appendPermitDeny({ append }, {
      owner: { sessionId: "sess_denied" },
      reason: "concurrency_limit",
      gate: "concurrency_cap",
      details: { current: 5, max: 5 },
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.topic).toBe("scheduler.permit.deny");
    expect(events[0]!.data).toEqual({
      session_id: "sess_denied",
      reason: "concurrency_limit",
      gate: "concurrency_cap",
      details: { current: 5, max: 5 },
    });

    expect(result).toEqual({
      granted: false,
      reason: "concurrency_limit",
      gate: "concurrency_cap",
      details: { current: 5, max: 5 },
    });
  });

  test("includes retry_after_seconds in event when retryAfterSeconds is provided", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitDeny({ append }, {
      owner: { sessionId: "sess_retry" },
      reason: "rate_limit",
      gate: "burn_rate",
      details: {},
      retryAfterSeconds: 60,
    });

    expect(events[0]!.data).toEqual({
      session_id: "sess_retry",
      reason: "rate_limit",
      gate: "burn_rate",
      details: {},
      retry_after_seconds: 60,
    });
  });

  test("returns PermitDenied with retryAfterSeconds when provided", async () => {
    const { append } = mockEventWriter();
    const result = await appendPermitDeny({ append }, {
      owner: { sessionId: "sess_retry" },
      reason: "rate_limit",
      gate: "burn_rate",
      details: {},
      retryAfterSeconds: 60,
    });

    expect(result).toEqual({
      granted: false,
      reason: "rate_limit",
      gate: "burn_rate",
      details: {},
      retryAfterSeconds: 60,
    });
  });

  test("event omits retry_after_seconds key when retryAfterSeconds is undefined", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitDeny({ append }, {
      owner: { sessionId: "sess_no_retry" },
      reason: "denied",
      gate: "test",
      details: { foo: "bar" },
    });

    expect(events[0]!.data).not.toHaveProperty("retry_after_seconds");
    expect(events[0]!.data).toHaveProperty("session_id");
    expect(events[0]!.data).toHaveProperty("reason");
  });

  test("result omits retryAfterSeconds key when retryAfterSeconds is undefined", async () => {
    const { append } = mockEventWriter();
    const result = await appendPermitDeny({ append }, {
      owner: { sessionId: "sess_no_retry" },
      reason: "denied",
      gate: "test",
      details: { foo: "bar" },
    });

    expect(result).not.toHaveProperty("retryAfterSeconds");
    expect((result as { retryAfterSeconds?: number }).retryAfterSeconds).toBeUndefined();
  });

  test("returns denial even when events.append throws", async () => {
    // Audit log failure must not prevent the denial response from being returned.
    // The permit decision is authoritative; event logging is best-effort.
    const failingAppend = async (_topic: string, _data: Record<string, unknown>) => {
      throw new Error("disk full");
    };
    const result = await appendPermitDeny({ append: failingAppend }, {
      owner: { sessionId: "sess_audit_fail" },
      reason: "concurrency_cap",
      gate: "concurrency",
      details: { active_permits: 3, concurrency_cap: 3 },
    });

    expect(result.granted).toBe(false);
    const denied = result as { granted: false; reason: string; gate: string; details: Record<string, unknown> };
    expect(denied.reason).toBe("concurrency_cap");
    expect(denied.gate).toBe("concurrency");
    expect(denied.details).toEqual({ active_permits: 3, concurrency_cap: 3 });
  });

  test("returns denial with retryAfterSeconds even when events.append throws", async () => {
    const failingAppend = async (_topic: string, _data: Record<string, unknown>) => {
      throw new Error("disk full");
    };
    const result = await appendPermitDeny({ append: failingAppend }, {
      owner: { sessionId: "sess_retry_audit_fail" },
      reason: "system_pressure",
      gate: "system",
      details: { cpu: 95, limit: 80 },
      retryAfterSeconds: 30,
    });

    expect(result.granted).toBe(false);
    const denied = result as { granted: false; retryAfterSeconds: number };
    expect(denied.retryAfterSeconds).toBe(30);
  });

  test("serialises research_run_id owner in deny event", async () => {
    const { events, append } = mockEventWriter();
    const result = await appendPermitDeny({ append }, {
      owner: { researchRunId: "rr_deny_01" },
      reason: "concurrency_cap",
      gate: "concurrency",
      details: {},
    });
    expect(events[0]!.data).toEqual({
      research_run_id: "rr_deny_01",
      reason: "concurrency_cap",
      gate: "concurrency",
      details: {},
    });
    expect(events[0]!.data).not.toHaveProperty("session_id");
    expect(result.granted).toBe(false);
  });

  test("serialises composer_turn_id owner in deny event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitDeny({ append }, {
      owner: { composerTurnId: "ct_deny_01" },
      reason: "system_limit_exceeded",
      gate: "system",
      details: {},
    });
    expect(events[0]!.data).toHaveProperty("composer_turn_id", "ct_deny_01");
    expect(events[0]!.data).not.toHaveProperty("session_id");
  });

  test("serialises control_subagent_run_id owner in deny event", async () => {
    const { events, append } = mockEventWriter();
    await appendPermitDeny({ append }, {
      owner: { controlSubagentRunId: "csar_deny_01" },
      reason: "provider_quota_exceeded",
      gate: "provider",
      details: {},
    });
    expect(events[0]!.data).toHaveProperty("control_subagent_run_id", "csar_deny_01");
    expect(events[0]!.data).not.toHaveProperty("session_id");
  });
});
