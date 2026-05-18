import { describe, expect, test } from "bun:test";
import { resolvePermitTtl } from "./permit-events.ts";
import type { PermitOwner } from "./decisions.ts";

// ownerToFields is exported for testing but not re-exported from index.
// We test it via the append* functions' behavior.

describe("resolvePermitTtl", () => {
  test("returns defaultTtlSeconds when requested is undefined", () => {
    expect(resolvePermitTtl(undefined, 300, 3600)).toBe(300);
  });

  test("returns requested when it is below max", () => {
    expect(resolvePermitTtl(120, 300, 3600)).toBe(120);
  });

  test("returns maxTtlSeconds when requested exceeds it", () => {
    expect(resolvePermitTtl(9999, 300, 3600)).toBe(3600);
  });

  test("returns defaultTtlSeconds when requested equals max", () => {
    expect(resolvePermitTtl(3600, 300, 3600)).toBe(3600);
  });

  test("handles zero requested (returns 0, not default)", () => {
    expect(resolvePermitTtl(0, 300, 3600)).toBe(0);
  });
});

describe("appendPermitGrant", () => {
  test("serialises session owner as session_id", async () => {
    const events = makeMockEventWriter();
    const { appendPermitGrant } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-42" };
    await appendPermitGrant(events, {
      permitId: "perm-1",
      owner,
      projectId: "proj-1",
      providerId: "provider-a",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });

    const appended = events.appends[0];
    expect(appended.topic).toBe("scheduler.permit.grant");
    expect(appended.data).toMatchObject({ session_id: "sess-42" });
    expect(appended.data).not.toHaveProperty("composer_turn_id");
    expect(appended.data).not.toHaveProperty("control_subagent_run_id");
  });

  test("serialises composerTurn owner as composer_turn_id", async () => {
    const events = makeMockEventWriter();
    const { appendPermitGrant } = await import("./permit-events.ts");

    const owner: PermitOwner = { composerTurnId: "turn-99" };
    await appendPermitGrant(events, {
      permitId: "perm-2",
      owner,
      projectId: null,
      providerId: "provider-b",
      ttlSeconds: 600,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z",
    });

    const appended = events.appends[0];
    expect(appended.data).toMatchObject({ composer_turn_id: "turn-99" });
    expect(appended.data).not.toHaveProperty("session_id");
    expect(appended.data).not.toHaveProperty("control_subagent_run_id");
  });

  test("serialises controlSubagentRun owner as control_subagent_run_id", async () => {
    const events = makeMockEventWriter();
    const { appendPermitGrant } = await import("./permit-events.ts");

    const owner: PermitOwner = { controlSubagentRunId: "run-abc" };
    await appendPermitGrant(events, {
      permitId: "perm-3",
      owner,
      projectId: "proj-3",
      providerId: "provider-c",
      ttlSeconds: 120,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:02:00.000Z",
    });

    const appended = events.appends[0];
    expect(appended.data).toMatchObject({ control_subagent_run_id: "run-abc" });
    expect(appended.data).not.toHaveProperty("session_id");
    expect(appended.data).not.toHaveProperty("composer_turn_id");
  });

  test("omits project_id when projectId is null", async () => {
    const events = makeMockEventWriter();
    const { appendPermitGrant } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-null-proj" };
    await appendPermitGrant(events, {
      permitId: "perm-4",
      owner,
      projectId: null,
      providerId: "provider-d",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });

    const appended = events.appends[0];
    expect(appended.data).not.toHaveProperty("project_id");
  });

  test("includes project_id when projectId is non-null", async () => {
    const events = makeMockEventWriter();
    const { appendPermitGrant } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-with-proj" };
    await appendPermitGrant(events, {
      permitId: "perm-5",
      owner,
      projectId: "proj-visible",
      providerId: "provider-e",
      ttlSeconds: 300,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });

    const appended = events.appends[0];
    expect(appended.data).toMatchObject({ project_id: "proj-visible" });
  });
});

