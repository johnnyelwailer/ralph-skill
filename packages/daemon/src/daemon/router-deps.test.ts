import { describe, expect, test } from "bun:test";
import { makeRouterDeps, type MakeRouterDepsInput } from "./router-deps.ts";
import type { ConfigStore } from "@aloop/daemon-config";
import { DAEMON_DEFAULTS, OVERRIDES_DEFAULT } from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";
import { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";

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

function makeEventWriter(): EventWriter {
  return {
    append: async <T>(_topic: string, _data: T) => ({
      _v: 1 as const,
      id: "evt_test",
      timestamp: new Date(0).toISOString(),
      topic: "test",
      data: {} as T,
    }),
  };
}

function makeInput(): MakeRouterDepsInput {
  const config = makeConfigStore();
  const providerRegistry = new ProviderRegistry();
  const providerHealth = new InMemoryProviderHealthStore(
    providerRegistry.list().map((it) => it.id),
  );

  return {
    registry: {
      listProjects: () =>
        Promise.resolve({
          items: [],
          total: 0,
          _v: 1 as const,
        }),
      getProject: () => Promise.resolve(undefined),
      createProject: () => Promise.resolve({ ok: true, id: "pid_test" } as never),
      deleteProject: () => Promise.resolve({ ok: true }),
      list: () => [],
      get: () => undefined,
    } as never,
    scheduler: {
      acquire: () =>
        Promise.resolve({ ok: false, reason: "no_quota", details: {} } as never),
      release: () => Promise.resolve({ ok: true }),
      listPermits: () => Promise.resolve([]),
      expirePermits: () => Promise.resolve({ expired: 0 }),
      getLimits: () =>
        Promise.resolve({
          concurrencyCap: 3,
          permitTtlDefaultSeconds: 300,
          permitTtlMaxSeconds: 3600,
          systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
          burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
        }),
      updateLimits: () =>
        Promise.resolve({
          ok: true,
          limits: {
            concurrencyCap: 3,
            permitTtlDefaultSeconds: 300,
            permitTtlMaxSeconds: 3600,
            systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
            burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
          },
        }),
      currentLimits: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 300,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_500_000, minCommitsPerHour: 30 },
      }),
    } as never,
    startedAt: Date.now(),
    config,
    events: makeEventWriter(),
    providerRegistry,
    providerHealth,
  };
}

describe("makeRouterDeps", () => {
  test("returns a RouterDeps object with all four handlers", () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    expect(typeof deps.handleDaemon).toBe("function");
    expect(typeof deps.handleProjects).toBe("function");
    expect(typeof deps.handleProviders).toBe("function");
    expect(typeof deps.handleScheduler).toBe("function");
  });

  test("handleDaemon returns 200 + v1 envelope for GET /v1/daemon/health", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/daemon/health", { method: "GET" });
    const res = await deps.handleDaemon(req, "/v1/daemon/health");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
  });

  test("handleDaemon returns undefined for unknown daemon path", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/daemon/unknown", { method: "GET" });
    const res = await deps.handleDaemon(req, "/v1/daemon/unknown");

    expect(res).toBeUndefined();
  });

  test("handleScheduler returns undefined for bare /v1/scheduler prefix", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/scheduler", { method: "GET" });
    const res = await deps.handleScheduler(req, "/v1/scheduler");

    expect(res).toBeUndefined();
  });

  test("handleScheduler returns 200 for GET /v1/scheduler/limits", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/scheduler/limits", { method: "GET" });
    const res = await deps.handleScheduler(req, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body).toHaveProperty("max_permits");
  });

  test("handleProviders GET /v1/providers/overrides returns current overrides", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/providers/overrides", { method: "GET" });
    const res = await deps.handleProviders(req, "/v1/providers/overrides");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
  });

  test("handleProviders DELETE /v1/providers/overrides resets to defaults", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/providers/overrides", { method: "DELETE" });
    const res = await deps.handleProviders(req, "/v1/providers/overrides");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { _v: number; allow: null };
    expect(body._v).toBe(1);
    expect(body.allow).toBeNull();
  });

  test("handleProviders POST /v1/providers/overrides returns 405 (POST not allowed)", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/providers/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ _v: 1, allow: null, deny: null, force: null }),
    });
    const res = await deps.handleProviders(req, "/v1/providers/overrides");

    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });

  test("handleProviders returns undefined for unknown provider path", async () => {
    const input = makeInput();
    const deps = makeRouterDeps(input);

    const req = new Request("http://localhost/v1/providers/unknown-route", { method: "GET" });
    const res = await deps.handleProviders(req, "/v1/providers/unknown-route");

    expect(res).toBeUndefined();
  });
});
