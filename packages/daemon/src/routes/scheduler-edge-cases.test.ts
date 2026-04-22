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
import { handleScheduler, type SchedulerDeps } from "@aloop/daemon-routes";
import { SchedulerService, type SchedulerConfigView } from "@aloop/scheduler";

function makeDeps() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const home = mkdtempSync(join(tmpdir(), "aloop-scheduler-edge-test-"));
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
  const scheduler = new SchedulerService(
    new PermitRegistry(db),
    schedulerConfig,
    events,
  );
  return { scheduler, events, db, config };
}

function makeDepsWithFailingLimits() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const home = mkdtempSync(join(tmpdir(), "aloop-scheduler-fail-test-"));
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
    updateLimits: async (rawPatch: Record<string, unknown>) => {
      if ("nope" in rawPatch) {
        return { ok: false, errors: ["unknown scheduler limits field: nope"] };
      }
      if (rawPatch.concurrencyCap !== undefined) {
        const v = rawPatch.concurrencyCap;
        if (typeof v !== "number" || v < 1) {
          return { ok: false, errors: ["concurrencyCap must be a positive number"] };
        }
      }
      return { ok: true, limits: config.daemon().scheduler };
    },
  };
  const scheduler = new SchedulerService(
    new PermitRegistry(db),
    schedulerConfig,
    events,
  );
  return { scheduler };
}

function makeSchedulerDeps(scheduler: SchedulerService): SchedulerDeps {
  return { scheduler };
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

describe("PUT /v1/scheduler/limits malformed JSON body", () => {
  test("returns 400 with bad_request code for non-JSON text", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "this is not json",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { _v: number; code: string; message: string } }>(res!);
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("invalid JSON body");
  });

  test("returns 400 for JSON array body", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for JSON null body", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be a JSON object");
  });
});

describe("PUT /v1/scheduler/limits updateLimits validation errors", () => {
  test("returns 400 with errors array when updateLimits rejects the patch", async () => {
    const { scheduler } = makeDepsWithFailingLimits();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: 1 }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{
      error: { _v: number; code: string; details: { errors: string[] } }
    }>(res!);
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.errors).toBeDefined();
    expect(Array.isArray(body.error.details.errors)).toBe(true);
    expect(body.error.details.errors.length).toBeGreaterThan(0);
  });

  test("returns 400 when concurrencyCap is not a positive number", async () => {
    const { scheduler } = makeDepsWithFailingLimits();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrencyCap: -5 }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{
      error: { details: { errors: string[] } }
    }>(res!);
    expect(body.error.details.errors).toContainEqual(
      expect.stringContaining("concurrencyCap"),
    );
  });
});

describe("POST /v1/scheduler/permits malformed JSON body", () => {
  test("returns 400 with bad_request code for non-JSON", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "totally not json",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { _v: number; code: string } }>(res!);
    expect(body.error._v).toBe(1);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for JSON array body", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["also", "not", "an", "object"]),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });
});

describe("PATCH /v1/scheduler/limits (wrong method)", () => {
  test("returns 405 for PATCH on limits route", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrencyCap: 8 }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── GET /v1/scheduler/limits ────────────────────────────────────────────────

describe("GET /v1/scheduler/limits", () => {
  test("returns 200 with full limits envelope", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{
      _v: number;
      concurrencyCap: number;
      permitTtlDefaultSeconds: number;
      permitTtlMaxSeconds: number;
      systemLimits: { cpuMaxPct: number; memMaxPct: number; loadMax: number };
      burnRate: { maxTokensSinceCommit: number; minCommitsPerHour: number };
    }>(res!);
    expect(body._v).toBe(1);
    expect(typeof body.concurrencyCap).toBe("number");
    expect(typeof body.permitTtlDefaultSeconds).toBe("number");
    expect(typeof body.permitTtlMaxSeconds).toBe("number");
    expect(body.systemLimits).toBeDefined();
    expect(body.burnRate).toBeDefined();
  });

  test("limits reflect current config values", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    const body = await resJson<{ concurrencyCap: number; systemLimits: { cpuMaxPct: number } }>(res!);
    // DAEMON_DEFAULTS values
    expect(body.concurrencyCap).toBe(3);
    expect(body.systemLimits.cpuMaxPct).toBe(80);
  });
});

// ─── GET /v1/scheduler/permits ───────────────────────────────────────────────

describe("GET /v1/scheduler/permits", () => {
  test("returns 200 with empty items when no permits exist", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: unknown[] }>(res!);
    expect(body.items).toEqual([]);
  });

  test("returns 200 with permits after acquisition", async () => {
    const { scheduler } = makeDeps();
    // Acquire a permit first
    const acquireReq = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_get_permits", provider_candidate: "opencode" }),
    });
    await handleScheduler(acquireReq, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");

    const req = new Request("http://x/v1/scheduler/permits", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: Array<{ id: string; sessionId: string }> }>(res!);
    expect(body.items.length).toBe(1);
    expect(body.items[0]!.sessionId).toBe("s_get_permits");
  });
});

// ─── /v1/scheduler/permits/:id (wrong method) ────────────────────────────────

describe("/v1/scheduler/permits/:id (wrong method)", () => {
  test("returns 405 for GET on a specific permit id", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/perm_abc123", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits/perm_abc123");
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("returns 405 for POST on a specific permit id", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/perm_abc123", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits/perm_abc123");
    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
  });
});

// ─── Unhandled paths return undefined ────────────────────────────────────────

describe("handleScheduler returns undefined for unhandled paths", () => {
  test("returns undefined for /v1/scheduler (bare prefix — caller should handle)", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler");
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/scheduler/other (unrecognised sub-path)", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/other", { method: "GET" });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/other");
    expect(res).toBeUndefined();
  });
});
