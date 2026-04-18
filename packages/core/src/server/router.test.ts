import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createConfigStore } from "../config/store.ts";
import { DAEMON_DEFAULTS } from "../config/daemon.ts";
import { OVERRIDES_DEFAULT } from "../config/overrides.ts";
import { resolveDaemonPaths } from "../paths.ts";
import { migrate, loadBundledMigrations } from "../state/migrations.ts";
import { ProjectRegistry } from "../state/projects.ts";
import { makeFetchHandler } from "./router.ts";

function makeDeps() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  return {
    startedAt: Date.now(),
    registry: new ProjectRegistry(db),
    config: createConfigStore({
      daemon: DAEMON_DEFAULTS,
      overrides: OVERRIDES_DEFAULT,
      paths: resolveDaemonPaths({ ALOOP_HOME: "/tmp/router-test-noop" }),
    }),
  };
}

/**
 * Direct unit tests on the fetch handler — no socket/HTTP listener involved.
 * Isolates routing logic from the transport layer (covered separately by
 * daemon/start.test.ts integration tests).
 */
describe("makeFetchHandler (unit)", () => {
  test("dispatches /v1/daemon/health to the daemon route module", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/daemon/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { _v: number; status: string };
    expect(body._v).toBe(1);
    expect(body.status).toBe("ok");
  });

  test("dispatches /v1/projects to the projects route module", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/projects"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  test("returns SSE response for /v1/events/echo", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/events/echo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  test("returns 404 envelope for unknown routes", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/unknown"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { _v: number; code: string; message: string } };
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/unknown");
  });

  test("404 envelope includes the request method in the message", async () => {
    const fetch = makeFetchHandler(makeDeps());
    const res = await fetch(new Request("http://x/v1/missing", { method: "DELETE" }));
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("DELETE");
  });
});
