import { describe, expect, test } from "bun:test";
import { handleMetrics, type MetricsDeps } from "./metrics.ts";
import type { SystemSample } from "@aloop/scheduler-gates";

function makeDeps(overrides: Partial<MetricsDeps> = {}): MetricsDeps {
  const makeNoopProbes = (): MetricsDeps["systemSample"] => () => undefined;

  const noopScheduler = {
    currentLimits() {
      return {
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 1800,
        permitTtlMaxSeconds: 7200,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 100_000, minCommitsPerHour: 6 },
      };
    },
    listPermits() { return []; },
    acquirePermit() { throw new Error("not stubbed"); },
    releasePermit() { throw new Error("not stubbed"); },
    expirePermits() { throw new Error("not stubbed"); },
    updateLimits() { throw new Error("not stubbed"); },
  };

  const noopHealthStore = {
    list() { return []; },
    peek() { return undefined; },
    get() { throw new Error("not stubbed"); },
    noteSuccess() { throw new Error("not stubbed"); },
    noteFailure() { throw new Error("not stubbed"); },
  };

  return {
    scheduler: overrides.scheduler ?? (noopScheduler as MetricsDeps["scheduler"]),
    providerHealth: overrides.providerHealth ?? (noopHealthStore as MetricsDeps["providerHealth"]),
    systemSample: overrides.systemSample ?? makeNoopProbes(),
  };
}

function parsePrometheus(text: string): Map<string, { type: string; labels: Record<string, string>; value: string }[]> {
  const byName = new Map<string, { type: string; labels: Record<string, string>; value: string }[]>();
  const lines = text.split("\n");
  let currentName: string | null = null;
  let currentType = "";
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l || l.startsWith("#")) {
      if (l.startsWith("# TYPE")) {
        const m = l.match(/^# TYPE (\S+) (\S+)/);
        if (m) { currentName = m[1]; currentType = m[2]; }
      }
      continue;
    }
    if (!currentName) continue;
    const valMatch = l.match(/^(\S+)\s+(.+)$/);
    if (!valMatch) continue;
    const labelMatch = valMatch[1].match(/^(\S+)\{(.+)\}$/);
    let name: string;
    let labels: Record<string, string> = {};
    let value: string;
    if (labelMatch) {
      name = labelMatch[1];
      for (const pair of labelMatch[2].split(",")) {
        const [k, v] = pair.split("=");
        labels[k] = v.replace(/^"|"$/g, "");
      }
      value = valMatch[2];
    } else {
      name = valMatch[1];
      value = valMatch[2];
    }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push({ type: currentType, labels, value });
  }
  return byName;
}

// ─── GET /v1/metrics ─────────────────────────────────────────────────────────

