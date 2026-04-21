import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../daemon/start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";

describe("/v1/daemon/{health,config,reload}", () => {
  let home: string;
  let daemon: RunningDaemon;
  let baseUrl: string;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "aloop-home-"));
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      dbPath: ":memory:",
    });
    baseUrl = `http://${daemon.http.hostname}:${daemon.http.port}`;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => {});
    rmSync(home, { recursive: true, force: true });
  });

  test("GET /v1/daemon/config returns current effective config", async () => {
    const res = await fetch(`${baseUrl}/v1/daemon/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    const d = body.daemon as Record<string, Record<string, unknown>>;
    expect(d.http?.port).toBe(7777); // default since no daemon.yml
    const o = body.overrides as Record<string, unknown>;
    expect(o.allow).toBeNull();
    expect(o.deny).toBeNull();
    expect(o.force).toBeNull();
  });

  test("POST /v1/daemon/reload re-reads disk and applies", async () => {
    // Write a daemon.yml that changes scheduler.concurrency_cap
    writeFileSync(
      daemon.paths.daemonConfigFile,
      "scheduler:\n  concurrency_cap: 5\n",
    );
    const res = await fetch(`${baseUrl}/v1/daemon/reload`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { daemon: { scheduler: { concurrencyCap: number } } };
    expect(body.daemon.scheduler.concurrencyCap).toBe(5);

    // Subsequent GET reflects the change
    const after = await fetch(`${baseUrl}/v1/daemon/config`).then((r) => r.json() as Promise<{
      daemon: { scheduler: { concurrencyCap: number } };
    }>);
    expect(after.daemon.scheduler.concurrencyCap).toBe(5);
  });

  test("POST /v1/daemon/reload returns 400 with errors on invalid file", async () => {
    writeFileSync(daemon.paths.daemonConfigFile, "scheduler:\n  concurrency_cap: -1\n");
    const res = await fetch(`${baseUrl}/v1/daemon/reload`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { errors: string[] } } };
    expect(body.error.code).toBe("config_invalid");
    expect(body.error.details.errors.length).toBeGreaterThan(0);
  });
});
