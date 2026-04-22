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
import { handleScheduler, type SchedulerDeps } from "@aloop/daemon-routes";
import { SchedulerService, type SchedulerConfigView } from "@aloop/scheduler";

function makeDeps() {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const home = mkdtempSync(join(tmpdir(), "aloop-scheduler-test-"));
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
      const limits = config.daemon().scheduler;
      const knownKeys = [
        "concurrencyCap",
        "permitTtlDefaultSeconds",
        "permitTtlMaxSeconds",
        "systemLimits",
        "burnRate",
      ];
      const unknownKeys = Object.keys(rawPatch).filter((k) => !knownKeys.includes(k));
      if (unknownKeys.length > 0) {
        return { ok: false, errors: [`unknown field: ${unknownKeys[0]}`] };
      }
      if (rawPatch.concurrencyCap !== undefined) {
        const v = rawPatch.concurrencyCap;
        if (typeof v !== "number" || v < 1) {
          return { ok: false, errors: ["concurrencyCap must be a positive number"] };
        }
      }
      // Return the patch reflected in the returned limits (mock applies values)
      return {
        ok: true,
        limits: {
          ...limits,
          ...(rawPatch.concurrencyCap !== undefined ? { concurrencyCap: rawPatch.concurrencyCap as number } : {}),
        },
      };
    },
  };
  const scheduler = new SchedulerService(
    new PermitRegistry(db),
    schedulerConfig,
    events,
  );
  return { scheduler, events, db, config };
}

function makeSchedulerDeps(scheduler: SchedulerService): SchedulerDeps {
  return { scheduler };
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

function makeDepsWithQuota(
  quotaProbe: NonNullable<import("@aloop/scheduler").SchedulerProbes["providerQuota"]>,
) {
  const db = new Database(":memory:");
  migrate(db, loadBundledMigrations());
  const home = mkdtempSync(join(tmpdir(), "aloop-scheduler-test-"));
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
      const limits = config.daemon().scheduler;
      return { ok: true, limits };
    },
  };
  const scheduler = new SchedulerService(
    new PermitRegistry(db),
    schedulerConfig,
    events,
    { providerQuota: quotaProbe },
  );
  return { scheduler };
}

// ─── /v1/scheduler/limits ────────────────────────────────────────────────────

describe("GET /v1/scheduler/limits", () => {
  test("returns current limits with _v:1 wrapper", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler/limits"),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/limits",
    );
    expect(res).toBeDefined();
    const body = await resJson<{ _v: number; concurrencyCap: number }>(res!);
    expect(body._v).toBe(1);
    expect(typeof body.concurrencyCap).toBe("number");
  });
});

describe("PUT /v1/scheduler/limits", () => {
  test("returns updated limits on valid patch", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrencyCap: 8 }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    const body = await resJson<{ _v: number; concurrencyCap: number }>(res!);
    expect(body._v).toBe(1);
    expect(body.concurrencyCap).toBe(8);
  });

  test("returns 400 when concurrencyCap is not a positive number", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrencyCap: -1 }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 on invalid JSON body", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when body is not a JSON object", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 405 for non-GET/PUT methods", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "DELETE",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/limits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── /v1/scheduler/permits ──────────────────────────────────────────────────

describe("GET /v1/scheduler/permits", () => {
  test("returns empty items list when no permits exist", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler/permits"),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/permits",
    );
    expect(res).toBeDefined();
    const body = await resJson<{ items: unknown[] }>(res!);
    expect(body.items).toEqual([]);
  });
});

