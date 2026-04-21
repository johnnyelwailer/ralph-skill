import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createEventWriter,
  EventCountsProjector,
  JsonlEventStore,
  loadBundledMigrations,
  migrate,
  PermitProjector,
  PermitRegistry,
  ProjectRegistry,
} from "@aloop/state-sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createConfigStore,
  DAEMON_DEFAULTS,
  OVERRIDES_DEFAULT,
  resolveDaemonPaths,
} from "@aloop/daemon-config";
import { SchedulerService, type SchedulerConfigView } from "@aloop/scheduler";
import { makeFetchHandler } from "./router.ts";

function makeDeps() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const home = mkdtempSync(join(tmpdir(), "aloop-router-"));
  const paths = resolveDaemonPaths({ ALOOP_HOME: home });
  const config = createConfigStore({
    daemon: DAEMON_DEFAULTS,
    overrides: OVERRIDES_DEFAULT,
    paths,
  });
  const events = createEventWriter({
    db,
    store: new JsonlEventStore(paths.logFile),
    projectors: [new EventCountsProjector(), new PermitProjector()],
    nextId: () => `evt_${crypto.randomUUID()}`,
  });
  const schedulerConfig: SchedulerConfigView = {
    scheduler: () => config.daemon().scheduler,
    overrides: () => config.overrides(),
    updateLimits: async () => ({ ok: true, limits: config.daemon().scheduler }),
  };
  return {
    registry: new ProjectRegistry(db),
    config,
    events,
    scheduler: new SchedulerService(new PermitRegistry(db), schedulerConfig, events),
    handleDaemon: (req: Request, pathname: string) => {
      if (req.method !== "GET" || pathname !== "/v1/daemon/health") return undefined;
      return new Response(JSON.stringify({ _v: 1, status: "ok", uptime_seconds: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

describe("makeFetchHandler (unit)", () => {
  test("dispatches /v1/daemon/health to the daemon route callback", async () => {
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
