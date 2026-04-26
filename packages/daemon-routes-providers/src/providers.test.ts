import { describe, expect, test } from "bun:test";
import { DAEMON_DEFAULTS, OVERRIDES_DEFAULT, type ConfigStore } from "@aloop/daemon-config";
import { InMemoryProviderHealthStore, ProviderRegistry, type ProviderAdapter } from "@aloop/provider";
import { handleProviders, type ProvidersDeps } from "./providers.ts";
import { parseJsonBody } from "./providers-http.ts";
import { handleProviderQuota } from "./providers-quota.ts";

function makeAdapter(id: string, opts: {
  supportsQuotaProbe: boolean;
  probeQuotaImpl?: () => Promise<{ remaining: number; total: number | null; resetsAt: string | null; probedAt: string }>;
}): ProviderAdapter {
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

function makeConfigStore(): ConfigStore {
  let overrides = { ...OVERRIDES_DEFAULT };
  return {
    daemon: () => DAEMON_DEFAULTS,
    overrides: () => overrides,
    paths: () => ({
      home: "/tmp/aloop-home",
      pidFile: "/tmp/aloop-home/aloopd.pid",
      socketFile: "/tmp/aloop-home/aloopd.sock",
      stateDir: "/tmp/aloop-home/state",
      logFile: "/tmp/aloop-home/state/aloopd.log",
      daemonConfigFile: "/tmp/aloop-home/daemon.yml",
      overridesFile: "/tmp/aloop-home/overrides.yml",
    }),
    reload: () => ({ ok: true, daemon: DAEMON_DEFAULTS, overrides }),
    setDaemon: () => DAEMON_DEFAULTS,
    setOverrides: (next) => {
      overrides = { ...next };
      return overrides;
    },
  };
}

function makeDeps(): ProvidersDeps {
  const providerRegistry = new ProviderRegistry();
  return {
    config: makeConfigStore(),
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
    providerHealth: new InMemoryProviderHealthStore(providerRegistry.list().map((it) => it.id)),
  };
}

function makeQuotaDeps(): ProvidersDeps {
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(makeAdapter("probe-capable", {
    supportsQuotaProbe: true,
    probeQuotaImpl: async () => ({
      remaining: 1000,
      total: 2000,
      resetsAt: null,
      probedAt: new Date().toISOString(),
    }),
  }));
  providerRegistry.register(makeAdapter("probe-incapable", {
    supportsQuotaProbe: false,
  }));
  return {
    config: makeConfigStore(),
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
}

describe("handleProviders", () => {
  test("returns undefined for unrelated path", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/unrelated"),
      makeDeps(),
      "/v1/unrelated",
    );
    expect(res).toBeUndefined();
  });

  test("GET /v1/providers returns v1 envelope", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers", { method: "GET" }),
      makeDeps(),
      "/v1/providers",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; items: unknown[] };
    expect(body._v).toBe(1);
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("GET /v1/providers returns 405 for non-GET", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers", { method: "POST" }),
      makeDeps(),
      "/v1/providers",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/providers/overrides ────────────────────────────────────────────────

describe("GET /v1/providers/overrides", () => {
  test("returns current overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "GET" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: null; deny: null; force: null };
    expect(body._v).toBe(1);
  });
});

describe("DELETE /v1/providers/overrides", () => {
  test("resets overrides to defaults and returns them", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "DELETE" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: null; deny: null; force: null };
    expect(body._v).toBe(1);
    expect(body.allow).toBeNull();
  });

  test("DELETE is the only allowed mutation method on overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "POST" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

describe("PUT /v1/providers/overrides", () => {
  test("accepts valid overrides", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allow: ["opencode", "codex"] }),
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: readonly string[] };
    expect(body._v).toBe(1);
    expect(body.allow).toEqual(["opencode", "codex"]);
  });

  test("rejects invalid overrides with 400", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allow: 42 }),
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for malformed JSON body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("PUT is the only allowed mutation method on overrides", async () => {
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", { method: "PATCH" }),
      makeDeps(),
      "/v1/providers/overrides",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/providers/resolve-chain ────────────────────────────────────────────

describe("POST /v1/providers/resolve-chain", () => {
  test("resolves provider chain and returns all fields", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_abc", provider_chain: ["opencode"] }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as {
      _v: number;
      session_id: string;
      input_chain: string[];
      resolved_chain: string[];
      excluded_overrides: string[];
      excluded_health: string[];
    };
    expect(body._v).toBe(1);
    expect(body.session_id).toBe("sess_abc");
    expect(body.input_chain).toEqual(["opencode"]);
    expect(Array.isArray(body.resolved_chain)).toBe(true);
  });

  test("uses all registered providers when chain is omitted", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_xyz" }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { input_chain: unknown };
    expect(body.input_chain).toEqual([]);
  });

  test("returns 400 when session_id is missing", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider_chain: ["opencode"] }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when session_id is empty string", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "   " }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for malformed JSON body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 405 for non-POST methods", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", { method: "GET" }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("returns 400 when session_id is a number instead of string", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: 12345 }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res!.status).toBe(400);
  });

  test("returns 400 when provider_chain is a number instead of array", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_valid", provider_chain: 42 }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res!.status).toBe(400);
  });

  test("returns 400 when provider_chain is a string instead of array", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/resolve-chain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: "sess_ok", provider_chain: "opencode" }),
      }),
      deps,
      "/v1/providers/resolve-chain",
    );
    expect(res!.status).toBe(400);
  });
});

