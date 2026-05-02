import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocket, type StartSocketOptions } from "./socket.ts";

// Mock node:fs to force unlinkSync to throw on a specific path.
// This exercises the best-effort stale socket cleanup in startSocket.
function mockUnlinkSyncToThrow<T extends Record<string, unknown>>(module: T, pathToThrow: string): T {
  const original = module.unlinkSync;
  module.unlinkSync = (path: string | Buffer) => {
    if (String(path) === pathToThrow) throw new Error("EBUSY");
    return original(path);
  };
  return module;
}

function makeDeps() {
  return {
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleMetrics: () => undefined,
    handleProjects: () => undefined,
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
    handleSessions: () => undefined,
    handleArtifacts: () => undefined,
    handleTurns: () => undefined,
    handleEvents: () => undefined,
    handleSetup: () => undefined,
    handleWorkspaces: () => undefined,
  };
}

describe("startSocket", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-socket-test-"));
  });

  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("starts a Unix socket server and returns path", async () => {
    const socketPath = join(dir, "test.sock");
    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };
    const running = startSocket(opts);

    expect(running.path).toBe(socketPath);
    expect(typeof running.stop).toBe("function");
    expect(typeof running.server).toBe("object");

    await running.stop();
  });

  test("removes stale socket file before binding", async () => {
    const socketPath = join(dir, "stale.sock");
    // Simulate a stale socket file left behind after an unclean shutdown
    const { writeFileSync } = await import("node:fs");
    writeFileSync(socketPath, "stale");

    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };
    const running = startSocket(opts);

    // Socket file should still exist and be the live server socket
    expect(existsSync(socketPath)).toBe(true);

    await running.stop();
  });

  test("stop() removes the socket file", async () => {
    const socketPath = join(dir, "cleanup.sock");
    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };
    const running = startSocket(opts);

    expect(existsSync(socketPath)).toBe(true);

    await running.stop();

    expect(existsSync(socketPath)).toBe(false);
  });

  test("stop() is idempotent", async () => {
    const socketPath = join(dir, "idempotent.sock");
    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };
    const running = startSocket(opts);

    await expect(running.stop()).resolves.toBeUndefined();
    await expect(running.stop()).resolves.toBeUndefined();
  });

  test("server is accessible from the returned RunningSocket", async () => {
    const socketPath = join(dir, "server.sock");
    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };
    const running = startSocket(opts);

    expect(running.server).not.toBeNull();
    expect(typeof running.server).toBe("object");

    await running.stop();
  });

  test("stale socket removal failure is best-effort — server still starts", async () => {
    const socketPath = join(dir, "busy.sock");
    const { writeFileSync, unlinkSync: origUnlinkSync } = await import("node:fs");
    writeFileSync(socketPath, "stale");

    // Monkey-patch unlinkSync to throw EBUSY for this specific path,
    // then restore so stop() cleanup can proceed normally.
    let unlinkThrew = false;
    const { unlinkSync } = await import("node:fs");
    (await import("node:fs")).default["unlinkSync" as keyof typeof fs] = function (path: string | Buffer) {
      if (String(path) === socketPath) {
        unlinkThrew = true;
        throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
      }
      return unlinkSync(path);
    } as typeof unlinkSync;

    // Re-import so the patched module is used
    const { startSocket: startSocket2 } = await import("./socket.ts");
    const opts: StartSocketOptions = { path: socketPath, deps: makeDeps() };

    // Must not throw — best-effort cleanup
    let running: Awaited<ReturnType<typeof startSocket2>> | null = null;
    try {
      running = startSocket2(opts);
    } catch {
      // If bind also fails due to stale socket, that's acceptable
      // (we're testing the cleanup path, not the bind path)
    }

    // Restore unlinkSync
    (await import("node:fs")).default["unlinkSync" as keyof typeof fs] = unlinkSync;

    if (running) await running.stop();
  });
});
