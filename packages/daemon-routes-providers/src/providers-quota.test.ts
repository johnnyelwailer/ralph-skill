import { describe, expect, test } from "bun:test";
import { handleProviderQuota, type ProviderQuotaDeps } from "./providers-quota.ts";

type MockAdapter = {
  id: string;
  name: string;
  probeQuota?: (authHandle: string) => Promise<{
    remaining: number;
    total: number;
    resetsAt: string;
    currency: string;
    probedAt: string;
  }>;
};

function makeMockAdapter(id: string, opts: Partial<MockAdapter> = {}): MockAdapter {
  return { id, name: id, ...opts } as MockAdapter;
}

function makeDeps(overrides: Partial<ProviderQuotaDeps> = {}): ProviderQuotaDeps {
  return {
    events: {
      append: async () => {},
    } as any,
    providerRegistry: {
      get: (id: string) => (overrides.providerRegistry as any)?.get?.(id),
    } as any,
    providerHealth: {
      noteSuccess: () => ({}),
      setQuota: () => ({}),
      noteFailure: () => ({}),
    } as any,
    ...overrides,
  };
}

function makeRequest(method: string, pathname: string, headers: Record<string, string> = {}): Request {
  const url = `http://localhost${pathname}`;
  return new Request(url, { method, headers: new Headers(headers) }) as any;
}

