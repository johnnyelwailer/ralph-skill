import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startHttp, type StartHttpOptions } from "./http.ts";

/** Minimal RouterDeps that are sufficient to exercise startHttp. */
function makeDeps() {
  return {
    handleDaemon: (req: Request, pathname: string) =>
      new Response(JSON.stringify({ _v: 1, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    handleProjects: () => undefined,
    handleProviders: () => undefined,
    handleScheduler: () => undefined,
  };
}

describe("startHttp", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = `/tmp/aloop-http-test-${Date.now()}`;
  });

  afterEach(async () => {
    // Cleanup is handled per-test; no persistent state here.
  });

  test("starts an HTTP server and returns port and hostname", async () => {
    const opts: StartHttpOptions = {
      port: 0,
      deps: makeDeps(),
    };
    const running = startHttp(opts);

    expect(running.port).toBeGreaterThan(0);
    expect(typeof running.hostname).toBe("string");
    expect(running.hostname).toBe("127.0.0.1");
    expect(typeof running.stop).toBe("function");

    await running.stop();
  });

  test("binds to the specified hostname when provided", async () => {
    const opts: StartHttpOptions = {
      port: 0,
      hostname: "0.0.0.0",
      deps: makeDeps(),
    };
    const running = startHttp(opts);

    expect(running.hostname).toBe("0.0.0.0");

    await running.stop();
  });

  test("uses 127.0.0.1 as default hostname when not specified", async () => {
    const opts: StartHttpOptions = {
      port: 0,
      deps: makeDeps(),
    };
    const running = startHttp(opts);

    expect(running.hostname).toBe("127.0.0.1");

    await running.stop();
  });

  test("stop() terminates the server without throwing", async () => {
    const opts: StartHttpOptions = {
      port: 0,
      deps: makeDeps(),
    };
    const running = startHttp(opts);

    await expect(running.stop()).resolves.toBeUndefined();

    // Second stop must also not throw (idempotent)
    await expect(running.stop()).resolves.toBeUndefined();
  });

  test("server is accessible from the returned RunningHttp", async () => {
    const opts: StartHttpOptions = {
      port: 0,
      deps: makeDeps(),
    };
    const running = startHttp(opts);

    expect(typeof running.server).toBe("object");
    expect(running.server).not.toBeNull();

    await running.stop();
  });
});
