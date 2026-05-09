import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  detectStuckSessions,
  recoverCrashedSessions,
  refreshProviderHealth,
  readLastLineOfLog,
  parseEventTimestamp,
  watchSessionBurnRates,
} from "./watchdog-jobs.ts";

function makeFakeEventWriter() {
  const events: Array<{ topic: string; data: unknown }> = [];
  return {
    events,
    append: async <T>(topic: string, data: T) => {
      events.push({ topic, data });
      return {
        _v: 1 as const,
        id: `test-${Date.now()}.000001`,
        timestamp: new Date().toISOString(),
        topic,
        data,
      };
    },
  };
}

function makeFakeProviderAdapter(overrides: {
  id?: string;
  quotaProbe?: boolean;
  probeQuotaFn?: () => Promise<unknown>;
}) {
  return {
    id: overrides.id ?? "test-provider",
    capabilities: {
      streaming: false,
      vision: false,
      toolUse: false,
      reasoningEffort: false,
      sessionResume: false,
      costReporting: false,
      maxContextTokens: null,
      quotaProbe: overrides.quotaProbe ?? false,
    },
    resolveModel: () => ({ providerId: "test", modelId: "test/model" }),
    sendTurn: async function* () {},
    ...(overrides.probeQuotaFn ? { probeQuota: overrides.probeQuotaFn } : {}),
  };
}

function makeFakeProviderRegistry(adapters: ReturnType<typeof makeFakeProviderAdapter>[]) {
  return {
    list: () => adapters,
  };
}

describe("readLastLineOfLog", () => {
  const tmpDir = join(process.env.TMPDIR ?? "/tmp", `watchdog-test-${Date.now()}`);
  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns null when log.jsonl does not exist", async () => {
    const result = await readLastLineOfLog(tmpDir);
    expect(result).toBeNull();
  });

  test("returns null when log.jsonl is empty", async () => {
    writeFileSync(join(tmpDir, "log.jsonl"), "", "utf-8");
    const result = await readLastLineOfLog(tmpDir);
    expect(result).toBeNull();
  });

  test("returns last line when log.jsonl has multiple lines", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    writeFileSync(logPath, '{"_v":1,"id":"1","timestamp":"2026-01-01T00:00:00.000Z","topic":"a","data":{}}\n', "utf-8");
    writeFileSync(logPath, '{"_v":1,"id":"2","timestamp":"2026-01-02T00:00:00.000Z","topic":"b","data":{}}\n', "utf-8");
    const result = await readLastLineOfLog(tmpDir);
    expect(result).toContain('"id":"2"');
  });

  test("skips blank lines", async () => {
    const logPath = join(tmpDir, "log.jsonl");
    writeFileSync(logPath, '{"_v":1,"id":"1","timestamp":"2026-01-01T00:00:00.000Z","topic":"a","data":{}}\n\n  \n', "utf-8");
    const result = await readLastLineOfLog(tmpDir);
    expect(result).toContain('"id":"1"');
  });
});

describe("parseEventTimestamp", () => {
  test("returns timestamp from valid envelope line", () => {
    const line = '{"_v":1,"id":"1746134400000.000001","timestamp":"2026-05-01T12:00:00.000Z","topic":"session.update","data":{"session_id":"s_abc123","status":"running"}}';
    const result = parseEventTimestamp(line);
    expect(result).toBe("2026-05-01T12:00:00.000Z");
  });

  test("returns null for invalid JSON", () => {
    expect(parseEventTimestamp("not json")).toBeNull();
  });

  test("returns null for valid JSON without timestamp", () => {
    expect(parseEventTimestamp('{"_v":1,"id":"1","data":{}}')).toBeNull();
  });
});

