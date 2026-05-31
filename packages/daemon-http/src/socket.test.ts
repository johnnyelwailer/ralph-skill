import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { startSocket, type StartSocketOptions } from "./socket";

function makeDeps() {
  return {
    handleDaemon: () => undefined,
    handleMetrics: () => undefined,
    handleProjects: () => undefined,
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
    handleWorkspaces: () => undefined,
    handleSessions: () => undefined,
    handleComposer: () => undefined,
    handleArtifacts: () => undefined,
    handleTriggers: () => undefined,
    handleSetup: () => undefined,
    handleEvents: () => undefined,
    handleTurns: () => undefined,
  };
}

describe("startSocket", () => {
  const tmpdir = join(__dirname, "../../test-socket-tmp");
  let socketPath: string;

  beforeEach(() => {
    mkdirSync(tmpdir, { recursive: true });
  });

  afterEach(async () => {
    try {
      unlinkSync(socketPath);
    } catch {
      // ignore
    }
    try {
      unlinkSync(tmpdir);
    } catch {
      // ignore
    }
  });

  test("removes a stale socket file before binding", async () => {
    socketPath = join(tmpdir, "stale.sock");
    writeFileSync(socketPath, "stale", { mode: 0o644 });
    expect(existsSync(socketPath)).toBe(true);

    const running = startSocket({ path: socketPath, deps: makeDeps() });
    expect(existsSync(socketPath)).toBe(true);
    await running.stop();
  });

  test("returns a RunningSocket with the socket path", async () => {
    socketPath = join(tmpdir, "alive.sock");
    const running = startSocket({ path: socketPath, deps: makeDeps() });
    expect(running.path).toBe(socketPath);
    await running.stop();
  });

  test("stop() calls server.stop with true", async () => {
    socketPath = join(tmpdir, "stop.sock");
    const originalServe = Bun.serve;
    let stopCalledWith: unknown = undefined;
    Bun.serve = ((opts: Parameters<typeof originalServe>[0]) => {
      return {
        port: undefined,
        hostname: opts.hostname ?? "",
        stop: (graceful: unknown) => {
          stopCalledWith = graceful;
        },
      } as unknown as ReturnType<typeof originalServe>;
    }) as typeof originalServe;

    try {
      const running = startSocket({ path: socketPath, deps: makeDeps() });
      await running.stop();
      expect(stopCalledWith).toBe(true);
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("stop() removes the socket file from disk", async () => {
    socketPath = join(tmpdir, "cleanup.sock");
    const running = startSocket({ path: socketPath, deps: makeDeps() });
    expect(existsSync(socketPath)).toBe(true);
    await running.stop();
    expect(existsSync(socketPath)).toBe(false);
  });

  test("stop() does not throw if socket file is already gone", async () => {
    socketPath = join(tmpdir, "gone.sock");
    const running = startSocket({ path: socketPath, deps: makeDeps() });
    // manually remove before stop
    unlinkSync(socketPath);
    await expect(running.stop()).resolves.toBeUndefined();
  });

  test("stop() propagates error from server.stop", async () => {
    socketPath = join(tmpdir, "fail-stop.sock");
    const originalServe = Bun.serve;
    Bun.serve = ((opts: Parameters<typeof originalServe>[0]) => {
      return {
        port: undefined,
        hostname: opts.hostname ?? "",
        stop: (_graceful: unknown) => {
          throw new Error("server stop failed");
        },
      } as unknown as ReturnType<typeof originalServe>;
    }) as typeof originalServe;

    try {
      const running = startSocket({ path: socketPath, deps: makeDeps() });
      // The implementation does NOT catch errors from server.stop — they propagate.
      // The unlink cleanup is best-effort but server.stop(true) error propagates.
      await expect(running.stop()).rejects.toThrow("server stop failed");
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("socket path is preserved on the returned object after start", async () => {
    socketPath = join(tmpdir, "path-preserved.sock");
    const running = startSocket({ path: socketPath, deps: makeDeps() });
    const savedPath = running.path;
    await running.stop();
    expect(savedPath).toBe(socketPath);
  });
});