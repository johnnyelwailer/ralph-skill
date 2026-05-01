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
