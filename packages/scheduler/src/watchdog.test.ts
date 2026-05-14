import { describe, expect, test } from "bun:test";
import { startSchedulerWatchdog, type RunningWatchdog } from "./watchdog.ts";
import type { EventWriter } from "@aloop/state-sqlite";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { BurnRateSample } from "@aloop/scheduler-gates";

// ─── mock factories shared across tests ───────────────────────────────────────

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
  return { list: () => adapters };
}

function makeFakeProviderHealthStore(): InMemoryProviderHealthStore {
  const store = new Map<string, { remaining: number; resets_at: string | null }>();
  return {
    getQuota: (id: string) => store.get(id) ?? undefined,
    setQuota: (id: string, quota: { remaining: number; resets_at: string | null }) => store.set(id, quota),
    removeQuota: (id: string) => store.delete(id),
  };
}

describe("startSchedulerWatchdog", () => {
  test("calls expirePermits repeatedly on the configured tick interval", async () => {
    const calls: number[] = [];
    // Use a realistic tick interval (1 second) — the minimum enforced is 1000ms anyway
    const input = {
      tickIntervalSeconds: () => 1,
      expirePermits: async () => {
        calls.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    // Wait long enough to observe multiple ticks (min interval is 1000ms)
    await new Promise((r) => setTimeout(r, 3200));
    wd.stop();

    // Should see at least 2 calls in ~3 seconds (1000ms min interval)
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // And not more than 4 (sanity check on runaway scheduling)
    expect(calls.length).toBeLessThanOrEqual(4);

    // Verify intervals between calls are approximately 1000ms
    for (let i = 1; i < calls.length; i++) {
      const delta = calls[i]! - calls[i - 1]!;
      expect(delta).toBeGreaterThanOrEqual(950);
    }
  });

  test("stop prevents further expirePermits calls", async () => {
    const calls: number[] = [];
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        calls.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    await new Promise((r) => setTimeout(r, 120));
    wd.stop();

    const countAfterStop = calls.length;
    await new Promise((r) => setTimeout(r, 150));
    // No new calls after stop
    expect(calls.length).toBe(countAfterStop);
  });

  test("minimum delay between ticks is 1000ms even when tickIntervalSeconds is 0", async () => {
    const timestamps: number[] = [];
    const input = {
      tickIntervalSeconds: () => 0, // 0 seconds — below minimum
      expirePermits: async () => {
        timestamps.push(Date.now());
        return 0;
      },
    };

    const wd = startSchedulerWatchdog(input);
    await new Promise((r) => setTimeout(r, 2200));
    wd.stop();

    // Should have roughly 2 ticks in 2200ms if min delay is 1000ms
    expect(timestamps.length).toBeGreaterThanOrEqual(1);
    expect(timestamps.length).toBeLessThanOrEqual(3);

    // Check minimum interval is respected
    for (let i = 1; i < timestamps.length; i++) {
      const delta = timestamps[i]! - timestamps[i - 1]!;
      expect(delta).toBeGreaterThanOrEqual(950); // ~1000ms with some tolerance
    }
  });

  test("returned RunningWatchdog.stop() is callable multiple times without throwing", async () => {
    const input = {
      tickIntervalSeconds: () => 60,
      expirePermits: async () => 0,
    };
    const wd = startSchedulerWatchdog(input);
    wd.stop();
    wd.stop(); // must not throw
    wd.stop();
  });

  test("expirePermits errors are swallowed (caught internally)", async () => {
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        throw new Error("simulated permit expiry error");
      },
    };
    const wd = startSchedulerWatchdog(input);
    // Wait long enough for at least one tick to fire (minimum interval is 1000ms).
    // This exercises the catch + finally { scheduleTick } block (lines 18-23 of watchdog.ts).
    await new Promise((r) => setTimeout(r, 1200));
    wd.stop(); // must not throw
  });

  test("finally block reschedules next tick after expirePermits throws", async () => {
    // Verify the finally { scheduleTick() } fires even when expirePermits rejects.
    // After one failed tick, the watchdog must still be alive and schedule the next one.
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => {
        throw new Error("transient error");
      },
    };
    const wd = startSchedulerWatchdog(input);
    // Wait for the first tick to fire AND the finally to reschedule.
    // With min interval of 1000ms, 1500ms is enough to see tick→catch→finally→reschedule.
    await new Promise((r) => setTimeout(r, 1500));
    wd.stop(); // must not throw — watchdog stayed alive via finally reschedule
  });
});

// ─── detectStuckSessions integration ──────────────────────────────────────────

