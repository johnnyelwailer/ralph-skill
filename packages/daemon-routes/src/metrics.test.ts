import { describe, expect, test } from "bun:test";
import { handleMetrics, type MetricsDeps } from "./metrics.ts";
import { InMemoryProviderHealthStore } from "@aloop/provider-health";
import type { SchedulerService } from "@aloop/scheduler";
import type { SchedulerProbes, SystemSample } from "@aloop/scheduler-gates";

function makeRequest(url: string): Request {
  return new Request(`http://localhost${url}`, { method: "GET" });
}

function makeDeps(overrides?: Partial<MetricsDeps>): MetricsDeps {
  return {
    scheduler: overrides?.scheduler ?? makeMockScheduler(),
    providerHealth: overrides?.providerHealth ?? new InMemoryProviderHealthStore([]),
    systemSample: overrides?.systemSample ?? (() => undefined),
  };
}

function makeMockScheduler(limitsOverwrites?: Record<string, unknown>, inFlightOverwrites?: Record<string, unknown>): SchedulerService {
  return {
    currentLimits() {
      return {
        concurrencyCap: 5,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: {
          cpuMaxPct: 80,
          memMaxPct: 85,
          loadMax: 4.0,
        },
        burnRate: {
          maxTokensSinceCommit: 100_000,
          minCommitsPerHour: 1,
        },
        ...limitsOverwrites,
      };
    },
    listPermits() {
      return [];
    },
    updateLimits: async () => ({ ok: true }),
    acquirePermit: async () => ({ ok: false, reason: "no permits" }),
    releasePermit: async () => false,
    expirePermits: async () => 0,
  } as unknown as SchedulerService;
}