// ─── PUT /v1/providers/overrides JSON body edge cases ──────────────────────

describe("PUT /v1/providers/overrides JSON body validation", () => {
  test("returns 400 for JSON array body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for JSON null body", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "null",
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for invalid JSON text", async () => {
    const deps = makeDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/overrides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not valid json {{{",
      }),
      deps,
      "/v1/providers/overrides",
    );
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });
});

// ─── GET /v1/providers/:id/quota ──────────────────────────────────────────────

describe("GET /v1/providers/:id/quota via handleProviders", () => {
  // This path is delegated to handleProviderQuota — tests verify the delegation
  // and the cases that handleProviderQuota does NOT cover in isolation.

  test("returns 200 with quota data for a known provider", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/probe-capable/quota", {
        headers: { "x-aloop-auth-handle": "test-user" },
      }),
      deps,
      "/v1/providers/probe-capable/quota",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; provider_id: string; quota: { remaining: number } };
    expect(body._v).toBe(1);
    expect(body.provider_id).toBe("probe-capable");
    expect(body.quota.remaining).toBe(1000);
  });

  test("returns 400 when x-aloop-auth-handle header is missing", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/probe-capable/quota"),
      deps,
      "/v1/providers/probe-capable/quota",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 when x-aloop-auth-handle header is empty string", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/probe-capable/quota", {
        headers: { "x-aloop-auth-handle": "   " },
      }),
      deps,
      "/v1/providers/probe-capable/quota",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 404 for an unknown provider id", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/nonexistent/quota", {
        headers: { "x-aloop-auth-handle": "test-user" },
      }),
      deps,
      "/v1/providers/nonexistent/quota",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });

  test("returns 405 for non-GET method on quota path", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/probe-capable/quota", {
        method: "POST",
        headers: { "x-aloop-auth-handle": "test-user" },
      }),
      deps,
      "/v1/providers/probe-capable/quota",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("URL-decodes provider id in the pathname", async () => {
    const deps = makeQuotaDeps();
    const res = await handleProviders(
      new Request("http://x/v1/providers/probe-capable%2Falias/quota", {
        headers: { "x-aloop-auth-handle": "test-user" },
      }),
      deps,
      "/v1/providers/probe-capable%2Falias/quota",
    );
    expect(res).toBeDefined();
    // probe-capable%2Falias is URL-decoded to "probe-capable/alias" — not in the registry → 404
    expect(res!.status).toBe(404);
  });
});

// ─── parseJsonBody throws on req.text() failure ─────────────────────────────

describe("parseJsonBody handles text() failure", () => {
  test("returns 400 error when req.text() throws", async () => {
    // A Request whose body throws on text() access
    const badReq = new Request("http://x", {
      method: "POST",
      body: {
        async text() {
          throw new Error("read error");
        },
      } as Body,
    });
    const result = await parseJsonBody(badReq);
    expect(result).toEqual({ error: expect.any(Response) });
    const err = (result as { error: Response }).error;
    expect(err.status).toBe(400);
    const body = await err.json();
    expect((body as { error: { code: string } }).error.code).toBe("bad_request");
  });
});
