import { afterEach, describe, expect, test } from "bun:test";
import { startHttp, type StartHttpOptions } from "./http.ts";

// Minimal deps factory — all handlers return undefined so requests 404
function makeDeps() {
  return {
    handleDaemon: () => undefined,
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

describe("startHttp error paths", () => {
  test("throws EADDRINUSE when the port is already bound", async () => {
    // Start a server on an OS-assigned port
    const first = startHttp({ port: 0, deps: makeDeps() });
    const boundPort = first.port;
    expect(boundPort).toBeGreaterThan(0);

    // Keep the first server running and try to bind the same port
    // This must throw EADDRINUSE
    expect(() => startHttp({ port: boundPort, deps: makeDeps() })).toThrow();

    await first.stop();
  });

  test("error message mentions the port or syscall when bind fails", async () => {
    const first = startHttp({ port: 0, deps: makeDeps() });
    const boundPort = first.port;

    let thrownMessage = "";
    try {
      startHttp({ port: boundPort, deps: makeDeps() });
    } catch (err) {
      thrownMessage = (err as Error).message;
    }

    // Error message should reference port, listen, or address
    expect(
      thrownMessage.includes("port") ||
        thrownMessage.includes("listen") ||
        thrownMessage.includes("address") ||
        thrownMessage.includes("EADDRINUSE"),
    ).toBe(true);

    await first.stop();
  });
});

describe("startHttp request handling via full server", () => {
  let running: Awaited<ReturnType<typeof startHttp>> | null = null;

  afterEach(async () => {
    if (running) {
      await running.stop();
      running = null;
    }
  });

  test("returns 404 envelope for requests to unhandled routes", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    const res = await fetch(`http://${running.hostname}:${running.port}/v1/unknown-route`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/unknown-route");
  });

  test("returns 404 for POST to unhandled route", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    const res = await fetch(`http://${running.hostname}:${running.port}/v1/sessions`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  test("GET to /v1/daemon/health 404s when handleDaemon returns undefined", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    const res = await fetch(`http://${running.hostname}:${running.port}/v1/daemon/health`);
    // handleDaemon returns undefined → falls through to 404 envelope
    expect(res.status).toBe(404);
  });

  test("multiple sequential requests all get proper responses", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://${running.hostname}:${running.port}/v1/sessions/test-${i}`);
      expect(res.status).toBe(404);
    }
  });
});
