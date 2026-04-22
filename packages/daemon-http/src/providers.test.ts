import { describe, expect, test } from "bun:test";
import { handleProviders, type ProvidersDeps } from "./providers.ts";
import type { EventWriter } from "@aloop/state-sqlite";
import type { ConfigStore } from "@aloop/daemon-config";
import { DAEMON_DEFAULTS, OVERRIDES_DEFAULT } from "@aloop/daemon-config";
import {
  createOpencodeAdapter,
  InMemoryProviderHealthStore,
  ProviderRegistry,
  type ProviderAdapter,
} from "@aloop/provider";

const PATH_OVERRIDES = "/v1/providers/overrides";
type OverridesBody = {
  _v: number;
  allow: readonly string[] | null;
  deny: readonly string[] | null;
  force: string | null;
};

function makeConfigStore(initial = OVERRIDES_DEFAULT): ConfigStore {
  let daemonConfig = DAEMON_DEFAULTS;
  let value = { ...initial };
  return {
    daemon() {
      return daemonConfig;
    },
    overrides() {
      return value;
    },
    paths() {
      return {
        home: "/tmp/aloop-home",
        pidFile: "/tmp/aloop-home/aloopd.pid",
        socketFile: "/tmp/aloop-home/aloopd.sock",
        stateDir: "/tmp/aloop-home/state",
        logFile: "/tmp/aloop-home/state/aloopd.log",
        daemonConfigFile: "/tmp/aloop-home/daemon.yml",
        overridesFile: "/tmp/aloop-home/overrides.yml",
      };
    },
    reload() {
      return { ok: true, daemon: daemonConfig, overrides: value } as const;
    },
    setDaemon(next) {
      daemonConfig = next;
      return daemonConfig;
    },
    setOverrides(v) {
      value = { ...v };
      return value;
    },
  };
}

