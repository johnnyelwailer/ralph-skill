import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocket, type StartSocketOptions } from "./socket.ts";

function makeDeps() {
  return {
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleProjects: () => undefined,
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
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
});