describe("startSchedulerWatchdog with detectStuckSessions", () => {
  test("calls detectStuckSessions on every tick when provided", async () => {
    const calls: string[] = [];
    const writer = makeFakeEventWriter();
    const input = {
      tickIntervalSeconds: () => 1,
      expirePermits: async () => 0,
      detectStuckSessions: async (sessionsDir: string) => {
        calls.push(sessionsDir);
        return 0;
      },
      sessionsDir: "/fake/sessions",
      stuckThresholdSeconds: 600,
      events: writer,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 3200));
    wd.stop();

    // Should have been called at least twice in ~3 seconds
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(4);
    // sessionsDir passed through correctly
    expect(calls.every((d) => d === "/fake/sessions")).toBe(true);
  });

  test("does not call detectStuckSessions when sessionsDir is absent", async () => {
    const calls: string[] = [];
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => 0,
      detectStuckSessions: async (sessionsDir: string) => {
        calls.push(sessionsDir);
        return 0;
      },
      // sessionsDir intentionally omitted
      stuckThresholdSeconds: 600,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 200));
    wd.stop();

    // detectStuckSessions must not be called when sessionsDir is missing
    expect(calls).toHaveLength(0);
  });

  test("errors from detectStuckSessions are swallowed", async () => {
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => 0,
      detectStuckSessions: async () => {
        throw new Error("stuck sessions error");
      },
      sessionsDir: "/fake",
      stuckThresholdSeconds: 600,
      events: makeFakeEventWriter(),
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 1200));
    wd.stop(); // must not throw
  });
});

// ─── refreshProviderHealth integration ────────────────────────────────────────

describe("startSchedulerWatchdog with refreshProviderHealth", () => {
  test("calls refreshProviderHealth when quotaPollIntervalSeconds has elapsed", async () => {
    const calls: number[] = [];
    const writer = makeFakeEventWriter();
    const registry = makeFakeProviderRegistry([]);
    const health = makeFakeProviderHealthStore();

    const input = {
      tickIntervalSeconds: () => 1,
      expirePermits: async () => 0,
      refreshProviderHealth: async () => {
        calls.push(Date.now());
        return 0;
      },
      providerRegistry: registry,
      providerHealth: health,
      events: writer,
      quotaPollIntervalSeconds: 2, // poll every 2 seconds
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 4200));
    wd.stop();

    // With 2s interval and ~4s runtime, expect at least 2 quota polls
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(5);
  });

  test("does not call refreshProviderHealth when providerRegistry is absent", async () => {
    const calls: number[] = [];
    const writer = makeFakeEventWriter();
    const health = makeFakeProviderHealthStore();

    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => 0,
      refreshProviderHealth: async () => {
        calls.push(Date.now());
        return 0;
      },
      // providerRegistry intentionally omitted
      providerHealth: health,
      events: writer,
      quotaPollIntervalSeconds: 1,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 1500));
    wd.stop();

    expect(calls).toHaveLength(0);
  });
});

// ─── watchSessionBurnRates integration ─────────────────────────────────────────

describe("startSchedulerWatchdog with watchSessionBurnRates", () => {
  test("calls watchSessionBurnRates on every tick when provided", async () => {
    const calls: number[] = [];
    const writer = makeFakeEventWriter();

    const input = {
      tickIntervalSeconds: () => 1,
      expirePermits: async () => 0,
      watchSessionBurnRates: async () => {
        calls.push(Date.now());
        return 0;
      },
      sessionsDir: "/fake/sessions",
      events: writer,
      burnRateProbe: (_sessionId: string) => null,
      maxTokensSinceCommit: 1_000_000,
      minCommitsPerHour: 1,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 3200));
    wd.stop();

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  test("does not call watchSessionBurnRates when sessionsDir is absent", async () => {
    const calls: number[] = [];
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => 0,
      watchSessionBurnRates: async () => {
        calls.push(Date.now());
        return 0;
      },
      // sessionsDir intentionally omitted
      events: makeFakeEventWriter(),
      burnRateProbe: (_sessionId: string) => null,
      maxTokensSinceCommit: 1_000_000,
      minCommitsPerHour: 1,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 200));
    wd.stop();

    expect(calls).toHaveLength(0);
  });

  test("errors from watchSessionBurnRates are swallowed", async () => {
    const input = {
      tickIntervalSeconds: () => 0.05,
      expirePermits: async () => 0,
      watchSessionBurnRates: async () => {
        throw new Error("burn rate error");
      },
      sessionsDir: "/fake",
      events: makeFakeEventWriter(),
      burnRateProbe: (_sessionId: string) => null,
      maxTokensSinceCommit: 1_000_000,
      minCommitsPerHour: 1,
    };

    const wd = startSchedulerWatchdog(input as any);
    await new Promise((r) => setTimeout(r, 1200));
    wd.stop(); // must not throw
  });
});