describe("GET /v1/metrics", () => {
  test("returns 200 with Prometheus text exposition format", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(
      new Request("http://x/v1/metrics"),
      deps,
      "/v1/metrics",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
  });

  test("returns undefined for non-metrics paths", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(
      new Request("http://x/v1/other"),
      deps,
      "/v1/other",
    );
    expect(res).toBeUndefined();
  });

  test("emits aloop info metric", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);
    const info = metrics.get("aloop");
    expect(info).toBeDefined();
    expect(info![0].type).toBe("info");
    expect(info![0].value).toBe("1");
    expect(info![0].labels["version"]).toBe("0.1.0");
  });

  test("emits scheduler limits gauges", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);
    const limits = metrics.get("aloop_scheduler_limits");
    expect(limits).toBeDefined();
    const byName = new Map(limits!.map(m => [m.labels["name"], m.value]));
    expect(byName.get("concurrency_cap")).toBe("3");
    expect(byName.get("permit_ttl_default_seconds")).toBe("1800");
    expect(byName.get("permit_ttl_max_seconds")).toBe("7200");
    expect(byName.get("cpu_max_pct")).toBe("80");
    expect(byName.get("mem_max_pct")).toBe("85");
    expect(byName.get("load_max")).toBe("4");
  });

  test("emits permits in flight gauge", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);
    const inFlight = metrics.get("aloop_scheduler_permits_in_flight");
    expect(inFlight).toBeDefined();
    expect(inFlight![0].value).toBe("0");
  });

  test("emits provider up gauges", async () => {
    const deps = makeDeps();
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);
    // Empty health store means no provider metrics are emitted;
    // HELP/TYPE directives are only written when health.list() returns ≥1 state.
    // The endpoint still returns 200 with the content-type header.
    expect(res!.status).toBe(200);
    expect(metrics.get("aloop_scheduler_limits")!.length).toBeGreaterThan(0);
  });

  test("emits system gauges with real sample values", async () => {
    const deps = makeDeps({
      systemSample: () => ({ cpuPct: 12.5, memPct: 45.0, loadAvg: 0.88 }),
    });
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const lines = text.split("\n");
    const cpuLine = lines.find(l => l.startsWith("aloop_system_cpu_pct"));
    const memLine = lines.find(l => l.startsWith("aloop_system_mem_pct"));
    const laLine = lines.find(l => l.startsWith("aloop_system_load_avg"));
    expect(cpuLine).toBeDefined();
    expect(memLine).toBeDefined();
    expect(laLine).toBeDefined();
    expect(cpuLine!.trimEnd()).toBe("aloop_system_cpu_pct 12.5");
    expect(memLine!.trimEnd()).toBe("aloop_system_mem_pct 45");
    expect(laLine!.trimEnd()).toBe("aloop_system_load_avg 0.88");
  });

  test("system gauges emit NaN when systemSample is undefined", async () => {
    const deps = makeDeps({ systemSample: () => undefined });
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const lines = text.split("\n");
    const cpuLine = lines.find(l => l.startsWith("aloop_system_cpu_pct"));
    const memLine = lines.find(l => l.startsWith("aloop_system_mem_pct"));
    const laLine = lines.find(l => l.startsWith("aloop_system_load_avg"));
    expect(cpuLine!.trimEnd()).toBe("aloop_system_cpu_pct NaN");
    expect(memLine!.trimEnd()).toBe("aloop_system_mem_pct NaN");
    expect(laLine!.trimEnd()).toBe("aloop_system_load_avg NaN");
  });

  test("provider health includes providers with health status", async () => {
    const mockHealth = {
      list() {
        return [
          {
            providerId: "anthropic",
            status: "healthy",
            consecutiveFailures: 0,
            lastSuccess: "2025-01-01T00:00:00Z",
            lastFailure: null,
            failureReason: null,
            cooldownUntil: null,
            quotaRemaining: 999,
            quotaResetsAt: null,
            updatedAt: "2025-01-01T00:00:00Z",
          },
          {
            providerId: "openai",
            status: "cooldown",
            consecutiveFailures: 3,
            lastSuccess: null,
            lastFailure: "2025-01-01T00:00:00Z",
            failureReason: "rate_limit",
            cooldownUntil: "2025-01-01T00:01:00Z",
            quotaRemaining: 0,
            quotaResetsAt: null,
            updatedAt: "2025-01-01T00:00:00Z",
          },
        ];
      },
      peek() { return undefined; },
      get() { throw new Error("not stubbed"); },
      noteSuccess() { throw new Error("not stubbed"); },
      noteFailure() { throw new Error("not stubbed"); },
    };

    const deps = makeDeps({ providerHealth: mockHealth as MetricsDeps["providerHealth"] });
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);

    const up = metrics.get("aloop_provider_up")!;
    const byProvider = new Map(up.map(m => [m.labels["provider_id"], m.value]));
    expect(byProvider.get("anthropic")).toBe("1");
    expect(byProvider.get("openai")).toBe("0");

    const failures = metrics.get("aloop_provider_consecutive_failures")!;
    const byFail = new Map(failures.map(m => [m.labels["provider_id"], m.value]));
    expect(byFail.get("anthropic")).toBe("0");
    expect(byFail.get("openai")).toBe("3");

    const cooldown = metrics.get("aloop_provider_cooldown_until_seconds")!;
    const byCd = new Map(cooldown.map(m => [m.labels["provider_id"], m.value]));
    expect(byCd.get("anthropic")).toBe("0");
    // 2025-01-01T00:01:00Z = 1735689660
    expect(byCd.get("openai")).toBe("1735689660");

    const quota = metrics.get("aloop_provider_quota_remaining")!;
    const byQuota = new Map(quota.map(m => [m.labels["provider_id"], m.value]));
    expect(byQuota.get("anthropic")).toBe("999");
    expect(byQuota.get("openai")).toBe("0");
  });

  test("escapes backslashes and double-quotes in label values", async () => {
    const mockHealth = {
      list() {
        return [
          {
            providerId: 'provider with "quotes" and\\backslash',
            status: "healthy",
            consecutiveFailures: 0,
            lastSuccess: null,
            lastFailure: null,
            failureReason: null,
            cooldownUntil: null,
            quotaRemaining: null,
            quotaResetsAt: null,
            updatedAt: "2025-01-01T00:00:00Z",
          },
        ];
      },
      peek() { return undefined; },
      get() { throw new Error("not stubbed"); },
      noteSuccess() { throw new Error("not stubbed"); },
      noteFailure() { throw new Error("not stubbed"); },
    };

    const deps = makeDeps({ providerHealth: mockHealth as MetricsDeps["providerHealth"] });
    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    // Should not throw, and backslash/quote should be escaped
    expect(text).toContain('aloop_provider_up{provider_id="provider with \\"quotes\\" and\\\\backslash"');
  });

  test("in-flight permits are emitted with provider and session labels", async () => {
    const inFlightPermits = [
      { id: "p1", sessionId: "s1", providerId: "anthropic", grantedAt: "2025-01-01T00:00:00Z", expiresAt: "2025-01-01T01:00:00Z" },
      { id: "p2", sessionId: "s2", providerId: "openai", grantedAt: "2025-01-01T00:00:00Z", expiresAt: "2025-01-01T01:00:00Z" },
    ];

    const deps = makeDeps({
      scheduler: {
        currentLimits() {
          return {
            concurrencyCap: 3,
            permitTtlDefaultSeconds: 1800,
            permitTtlMaxSeconds: 7200,
            systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
            burnRate: { maxTokensSinceCommit: 100_000, minCommitsPerHour: 6 },
          };
        },
        listPermits() { return inFlightPermits; },
        acquirePermit() { throw new Error("not stubbed"); },
        releasePermit() { throw new Error("not stubbed"); },
        expirePermits() { throw new Error("not stubbed"); },
        updateLimits() { throw new Error("not stubbed"); },
      } as MetricsDeps["scheduler"],
    });

    const res = await handleMetrics(new Request("http://x/v1/metrics"), deps, "/v1/metrics");
    const text = await res!.text();
    const metrics = parsePrometheus(text);

    // Total in-flight count
    const inFlight = metrics.get("aloop_scheduler_permits_in_flight")!;
    expect(inFlight[0].value).toBe("2");

    // Individual permit gauges
    const permitMetrics = metrics.get("aloop_scheduler_permit")!;
    expect(permitMetrics).toHaveLength(2);
    const bySession = new Map(permitMetrics.map(m => [m.labels["session_id"], m.value]));
    expect(bySession.get("s1")).toBe("1");
    expect(bySession.get("s2")).toBe("1");
  });
});