function makeEventWriter(): EventWriter & { appended: unknown[] } {
  const appended: unknown[] = [];
  return {
    appended,
    async append(topic, data) {
      appended.push({ topic, data });
      // Return a minimal valid envelope shape.
      return {
        _v: 1,
        topic,
        data,
        id: "test-id",
        timestamp: new Date(0).toISOString(),
      };
    },
  };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost${PATH_OVERRIDES}`, {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });
}

function makeProviderAdapterWithProbe(): ProviderAdapter {
  return {
    id: "claude",
    capabilities: {
      streaming: false,
      vision: false,
      toolUse: true,
      reasoningEffort: true,
      quotaProbe: true,
      sessionResume: false,
      costReporting: true,
      maxContextTokens: null,
    },
    resolveModel(ref) {
      return { providerId: "claude", modelId: ref };
    },
    probeQuota: async () => ({
      remaining: 123,
      total: 1000,
      resetsAt: new Date(1_700_000_000_000).toISOString(),
      probedAt: new Date(1_700_000_000_000).toISOString(),
      currency: "tokens",
    }),
    async *sendTurn() {
      yield { type: "text", content: { delta: "ok" } };
      yield { type: "usage", content: { providerId: "claude", modelId: "claude" }, final: true };
    },
  };
}

function makeProvidersDeps(options: {
  config?: ConfigStore;
  events?: ReturnType<typeof makeEventWriter>;
  withQuotaProbe?: boolean;
} = {}): ProvidersDeps & { events: ReturnType<typeof makeEventWriter> } {
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(
    createOpencodeAdapter({
      runTurn: async () => ({ ok: true, text: "ok", usage: { tokensIn: 1, tokensOut: 1 } }),
    }),
  );
  if (options.withQuotaProbe) {
    providerRegistry.register(makeProviderAdapterWithProbe());
  }
  const providerHealth = new InMemoryProviderHealthStore(
    providerRegistry.list().map((adapter) => adapter.id),
  );
  return {
    config: options.config ?? makeConfigStore(),
    events: options.events ?? makeEventWriter(),
    providerRegistry,
    providerHealth,
  };
}

describe("handleProviders", () => {
  describe("path mismatch", () => {
    test("returns undefined for unrelated pathname", async () => {
      const deps = makeProvidersDeps();
      const req = makeRequest("GET");
      // Pretend this is a different route by passing a non-matching pathname.
      const result = await handleProviders(req, deps, "/v1/something/else");
      expect(result).toBeUndefined();
    });
  });

  describe("GET /v1/providers", () => {
    test("lists registered providers with capabilities and health", async () => {
      const deps = makeProvidersDeps({ withQuotaProbe: true });
      const req = new Request("http://localhost/v1/providers", { method: "GET" });
      const result = await handleProviders(req, deps, "/v1/providers");
      expect(result!.status).toBe(200);
      const body = await resJson<{
        _v: number;
        items: Array<{ id: string; capabilities: { quotaProbe: boolean }; health: { status: string } }>;
      }>(result!);
      expect(body._v).toBe(1);
      expect(body.items.map((item) => item.id)).toEqual(["opencode", "claude"]);
      const claude = body.items.find((item) => item.id === "claude");
      expect(claude?.health.status).toBe("unknown");
      expect(claude?.capabilities.quotaProbe).toBe(true);
    });
  });

  describe("GET /v1/providers/:id/quota", () => {
    test("returns 400 when auth handle header is missing", async () => {
      const deps = makeProvidersDeps({ withQuotaProbe: true });
      const req = new Request("http://localhost/v1/providers/claude/quota", { method: "GET" });
      const result = await handleProviders(req, deps, "/v1/providers/claude/quota");
      expect(result!.status).toBe(400);
    });

    test("returns 501 when provider has no probe", async () => {
      const deps = makeProvidersDeps();
      const req = new Request("http://localhost/v1/providers/opencode/quota", {
        method: "GET",
        headers: { "x-aloop-auth-handle": "auth_1" },
      });
      const result = await handleProviders(req, deps, "/v1/providers/opencode/quota");
      expect(result!.status).toBe(501);
    });

    test("returns probe result and updates quota in health store", async () => {
      const deps = makeProvidersDeps({ withQuotaProbe: true });
      const req = new Request("http://localhost/v1/providers/claude/quota", {
        method: "GET",
        headers: { "x-aloop-auth-handle": "auth_1" },
      });
      const result = await handleProviders(req, deps, "/v1/providers/claude/quota");
      expect(result!.status).toBe(200);
      const body = await resJson<{ quota: { remaining: number } }>(result!);
      expect(body.quota.remaining).toBe(123);
      expect(deps.providerHealth.get("claude").quotaRemaining).toBe(123);
    });
  });

  describe("GET /v1/providers/overrides", () => {
    test("returns current overrides with _v envelope", async () => {
      const custom = { allow: ["provider_a"], deny: null, force: null };
      const config = makeConfigStore(custom);
      const deps = makeProvidersDeps({ config });
      const result = await handleProviders(makeRequest("GET"), deps, PATH_OVERRIDES);
      expect(result!.status).toBe(200);
      const body = await resJson<OverridesBody>(result!);
      expect(body).toEqual({ _v: 1, ...custom });
    });

    test("returns all-null defaults when no overrides set", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(makeRequest("GET"), deps, PATH_OVERRIDES);
      expect(result!.status).toBe(200);
      const body = await resJson<OverridesBody>(result!);
      expect(body).toEqual({ _v: 1, ...OVERRIDES_DEFAULT });
    });
  });

  describe("DELETE /v1/providers/overrides", () => {
    test("resets overrides to defaults and returns them", async () => {
      const custom = { allow: ["x"], deny: ["y"], force: "z" };
      const config = makeConfigStore(custom);
      const events = makeEventWriter();
      const deps = makeProvidersDeps({ config, events });
      const result = await handleProviders(makeRequest("DELETE"), deps, PATH_OVERRIDES);
      expect(result!.status).toBe(200);
      const body = await resJson<OverridesBody>(result!);
      expect(body).toEqual({ _v: 1, ...OVERRIDES_DEFAULT });
      expect(config.overrides()).toEqual(OVERRIDES_DEFAULT);
    });

    test("emits provider.override.changed event with defaults", async () => {
      const custom = { allow: ["x"], deny: null, force: null };
      const config = makeConfigStore(custom);
      const events = makeEventWriter();
      const deps = makeProvidersDeps({ config, events });
      await handleProviders(makeRequest("DELETE"), deps, PATH_OVERRIDES);
      expect(events.appended).toHaveLength(1);
      expect(events.appended[0]).toMatchObject({
        topic: "provider.override.changed",
        data: OVERRIDES_DEFAULT,
      });
    });
  });

  describe("PUT /v1/providers/overrides", () => {
    test("accepts valid overrides and persists them", async () => {
      const config = makeConfigStore();
      const events = makeEventWriter();
      const deps = makeProvidersDeps({ config, events });
      const overrides = { allow: ["opencode", "codex"], deny: null, force: null };
      const result = await handleProviders(
        makeRequest("PUT", overrides),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(200);
      const body = await resJson<OverridesBody>(result!);
      expect(body).toEqual({ _v: 1, ...overrides });
      expect(config.overrides()).toEqual(overrides);
    });

    test("emits provider.override.changed event on valid PUT", async () => {
      const config = makeConfigStore();
      const events = makeEventWriter();
      const deps = makeProvidersDeps({ config, events });
      const overrides = { allow: null, deny: ["bad"], force: "good" };
      await handleProviders(makeRequest("PUT", overrides), deps, PATH_OVERRIDES);
      expect(events.appended).toHaveLength(1);
      expect(events.appended[0]).toMatchObject({
        topic: "provider.override.changed",
        data: overrides,
      });
    });

    test("returns 400 when body is not a JSON object", async () => {
      const deps = makeProvidersDeps();
      const badReq = new Request(`http://localhost${PATH_OVERRIDES}`, {
        method: "PUT",
        body: "not json at all",
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH_OVERRIDES);
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string } }>(result!);
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 when allow is not an array", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { allow: "not-an-array" }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string } }>(result!);
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 when allow contains non-string entries", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { allow: ["valid", 123, "also valid"] }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string; details: { errors: string[] } } }>(result!);
      expect(body.error.code).toBe("bad_request");
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("allow"),
      );
    });

    test("returns 400 when force is not a string", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { force: 42 }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
    });

    test("returns 400 when force is an empty string", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { force: "" }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string } }>(result!);
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 for deny list containing an empty string", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { deny: ["provider_a", ""] }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string; details: { errors: string[] } } }>(result!);
      expect(body.error.code).toBe("bad_request");
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("deny"),
      );
    });

    test("returns 400 when body is null JSON value", async () => {
      const deps = makeProvidersDeps();
      const badReq = new Request(`http://localhost${PATH_OVERRIDES}`, {
        method: "PUT",
        body: "null",
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH_OVERRIDES);
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string; message: string } }>(result!);
      expect(body.error.code).toBe("bad_request");
      expect(body.error.message).toBe("request body must be a JSON object");
    });

    test("returns 400 when body is an array", async () => {
      const deps = makeProvidersDeps();
      const badReq = new Request(`http://localhost${PATH_OVERRIDES}`, {
        method: "PUT",
        body: JSON.stringify(["not", "an", "object"]),
        headers: { "content-type": "application/json" },
      });
      const result = await handleProviders(badReq, deps, PATH_OVERRIDES);
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { code: string } }>(result!);
      expect(body.error.code).toBe("bad_request");
    });

    test("returns 400 for unknown top-level field", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(
        makeRequest("PUT", { allow: null, unknown_field: true }),
        deps,
        PATH_OVERRIDES,
      );
      expect(result!.status).toBe(400);
      const body = await resJson<{ error: { details: { errors: string[] } } }>(result!);
      expect(body.error.details.errors).toContainEqual(
        expect.stringContaining("unknown"),
      );
    });

    test("does not emit event when validation fails", async () => {
      const events = makeEventWriter();
      const deps = makeProvidersDeps({ events });
      await handleProviders(
        makeRequest("PUT", { allow: 123 }),
        deps,
        PATH_OVERRIDES,
      );
      expect(events.appended).toHaveLength(0);
    });
  });

  describe("PUT /v1/providers/overrides error handling", () => {
    test("rethrows when setOverrides throws a non-Error value", async () => {
      const badConfigStore = {
        overrides() {
          return OVERRIDES_DEFAULT;
        },
        setOverrides(_v: unknown) {
          // Simulate a broken ConfigStore that throws a non-Error
          throw "unexpected string error";
        },
      };
      const deps = {
        config: badConfigStore as unknown as ConfigStore,
        events: makeEventWriter(),
      };
      // The handler does not catch non-Error throwables — the rejection propagates
      await expect(
        handleProviders(
          makeRequest("PUT", { allow: ["opencode"], deny: null, force: null }),
          deps,
          PATH,
        ),
      ).rejects.toThrow("unexpected string error");
    });

    test("rethrows when setOverrides throws an Error", async () => {
      const throwingConfigStore = {
        overrides() {
          return OVERRIDES_DEFAULT;
        },
        setOverrides(_v: unknown) {
          throw new Error("database write failed");
        },
      };
      const deps = {
        config: throwingConfigStore as unknown as ConfigStore,
        events: makeEventWriter(),
      };
      await expect(
        handleProviders(
          makeRequest("PUT", { allow: null, deny: null, force: "codex" }),
          deps,
          PATH,
        ),
      ).rejects.toThrow("database write failed");
    });

    test("event is not emitted when setOverrides throws", async () => {
      const throwingConfigStore = {
        overrides() {
          return OVERRIDES_DEFAULT;
        },
        setOverrides(_v: unknown) {
          throw new Error("write failure");
        },
      };
      const events = makeEventWriter();
      const deps = {
        config: throwingConfigStore as unknown as ConfigStore,
        events,
      };
      await expect(
        handleProviders(
          makeRequest("PUT", { allow: null, deny: null, force: "anthropic" }),
          deps,
          PATH,
        ),
      ).rejects.toThrow("write failure");
      // No event should be appended since the throw happened before append
      expect(events.appended).toHaveLength(0);
    });
  });

  describe("method not allowed", () => {
    test("returns 405 for POST", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(makeRequest("POST"), deps, PATH_OVERRIDES);
      expect(result!.status).toBe(405);
      const body = await resJson<{ error: { code: string } }>(result!);
      expect(body.error.code).toBe("method_not_allowed");
    });

    test("returns 405 for PATCH", async () => {
      const deps = makeProvidersDeps();
      const result = await handleProviders(makeRequest("PATCH"), deps, PATH_OVERRIDES);
      expect(result!.status).toBe(405);
    });
  });
});