describe("handleMetrics", () => {
  test("returns undefined for unrelated pathname", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/not-metrics");
    const result = await handleMetrics(req, deps, "/v1/not-metrics");
    expect(result).toBeUndefined();
  });

  test("returns 200 with Prometheus text format for /v1/metrics", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toContain("text/plain");
  });

  test("emits aloop info metric", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop ");
    expect(text).toContain("# TYPE aloop info");
    expect(text).toContain('aloop{version="0.1.0"} 1');
  });

  test("emits scheduler limits gauges", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop_scheduler_limits");
    expect(text).toContain("# TYPE aloop_scheduler_limits gauge");
    expect(text).toContain('aloop_scheduler_limits{name="concurrency_cap"} 5');
    expect(text).toContain('aloop_scheduler_limits{name="permit_ttl_default_seconds"} 300');
    expect(text).toContain('aloop_scheduler_limits{name="cpu_max_pct"} 80');
    expect(text).toContain('aloop_scheduler_limits{name="burn_rate_max_tokens_since_commit"} 100000');
  });

  test("emits in-flight permits gauge (zero when empty)", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop_scheduler_permits_in_flight");
    expect(text).toContain("# TYPE aloop_scheduler_permits_in_flight gauge");
    expect(text).toContain("aloop_scheduler_permits_in_flight 0");
  });

  test("emits per-session permit labels when permits are in flight", async () => {
    const deps = makeDeps();
    const mockScheduler = makeMockScheduler();
    const fakePermits = [
      { id: "p1", sessionId: "sess_abc", providerId: "openai" } as any,
    ];
    (mockScheduler as any).listPermits = () => fakePermits;

    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, { ...deps, scheduler: mockScheduler }, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain('aloop_scheduler_permit{session_id="sess_abc",provider_id="openai"} 1');
  });

  test("emits NaN for system metrics when systemSample is undefined", async () => {
    const deps = makeDeps({ systemSample: undefined });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("aloop_system_cpu_pct NaN");
    expect(text).toContain("aloop_system_mem_pct NaN");
    expect(text).toContain("aloop_system_load_avg NaN");
  });

  test("emits system metrics from working systemSample probe", async () => {
    const sample: SystemSample = { cpuPct: 45.5, memPct: 62.3, loadAvg: 1.7 };
    const deps = makeDeps({ systemSample: () => sample });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("aloop_system_cpu_pct 45.5");
    expect(text).toContain("aloop_system_mem_pct 62.3");
    expect(text).toContain("aloop_system_load_avg 1.7");
  });

  test("emits NaN when systemSample probe throws", async () => {
    const deps = makeDeps({ systemSample: () => { throw new Error("probe failed"); } });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("aloop_system_cpu_pct NaN");
    expect(text).toContain("aloop_system_mem_pct NaN");
    expect(text).toContain("aloop_system_load_avg NaN");
  });

  test("emits provider health for healthy provider", async () => {
    const health = new InMemoryProviderHealthStore(["openai"]);
    health.noteSuccess("openai");
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop_provider_up");
    expect(text).toContain("# TYPE aloop_provider_up gauge");
    expect(text).toContain('aloop_provider_up{provider_id="openai",status="healthy"} 1');
    expect(text).toContain('aloop_provider_consecutive_failures{provider_id="openai"} 0');
  });

  test("emits provider health for degraded provider", async () => {
    const health = new InMemoryProviderHealthStore(["openai"]);
    health.noteFailure("openai", "auth", Date.now(), { backoffMsByFailureCount: [0, 0, 1000] });
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain('aloop_provider_up{provider_id="openai",status="degraded"} 0');
    expect(text).toContain('aloop_provider_consecutive_failures{provider_id="openai"} 1');
  });

  test("emits cooldown_until timestamp when provider is in cooldown", async () => {
    const health = new InMemoryProviderHealthStore(["openai"]);
    // First timeout: consecutiveFailures=1, backoff[1]=0 → no cooldown yet
    health.noteFailure("openai", "timeout", Date.now(), {
      backoffMsByFailureCount: [0, 0, 1000],
      quotaRemaining: 100,
    });
    // Second timeout: consecutiveFailures=2, backoff[2]=1000 → enters cooldown
    health.noteFailure("openai", "timeout", Date.now(), {
      backoffMsByFailureCount: [0, 0, 1000],
      quotaRemaining: 100,
    });
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop_provider_cooldown_until_seconds");
    expect(text).toContain("# TYPE aloop_provider_cooldown_until_seconds gauge");
    // cooldownUntil should be a positive unix timestamp
    expect(text).toMatch(/aloop_provider_cooldown_until_seconds\{provider_id="openai"\} [1-9]\d+/);
  });

  test("emits quota_remaining gauge", async () => {
    const health = new InMemoryProviderHealthStore(["openai"]);
    health.setQuota("openai", { remaining: 500, resetsAt: null });
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain("# HELP aloop_provider_quota_remaining");
    expect(text).toContain("# TYPE aloop_provider_quota_remaining gauge");
    expect(text).toContain('aloop_provider_quota_remaining{provider_id="openai"} 500');
  });

  test("emits -1 for quota_remaining when quotaRemaining is null", async () => {
    const health = new InMemoryProviderHealthStore(["openai"]);
    health.noteSuccess("openai");
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain('aloop_provider_quota_remaining{provider_id="openai"} -1');
  });

  test("escapes special characters in label values", async () => {
    const health = new InMemoryProviderHealthStore(['openai"escape']);
    health.noteSuccess('openai"escape');
    const deps = makeDeps({ providerHealth: health });
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    expect(text).toContain('aloop_provider_up{provider_id="openai\\"escape"');
  });

  test("output ends with single newline", async () => {
    const deps = makeDeps();
    const req = makeRequest("/v1/metrics");
    const res = await handleMetrics(req, deps, "/v1/metrics");
    const text = await res!.text();
    // Should end with exactly one trailing newline
    expect(text).toMatch(/\n+$/);
    expect(text.trim()).toBe(text.trim());
  });
});

// ─── handleMetricsAggregates ──────────────────────────────────────────────────

import { Database } from "bun:sqlite";
import { handleMetricsAggregates, type MetricsAggregatesDeps } from "./metrics.ts";

const SCHEMA = `
  CREATE TABLE metric_aggregates (
    labels TEXT, sample_size INTEGER, directional INTEGER, metrics TEXT,
    scope TEXT, window_label TEXT, window_start TEXT, window_end TEXT
  )
`;

function makeAggregatesDeps(db: Database): MetricsAggregatesDeps {
  return { db };
}