describe("POST /v1/scheduler/permits", () => {
  test("returns 400 when session_id is missing", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_candidate: "test-provider" }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("session_id");
  });

  test("returns 400 when provider_candidate is missing", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "sess_123" }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("provider_candidate");
  });

  test("returns 400 when ttl_seconds is not a positive integer", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "sess_123",
        provider_candidate: "test-provider",
        ttl_seconds: 0,
      }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("ttl_seconds");
  });

  test("returns granted:true with permit on successful acquisition", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "sess_abc",
        provider_candidate: "test-provider",
      }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{
      _v: number;
      granted: boolean;
      permit: { id: string; sessionId: string; providerId: string };
    }>(res!);
    expect(body._v).toBe(1);
    expect(body.granted).toBe(true);
    expect(body.permit.id).toBeTruthy();
    expect(body.permit.sessionId).toBe("sess_abc");
    expect(body.permit.providerId).toBe("test-provider");
  });

  test("returns granted:false with retryAfterSeconds when provider quota denies with retry info", async () => {
    const quotaProbe = async () => ({
      ok: false,
      reason: "rate_limit_exceeded",
      retryAfterSeconds: 120,
      remaining: 0,
    });
    const { scheduler } = makeDepsWithQuota(quotaProbe);
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "sess_quota",
        provider_candidate: "opencode",
      }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{
      _v: number;
      granted: boolean;
      reason: string;
      gate: string;
      retryAfterSeconds?: number;
    }>(res!);
    expect(body.granted).toBe(false);
    expect(body.reason).toBe("rate_limit_exceeded");
    expect(body.gate).toBe("provider");
    expect(body.retryAfterSeconds).toBe(120);
  });

  test("returns granted:false with remaining quota info when provider quota denies", async () => {
    const quotaProbe = async () => ({
      ok: false,
      reason: "daily_limit_exceeded",
      remaining: 0,
      resetAt: "2026-04-22T00:00:00Z",
    });
    const { scheduler } = makeDepsWithQuota(quotaProbe);
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "sess_quota2",
        provider_candidate: "claude",
      }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{
      granted: boolean;
      reason: string;
      gate: string;
    }>(res!);
    expect(body.granted).toBe(false);
    expect(body.reason).toBe("daily_limit_exceeded");
    expect(body.gate).toBe("provider");
  });

  test("returns granted:true when ttl_seconds is provided and valid", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "sess_ttl",
        provider_candidate: "test-provider",
        ttl_seconds: 60,
      }),
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{ granted: boolean; permit: { id: string } }>(res!);
    expect(body.granted).toBe(true);
    expect(body.permit.id).toBeTruthy();
  });

  test("returns 405 for non-POST/GET methods on permits route", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "DELETE",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── /v1/scheduler/permits/:id ───────────────────────────────────────────────

describe("DELETE /v1/scheduler/permits/:id", () => {
  test("returns 204 when permit exists and is released", async () => {
    const { scheduler } = makeDeps();

    // First acquire a permit
    const acquireReq = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "sess_release", provider_candidate: "test-provider" }),
    });
    const acquireRes = await handleScheduler(
      acquireReq,
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/permits",
    );
    expect(acquireRes).toBeDefined();
    const acquireBody = await resJson<{ permit: { id: string } }>(acquireRes!);
    const permitId = acquireBody.permit.id;

    // Now release it
    const releaseRes = await handleScheduler(
      new Request(`http://x/v1/scheduler/permits/${permitId}`, { method: "DELETE" }),
      makeSchedulerDeps(scheduler),
      `/v1/scheduler/permits/${permitId}`,
    );
    expect(releaseRes).toBeDefined();
    expect(releaseRes!.status).toBe(204);
  });

  test("returns 404 when permit does not exist", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler/permits/nonexistent_id", { method: "DELETE" }),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/permits/nonexistent_id",
    );
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("not_found");
  });

  test("returns 405 for non-DELETE on permit route", async () => {
    const { scheduler } = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/some_id", {
      method: "GET",
    });
    const res = await handleScheduler(req, makeSchedulerDeps(scheduler), "/v1/scheduler/permits/some_id");
    expect(res).toBeDefined();
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("returns 404 for DELETE on empty permit id segment", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler/permits/", { method: "DELETE" }),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/permits/",
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
  });
});

// ─── Unhandled paths return undefined ───────────────────────────────────────

describe("unhandled paths", () => {
  test("returns undefined for /v1/scheduler (unmatched prefix)", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler", { method: "GET" }),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler",
    );
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/scheduler/other", async () => {
    const { scheduler } = makeDeps();
    const res = await handleScheduler(
      new Request("http://x/v1/scheduler/other", { method: "GET" }),
      makeSchedulerDeps(scheduler),
      "/v1/scheduler/other",
    );
    expect(res).toBeUndefined();
  });
});
