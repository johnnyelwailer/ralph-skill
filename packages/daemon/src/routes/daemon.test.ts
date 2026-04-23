import { describe, expect, test } from "bun:test";
import { handleDaemon, type DaemonDeps } from "./daemon.ts";
import { DAEMON_DEFAULTS, OVERRIDES_DEFAULT } from "@aloop/daemon-config";

function makeDeps(overrides: Partial<DaemonDeps> = {}): DaemonDeps {
  return {
    startedAt: Date.now() - 60_000,
    config: {
      daemon: () => ({ ...DAEMON_DEFAULTS }),
      overrides: () => ({ ...OVERRIDES_DEFAULT }),
      paths: () => ({
        home: "/tmp/aloop",
        pidFile: "/tmp/aloop/aloopd.pid",
        socketFile: "/tmp/aloop/aloopd.sock",
        stateDir: "/tmp/aloop/state",
        logFile: "/tmp/aloop/state/aloopd.log",
        daemonConfigFile: "/tmp/aloop/daemon.yml",
        overridesFile: "/tmp/aloop/overrides.yml",
      }),
      reload: () => ({
        ok: true,
        daemon: { ...DAEMON_DEFAULTS },
        overrides: { ...OVERRIDES_DEFAULT },
      }),
      setDaemon: () => ({ ...DAEMON_DEFAULTS }),
      setOverrides: () => ({ ...OVERRIDES_DEFAULT }),
    },
    ...overrides,
  };
}

// ─── GET /v1/daemon/health ─────────────────────────────────────────────────

describe("GET /v1/daemon/health", () => {
  test("returns 200 with canonical v1 health envelope", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/json");
  });

  test("health body includes _v: 1, status: ok, version, and uptime_seconds", async () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      _v: 1,
      status: "ok",
      version: expect.any(String),
    });
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(59);
    expect(body.uptime_seconds).toBeLessThanOrEqual(61);
  });

  test("uptime_seconds is computed from startedAt", async () => {
    const startedAt = Date.now() - 5000;
    const deps = makeDeps({ startedAt });
    const res = handleDaemon(new Request("http://x/v1/daemon/health", { method: "GET" }), deps, "/v1/daemon/health");
    const body = await res!.json() as Record<string, unknown>;
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(4);
    expect(body.uptime_seconds).toBeLessThanOrEqual(6);
  });

  test("returns 405 for POST on /v1/daemon/health", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/health", { method: "POST" }), deps, "/v1/daemon/health");
    expect(res).toBeUndefined();
  });
});

// ─── GET /v1/daemon/config ────────────────────────────────────────────────

describe("GET /v1/daemon/config", () => {
  test("returns 200 with daemon and overrides config", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/config", { method: "GET" }), deps, "/v1/daemon/config");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/json");
  });

  test("body includes _v: 1, daemon config, and overrides", async () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/config", { method: "GET" }), deps, "/v1/daemon/config");
    const body = JSON.parse(await res!.text());
    expect(body._v).toBe(1);
    expect(body.daemon).toBeDefined();
    expect(body.overrides).toBeDefined();
  });

  test("returns 405 for PUT on /v1/daemon/config", () => {
    const deps = makeDeps();
    const res = handleDaemon(
      new Request("http://x/v1/daemon/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      deps,
      "/v1/daemon/config",
    );
    expect(res).toBeUndefined();
  });
});

// ─── POST /v1/daemon/reload ────────────────────────────────────────────────

describe("POST /v1/daemon/reload", () => {
  test("returns 200 with reloaded daemon and overrides on success", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("application/json");
  });

  test("success body includes _v: 1, daemon, and overrides", async () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    const body = JSON.parse(await res!.text());
    expect(body._v).toBe(1);
    expect(body.daemon).toBeDefined();
    expect(body.overrides).toBeDefined();
  });

  test("returns 400 when reload fails with config errors", async () => {
    const deps = makeDeps({
      config: {
        ...makeDeps().config,
        reload: () => ({
          ok: false,
          errors: ["daemon.yml is malformed", "overrides.yml is missing"],
        }),
      } as DaemonDeps["config"],
    });
    const res = handleDaemon(new Request("http://x/v1/daemon/reload", { method: "POST" }), deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = JSON.parse(await res!.text());
    expect(body.error.code).toBe("config_invalid");
    expect(body.error.message).toBe("reload failed");
    expect(body.error.details.errors).toContain("daemon.yml is malformed");
    expect(body.error.details.errors).toContain("overrides.yml is missing");
  });

  test("returns 405 for GET on /v1/daemon/reload", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/reload", { method: "GET" }), deps, "/v1/daemon/reload");
    expect(res).toBeUndefined();
  });
});

// ─── unmatched paths ────────────────────────────────────────────────────────

describe("unmatched paths", () => {
  test("returns undefined for unrelated paths", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/foo", { method: "GET" }), deps, "/v1/foo");
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/daemon/health with DELETE", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/health", { method: "DELETE" }), deps, "/v1/daemon/health");
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/daemon/config with POST", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/config", { method: "POST" }), deps, "/v1/daemon/config");
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/daemon/reload with PUT", () => {
    const deps = makeDeps();
    const res = handleDaemon(new Request("http://x/v1/daemon/reload", { method: "PUT" }), deps, "/v1/daemon/reload");
    expect(res).toBeUndefined();
  });
});