describe("recoverCrashedSessions", () => {
  const tmpDir = join(process.env.TMPDIR ?? "/tmp", `watchdog-recover-test-${Date.now()}`);
  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns 0 when sessionsDir does not exist", async () => {
    const writer = makeFakeEventWriter();
    const result = await recoverCrashedSessions(join(tmpDir, "nonexistent"), writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips sessions that are not running", async () => {
    const sessionDir = join(tmpDir, "s_running");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_running",
      project_id: "p1",
      kind: "standalone",
      status: "pending",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const result = await recoverCrashedSessions(tmpDir, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("marks running sessions as interrupted and emits event", async () => {
    const sessionDir = join(tmpDir, "s_running");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_running",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");
    writeFileSync(join(sessionDir, "log.jsonl"), '{"_v":1,"id":"1","timestamp":"2026-05-01T12:00:00.000Z","topic":"session.update","data":{}}\n', "utf-8");

    const writer = makeFakeEventWriter();
    const result = await recoverCrashedSessions(tmpDir, writer);

    expect(result).toBe(1);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("session.interrupted");
    expect(writer.events[0]!.data).toMatchObject({ session_id: "s_running" });

    const saved = JSON.parse(readFileSync(join(sessionDir, "session.json"), "utf-8"));
    expect(saved.status).toBe("interrupted");
  });

  test("uses null last_event_at when log.jsonl is empty", async () => {
    const sessionDir = join(tmpDir, "s_running2");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_running2",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");
    writeFileSync(join(sessionDir, "log.jsonl"), "", "utf-8");

    const writer = makeFakeEventWriter();
    await recoverCrashedSessions(tmpDir, writer);

    expect(writer.events[0]!.data).toMatchObject({
      session_id: "s_running2",
      last_event_at: null,
    });
  });

  test("handles multiple running sessions", async () => {
    for (const id of ["s1", "s2", "s3"]) {
      const sessionDir = join(tmpDir, id);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
        id,
        project_id: "p1",
        kind: "standalone",
        status: "running",
        workflow: null,
        created_at: new Date().toISOString(),
      }), "utf-8");
      writeFileSync(join(sessionDir, "log.jsonl"), `{"_v":1,"id":"${id}","timestamp":"2026-05-01T12:00:00.000Z","topic":"x","data":{}}\n`, "utf-8");
    }

    const writer = makeFakeEventWriter();
    const result = await recoverCrashedSessions(tmpDir, writer);
    expect(result).toBe(3);
    expect(writer.events).toHaveLength(3);
  });
});

describe("detectStuckSessions", () => {
  const tmpDir = join(process.env.TMPDIR ?? "/tmp", `watchdog-stuck-test-${Date.now()}`);
  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns 0 when sessionsDir does not exist", async () => {
    const writer = makeFakeEventWriter();
    const result = await detectStuckSessions(join(tmpDir, "nonexistent"), 60, writer);
    expect(result).toBe(0);
  });

  test("skips non-running sessions", async () => {
    const sessionDir = join(tmpDir, "s_completed");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_completed",
      project_id: "p1",
      kind: "standalone",
      status: "completed",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const result = await detectStuckSessions(tmpDir, 60, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips sessions with no log.jsonl", async () => {
    const sessionDir = join(tmpDir, "s_nolog");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_nolog",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const result = await detectStuckSessions(tmpDir, 60, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("emits session.stuck when last event is older than threshold", async () => {
    const oldTime = new Date(Date.now() - 120 * 1000).toISOString();
    const sessionDir = join(tmpDir, "s_stuck");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_stuck",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");
    writeFileSync(join(sessionDir, "log.jsonl"), `{"_v":1,"id":"1","timestamp":"${oldTime}","topic":"session.update","data":{}}\n`, "utf-8");

    const writer = makeFakeEventWriter();
    const result = await detectStuckSessions(tmpDir, 60, writer);

    expect(result).toBe(1);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("session.stuck");
    expect(writer.events[0]!.data).toMatchObject({
      session_id: "s_stuck",
      last_event_at: oldTime,
    });
    expect((writer.events[0]!.data as { elapsed: number }).elapsed).toBeGreaterThanOrEqual(120);
  });

  test("does not emit session.stuck when session is active", async () => {
    const recentTime = new Date(Date.now() - 10 * 1000).toISOString();
    const sessionDir = join(tmpDir, "s_active");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_active",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");
    writeFileSync(join(sessionDir, "log.jsonl"), `{"_v":1,"id":"1","timestamp":"${recentTime}","topic":"session.update","data":{}}\n`, "utf-8");

    const writer = makeFakeEventWriter();
    const result = await detectStuckSessions(tmpDir, 60, writer);

    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("uses custom now function for elapsed calculation", async () => {
    const recentTime = new Date(Date.now() - 10 * 1000).toISOString();
    const sessionDir = join(tmpDir, "s_recent");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_recent",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");
    writeFileSync(join(sessionDir, "log.jsonl"), `{"_v":1,"id":"1","timestamp":"${recentTime}","topic":"x","data":{}}\n`, "utf-8");

    const writer = makeFakeEventWriter();
    const fixedNow = Date.now() + 120 * 1000;
    const result = await detectStuckSessions(tmpDir, 60, writer, () => fixedNow);

    expect(result).toBe(1);
    expect((writer.events[0]!.data as { elapsed: number }).elapsed).toBeGreaterThanOrEqual(120);
  });
});

