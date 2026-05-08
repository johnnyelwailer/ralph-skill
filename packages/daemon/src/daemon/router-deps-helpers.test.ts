import { describe, expect, test } from "bun:test";
import { createMetricsDeps, createMetricsAggregatesDeps } from "./router-deps-helpers.ts";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import type { MetricsDeps } from "@aloop/daemon-routes";
import type { MetricsAggregatesDeps } from "@aloop/daemon-routes";
import { Database } from "bun:sqlite";

describe("createMetricsDeps", () => {
  test("returns MetricsDeps with scheduler and providerHealth", () => {
    const scheduler = {
      acquire: async () => ({ ok: false, reason: "no_quota" } as const),
      release: async () => ({ ok: true }),
      listPermits: async () => [],
      expirePermits: async () => ({ expired: 0 }),
      getLimits: async () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
      }),
      updateLimits: async () => ({ ok: true, limits: {} as never }),
      currentLimits: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
      }),
    };

    const providerRegistry = new ProviderRegistry();
    const providerHealth = new InMemoryProviderHealthStore(providerRegistry.list().map((p) => p.id));

    const deps = createMetricsDeps({ scheduler, providerHealth });

    expect(typeof deps.scheduler).toBe("object");
    expect(typeof deps.providerHealth).toBe("object");
    expect(typeof deps.systemSample).toBe("function");
  });

  test("systemSample is a callable function", () => {
    const scheduler = {
      acquire: async () => ({ ok: false, reason: "no_quota" } as const),
      release: async () => ({ ok: true }),
      listPermits: async () => [],
      expirePermits: async () => ({ expired: 0 }),
      getLimits: async () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
      }),
      updateLimits: async () => ({ ok: true, limits: {} as never }),
      currentLimits: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
      }),
    };

    const providerRegistry = new ProviderRegistry();
    const providerHealth = new InMemoryProviderHealthStore(providerRegistry.list().map((p) => p.id));

    const deps = createMetricsDeps({ scheduler, providerHealth });
    const sample = deps.systemSample();

    // systemSample returns an object from DEFAULT_SCHEDULER_PROBES.systemSample
    expect(typeof sample).toBe("object");
    expect(sample).toBeTruthy();
  });
});

describe("createMetricsAggregatesDeps", () => {
  test("returns MetricsAggregatesDeps with db", () => {
    const db = new Database(":memory:");
    const deps = createMetricsAggregatesDeps({ db });

    expect(typeof deps.db).toBe("object");
    db.close();
  });

  test("db is the same instance passed in", () => {
    const db = new Database(":memory:");
    const deps = createMetricsAggregatesDeps({ db });

    expect(deps.db).toBe(db);
    db.close();
  });
});
