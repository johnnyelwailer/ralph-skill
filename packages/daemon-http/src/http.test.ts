import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startHttp, type StartHttpOptions } from "./http.ts";

function makeDeps() {
  return {
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok", uptime_seconds: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    handleProjects: () => undefined,
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
  };
}

describe("startHttp", () => {
  let running: Awaited<ReturnType<typeof startHttp>> | null = null;

  afterEach(async () => {
    if (running) {
      await running.stop();
      running = null;
    }
  });

  test("starts an HTTP server and returns the port and hostname", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    expect(running.port).toBeGreaterThan(0);
    expect(running.hostname).toBe("127.0.0.1");
    expect(typeof running.server).toBe("object");
    expect(typeof running.stop).toBe("function");
  });

  test("uses the provided hostname when specified", async () => {
    const opts: StartHttpOptions = { hostname: "0.0.0.0", port: 0, deps: makeDeps() };
    running = startHttp(opts);

    expect(running.hostname).toBe("0.0.0.0");
  });

  test("defaults hostname to 127.0.0.1 when not provided", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    // The internal Bun.serve hostname defaults to 0.0.0.0, but our wrapper
    // normalizes unspecified hostname to 127.0.0.1
    expect(running.hostname).toBe("127.0.0.1");
  });

  test("server is accessible via the returned RunningHttp", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    expect(running.server).not.toBeNull();
    expect(typeof running.server).toBe("object");
  });

  test("stop() resolves without throwing", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    await expect(running.stop()).resolves.toBeUndefined();
    // After stop, running is conceptually stopped — the reference is just held for cleanup
    running = null;
  });

  test("stop() is idempotent", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    await expect(running.stop()).resolves.toBeUndefined();
    await expect(running.stop()).resolves.toBeUndefined();
    running = null;
  });

  test("server responds to /v1/daemon/health", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    const res = await fetch(`http://${running.hostname}:${running.port}/v1/daemon/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { _v: number; status: string };
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
  });

  test("returns a port that matches what Bun allocated", async () => {
    const opts: StartHttpOptions = { port: 0, deps: makeDeps() };
    running = startHttp(opts);

    // With port 0, the OS assigns an available port. Bun exposes it via server.port.
    expect(running.port).toBe(running.server.port);
  });
});