describe("refreshProviderHealth", () => {
  test("skips adapters without quotaProbe capability", async () => {
    const adapter = makeFakeProviderAdapter({ id: "opencode", quotaProbe: false });
    const registry = makeFakeProviderRegistry([adapter]);
    const healthStore = {
      setQuota: (id: string, q: { remaining: number; resetsAt: string | null }) => ({ id, ...q }),
    } as any;
    const writer = makeFakeEventWriter();

    const result = await refreshProviderHealth(registry as any, healthStore, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips adapters that don't implement probeQuota", async () => {
    const adapter = makeFakeProviderAdapter({ id: "opencode", quotaProbe: true });
    const registry = makeFakeProviderRegistry([adapter]);
    const healthStore = {
      setQuota: (id: string, q: { remaining: number; resetsAt: string | null }) => ({ id, ...q }),
    } as any;
    const writer = makeFakeEventWriter();

    const result = await refreshProviderHealth(registry as any, healthStore, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("calls probeQuota and updates health store for capable adapters", async () => {
    const fakeSnapshot = {
      remaining: 1000,
      total: 5000,
      resetsAt: "2026-06-01T00:00:00.000Z",
      currency: "tokens" as const,
      probedAt: new Date().toISOString(),
    };
    const adapter = makeFakeProviderAdapter({
      id: "opencode",
      quotaProbe: true,
      probeQuotaFn: async () => fakeSnapshot,
    });
    const registry = makeFakeProviderRegistry([adapter]);
    let setQuotaCalled = false;
    const healthStore = {
      setQuota: (id: string, q: { remaining: number; resetsAt: string | null }) => {
        setQuotaCalled = true;
        expect(id).toBe("opencode");
        expect(q.remaining).toBe(1000);
        return { id, ...q };
      },
    } as any;
    const writer = makeFakeEventWriter();

    const result = await refreshProviderHealth(registry as any, healthStore, writer);
    expect(result).toBe(1);
    expect(setQuotaCalled).toBe(true);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("provider.quota");
    expect(writer.events[0]!.data).toMatchObject({
      provider_id: "opencode",
      remaining: 1000,
      total: 5000,
    });
  });

  test("swallows probeQuota errors", async () => {
    const adapter = makeFakeProviderAdapter({
      id: "flaky",
      quotaProbe: true,
      probeQuotaFn: async () => { throw new Error("network error"); },
    });
    const registry = makeFakeProviderRegistry([adapter]);
    const healthStore = {
      setQuota: () => { throw new Error("should not be called"); },
    } as any;
    const writer = makeFakeEventWriter();

    const result = await refreshProviderHealth(registry as any, healthStore, writer);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("processes multiple providers", async () => {
    const a1 = makeFakeProviderAdapter({
      id: "p1",
      quotaProbe: true,
      probeQuotaFn: async () => ({ remaining: 100, total: 200, resetsAt: null, probedAt: new Date().toISOString() }),
    });
    const a2 = makeFakeProviderAdapter({ id: "p2", quotaProbe: false });
    const a3 = makeFakeProviderAdapter({
      id: "p3",
      quotaProbe: true,
      probeQuotaFn: async () => ({ remaining: 50, total: 100, resetsAt: null, probedAt: new Date().toISOString() }),
    });
    const registry = makeFakeProviderRegistry([a1, a2, a3]);
    const called: string[] = [];
    const healthStore = {
      setQuota: (id: string, q: { remaining: number; resetsAt: string | null }) => {
        called.push(id);
        return { id, ...q };
      },
    } as any;
    const writer = makeFakeEventWriter();

    const result = await refreshProviderHealth(registry as any, healthStore, writer);
    expect(result).toBe(2);
    expect(called).toContain("p1");
    expect(called).not.toContain("p2");
    expect(called).toContain("p3");
    expect(writer.events).toHaveLength(2);
  });
});

// ─── watchSessionBurnRates ─────────────────────────────────────────────────────

describe("watchSessionBurnRates", () => {
  const tmpDir = join(process.env.TMPDIR ?? "/tmp", `watchdog-burnrate-test-${Date.now()}`);
  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns 0 when sessionsDir does not exist", async () => {
    const writer = makeFakeEventWriter();
    const probe = () => null;
    const result = await watchSessionBurnRates(
      join(tmpDir, "nonexistent"),
      writer,
      probe as any,
      1_000_000,
      1,
    );
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips non-running sessions", async () => {
    const sessionDir = join(tmpDir, "s_completed");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_completed",
      project_id: "p1",
      kind: "standalone",
      status: "completed",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => null;
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips sessions when burnRateProbe returns null", async () => {
    const sessionDir = join(tmpDir, "s_null_probe");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_null_probe",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => null;
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("skips sessions when burnRateProbe throws", async () => {
    const sessionDir = join(tmpDir, "s_throwing");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_throwing",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => { throw new Error("probe unavailable"); };
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);
    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("emits scheduler.burn_rate_exceeded when tokensSinceLastCommit exceeds threshold", async () => {
    const sessionDir = join(tmpDir, "s_token_exceeded");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_token_exceeded",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => ({ tokensSinceLastCommit: 2_000_000, commitsPerHour: 5 });
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);

    expect(result).toBe(1);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("scheduler.burn_rate_exceeded");
    expect(writer.events[0]!.data).toMatchObject({
      session_id: "s_token_exceeded",
      metric: "tokens_since_last_commit",
      observed: 2_000_000,
      threshold: 1_000_000,
    });
  });

  test("emits scheduler.burn_rate_exceeded when commitsPerHour is below threshold", async () => {
    const sessionDir = join(tmpDir, "s_commit_exceeded");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_commit_exceeded",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => ({ tokensSinceLastCommit: 500_000, commitsPerHour: 0.5 });
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);

    expect(result).toBe(1);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("scheduler.burn_rate_exceeded");
    expect(writer.events[0]!.data).toMatchObject({
      session_id: "s_commit_exceeded",
      metric: "commits_per_hour",
      observed: 0.5,
      threshold: 1,
    });
  });

  test("does not emit when neither threshold is exceeded", async () => {
    const sessionDir = join(tmpDir, "s_healthy");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_healthy",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = () => ({ tokensSinceLastCommit: 500_000, commitsPerHour: 5 });
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);

    expect(result).toBe(0);
    expect(writer.events).toHaveLength(0);
  });

  test("handles async burnRateProbe returning a Promise<BurnRateSample | null>", async () => {
    const sessionDir = join(tmpDir, "s_async");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
      id: "s_async",
      project_id: "p1",
      kind: "standalone",
      status: "running",
      workflow: null,
      created_at: new Date().toISOString(),
    }), "utf-8");

    const writer = makeFakeEventWriter();
    const probe = async () => ({ tokensSinceLastCommit: 2_000_000, commitsPerHour: 5 });
    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);

    expect(result).toBe(1);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]!.topic).toBe("scheduler.burn_rate_exceeded");
  });

  test("processes multiple sessions independently", async () => {
    for (const [id, tokens, commits] of [
      ["s_ok", 500_000, 5] as const,
      ["s_tokens_bad", 2_000_000, 5] as const,
      ["s_commits_bad", 500_000, 0.1] as const,
    ]) {
      const sessionDir = join(tmpDir, id);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, "session.json"), JSON.stringify({
        id,
        project_id: "p1",
        kind: "standalone",
        status: "running",
        workflow: null,
        created_at: new Date().toISOString(),
      }), "utf-8");
    }

    const writer = makeFakeEventWriter();
    const probes: Record<string, () => { tokensSinceLastCommit: number; commitsPerHour: number }> = {
      s_ok: () => ({ tokensSinceLastCommit: 500_000, commitsPerHour: 5 }),
      s_tokens_bad: () => ({ tokensSinceLastCommit: 2_000_000, commitsPerHour: 5 }),
      s_commits_bad: () => ({ tokensSinceLastCommit: 500_000, commitsPerHour: 0.1 }),
    };
    const probe = (sessionId: string) => probes[sessionId]?.() ?? null;

    const result = await watchSessionBurnRates(tmpDir, writer, probe as any, 1_000_000, 1);

    expect(result).toBe(2);
    expect(writer.events).toHaveLength(2);
    const exceededSessionIds = writer.events.map(e => (e.data as { session_id: string }).session_id);
    expect(exceededSessionIds).toContain("s_tokens_bad");
    expect(exceededSessionIds).toContain("s_commits_bad");
    expect(exceededSessionIds).not.toContain("s_ok");
  });
});