import { describe, expect, test } from "bun:test";
import type { SchedulerService } from "@aloop/scheduler";
import { handleScheduler, type SchedulerDeps } from "./scheduler.ts";

function makeDeps(overrides: Partial<SchedulerService> = {}): SchedulerDeps {
  const scheduler = {
    acquirePermit: async () => ({ granted: true, permit: { id: "test", sessionId: "s", providerId: "opencode", ttlSeconds: 600, grantedAt: "", expiresAt: "" } }),
    releasePermit: async (_id: string) => false,
    listPermits: () => [],
    currentLimits: () => ({ concurrencyCap: 3, permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600, systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 }, burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 10 } }),
    updateLimits: async () => ({ ok: true, limits: { concurrencyCap: 3, permitTtlDefaultSeconds: 600, permitTtlMaxSeconds: 3600, systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 }, burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 10 } } }),
    ...overrides,
  } as unknown as SchedulerService;
  return { scheduler };
}

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

// ─── DELETE /v1/scheduler/permits/:id ────────────────────────────────────────

describe("DELETE /v1/scheduler/permits/:id", () => {
  test("returns 404 when permit does not exist", async () => {
    const deps = makeDeps({ releasePermit: async () => false });
    const req = new Request("http://x/v1/scheduler/permits/perm_nonexistent", {
      method: "DELETE",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/perm_nonexistent");

    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("/v1/scheduler/permits/perm_nonexistent");
  });

  test("returns 204 when permit is successfully released", async () => {
    const deps = makeDeps({ releasePermit: async () => true });
    const req = new Request("http://x/v1/scheduler/permits/perm_existing", {
      method: "DELETE",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/perm_existing");

    expect(res).toBeDefined();
    expect(res!.status).toBe(204);
  });

  test("returns 405 when method is not DELETE", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/perm_existing", {
      method: "GET",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/perm_existing");

    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });

  test("id is extracted correctly from the pathname", async () => {
    let capturedId: string | undefined;
    const deps = makeDeps({
      releasePermit: async (id: string) => {
        capturedId = id;
        return true;
      },
    });
    const req = new Request("http://x/v1/scheduler/permits/perm_abc123", {
      method: "DELETE",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/perm_abc123");

    expect(res!.status).toBe(204);
    expect(capturedId).toBe("perm_abc123");
  });
});

// ─── POST /v1/scheduler/permits — input validation ────────────────────────────

describe("POST /v1/scheduler/permits validation", () => {
  test("returns 400 when session_id is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("session_id");
  });

  test("returns 400 when provider_candidate is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("provider_candidate");
  });

  test("returns 400 when session_id is an empty string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "", provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when provider_candidate is an empty string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when ttl_seconds is not a positive integer", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode", ttl_seconds: -5 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("ttl_seconds");
  });

  test("returns 400 when ttl_seconds is a float", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode", ttl_seconds: 3.14 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when ttl_seconds is zero", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode", ttl_seconds: 0 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for non-JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json at all",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("invalid JSON body");
  });

  test("returns 400 for JSON array body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["session_id", "provider_candidate"]),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("request body must be a JSON object");
  });

  test("returns 400 for empty JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("accepts a valid permit acquisition request", async () => {
    const deps = makeDeps({
      acquirePermit: async (input: { sessionId: string; providerCandidate: string }) => ({
        granted: true,
        permit: {
          id: "perm_test",
          sessionId: input.sessionId,
          providerId: input.providerCandidate,
          ttlSeconds: 600,
          grantedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      }),
    });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_1", provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ granted: boolean; permit: { id: string } }>(res!);
    expect(body.granted).toBe(true);
    expect(body.permit.id).toBe("perm_test");
  });

  test("forwards denial from scheduler as granted=false response", async () => {
    const deps = makeDeps({
      acquirePermit: async () => ({
        granted: false,
        reason: "concurrency_cap_reached",
        gate: "concurrency",
        details: { active_permits: 3, concurrency_cap: 3 },
      }),
    });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s_over", provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ granted: boolean; reason: string; gate: string }>(res!);
    expect(body.granted).toBe(false);
    expect(body.reason).toBe("concurrency_cap_reached");
    expect(body.gate).toBe("concurrency");
  });
});

// ─── GET /v1/scheduler/limits ────────────────────────────────────────────────

describe("GET /v1/scheduler/limits", () => {
  test("returns 200 with full limits envelope", async () => {
    const deps = makeDeps({
      currentLimits: () => ({
        concurrencyCap: 3,
        permitTtlDefaultSeconds: 600,
        permitTtlMaxSeconds: 3600,
        systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
        burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 10 },
      }),
    });
    const req = new Request("http://x/v1/scheduler/limits", { method: "GET" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; concurrencyCap: number }>(res!);
    expect(body._v).toBe(1);
    expect(body.concurrencyCap).toBe(3);
  });

  test("returns 405 for POST on limits route", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrencyCap: 5 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(405);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── PUT /v1/scheduler/limits ────────────────────────────────────────────────

describe("PUT /v1/scheduler/limits", () => {
  test("returns 200 with updated limits on success", async () => {
    const deps = makeDeps({
      updateLimits: async () => ({
        ok: true,
        limits: {
          concurrencyCap: 7,
          permitTtlDefaultSeconds: 600,
          permitTtlMaxSeconds: 3600,
          systemLimits: { cpuMaxPct: 80, memMaxPct: 85, loadMax: 4.0 },
          burnRate: { maxTokensSinceCommit: 1_000_000, minCommitsPerHour: 10 },
        },
      }),
    });
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ concurrency_cap: 7 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; concurrencyCap: number }>(res!);
    expect(body._v).toBe(1);
    expect(body.concurrencyCap).toBe(7);
  });

  test("returns 400 when updateLimits returns errors", async () => {
    const deps = makeDeps({
      updateLimits: async () => ({
        ok: false,
        errors: ["unknown scheduler limits field: nope"],
      }),
    });
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: 1 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; details: { errors: string[] } } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.errors).toContain("unknown scheduler limits field: nope");
  });

  test("returns 400 for non-JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("invalid JSON body");
  });

  test("returns 400 for JSON array body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("request body must be a JSON object");
  });
});

// ─── Unhandled paths ─────────────────────────────────────────────────────────

describe("handleScheduler unhandled paths", () => {
  test("returns undefined for bare /v1/scheduler prefix", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler", { method: "GET" });
    const res = await handleScheduler(req, deps, "/v1/scheduler");
    expect(res).toBeUndefined();
  });

  test("returns undefined for /v1/scheduler/other", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/other", { method: "GET" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/other");
    expect(res).toBeUndefined();
  });

  test("returns 404 for /v1/scheduler/permits/ (empty id)", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/", { method: "DELETE" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/");
    // Empty id after permits/ is not a valid route — returns 404
    expect(res).toBeDefined();
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("not_found");
  });
});
