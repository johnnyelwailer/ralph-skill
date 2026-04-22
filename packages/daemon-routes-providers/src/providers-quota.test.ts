import { describe, expect, test } from "bun:test";
import { InMemoryProviderHealthStore, ProviderRegistry, type ProviderAdapter } from "@aloop/provider";
import { handleProviderQuota, type ProviderQuotaDeps } from "./providers-quota.ts";

function makeAdapter(id: string, opts: { supportsQuotaProbe: boolean; probeQuotaImpl?: () => Promise<{ remaining: number; total: number | null; resetsAt: string | null; probedAt: string }> }): ProviderAdapter {
  return {
    id,
    capabilities: {
      streaming: false,
      vision: false,
      toolUse: false,
      reasoningEffort: false,
      quotaProbe: opts.supportsQuotaProbe,
      sessionResume: false,
      costReporting: false,
      maxContextTokens: null,
    },
    resolveModel: () => ({ providerId: id, modelId: id }),
    async *sendTurn() {
      yield { type: "usage", content: { tokensIn: 1, tokensOut: 1 }, final: true };
    },
    ...(opts.supportsQuotaProbe && opts.probeQuotaImpl
      ? { probeQuota: opts.probeQuotaImpl }
      : {}),
  };
}

function makeDeps(overrides?: Partial<ProviderQuotaDeps>): ProviderQuotaDeps {
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(makeAdapter("probe-capable", {
    supportsQuotaProbe: true,
    probeQuotaImpl: async () => ({
      remaining: 500,
      total: 1000,
      resetsAt: null,
      probedAt: new Date().toISOString(),
    }),
  }));
  providerRegistry.register(makeAdapter("probe-incapable", {
    supportsQuotaProbe: false,
  }));
  const defaultDeps: ProviderQuotaDeps = {
    events: {
      append: async (topic, data) => ({
        _v: 1,
        id: "evt_test",
        timestamp: new Date(0).toISOString(),
        topic,
        data,
      }),
    },
    providerRegistry,
    providerHealth: new InMemoryProviderHealthStore(providerRegistry.list().map((a) => a.id)),
  };
  return { ...defaultDeps, ...overrides };
}

describe("handleProviderQuota", () => {
  test("returns undefined for unrelated path", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/other", { method: "GET" });
    const res = await handleProviderQuota(req, deps, "/v1/other");
    expect(res).toBeUndefined();
  });

  test("returns 405 for non-GET methods", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-capable/quota", { method: "POST" });
    const res = await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");
    expect(res!.status).toBe(405);
  });

  test("returns 404 for unknown provider", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/unknown/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/unknown/quota");
    expect(res!.status).toBe(404);
  });

  test("returns 501 when provider does not support quota probes", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-incapable/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/probe-incapable/quota");
    expect(res!.status).toBe(501);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quota_probe_unavailable");
  });

  test("returns 400 when x-aloop-auth-handle header is missing", async () => {
    // Note: auth check runs after capability check; opencode has quotaProbe capability=true
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-capable/quota", { method: "GET" });
    const res = await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when x-aloop-auth-handle header is whitespace-only", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-capable/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "   " },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");
    expect(res!.status).toBe(400);
  });

  test("successful quota probe returns 200 with quota data", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-capable/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; provider_id: string; quota: { remaining: number } };
    expect(body._v).toBe(1);
    expect(body.provider_id).toBe("probe-capable");
    expect(body.quota.remaining).toBe(500);
  });

  test("failed quota probe records failure and returns 429 rate_limit", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("rate-limited", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("rate limit exceeded");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["rate-limited"]),
    };

    const req = new Request("http://x/v1/providers/rate-limited/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/rate-limited/quota");
    expect(res!.status).toBe(429);
    const body = (await res!.json()) as { error: { code: string; details: { classification: string } } };
    expect(body.error.code).toBe("provider_rate_limited");
    expect(body.error.details.classification).toBe("rate_limit");
  });

  test("failed probe due to auth error returns 401", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("auth-failed", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("invalid api key");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["auth-failed"]),
    };

    const req = new Request("http://x/v1/providers/auth-failed/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/auth-failed/quota");
    expect(res!.status).toBe(401);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("provider_auth_failed");
  });

  test("failed probe due to timeout returns 504", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("timed-out", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("request timed out");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["timed-out"]),
    };

    const req = new Request("http://x/v1/providers/timed-out/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/timed-out/quota");
    expect(res!.status).toBe(504);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("provider_probe_timeout");
  });

  test("failed probe due to concurrent_cap returns 409", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("concurrent-cap", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("another session is already running");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["concurrent-cap"]),
    };

    const req = new Request("http://x/v1/providers/concurrent-cap/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/concurrent-cap/quota");
    expect(res!.status).toBe(409);
    const body = (await res!.json()) as { error: { code: string; details: { classification: string } } };
    expect(body.error.code).toBe("provider_concurrent_cap");
    expect(body.error.details.classification).toBe("concurrent_cap");
  });

  test("failed probe due to unknown reason returns 502", async () => {
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("unknown-failure", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("something went wrong");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["unknown-failure"]),
    };

    const req = new Request("http://x/v1/providers/unknown-failure/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    const res = await handleProviderQuota(req, deps, "/v1/providers/unknown-failure/quota");
    expect(res!.status).toBe(502);
    const body = (await res!.json()) as { error: { code: string; details: { classification: string } } };
    expect(body.error.code).toBe("quota_probe_failed");
    expect(body.error.details.classification).toBe("unknown");
  });

  test("successful probe transitions provider health to healthy", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/providers/probe-capable/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");
    const health = deps.providerHealth.get("probe-capable");
    expect(health.status).toBe("healthy");
    expect(health.consecutiveFailures).toBe(0);
  });

  test("failed probe records failure reason on provider health", async () => {
    // After a single transient failure (rate_limit) the provider is still "healthy"
    // (first failure has no cooldown — backoff[1]=0). The failure reason IS recorded.
    const registry = new ProviderRegistry();
    registry.register(makeAdapter("rate-limited-2", {
      supportsQuotaProbe: true,
      probeQuotaImpl: async () => {
        throw new Error("rate limit");
      },
    }));
    const deps: ProviderQuotaDeps = {
      events: makeDeps().events,
      providerRegistry: registry,
      providerHealth: new InMemoryProviderHealthStore(["rate-limited-2"]),
    };

    const req = new Request("http://x/v1/providers/rate-limited-2/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    await handleProviderQuota(req, deps, "/v1/providers/rate-limited-2/quota");

    const health = deps.providerHealth.get("rate-limited-2");
    // Single failure: status remains healthy (no cooldown yet)
    expect(health.status).toBe("healthy");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.failureReason).toBe("rate_limit");
  });

  test("appends provider.quota and provider.health events on successful probe", async () => {
    const appendedTopics: string[] = [];
    const deps = makeDeps({
      events: {
        append: async (topic, data) => {
          appendedTopics.push(topic);
          return {
            _v: 1,
            id: "evt_test",
            timestamp: new Date(0).toISOString(),
            topic,
            data,
          };
        },
      },
    });

    const req = new Request("http://x/v1/providers/probe-capable/quota", {
      method: "GET",
      headers: { "x-aloop-auth-handle": "user@example.com" },
    });
    await handleProviderQuota(req, deps, "/v1/providers/probe-capable/quota");

    expect(appendedTopics).toContain("provider.quota");
    expect(appendedTopics).toContain("provider.health");
  });
});
