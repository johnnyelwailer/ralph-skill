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
  };
}

describe("startHttp error handling", () => {
  test("throws when HTTP server fails to bind a port (port is undefined)", async () => {
    // Monkey-patch Bun.serve to simulate a bind failure where port is undefined.
    // This mirrors a real scenario where the OS refuses the port binding.
    const originalServe = Bun.serve;
    let serveCallCount = 0;
    Bun.serve = (options: {
      hostname: string;
      port: number;
      fetch: (req: Request) => Response | Promise<Response>;
    }) => {
      serveCallCount++;
      // Simulate a port bind failure by returning an object with port as undefined
      return {
        port: undefined,
        hostname: options.hostname,
        stop: () => {},
      } as unknown as ReturnType<typeof originalServe>;
    };

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
    Bun.serve = (options: {
      hostname: string;
      port: number;
      fetch: (req: Request) => Response | Promise<Response>;
    }) => {
      return {
        port: 0,
        hostname: options.hostname,
        stop: (graceful: unknown) => {
          stopCalledWith = graceful;
        },
      } as unknown as ReturnType<typeof originalServe>;
    };

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
