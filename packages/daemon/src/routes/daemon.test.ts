import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDaemon } from "./daemon.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { createConfigStore, DAEMON_DEFAULTS, OVERRIDES_DEFAULT } from "@aloop/daemon-config";
import type { DaemonDeps } from "./daemon.ts";

function makeDeps(home: string): DaemonDeps {
  const paths = resolveDaemonPaths({ ALOOP_HOME: home });
  const config = createConfigStore({
    daemon: DAEMON_DEFAULTS,
    overrides: OVERRIDES_DEFAULT,
    paths,
  });
  return {
    startedAt: Date.now(),
    config,
  };
}

describe("handleDaemon", () => {
  let home: string;
  let deps: DaemonDeps;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-daemon-route-"));
    deps = makeDeps(home);
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("GET /v1/daemon/health returns canonical v1 health envelope", async () => {
    const req = new Request("http://localhost/v1/daemon/health", { method: "GET" });
    const res = await handleDaemon(req, deps, "/v1/daemon/health");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptime_seconds).toBe("number");
  });

  test("GET /v1/daemon/config returns daemon config and overrides", async () => {
    const req = new Request("http://localhost/v1/daemon/config", { method: "GET" });
    const res = await handleDaemon(req, deps, "/v1/daemon/config");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body).toHaveProperty("daemon");
    expect(body).toHaveProperty("overrides");
  });

  test("POST /v1/daemon/reload re-reads daemon.yml and returns updated config", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    writeFileSync(paths.daemonConfigFile, "scheduler:\n  concurrency_cap: 42\n");

    const req = new Request("http://localhost/v1/daemon/reload", { method: "POST" });
    const res = await handleDaemon(req, deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { daemon: { scheduler: { concurrencyCap: number } } };
    expect(body.daemon.scheduler.concurrencyCap).toBe(42);
  });

  test("POST /v1/daemon/reload returns 400 with errors for invalid daemon.yml", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    writeFileSync(paths.daemonConfigFile, "http:\n  port: not_a_number\n");

    const req = new Request("http://localhost/v1/daemon/reload", { method: "POST" });
    const res = await handleDaemon(req, deps, "/v1/daemon/reload");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as { error: { code: string; details: { errors: unknown[] } } };
    expect(body.error.code).toBe("config_invalid");
    expect((body.error.details.errors as unknown[]).length).toBeGreaterThan(0);
  });

  test("returns undefined for unknown daemon pathname", () => {
    const req = new Request("http://localhost/v1/daemon/unknown", { method: "GET" });
    const res = handleDaemon(req, deps, "/v1/daemon/unknown");
    expect(res).toBeUndefined();
  });

  test("returns undefined for known path but wrong method", () => {
    const req = new Request("http://localhost/v1/daemon/health", { method: "POST" });
    const res = handleDaemon(req, deps, "/v1/daemon/health");
    expect(res).toBeUndefined();
  });

  test("health response Content-Type is application/json", async () => {
    const req = new Request("http://localhost/v1/daemon/health", { method: "GET" });
    const res = await handleDaemon(req, deps, "/v1/daemon/health");
    expect(res!.headers.get("content-type")).toContain("application/json");
  });
});
