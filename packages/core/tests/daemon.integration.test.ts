import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../src/daemon/start.ts";
import { resolveDaemonPaths } from "../src/paths.ts";
import { VERSION } from "../src/version.ts";

describe("daemon integration", () => {
  let home: string;
  let daemon: RunningDaemon | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-home-"));
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop().catch(() => {});
      daemon = undefined;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test("serves GET /v1/daemon/health over HTTP with canonical v1 shape", async () => {
    daemon = await startDaemon({
      port: 0, // 0 = ephemeral; Bun assigns a free port
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });

    const url = `http://${daemon.http.hostname}:${daemon.http.port}/v1/daemon/health`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
    expect(body.version).toBe(VERSION);
    expect(typeof body.uptime_seconds).toBe("number");
  });

  test("serves GET /v1/daemon/health over unix socket", async () => {
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });

    // Bun's fetch supports unix:// with the path embedded per fetch's unix option.
    const res = await fetch("http://localhost/v1/daemon/health", {
      unix: daemon.socket.path,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
  });

  test("returns 404 with error envelope for unknown routes", async () => {
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });

    const url = `http://${daemon.http.hostname}:${daemon.http.port}/v1/nope`;
    const res = await fetch(url);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/nope");
  });

  test("refuses to start when another daemon holds the pid lock", async () => {
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });

    await expect(
      startDaemon({
        port: 0,
        paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      }),
    ).rejects.toThrow(/already running/);
  });

  test("SSE echo endpoint streams events", async () => {
    daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });

    const url = `http://${daemon.http.hostname}:${daemon.http.port}/v1/events/echo`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: hello");
    expect(text).toContain("event: ping");
  });
});
