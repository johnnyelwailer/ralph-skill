import { describe, expect, test } from "bun:test";
import { handleDaemon } from "./daemon";
import type { DaemonDeps } from "./daemon";
import type { ConfigStore } from "@aloop/daemon-config";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<{
  startedAt: number;
  config: ConfigStore;
  features?: { daemonConfigWrite: boolean };
}> = {}): DaemonDeps {
  const daemonCfg: typeof defaultDaemon.features = {
    daemonConfigWrite: false,
    ...overrides.features,
  };

  const defaultDaemon = {
    _v: 1,
    http: { bind: "127.0.0.1", port: 24709, autostart: false },
    watchdog: { tickIntervalSeconds: 15, stuckThresholdSeconds: 600, quotaPollIntervalSeconds: 60 },
    scheduler: {
      concurrencyCap: 3,
      permitTtlDefaultSeconds: 600,
      permitTtlMaxSeconds: 3600,
      systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
      burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
    },
    retention: { completedSessionsDays: 30, interruptedSessionsDays: 90, abandonedSetupDays: 14 },
    logging: { level: "info" as const },
    features: daemonCfg,
  };

  const configWrap = { _v: 1 as const, version: "0.1.0", daemon: defaultDaemon, providers: [] };

  // _cached must be a getter so it tracks the live daemon config even after
  // setDaemon() replaces configWrap.daemon entirely (Object.assign replaces the
  // .daemon property, not its contents).
  let _cached = defaultDaemon;

  const store: ConfigStore = {
    daemon: () => configWrap.daemon as any,
    overrides: () => [] as any,
    reload: () => ({ ok: true, daemon: configWrap.daemon as any, overrides: [] as any }),
    setDaemon: (c: any) => {
      Object.assign(configWrap, c);
      _cached = configWrap.daemon;
      return configWrap.daemon as any;
    },
  } as any;

  // Define _cached as an own getter property so it stays in sync.
  Object.defineProperty(store, "_cached", {
    get() { return _cached; },
    configurable: true,
  });

  return {
    startedAt: overrides.startedAt ?? Date.now(),
    config: overrides.config ?? store,
  };
}

// ---------------------------------------------------------------------------
// GET /v1/daemon/health
// ---------------------------------------------------------------------------

describe("GET /v1/daemon/health", () => {
  test("returns 200 with canonical v1 health envelope", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
  });

  test("health body includes _v: 1, status: ok, version, and uptime_seconds", async () => {
    const deps = makeDeps({ startedAt: Date.now() });
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.0.0");
    expect(typeof (body.uptime_seconds as number)).toBe("number");
  });

  test("uptime_seconds is computed from startedAt", async () => {
    const startedAt = Date.now() - 5000;
    const deps = makeDeps({ startedAt });
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    // uptime should be ~5 seconds (allow small margin)
    expect((body.uptime_seconds as number)).toBeGreaterThanOrEqual(4);
    expect((body.uptime_seconds as number)).toBeLessThan(10);
  });

  test("returns undefined (404) for POST on /v1/daemon/health", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "POST" }), deps, "/v1/daemon/health");
    expect(res).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/daemon/config
// ---------------------------------------------------------------------------

describe("GET /v1/daemon/config", () => {
  test("returns 200 with daemon and overrides config", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/config", { method: "GET" }), deps, "/v1/daemon/config");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
  });

  test("body includes _v: 1, daemon config, and overrides", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/config", { method: "GET" }), deps, "/v1/daemon/config");
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.daemon).toBeDefined();
    expect(body.overrides).toBeDefined();
  });

  test("returns undefined (404) for PUT on /v1/daemon/config when feature flag is disabled", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ http: { bind: "0.0.0.0", port: 24709, autostart: false } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    // Disabled flag → handler returns undefined → router maps to 404
    expect(res).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/daemon/config (feature-gated)
// ---------------------------------------------------------------------------

describe("PUT /v1/daemon/config", () => {
  test("returns 200 with updated config when feature flag is enabled and payload is valid", async () => {
    const deps = makeDeps();
    // Mutate the in-memory config to enable the feature flag
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features: { daemon_config_write: true } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.daemon).toBeDefined();
    expect((body.daemon as any).features.daemonConfigWrite).toBe(true);
  });

  test("returns 200 and preserves unspecified fields when updating with partial config", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logging: { level: "debug" } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    // logging should be debug, everything else should use defaults
    expect((body.daemon as any).logging.level).toBe("debug");
    // scheduler should use defaults
    expect((body.daemon as any).scheduler.concurrencyCap).toBe(3);
  });

  test("returns 400 when http.bind is changed (requires restart)", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ http: { bind: "0.0.0.0", port: 24709, autostart: false } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("restart");
    expect((body as any).error.details.current_bind).toBe("127.0.0.1");
    expect((body as any).error.details.current_port).toBe(24709);
  });

  test("returns 400 when http.port is changed (requires restart)", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ http: { bind: "127.0.0.1", port: 9999, autostart: false } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("restart");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not json{",
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("JSON");
  });

  test("returns 400 for non-object JSON body", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "123",
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.message).toContain("JSON object");
  });

  test("returns 400 for empty body (empty string)", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "",
      }),
      deps,
      "/v1/daemon/config",
    );
    // Empty body is treated as {} so should succeed — actually let's allow empty
    // Wait, empty string gets caught by the JSON.parse catch → 400
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
  });

  test("returns 400 for unknown top-level field", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unknown_field: true }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
  });

  test("returns 400 for unknown features sub-field", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features: { unknown_feature: true } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
    expect((body as any).error.details.errors.some((e: string) => e.includes("unknown features field"))).toBe(true);
  });

  test("returns 400 for invalid logging level", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logging: { level: "invalid" } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
  });

  test("feature flag disabled → returns undefined (404)", async () => {
    const deps = makeDeps();
    // Explicitly keep daemonConfigWrite = false
    (deps.config as any)._cached.features.daemonConfigWrite = false;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features: { daemon_config_write: true } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeUndefined();
  });

  test("accepts camelCase features.daemonConfigWrite in addition to snake_case", async () => {
    const deps = makeDeps();
    (deps.config as any)._cached.features.daemonConfigWrite = true;

    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ features: { daemonConfigWrite: true } }),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
  });
});
