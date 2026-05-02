import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readAllEvents } from "@aloop/state-sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../daemon/start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";

describe("/v1/scheduler/*", () => {
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

  test("POST grants a permit and GET lists it", async () => {
    const res = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    });
    expect(res.status).toBe(200);
    const granted = (await res.json()) as { granted: boolean; permit: { providerId: string; ttlSeconds: number } };
    expect(granted.granted).toBe(true);
    expect(granted.permit.providerId).toBe("opencode");
    expect(granted.permit.ttlSeconds).toBe(600);

    const listed = await fetch(`${baseUrl}/v1/scheduler/permits`).then(
      (r) => r.json() as Promise<{ items: Array<{ sessionId: string }> }>,
    );
    expect(listed.items.map((permit) => permit.sessionId)).toEqual(["s_1"]);
  });

  test("requested TTL is capped at the configured maximum", async () => {
    const res = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_1",
        provider_candidate: "opencode",
        ttl_seconds: 99999,
      }),
    });
    const body = (await res.json()) as { permit: { ttlSeconds: number } };
    expect(body.permit.ttlSeconds).toBe(3600);
  });

  test("concurrency cap denial returns granted=false", async () => {
    writeFileSync(daemon.paths.daemonConfigFile, "scheduler:\n  concurrency_cap: 1\n");
    const reload = await fetch(`${baseUrl}/v1/daemon/reload`, { method: "POST" });
    expect(reload.status).toBe(200);

    await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    });

    const denied = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_2", provider_candidate: "opencode" }),
    }).then((r) =>
      r.json() as Promise<{ granted: boolean; reason: string; gate: string; details: { concurrency_cap: number } }>,
    );

    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("concurrency_cap_reached");
    expect(denied.gate).toBe("concurrency");
    expect(denied.details.concurrency_cap).toBe(1);
  });

  test("DELETE releases a permit", async () => {
    const granted = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    }).then((r) => r.json() as Promise<{ permit: { id: string } }>);

    const res = await fetch(`${baseUrl}/v1/scheduler/permits/${granted.permit.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const listed = await fetch(`${baseUrl}/v1/scheduler/permits`).then(
      (r) => r.json() as Promise<{ items: unknown[] }>,
    );
    expect(listed.items).toEqual([]);
  });

  test("provider force override is applied at grant time", async () => {
    await fetch(`${baseUrl}/v1/providers/overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: "codex" }),
    });

    const granted = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    }).then((r) => r.json() as Promise<{ permit: { providerId: string } }>);

    expect(granted.permit.providerId).toBe("codex");
  });

  test("provider gate denies permits when provider health is degraded", async () => {
    daemon.providerHealth.noteFailure("opencode", "auth");
    const denied = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    }).then((r) =>
      r.json() as Promise<{
        granted: boolean;
        reason: string;
        gate: string;
        details: { provider_id: string; status: string };
      }>,
    );
    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("provider_unavailable");
    expect(denied.gate).toBe("provider");
    expect(denied.details.provider_id).toBe("opencode");
    expect(denied.details.status).toBe("degraded");
  });

  test("provider gate returns retryAfterSeconds for cooldown providers", async () => {
    daemon.providerHealth.noteFailure("opencode", "timeout");
    daemon.providerHealth.noteFailure("opencode", "timeout");
    const denied = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_2", provider_candidate: "opencode" }),
    }).then((r) =>
      r.json() as Promise<{
        granted: boolean;
        reason: string;
        gate: string;
        retryAfterSeconds: number;
        details: { provider_id: string; status: string };
      }>,
    );
    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("provider_unavailable");
    expect(denied.gate).toBe("provider");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.details.provider_id).toBe("opencode");
    expect(denied.details.status).toBe("cooldown");
  });

  test("PUT /v1/scheduler/limits updates live limits and persists daemon.yml", async () => {
    const res = await fetch(`${baseUrl}/v1/scheduler/limits`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        concurrency_cap: 1,
        cpu_max_pct: 70,
        burn_rate: { min_commits_per_hour: 2 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      max_permits: number;
      system_limits: { cpu_max_pct: number };
      burn_rate: { min_commits_per_hour: number };
    };
    expect(body.max_permits).toBe(1);
    expect(body.system_limits.cpu_max_pct).toBe(70);
    expect(body.burn_rate.min_commits_per_hour).toBe(2);

    const onDisk = readFileSync(daemon.paths.daemonConfigFile, "utf-8");
    expect(onDisk).toContain("concurrency_cap: 1");
    expect(onDisk).toContain("cpu_max_pct: 70");
    expect(onDisk).toContain("min_commits_per_hour: 2");
    const events = await readAllEvents(daemon.paths.logFile);
    expect(events.some((e) => e.topic === "scheduler.limits.changed")).toBe(true);

    await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    });
    const denied = await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_2", provider_candidate: "opencode" }),
    }).then((r) => r.json() as Promise<{ granted: boolean; gate: string }>);
    expect(denied.granted).toBe(false);
    expect(denied.gate).toBe("concurrency");
  });

  test("PUT /v1/scheduler/limits rejects unknown fields", async () => {
    const res = await fetch(`${baseUrl}/v1/scheduler/limits`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: 1 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details: { errors: string[] } };
    };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.errors[0]).toContain("unknown scheduler limits field");
  });
});

describe("scheduler watchdog permit-expiry sweep", () => {
  let home: string;
  let daemon: RunningDaemon;
  let baseUrl: string;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "aloop-home-watchdog-"));
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    writeFileSync(paths.daemonConfigFile, "watchdog:\n  tick_interval: 1s\n");
    daemon = await startDaemon({
      port: 0,
      paths,
      dbPath: ":memory:",
    });
    baseUrl = `http://${daemon.http.hostname}:${daemon.http.port}`;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => {});
    rmSync(home, { recursive: true, force: true });
  });

  test("expired permits are reclaimed automatically and emit scheduler.permit.expired", async () => {
    await fetch(`${baseUrl}/v1/scheduler/permits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_exp",
        provider_candidate: "opencode",
        ttl_seconds: 1,
      }),
    });

    const before = await fetch(`${baseUrl}/v1/scheduler/permits`).then(
      (r) => r.json() as Promise<{ items: unknown[] }>,
    );
    expect(before.items.length).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const after = await fetch(`${baseUrl}/v1/scheduler/permits`).then(
      (r) => r.json() as Promise<{ items: unknown[] }>,
    );
    expect(after.items.length).toBe(0);

    const events = await readAllEvents(daemon.paths.logFile);
    expect(events.some((e) => e.topic === "scheduler.permit.expired")).toBe(true);
  });
});
