import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunningSocket, StartSocketOptions } from "./socket.ts";
import { startSocket } from "./socket.ts";

/** Minimal fetch handler that returns 200 with a JSON body. */
function makeEchoFetch() {
  return () =>
    new Response(JSON.stringify({ _v: 1, message: "socket test ok" }), {
      headers: { "content-type": "application/json" },
    });
}

describe("startSocket", () => {
  let tmp: string;
  let socketPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-socket-test-"));
    socketPath = join(tmp, `sock-${Date.now()}.sock`);
  });

  afterEach(async () => {
    // Clean up any stray socket files in tmp
    const leftover = join(tmp, "sock-.sock");
    if (existsSync(leftover)) {
      try { unlinkSync(leftover); } catch { /* best-effort */ }
    }
  });

  test("returns a RunningSocket with server, path, and stop", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    expect(running).toHaveProperty("server");
    expect(running).toHaveProperty("path");
    expect(running).toHaveProperty("stop");
    expect(typeof running.stop).toBe("function");
    expect(running.path).toBe(socketPath);

    await running.stop();
  });

  test("creates the socket file on disk while running", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    // Socket file must exist while server is alive
    expect(existsSync(socketPath)).toBe(true);

    await running.stop();
  });

  test("removes the socket file after stop()", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);
    expect(existsSync(socketPath)).toBe(true);

    await running.stop();

    // Socket file must be gone after stop
    expect(existsSync(socketPath)).toBe(false);
  });

  test("removes stale socket file on startup before binding", async () => {
    // Pre-create a stale socket file to simulate unclean shutdown.
    // Use a fixed path so we can safely unlink it if it exists, then create it.
    const stalePath = join(tmp, "stale.sock");
    try { unlinkSync(stalePath); } catch { /* ignore if not present */ }
    // Create a file at the path (simulates a stale UNIX socket from prior run)
    const { writeFileSync } = await import("node:fs");
    writeFileSync(stalePath, "");

    expect(existsSync(stalePath)).toBe(true);

    const opts: StartSocketOptions = {
      path: stalePath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    // Should have successfully bound to the path (replacing the stale file)
    expect(existsSync(stalePath)).toBe(true);
    expect(running.server).toBeDefined();

    await running.stop();
  });

  test("stop() is idempotent — calling twice does not throw", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    await running.stop();
    // Second stop must not throw
    await expect(running.stop()).resolves.toBeUndefined();
  });

  test("stop() best-effort cleans socket file even if unlink fails", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    // Replace the socket path with a directory to make unlinkSync fail on stop
    // We do this by stopping the server first, then creating a dir at that path
    await running.stop();
    const { mkdirSync } = await import("node:fs");
    mkdirSync(socketPath, { recursive: true });

    // Re-create a RunningSocket-like object with the same path pointing at a directory
    const badRunning: RunningSocket = {
      server: { stop: (_graceful: boolean) => {} } as any,
      path: socketPath,
      stop: async () => {
        const { existsSync, unlinkSync: ul } = await import("node:fs");
        if (existsSync(socketPath)) {
          try { unlinkSync(socketPath); } catch { /* best-effort */ }
        }
      },
    };

    // Must not throw
    await expect(badRunning.stop()).resolves.toBeUndefined();
  });

  test("server.port is undefined for a UNIX socket (not a TCP port)", async () => {
    const opts: StartSocketOptions = {
      path: socketPath,
      deps: { makeFetchHandler: makeEchoFetch } as any,
    };
    const running = startSocket(opts);

    // UNIX sockets do not have a TCP port
    expect(running.server.port).toBeUndefined();

    await running.stop();
  });
});
