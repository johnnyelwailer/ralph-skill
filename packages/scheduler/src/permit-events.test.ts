import { describe, expect, test } from "bun:test";
import {
  appendPermitGrant,
  appendPermitRelease,
  appendPermitExpired,
  appendPermitDeny,
  resolvePermitTtl,
} from "./permit-events.ts";

class MockEventWriter {
  readonly events: Array<{ topic: string; data: Record<string, unknown> }> = [];
  async append(topic: string, data: Record<string, unknown>): Promise<void> {
    this.events.push({ topic, data });
  }
}

// ─── appendPermitGrant ───────────────────────────────────────────────────────

describe("appendPermitGrant", () => {
  test("appends scheduler.permit.grant event with all fields", async () => {
    const events = new MockEventWriter();
    await appendPermitGrant(events, {
      permitId: "perm_abc123",
      sessionId: "sess_1",
      providerId: "opencode",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.permit.grant");
    expect(events.events[0]!.data).toEqual({
      permit_id: "perm_abc123",
      session_id: "sess_1",
      provider_id: "opencode",
      ttl_seconds: 600,
      granted_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-01T00:10:00.000Z",
    });
  });

  test("emits distinct events for each permit", async () => {
    const events = new MockEventWriter();
    await appendPermitGrant(events, {
      permitId: "perm_1",
      sessionId: "sess_a",
      providerId: "opencode",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
    await appendPermitGrant(events, {
      permitId: "perm_2",
      sessionId: "sess_b",
      providerId: "anthropic",
      ttlSeconds: 900,
      grantedAt: "2026-01-02T00:00:00.000Z",
      expiresAt: "2026-01-02T00:15:00.000Z",
    });
    expect(events.events).toHaveLength(2);
    expect(events.events[0]!.data.permit_id).toBe("perm_1");
    expect(events.events[1]!.data.permit_id).toBe("perm_2");
  });
});

// ─── appendPermitRelease ────────────────────────────────────────────────────

describe("appendPermitRelease", () => {
  test("appends scheduler.permit.release event with permit_id and session_id", async () => {
    const events = new MockEventWriter();
    await appendPermitRelease(events, {
      permitId: "perm_xyz",
      sessionId: "sess_release",
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.permit.release");
    expect(events.events[0]!.data).toEqual({
      permit_id: "perm_xyz",
      session_id: "sess_release",
    });
  });
});

// ─── appendPermitExpired ────────────────────────────────────────────────────

describe("appendPermitExpired", () => {
  test("appends scheduler.permit.expired event with permit_id and session_id", async () => {
    const events = new MockEventWriter();
    await appendPermitExpired(events, {
      permitId: "perm_expired",
      sessionId: "sess_exp",
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.permit.expired");
    expect(events.events[0]!.data).toEqual({
      permit_id: "perm_expired",
      session_id: "sess_exp",
    });
  });
});

// ─── appendPermitDeny ───────────────────────────────────────────────────────

describe("appendPermitDeny", () => {
  test("appends scheduler.permit.deny event with all fields", async () => {
    const events = new MockEventWriter();
    const result = await appendPermitDeny(events, {
      sessionId: "sess_deny",
      reason: "concurrency_cap_reached",
      gate: "concurrency",
      details: { active_permits: 3, concurrency_cap: 3 },
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.topic).toBe("scheduler.permit.deny");
    expect(events.events[0]!.data).toEqual({
      session_id: "sess_deny",
      reason: "concurrency_cap_reached",
      gate: "concurrency",
      details: { active_permits: 3, concurrency_cap: 3 },
    });
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("concurrency_cap_reached");
    expect(result.gate).toBe("concurrency");
  });

  test("includes retry_after_seconds in event payload when provided", async () => {
    const events = new MockEventWriter();
    const result = await appendPermitDeny(events, {
      sessionId: "sess_retry",
      reason: "rate_limited",
      gate: "provider",
      details: { provider_id: "opencode" },
      retryAfterSeconds: 120,
    });
    expect(events.events[0]!.data).toEqual({
      session_id: "sess_retry",
      reason: "rate_limited",
      gate: "provider",
      details: { provider_id: "opencode" },
      retry_after_seconds: 120,
    });
    expect(result.retryAfterSeconds).toBe(120);
  });

  test("does not include retry_after_seconds key when not provided", async () => {
    const events = new MockEventWriter();
    await appendPermitDeny(events, {
      sessionId: "sess_no_retry",
      reason: "provider_denied",
      gate: "overrides",
      details: { provider_candidate: "unknown" },
    });
    expect("retry_after_seconds" in events.events[0]!.data).toBe(false);
  });

  test("returned PermitDecision matches the event payload", async () => {
    const events = new MockEventWriter();
    const result = await appendPermitDeny(events, {
      sessionId: "sess_check",
      reason: "system_limit_exceeded",
      gate: "system",
      details: { cpu_pct: 99 },
    });
    expect(result).toEqual({
      granted: false,
      reason: "system_limit_exceeded",
      gate: "system",
      details: { cpu_pct: 99 },
    });
  });
});

// ─── resolvePermitTtl ────────────────────────────────────────────────────────

describe("resolvePermitTtl", () => {
  test("returns defaultTtlSeconds when requested is undefined", () => {
    expect(resolvePermitTtl(undefined, 600, 3600)).toBe(600);
  });

  test("returns requested when it is below max", () => {
    expect(resolvePermitTtl(300, 600, 3600)).toBe(300);
  });

  test("returns max when requested exceeds maxTtlSeconds", () => {
    expect(resolvePermitTtl(9999, 600, 3600)).toBe(3600);
  });

  test("returns requested when it equals maxTtlSeconds", () => {
    expect(resolvePermitTtl(3600, 600, 3600)).toBe(3600);
  });

  test("returns zero when requested is zero (zero is a valid TTL below max)", () => {
    expect(resolvePermitTtl(0, 600, 3600)).toBe(0);
  });

  test("handles large numbers without overflow", () => {
    expect(resolvePermitTtl(1_000_000_000, 600, 3600)).toBe(3600);
  });

  test("defaultTtlSeconds can be larger than maxTtlSeconds", () => {
    // Edge case: if default > max, resolvePermitTtl still returns Math.min(undefined, max) = default
    expect(resolvePermitTtl(undefined, 7200, 3600)).toBe(7200);
  });
});