describe("handleProviderQuota", () => {
  test("returns undefined for non-matching pathname", async () => {
    const deps = makeDeps({ providerRegistry: { get: () => undefined } as any });
    const req = makeRequest("GET", "/v1/sessions/s1");
    const result = await handleProviderQuota(req as any, deps, "/v1/sessions/s1");
    expect(result).toBeUndefined();
  });

  test("returns 405 for non-GET methods", async () => {
    const deps = makeDeps({ providerRegistry: { get: () => makeMockAdapter("opencode") } as any });
    const req = makeRequest("POST", "/v1/providers/opencode/quota");
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(405);
  });

  test("returns 404 when provider is not registered", async () => {
    const deps = makeDeps({ providerRegistry: { get: () => undefined } as any });
    const req = makeRequest("GET", "/v1/providers/nonexistent/quota");
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/nonexistent/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(404);
    const body = await (result as Response).json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns 501 when provider does not support quota probes", async () => {
    const adapter = makeMockAdapter("opencode", { probeQuota: undefined });
    const deps = makeDeps({ providerRegistry: { get: () => adapter } as any });
    const req = makeRequest("GET", "/v1/providers/opencode/quota");
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(501);
    const body = await (result as Response).json();
    expect(body.error.code).toBe("quota_probe_unavailable");
  });

  test("returns 400 when x-aloop-auth-handle header is missing", async () => {
    const adapter = makeMockAdapter("opencode", { probeQuota: async () => ({ remaining: 100, total: 1000, resetsAt: "2025-01-01", currency: "USD", probedAt: "2025-01-01" }) });
    const deps = makeDeps({ providerRegistry: { get: () => adapter } as any });
    const req = makeRequest("GET", "/v1/providers/opencode/quota", {});
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(400);
    const body = await (result as Response).json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("x-aloop-auth-handle");
  });

  test("returns 400 when x-aloop-auth-handle header is whitespace-only", async () => {
    const adapter = makeMockAdapter("opencode", { probeQuota: async () => ({ remaining: 100, total: 1000, resetsAt: "2025-01-01", currency: "USD", probedAt: "2025-01-01" }) });
    const deps = makeDeps({ providerRegistry: { get: () => adapter } as any });
    const req = makeRequest("GET", "/v1/providers/opencode/quota", { "x-aloop-auth-handle": "   " });
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(400);
  });

  test("returns 200 with quota data on successful probe", async () => {
    const quotaData = { remaining: 500, total: 10000, resetsAt: "2025-06-01T00:00:00Z", currency: "USD", probedAt: "2025-05-11T12:00:00Z" };
    const adapter = makeMockAdapter("anthropic", { probeQuota: async () => quotaData });
    let appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const deps = makeDeps({
      providerRegistry: { get: () => adapter } as any,
      events: {
        append: async (topic: string, data: Record<string, unknown>) => { appendedEvents.push({ topic, data }); },
      } as any,
      providerHealth: {
        noteSuccess: () => ({}),
        setQuota: () => ({}),
      } as any,
    });
    const req = makeRequest("GET", "/v1/providers/anthropic/quota", { "x-aloop-auth-handle": "user@example.com" });
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/anthropic/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    expect(resp.status).toBe(200);
    const body = await (result as Response).json();
    expect(body.provider_id).toBe("anthropic");
    expect(body.quota).toEqual(quotaData);
  });

  test("appends provider.quota and provider.health events on success", async () => {
    const quotaData = { remaining: 250, total: 5000, resetsAt: "2025-07-01", currency: "EUR", probedAt: "2025-05-11" };
    const adapter = makeMockAdapter("cohere", { probeQuota: async () => quotaData });
    let appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const deps = makeDeps({
      providerRegistry: { get: () => adapter } as any,
      events: {
        append: async (topic: string, data: Record<string, unknown>) => { appendedEvents.push({ topic, data }); },
      } as any,
      providerHealth: {
        noteSuccess: () => ({}),
        setQuota: () => ({}),
      } as any,
    });
    const req = makeRequest("GET", "/v1/providers/cohere/quota", { "x-aloop-auth-handle": "testuser" });
    await handleProviderQuota(req as any, deps, "/v1/providers/cohere/quota");
    const topics = appendedEvents.map(e => e.topic);
    expect(topics).toContain("provider.quota");
    expect(topics).toContain("provider.health");
    const quotaEvent = appendedEvents.find(e => e.topic === "provider.quota");
    expect(quotaEvent!.data.provider_id).toBe("cohere");
    expect(quotaEvent!.data.remaining).toBe(250);
    expect(quotaEvent!.data.total).toBe(5000);
  });

  test("returns error response when probeQuota throws", async () => {
    const error = new Error("rate limit exceeded");
    const adapter = makeMockAdapter("opencode", { probeQuota: async () => { throw error; } });
    let appendedEvents: Array<{ topic: string; data: Record<string, unknown> }> = [];
    const deps = makeDeps({
      providerRegistry: { get: () => adapter } as any,
      events: {
        append: async (topic: string, data: Record<string, unknown>) => { appendedEvents.push({ topic, data }); },
      } as any,
      providerHealth: {
        noteFailure: () => ({}),
      } as any,
    });
    const req = makeRequest("GET", "/v1/providers/opencode/quota", { "x-aloop-auth-handle": "user123" });
    const result = await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(result).not.toBeUndefined();
    const resp = result as Response;
    // classification of a generic Error is "unknown" → 503 Service Unavailable
    expect(resp.status).toBeGreaterThanOrEqual(400);
    const body = await (result as Response).json();
    expect(body.error.details.provider_id).toBe("opencode");
    expect(body.error.details.classification).toBeDefined();
  });

  test("uses cooldownMultiplier from deps when recording failure", async () => {
    const adapter = makeMockAdapter("opencode", { probeQuota: async () => { throw new Error("fail"); } });
    let recordedMultiplier: number | undefined;
    const deps = makeDeps({
      providerRegistry: { get: () => adapter } as any,
      events: { append: async () => {} } as any,
      providerHealth: {
        noteFailure: (_id: string, _classification: unknown, _now: number, opts: { cooldownMultiplier?: number }) => {
          recordedMultiplier = opts.cooldownMultiplier;
          return {};
        },
      } as any,
      cooldownMultipliers: new Map([["opencode", 2.5]]),
    });
    const req = makeRequest("GET", "/v1/providers/opencode/quota", { "x-aloop-auth-handle": "user" });
    await handleProviderQuota(req as any, deps, "/v1/providers/opencode/quota");
    expect(recordedMultiplier).toBe(2.5);
  });

  test("URL-decodes provider ID in pathname", async () => {
    const adapter = makeMockAdapter("provider with spaces", { probeQuota: async () => ({ remaining: 10, total: 100, resetsAt: "2025-01-01", currency: "USD", probedAt: "2025-01-01" }) });
    let gotProviderId: string | undefined;
    const deps = makeDeps({
      providerRegistry: {
        get: (id: string) => { gotProviderId = id; return adapter; },
      } as any,
      events: { append: async () => {} } as any,
      providerHealth: { noteSuccess: () => ({}), setQuota: () => ({}) } as any,
    });
    const req = makeRequest("GET", "/v1/providers/provider%20with%20spaces/quota", { "x-aloop-auth-handle": "user" });
    await handleProviderQuota(req as any, deps, "/v1/providers/provider%20with%20spaces/quota");
    expect(gotProviderId).toBe("provider with spaces");
  });
});
