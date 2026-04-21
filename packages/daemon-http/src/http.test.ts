import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startHttp, type RunningHttp, type StartHttpOptions } from "./http.ts";

function makeDeps(): StartHttpOptions["deps"] {
  return {
    registry: {
      list() {
        return [];
      },
      get() {
        return undefined;
      },
    } as unknown as StartHttpOptions["deps"]["registry"],
    config: {
      daemon() {
        return {
          scheduler: {
            concurrencyCap: 3,
            permitTtlDefaultSeconds: 600,
            permitTtlMaxSeconds: 3600,
            systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
            burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
          },
        };
      },
      overrides() {
        return { allow: null, deny: null, force: null };
      },
    } as unknown as StartHttpOptions["deps"]["config"],
    scheduler: {
      listPermits() {
        return [];
      },
      currentLimits() {
        return {
          concurrencyCap: 3,
          permitTtlDefaultSeconds: 600,
          permitTtlMaxSeconds: 3600,
          systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
          burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 1 },
        };
      },
      async updateLimits() {
        return { ok: true, limits: {} } as any;
      },
      async acquirePermit() {
        return { granted: false, reason: "test", gate: "test", details: {} };
      },
      async releasePermit() {
        return false;
      },
    } as unknown as StartHttpOptions["deps"]["scheduler"],
    events: {
      async append() {
        return { topic: "", data: {}, id: "test", ts: 0 };
      },
    } as unknown as StartHttpOptions["deps"]["events"],
    handleDaemon: () => undefined,
  };
}

describe("startHttp", () => {
  test("returns a RunningHttp with the configured port and hostname", async () => {
    const deps = makeDeps();
    const running = startHttp({ port: 0, deps });

    try {
      expect(typeof running.port).toBe("number");
      expect(running.hostname).toBe("127.0.0.1");
      expect(typeof running.server).toBe("object");
      expect(typeof running.stop).toBe("function");
    } finally {
      await running.stop();
    }
  });

  test("uses provided hostname when specified", async () => {
    const deps = makeDeps();
    const running = startHttp({ hostname: "0.0.0.0", port: 0, deps });

    try {
      expect(running.hostname).toBe("0.0.0.0");
    } finally {
      await running.stop();
    }
  });

  test("defaults hostname to 127.0.0.1 when not provided", async () => {
    const deps = makeDeps();
    const running = startHttp({ port: 0, deps });

    try {
      expect(running.hostname).toBe("127.0.0.1");
    } finally {
      await running.stop();
    }
  });

  test("stop() returns a Promise that resolves without error", async () => {
    const deps = makeDeps();
    const running = startHttp({ port: 0, deps });
    await running.stop();
    // second call to stop is also safe
    await running.stop();
  });

  test("server is actually listening — HTTP request returns 200 for projects route", async () => {
    const deps = makeDeps();
    const running = startHttp({ port: 0, deps });

    try {
      const port = running.port;
      const res = await fetch(`http://127.0.0.1:${port}/v1/projects`);
      expect(res.status).toBe(200);
      const body = await res.json() as { _v: number; items: unknown[] };
      expect(body._v).toBe(1);
      expect(body.items).toEqual([]);
    } finally {
      await running.stop();
    }
  });

  test("server is actually listening — unknown route returns 404 envelope", async () => {
    const deps = makeDeps();
    const running = startHttp({ port: 0, deps });

    try {
      const port = running.port;
      const res = await fetch(`http://127.0.0.1:${port}/v1/no-such-route`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: { _v: number; code: string; message: string } };
      expect(body.error._v).toBe(1);
      expect(body.error.code).toBe("not_found");
    } finally {
      await running.stop();
    }
  });
});
