import { describe, expect, test } from "bun:test";
import { startHttp, type StartHttpOptions } from "./http.ts";

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
    handleWorkItems: () => undefined,
  };
}

describe("startHttp error handling", () => {
  test("throws when HTTP server fails to bind a port (port is undefined)", async () => {
    const originalServe = Bun.serve;
    Bun.serve = ((
      options: Parameters<typeof originalServe>[0]
    ) => {
      return {
        port: undefined,
        hostname: options.hostname ?? "127.0.0.1",
        stop: () => {},
      } as unknown as ReturnType<typeof originalServe>;
    }) as typeof originalServe;

    try {
      const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
      expect(() => startHttp(opts)).toThrow(
        "HTTP server failed to bind a port",
      );
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("returns a RunningHttp with correct hostname when hostname is explicitly set", async () => {
    const opts: StartHttpOptions = { hostname: "0.0.0.0", port: 0, deps: makeDeps() };
    const running = startHttp(opts);
    expect(running.hostname).toBe("0.0.0.0");
    await running.stop();
  });

  test("stop() calls server.stop with true to allow graceful shutdown", async () => {
    const originalServe = Bun.serve;
    let stopCalledWith: unknown = undefined;
    Bun.serve = ((
      options: Parameters<typeof originalServe>[0]
    ) => {
      return {
        port: 0,
        hostname: options.hostname ?? "127.0.0.1",
        stop: (graceful: unknown) => {
          stopCalledWith = graceful;
        },
      } as unknown as ReturnType<typeof originalServe>;
    }) as typeof originalServe;

    try {
      const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
      const running = startHttp(opts);
      await running.stop();
      expect(stopCalledWith).toBe(true);
    } finally {
      Bun.serve = originalServe;
    }
  });
});
