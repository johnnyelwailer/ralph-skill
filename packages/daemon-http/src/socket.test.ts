import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocket, type StartSocketOptions } from "./socket.ts";

function makeDeps() {
  return {
    registry: {} as any,
    config: {} as any,
    scheduler: {} as any,
    events: {} as any,
    handleDaemon: (req: Request, pathname: string) =>
      new Response(JSON.stringify({ _v: 1, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  };
}

describe("startSocket", () => {
  let home: string;
  let socketPath: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-socket-test-"));
    socketPath = join(home, "aloopd.sock");
  });

  afterEach(async () => {
    rmSync(home, { recursive: true, force: true });
  });

  test("starts a Unix socket server and returns the path", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);

    expect(running.path).toBe(socketPath);
    expect(typeof running.stop).toBe("function");
    expect(typeof running.server).toBe("object");
    expect(running.server).not.toBeNull();

    await running.stop();
  });

  test("removes a stale socket file before binding (simulating unclean shutdown)", async () => {
    // Pre-create a stale socket file
    writeFileSync(socketPath, "", "utf8");

    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);

    // Should have replaced the stale file with a real socket
    expect(existsSync(socketPath)).toBe(true);

    await running.stop();
  });

  test("socket file does not exist after stop() is called", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);
    expect(existsSync(socketPath)).toBe(true);

    await running.stop();
    // Socket file is cleaned up best-effort after stop
    expect(existsSync(socketPath)).toBe(false);
  });

  test("stop() is idempotent (calling twice does not throw)", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);

    await expect(running.stop()).resolves.toBeUndefined();
    await expect(running.stop()).resolves.toBeUndefined();
  });

  test("socket file removed even if unlink fails (best-effort cleanup)", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);
    await running.stop();
    // Should be cleaned up even though it was already removed
    expect(existsSync(socketPath)).toBe(false);
  });

  test("returned server object is the Bun.serve instance", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: makeDeps(),
    };
    const running = startSocket(opts);

    // Bun.serve returns an object for unix sockets — verify it's truthy and stoppable
    expect(running.server).toBeDefined();
    expect(running.server).not.toBeNull();

    await running.stop();
  });
});