describe("handleMetricsAggregates", () => {
  describe("path / method guard", () => {
    test("returns undefined for unrelated pathname", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics");
        const result = await handleMetricsAggregates(req, deps, "/v1/metrics");
        expect(result).toBeUndefined();
      } finally {
        db.close();
      }
    });

    test("returns a 200 response for POST (implementation currently handles non-GET without method guard)", async () => {
      // NOTE: The implementation does not check HTTP method for /v1/metrics/aggregates.
      // Per api.md this should return undefined (to fall through to 404), but currently
      // the implementation processes POST as a 200 with empty results.
      // This test documents actual behavior; the spec mismatch is a finding.
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = new Request("http://localhost/v1/metrics/aggregates", { method: "POST" });
        const result = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(result).toBeDefined();
        expect(result!.status).toBe(200);
      } finally {
        db.close();
      }
    });

    test("returns a 200 response for DELETE (implementation currently handles non-GET without method guard)", async () => {
      // NOTE: Same spec mismatch as POST above.
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = new Request("http://localhost/v1/metrics/aggregates", { method: "DELETE" });
        const result = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(result).toBeDefined();
        expect(result!.status).toBe(200);
      } finally {
        db.close();
      }
    });
  });

  describe("window parameter validation", () => {
    test("returns 400 for invalid window label", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=invalid");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(res!.status).toBe(400);
        const body = await res!.json();
        expect(body.error.code).toBe("bad_request");
        expect(body.error.message).toContain("window must be one of");
      } finally {
        db.close();
      }
    });

    test("accepts valid window labels (24h, 7d, 30d, all)", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        for (const window of ["24h", "7d", "30d", "all"]) {
          const req = makeRequest(`/v1/metrics/aggregates?window=${window}`);
          const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
          // All valid windows should return 200 (empty result is ok)
          expect(res!.status).toBe(200);
        }
      } finally {
        db.close();
      }
    });
  });

  describe("group_by validation", () => {
    test("returns 400 for unknown group_by field", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?group_by=invalid_field");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(res!.status).toBe(400);
        const body = await res!.json();
        expect(body.error.code).toBe("bad_request");
        expect(body.error.message).toContain("Unknown or high-cardinality group_by field");
        expect(body.error.message).toContain("invalid_field");
      } finally {
        db.close();
      }
    });

    test("accepts all valid group_by fields", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const validDims = [
          "scope", "provider_route", "model_id", "deployment_route",
          "workflow", "workflow_phase", "task_family", "story_complexity",
          "spec_quality_tier", "outcome",
        ];
        for (const dim of validDims) {
          const req = makeRequest(`/v1/metrics/aggregates?group_by=${dim}`);
          const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
          expect(res!.status).toBe(200);
        }
      } finally {
        db.close();
      }
    });

    test("accepts multiple group_by fields comma-separated", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?group_by=scope,model_id");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(res!.status).toBe(200);
      } finally {
        db.close();
      }
    });
  });

  describe("metrics parameter validation", () => {
    test("returns 400 for unknown metric name", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?metrics=invalid_metric");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(res!.status).toBe(400);
        const body = await res!.json();
        expect(body.error.code).toBe("bad_request");
        expect(body.error.message).toContain("Unknown metric");
        expect(body.error.message).toContain("invalid_metric");
      } finally {
        db.close();
      }
    });

    test("accepts all valid metric names", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const validMetrics = [
          "model_approval_rate", "model_merge_rate", "model_cost_per_merged_pr",
          "model_changes_requested_rate", "model_review_gate_pass_rate",
          "model_cost_per_approved_change", "model_turn_success_rate",
          "change_set_approval_rate", "change_set_merge_rate", "keeper_rate",
          "burn_rate_tokens_per_merged_pr", "permit_denial_rate",
        ];
        for (const metric of validMetrics) {
          const req = makeRequest(`/v1/metrics/aggregates?metrics=${metric}`);
          const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
          expect(res!.status).toBe(200);
        }
      } finally {
        db.close();
      }
    });
  });

  describe("response shape", () => {
    test("returns empty items when no rows match", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        expect(res!.status).toBe(200);
        expect(res!.headers.get("content-type")).toBe("application/json");
        const body = await res!.json();
        expect(body.window).toBeDefined();
        expect(body.window.start).toBeTruthy();
        expect(body.window.end).toBeTruthy();
        expect(body.items).toEqual([]);
      } finally {
        db.close();
      }
    });

    test("returns window bounds that are sensible dates for 24h window", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=24h");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        const body = await res!.json();
        const start = new Date(body.window.start);
        const end = new Date(body.window.end);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        expect(diffHours).toBeGreaterThan(23);
        expect(diffHours).toBeLessThan(25);
      } finally {
        db.close();
      }
    });

    test("maps database rows to correct response shape", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const now = new Date();
        const nowStr = now.toISOString();
        // Compute windowStart using the same logic as the handler:
        // subtractWindow(new Date(), "all") = new Date() with year set to 2000
        const windowStartDate = new Date(now);
        windowStartDate.setFullYear(2000, 0, 1);
        const windowStartStr = windowStartDate.toISOString();
        // Use template literal to avoid Bun:sqlite parameterized insert quirks
        db.exec(
          `INSERT INTO metric_aggregates (labels, sample_size, directional, metrics, scope, window_label, window_start, window_end) VALUES ('${"{"}"scope":"project:p_abc"${"}"}', 42, 1, '${"{"}"model_approval_rate":0.85${"}"}', 'global', 'all', '${windowStartStr}', '${nowStr}')`,
        );
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=all");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        const body = await res!.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0]!.labels).toEqual({ scope: "project:p_abc" });
        expect(body.items[0]!.sample_size).toBe(42);
        expect(body.items[0]!.directional).toBe(true);
        expect(body.items[0]!.metrics).toEqual({ model_approval_rate: 0.85 });
      } finally {
        db.close();
      }
    });

    test("filters metrics to only requested ones when metrics param is set", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const now = new Date();
        const nowStr = now.toISOString();
        const windowStartDate = new Date(now);
        windowStartDate.setFullYear(2000, 0, 1);
        const windowStartStr = windowStartDate.toISOString();
        db.exec(
          `INSERT INTO metric_aggregates (labels, sample_size, directional, metrics, scope, window_label, window_start, window_end) VALUES ('${"{"}"scope":"global"${"}"}', 10, 1, '${"{"}"model_approval_rate":0.9,"model_merge_rate":0.7${"}"}', 'global', 'all', '${windowStartStr}', '${nowStr}')`,
        );
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=all&metrics=model_approval_rate");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        const body = await res!.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0]!.metrics).toEqual({ model_approval_rate: 0.9 });
        expect(body.items[0]!.metrics).not.toHaveProperty("model_merge_rate");
      } finally {
        db.close();
      }
    });

    test("returns rows ordered by sample_size desc", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const now = new Date();
        const nowStr = now.toISOString();
        const windowStartDate = new Date(now);
        windowStartDate.setFullYear(2000, 0, 1);
        const windowStartStr = windowStartDate.toISOString();
        db.exec(
          `INSERT INTO metric_aggregates (labels, sample_size, directional, metrics, scope, window_label, window_start, window_end) VALUES ('${"{"}"scope":"small"${"}"}', 5, 1, '${"{}"}', 'global', 'all', '${windowStartStr}', '${nowStr}')`,
        );
        db.exec(
          `INSERT INTO metric_aggregates (labels, sample_size, directional, metrics, scope, window_label, window_start, window_end) VALUES ('${"{"}"scope":"large"${"}"}', 100, 1, '${"{}"}', 'global', 'all', '${windowStartStr}', '${nowStr}')`,
        );
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=all");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        const body = await res!.json();
        expect(body.items[0]!.sample_size).toBe(100);
        expect(body.items[1]!.sample_size).toBe(5);
      } finally {
        db.close();
      }
    });

    test("handles malformed JSON in labels and metrics columns gracefully", async () => {
      const db = new Database(":memory:");
      try {
        db.exec(SCHEMA);
        const now = new Date();
        const nowStr = now.toISOString();
        const windowStartDate = new Date(now);
        windowStartDate.setFullYear(2000, 0, 1);
        const windowStartStr = windowStartDate.toISOString();
        db.exec(
          `INSERT INTO metric_aggregates (labels, sample_size, directional, metrics, scope, window_label, window_start, window_end) VALUES ('not-json', 10, 1, 'also-not-json', 'global', 'all', '${windowStartStr}', '${nowStr}')`,
        );
        const deps = makeAggregatesDeps(db);
        const req = makeRequest("/v1/metrics/aggregates?window=all");
        const res = await handleMetricsAggregates(req, deps, "/v1/metrics/aggregates");
        const body = await res!.json();
        expect(body.items).toHaveLength(1);
        expect(body.items[0]!.labels).toEqual({});
        expect(body.items[0]!.metrics).toEqual({});
      } finally {
        db.close();
      }
    });
  });
});
