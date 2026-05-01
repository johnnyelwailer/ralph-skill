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
  reloadError?: string[];
}> = {}): DaemonDeps {
  const daemonCfg: typeof defaultDaemon.features = {
    daemonConfigWrite: false,
    ...overrides.features,
  };

  const defaultDaemon = {
    _v: 1,
    http: { bind: "127.0.0.1", port: 7777, autostart: true },
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

  const store: ConfigStore = {
    daemon: () => configWrap.daemon as any,
    overrides: () => [] as any,
    reload: overrides.reloadError
      ? () => ({ ok: false as const, errors: overrides.reloadError! })
      : () => ({ ok: true, daemon: configWrap.daemon as any, overrides: [] as any }),
    setDaemon: (c: any) => {
      // Replace the nested daemon object entirely so callers that read daemon() get the updated object.
      if (c.daemon !== undefined) {
        configWrap.daemon = c.daemon;
      } else {
        // Partial update — merge into existing daemon
        configWrap.daemon = { ...configWrap.daemon, ...c } as typeof defaultDaemon;
      }
      return configWrap.daemon as any;
    },
  } as any;

  // Minimal temp dir with no sessions — buildCounters will scan and return zeros
  const tmpDir = { path: "" };

  return {
    startedAt: overrides.startedAt ?? Date.now(),
    config: overrides.config ?? store,
    sessionsDir: () => tmpDir.path,
    scheduler: {
      listPermits: () => [],
    } as any,
    registry: { listProjects: () => [] } as any,
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

  test("health body includes _v: 1, status: ok, version, uptime_seconds, and counters", async () => {
    const deps = makeDeps({ startedAt: Date.now() });
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(typeof (body.uptime_seconds as number)).toBe("number");
    // counters field present and has expected shape
    expect(body.counters).toBeDefined();
    const c = body.counters as Record<string, unknown>;
    expect(typeof (c.sessions_total as number)).toBe("number");
    expect(typeof (c.permits_in_flight as number)).toBe("number");
    expect(typeof (c.sessions_by_status as Record<string, unknown>)).toBe("object");
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

  test("health counters.permits_in_flight reflects scheduler permits", async () => {
    const deps = makeDeps();
    // Override scheduler to return 2 permits
    (deps.scheduler as any).listPermits = () => [{ id: "p1" }, { id: "p2" }];
    const res = await handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    expect((body.counters as Record<string, unknown>).permits_in_flight).toBe(2);
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

  test("returns undefined (404) for POST on /v1/daemon/config", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/config", { method: "POST" }), deps, "/v1/daemon/config");
    expect(res).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/daemon/reload
// ---------------------------------------------------------------------------

describe("POST /v1/daemon/reload", () => {
  test("returns 200 with reloaded daemon and overrides on success", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.daemon).toBeDefined();
    expect(body.overrides).toBeDefined();
  });

  test("returns 400 with config_invalid error when reload fails", async () => {
    const deps = makeDeps({ reloadError: ["daemon.yml: http.port must be a number"] });
    const res = await handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("config_invalid");
    expect((body as any).error.message).toContain("reload failed");
    expect((body as any).error.details.errors).toContain("daemon.yml: http.port must be a number");
  });

  test("returns 400 with multiple errors when both files fail to parse", async () => {
    const deps = makeDeps({
      reloadError: [
        "daemon.yml: http.port must be a number",
        "overrides.yml: allow must be an array",
      ],
    });
    const res = await handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("config_invalid");
    expect((body as any).error.details.errors).toHaveLength(2);
  });

  test("returns undefined (404) for GET on /v1/daemon/reload", async () => {
    const deps = makeDeps();
    const res = await handleDaemon(new Request("http://x/v1/daemon/reload", { method: "GET" }), deps, "/v1/daemon/reload");
    expect(res).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildCounters error paths (GET /v1/daemon/health)
// ---------------------------------------------------------------------------

describe("GET /v1/daemon/health buildCounters error paths", () => {
  test("returns zero counters when sessions directory does not exist", async () => {
    // sessionsDir returns a path that does not exist
    const deps = makeDeps();
    (deps as any).sessionsDir = () => "/this/path/does/not/exist/at/all";
    const res = await handleDaemon(
      new Request("http://x/v1/daemon/health", { method: "GET" }),
      deps,
      "/v1/daemon/health",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await res!.json() as Record<string, unknown>;
    expect((body.counters as Record<string, unknown>).sessions_total).toBe(0);
    expect((body.counters as Record<string, unknown>).sessions_by_status).toEqual({});
  });

  test("returns zero counters when sessions directory is a file (not a directory)", async () => {
    const deps = makeDeps();
    // Use a file path instead of a directory — readdirSync on a file throws
    (deps as any).sessionsDir = () => "/etc/passwd";
    const res = await handleDaemon(
      new Request("http://x/v1/daemon/health", { method: "GET" }),
      deps,
      "/v1/daemon/health",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await res!.json() as Record<string, unknown>;
    // Should gracefully fall through to empty counters rather than crashing
    expect((body.counters as Record<string, unknown>).sessions_total).toBe(0);
    expect((body.counters as Record<string, unknown>).sessions_by_status).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/daemon/config (feature-gated)
// ---------------------------------------------------------------------------

describe("PUT /v1/daemon/config", () => {
  test("returns 200 with updated config when feature flag is enabled and payload is valid", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    expect((body.daemon as any).logging.level).toBe("debug");
    expect((body.daemon as any).scheduler.concurrencyCap).toBe(3);
  });

  test("returns 400 when http.bind is changed (requires restart)", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    expect((body as any).error.details.current_port).toBe(7777);
  });

  test("returns 400 when http.port is changed (requires restart)", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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

  test("returns 400 when req.text() throws (malformed stream)", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
    // Simulate a stream that throws when read — parseJsonBody should catch it and return 400
    const mockReq = new Request("http://x/v1/daemon/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
    }) as Request & { text(): Promise<string> };
    // Replace text() with one that throws
    mockReq.text = async () => {
      throw new Error("stream error");
    };
    const res = await handleDaemon(mockReq as Request, deps, "/v1/daemon/config");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text()) as Record<string, unknown>;
    expect((body as any).error.code).toBe("bad_request");
  });

  test("returns 400 for non-object JSON body", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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

  test("empty body is treated as {} and succeeds (fills defaults)", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
    const res = await handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "",
      }),
      deps,
      "/v1/daemon/config",
    );
    // Empty string → parseJsonBody returns {} → parseDaemonConfig fills defaults → ok
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
  });

  test("returns 400 for unknown top-level field", async () => {
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: false } });
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
    const deps = makeDeps({ features: { daemonConfigWrite: true } });
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