describe("appendPermitRelease", () => {
  test("serialises owner fields and permit_id", async () => {
    const events = makeMockEventWriter();
    const { appendPermitRelease } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-release" };
    await appendPermitRelease(events, {
      permitId: "perm-release-1",
      owner,
    });

    const appended = events.appends[0];
    expect(appended.topic).toBe("scheduler.permit.release");
    expect(appended.data).toMatchObject({
      permit_id: "perm-release-1",
      session_id: "sess-release",
    });
  });
});

describe("appendPermitExpired", () => {
  test("serialises owner fields and permit_id", async () => {
    const events = makeMockEventWriter();
    const { appendPermitExpired } = await import("./permit-events.ts");

    const owner: PermitOwner = { composerTurnId: "turn-expired" };
    await appendPermitExpired(events, {
      permitId: "perm-expired-1",
      owner,
    });

    const appended = events.appends[0];
    expect(appended.topic).toBe("scheduler.permit.expired");
    expect(appended.data).toMatchObject({
      permit_id: "perm-expired-1",
      composer_turn_id: "turn-expired",
    });
  });
});

describe("appendPermitDeny", () => {
  test("returns PermitDenied with all fields", async () => {
    const events = makeMockEventWriter();
    const { appendPermitDeny } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-deny" };
    const result = await appendPermitDeny(events, {
      owner,
      reason: "concurrency_limit",
      gate: "global_cap",
      details: { concurrencyCap: 3, currentPermits: 3 },
      retryAfterSeconds: 45,
    });

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("concurrency_limit");
    expect(result.gate).toBe("global_cap");
    expect(result.details).toEqual({ concurrencyCap: 3, currentPermits: 3 });
    expect(result.retryAfterSeconds).toBe(45);
  });

  test("returns PermitDenied without retryAfterSeconds when not provided", async () => {
    const events = makeMockEventWriter();
    const { appendPermitDeny } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-deny-no-retry" };
    const result = await appendPermitDeny(events, {
      owner,
      reason: "rate_limit",
      gate: "provider_quota",
      details: {},
    });

    expect(result.granted).toBe(false);
    expect(result).not.toHaveProperty("retryAfterSeconds");
  });

  test("appends deny event with retry_after_seconds included when provided", async () => {
    const events = makeMockEventWriter();
    const { appendPermitDeny } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-event" };
    await appendPermitDeny(events, {
      owner,
      reason: "quota_exceeded",
      gate: "provider_quota",
      details: { provider: "opencode" },
      retryAfterSeconds: 30,
    });

    const appended = events.appends[0];
    expect(appended.topic).toBe("scheduler.permit.deny");
    expect(appended.data).toMatchObject({
      session_id: "sess-event",
      reason: "quota_exceeded",
      gate: "provider_quota",
      retry_after_seconds: 30,
    });
  });

  test(" swallows event writer errors and still returns PermitDenied", async () => {
    const events = makeFailingEventWriter();
    const { appendPermitDeny } = await import("./permit-events.ts");

    const owner: PermitOwner = { sessionId: "sess-fail" };
    const result = await appendPermitDeny(events, {
      owner,
      reason: "audit_log_failure",
      gate: "test",
      details: {},
    });

    // The denial is still returned even when event append fails
    expect(result.granted).toBe(false);
    expect(result.reason).toBe("audit_log_failure");
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AppendedEvent = {
  topic: string;
  data: Record<string, unknown>;
};

function makeMockEventWriter(): {
  appends: AppendedEvent[];
  append: <T>(topic: string, data: T) => Promise<{ _v: 1; id: string; timestamp: string; topic: string; data: T }>;
} {
  const appends: AppendedEvent[] = [];
  return {
    appends,
    append: async <T>(topic: string, data: T) => {
      appends.push({ topic, data: data as Record<string, unknown> });
      return { _v: 1 as const, id: "evt_test", timestamp: new Date(0).toISOString(), topic, data };
    },
  };
}

function makeFailingEventWriter(): {
  append: <T>(_topic: string, _data: T) => Promise<never>;
} {
  return {
    append: async <T>(_topic: string, _data: T) => {
      throw new Error("event writer failed");
    },
  };
}