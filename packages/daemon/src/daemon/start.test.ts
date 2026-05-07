import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "./start.ts";
import { resolveDaemonPaths } from "@aloop/daemon-config";
import { __testHooks as opencodeTestHooks } from "@aloop/provider-opencode";
import { VERSION } from "../version.ts";

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

describe("startDaemon error handling", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-start-error-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test("throws when daemon.yml contains invalid content", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    writeFileSync(paths.daemonConfigFile, "http:\n  port: not_a_number\n");

    await expect(startDaemon({ port: 0, paths })).rejects.toThrow(/daemon.yml invalid/);
  });

  test("throws when overrides.yml contains invalid content", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    // Write a minimal valid daemon.yml so we pass that check
    writeFileSync(paths.daemonConfigFile, "");
    writeFileSync(paths.overridesFile, "allow: not_an_array\n");

    await expect(startDaemon({ port: 0, paths })).rejects.toThrow(/overrides.yml invalid/);
  });

  test("wires sdk and cli opencode overrides independently", async () => {
    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
      opencodeSdkRunTurn: async () => ({
        ok: true,
        text: "sdk-result",
        usage: { tokensIn: 1, tokensOut: 1 },
      }),
      opencodeCliRunTurn: async () => ({
        ok: true,
        text: "cli-result",
        usage: { tokensIn: 2, tokensOut: 2 },
      }),
    });

    try {
      const sdkAdapter = daemon.providerRegistry.require("opencode");
      const cliAdapter = daemon.providerRegistry.require("opencode-cli");

      const sdkChunks = [];
      for await (const chunk of sdkAdapter.sendTurn({
        sessionId: "sdk-session",
        authHandle: "auth",
        providerRef: "opencode",
        prompt: "ping",
        cwd: home,
      })) {
        sdkChunks.push(chunk);
      }

      const cliChunks = [];
      for await (const chunk of cliAdapter.sendTurn({
        sessionId: "cli-session",
        authHandle: "auth",
        providerRef: "opencode-cli",
        prompt: "ping",
        cwd: home,
      })) {
        cliChunks.push(chunk);
      }

      expect(sdkChunks[0]).toMatchObject({ type: "text", content: { delta: "sdk-result" } });
      expect(cliChunks[0]).toMatchObject({ type: "text", content: { delta: "cli-result" } });
      expect(sdkChunks[1]).toMatchObject({
        type: "usage",
        content: { providerId: "opencode", tokensIn: 1, tokensOut: 1 },
      });
      expect(cliChunks[1]).toMatchObject({
        type: "usage",
        content: { providerId: "opencode-cli", tokensIn: 2, tokensOut: 2 },
      });
    } finally {
      await daemon.stop();
    }
  });
});

describe("RunningDaemon.stop()", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-stop-test-"));
  });

  afterEach(async () => {
    rmSync(home, { recursive: true, force: true });
  });

  test("stop() is callable without throwing", async () => {
    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });
    await expect(daemon.stop()).resolves.toBeUndefined();
  });

  test("stop() can be called multiple times without throwing", async () => {
    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });
    await daemon.stop();
    // Second call should also resolve cleanly
    await expect(daemon.stop()).resolves.toBeUndefined();
  });

  test("after stop(), HTTP server is no longer listening", async () => {
    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });
    const url = `http://${daemon.http.hostname}:${daemon.http.port}/v1/daemon/health`;
    // Verify server is up
    const before = await fetch(url);
    expect(before.status).toBe(200);

    await daemon.stop();

    // Server should be closed — fetch should fail (connection refused or timeout)
    await expect(fetch(url)).rejects.toThrow();
  });

  test("after stop(), the pid lock is released and a new daemon can start", async () => {
    const paths = resolveDaemonPaths({ ALOOP_HOME: home });
    const first = await startDaemon({
      port: 0,
      paths,
    });
    await first.stop();

    // A new daemon should be able to acquire the lock immediately
    const second = await startDaemon({
      port: 0,
      paths,
    });
    expect(second.http.port).toBeTruthy();
    await second.stop();
  });

  test("after stop(), events store is closed", async () => {
    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });
    const events = daemon.events;
    await daemon.stop();

    // Appending after stop should fail since the store is closed
    await expect(events.append("test.topic", {})).rejects.toThrow();
  });

  test("after stop(), cached opencode SDK servers are disposed", async () => {
    const closed: string[] = [];
    opencodeTestHooks.addCachedServerForTest("daemon-sdk-cache", () => { closed.push("closed"); });

    const daemon = await startDaemon({
      port: 0,
      paths: resolveDaemonPaths({ ALOOP_HOME: home }),
    });
    expect(opencodeTestHooks.cachedServerCount()).toBe(1);

    await daemon.stop();

    expect(closed).toEqual(["closed"]);
    expect(opencodeTestHooks.cachedServerCount()).toBe(0);
  });
});
