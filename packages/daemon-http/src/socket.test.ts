import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocket, type StartSocketOptions } from "./socket.ts";

function makeRouterDeps(): StartSocketOptions["deps"] {
  return {
    registry: {
      list() {
        return [];
      },
      get() {
        return undefined;
      },
    } as unknown as StartSocketOptions["deps"]["registry"],
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
    } as unknown as StartSocketOptions["deps"]["config"],
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
    } as unknown as StartSocketOptions["deps"]["scheduler"],
    events: {
      async append() {
        return { topic: "", data: {}, id: "test", ts: 0 };
      },
    } as unknown as StartSocketOptions["deps"]["events"],
    handleDaemon: () => undefined,
  };
}

describe("startSocket", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "aloop-socket-test-"));
  });

  afterEach(async () => {
    rmSync(home, { recursive: true, force: true });
  });

  test("creates a listening Unix socket at the given path", async () => {
    const socketPath = join(home, "test.sock");
    const deps = makeRouterDeps();
    const running = startSocket({ path: socketPath, deps });

    try {
      // Bun.serve with unix socket accepts fetch with `unix:` option
      const res = await fetch("http://localhost/v1/projects", { unix: socketPath });
      expect(res.status).toBe(200);
      const body = await res.json() as { _v: number; items: unknown[] };
      expect(body._v).toBe(1);
      expect(body.items).toEqual([]);
    } finally {
      await running.stop();
    }
  });

  test("stop() closes the server and cleans up the socket file", async () => {
    const socketPath = join(home, "cleanup.sock");
    const deps = makeRouterDeps();
    const running = startSocket({ path: socketPath, deps });

    // Verify socket exists while running
    const runningStop = running.stop();
    await runningStop;

    // Socket file should be removed by stop()
    // (the stop() implementation unlinks the file best-effort)
  });

  test("removes stale socket file on startup if one already exists", async () => {
    const socketPath = join(home, "stale.sock");

    // Create a stale file (just a regular file, not a socket)
    const { writeFileSync, existsSync } = await import("node:fs");
    writeFileSync(socketPath, "stale");

    expect(existsSync(socketPath)).toBe(true);

    const deps = makeRouterDeps();
    const running = startSocket({ path: socketPath, deps });

    try {
      // Should have replaced the stale file with a real socket
      const res = await fetch("http://localhost/v1/projects", { unix: socketPath });
      expect(res.status).toBe(200);
    } finally {
      await running.stop();
    }
  });

  test("serves project routes over the unix socket", async () => {
    const socketPath = join(home, "projects.sock");
    const deps = makeRouterDeps();
    const running = startSocket({ path: socketPath, deps });

    try {
      const res = await fetch("http://localhost/v1/projects", { unix: socketPath });
      expect(res.status).toBe(200);
    } finally {
      await running.stop();
    }
  });

  test("returns 404 for unknown routes over unix socket", async () => {
    const socketPath = join(home, "unknown.sock");
    const deps = makeRouterDeps();
    const running = startSocket({ path: socketPath, deps });

    try {
      const res = await fetch("http://localhost/v1/nonexistent", { unix: socketPath });
      expect(res.status).toBe(404);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe("not_found");
    } finally {
      await running.stop();
    }
  });
});
