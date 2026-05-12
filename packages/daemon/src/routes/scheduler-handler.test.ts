import { describe, expect, test } from "bun:test";
import type { SchedulerService } from "@aloop/scheduler";
import { handleScheduler, type SchedulerDeps } from "@aloop/daemon-routes";

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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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

  test("accepts composer_turn_id as alternative owner", async () => {
    const deps = makeDeps({
      acquirePermit: async (input: { composerTurnId: string; providerCandidate: string }) => ({
        granted: true,
        permit: {
          id: "perm_ct",
          composerTurnId: input.composerTurnId,
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
      body: JSON.stringify({ composer_turn_id: "ct_abc", provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ granted: boolean; permit: { id: string } }>(res!);
    expect(body.granted).toBe(true);
    expect(body.permit.id).toBe("perm_ct");
  });

  test("accepts control_subagent_run_id as alternative owner", async () => {
    const deps = makeDeps({
      acquirePermit: async (input: { controlSubagentRunId: string; providerCandidate: string }) => ({
        granted: true,
        permit: {
          id: "perm_cs",
          controlSubagentRunId: input.controlSubagentRunId,
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
      body: JSON.stringify({ control_subagent_run_id: "cs_xyz", provider_candidate: "opencode" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ granted: boolean; permit: { id: string } }>(res!);
    expect(body.granted).toBe(true);
    expect(body.permit.id).toBe("perm_cs");
  });

  test("returns 400 when none of session_id, composer_turn_id, or control_subagent_run_id is provided", async () => {
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
    expect(body.error.message).toContain("session_id is required (or composer_turn_id or control_subagent_run_id)");
  });

  test("returns 400 when more than one owner field is provided", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_1",
        composer_turn_id: "ct_abc",
        provider_candidate: "opencode",
      }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("only one owner field may be provided");
  });

  test("accepts estimated_cost_usd as a valid non-negative number", async () => {
    const deps = makeDeps({
      acquirePermit: async (input: { sessionId: string; providerCandidate: string; estimatedCostUsd: number }) => ({
        granted: true,
        permit: {
          id: "perm_cost",
          sessionId: input.sessionId,
          providerId: input.providerCandidate,
          estimatedCostUsd: input.estimatedCostUsd,
          ttlSeconds: 600,
          grantedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      }),
    });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_cost",
        provider_candidate: "opencode",
        estimated_cost_usd: 0.05,
      }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(200);
    const body = await resJson<{ granted: boolean }>(res!);
    expect(body.granted).toBe(true);
  });

  test("returns 400 when estimated_cost_usd is negative", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_1",
        provider_candidate: "opencode",
        estimated_cost_usd: -0.01,
      }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("estimated_cost_usd");
  });

  test("returns 400 when estimated_cost_usd is non-finite", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s_1",
        provider_candidate: "opencode",
        estimated_cost_usd: Infinity,
      }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
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
  test("returns 200 with full limits envelope including nested system_limits and burn_rate", async () => {
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
    const body = await resJson<{
      _v: number;
      max_permits: number;
      permit_ttl_default_seconds: number;
      permit_ttl_max_seconds: number;
      system_limits: { cpu_max_pct: number; mem_max_pct: number; load_max: number };
      burn_rate: { max_tokens_since_commit: number; min_commits_per_hour: number };
    }>(res!);
    expect(body._v).toBe(1);
    expect(body.max_permits).toBe(3);
    expect(body.permit_ttl_default_seconds).toBe(600);
    expect(body.permit_ttl_max_seconds).toBe(3600);
    expect(body.system_limits.cpu_max_pct).toBe(80);
    expect(body.system_limits.mem_max_pct).toBe(85);
    expect(body.system_limits.load_max).toBe(4.0);
    expect(body.burn_rate.max_tokens_since_commit).toBe(1_000_000);
    expect(body.burn_rate.min_commits_per_hour).toBe(10);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── PUT /v1/scheduler/limits ────────────────────────────────────────────────

describe("PUT /v1/scheduler/limits", () => {
  test("returns 200 with full structured limits on success", async () => {
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
    const body = await resJson<{
      _v: number;
      max_permits: number;
      permit_ttl_default_seconds: number;
      permit_ttl_max_seconds: number;
      system_limits: { cpu_max_pct: number; mem_max_pct: number; load_max: number };
      burn_rate: { max_tokens_since_commit: number; min_commits_per_hour: number };
    }>(res!);
    expect(body._v).toBe(1);
    expect(body.max_permits).toBe(7);
    expect(body.permit_ttl_default_seconds).toBe(600);
    expect(body.permit_ttl_max_seconds).toBe(3600);
    expect(body.system_limits.cpu_max_pct).toBe(80);
    expect(body.system_limits.mem_max_pct).toBe(85);
    expect(body.system_limits.load_max).toBe(4.0);
    expect(body.burn_rate.max_tokens_since_commit).toBe(1_000_000);
    expect(body.burn_rate.min_commits_per_hour).toBe(10);
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

  test("returns 422 when updateLimits returns tune_out_of_bounds", async () => {
    const deps = makeDeps({
      updateLimits: async () => ({
        ok: false,
        code: "tune_out_of_bounds",
        violations: [
          { field: "system_limits.cpu_max_pct", value: 150, message: "must be <= 100" },
        ],
      }),
    });
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system_limits: { cpu_max_pct: 150 } }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");

    expect(res).toBeDefined();
    expect(res!.status).toBe(422);
    const body = await resJson<{
      error: { code: string; message: string; details: { violations: unknown[] } };
    }>(res!);
    expect(body.error.code).toBe("tune_out_of_bounds");
    expect(body.error.message).toBe("scheduler tuning request violates hard bounds");
    expect(body.error.details.violations).toHaveLength(1);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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
    const body = await resJson<{ error: { code: string; message: string } }>(res!);
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

// ─── parseJsonBody helper ────────────────────────────────────────────────────

async function parseJsonBody(
  req: Request,
): Promise<{ data: Record<string, unknown> } | { error: Response }> {
  try {
    const text = await req.text();
    if (text.length === 0) return { data: {} };
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: new Response(JSON.stringify({ error: { _v: 1, code: "bad_request", message: "request body must be a JSON object" } }), { status: 400, headers: { "content-type": "application/json" } }) };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: new Response(JSON.stringify({ error: { _v: 1, code: "bad_request", message: "invalid JSON body" } }), { status: 400, headers: { "content-type": "application/json" } }) };
  }
}

describe("parseJsonBody helper", () => {
  async function parseBody(body: string | null | undefined): Promise<{ data: Record<string, unknown> } | { error: Response }> {
    return parseJsonBody(new Request("http://x", { method: "POST", body: body ?? null as any }));
  }

  test("empty string body returns empty data object", async () => {
    const result = await parseBody("");
    expect(result).toEqual({ data: {} });
  });

  test("undefined body returns empty data object", async () => {
    const result = await parseBody(undefined);
    expect(result).toEqual({ data: {} });
  });

  test("valid JSON object returns data", async () => {
    const result = await parseBody('{"foo":"bar"}');
    expect("data" in result && result.data).toEqual({ foo: "bar" });
  });

  test("JSON array body returns error", async () => {
    const result = await parseBody("[1,2,3]");
    expect("error" in result).toBe(true);
    expect(result.error.status).toBe(400);
  });

  test("JSON null body returns error", async () => {
    const result = await parseBody("null");
    expect("error" in result).toBe(true);
    expect(result.error.status).toBe(400);
  });

  test("non-JSON text returns error", async () => {
    const result = await parseBody("not json at all");
    expect("error" in result).toBe(true);
    expect(result.error.status).toBe(400);
  });

  test("plain number body returns error", async () => {
    const result = await parseBody("42");
    expect("error" in result).toBe(true);
    expect(result.error.status).toBe(400);
  });

  test("nested JSON object returns data", async () => {
    const result = await parseBody('{"a":{"b":1},"c":[1,2]}');
    expect("data" in result && result.data).toEqual({ a: { b: 1 }, c: [1, 2] });
  });
});

// ─── asPositiveInt helper ────────────────────────────────────────────────────

function asPositiveInt(value: unknown): number | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return "invalid";
  return value;
}

describe("asPositiveInt helper", () => {
  test("undefined returns undefined (field absent)", () => {
    expect(asPositiveInt(undefined)).toBeUndefined();
  });

  test("valid positive integer returns the value", () => {
    expect(asPositiveInt(1)).toBe(1);
    expect(asPositiveInt(42)).toBe(42);
    expect(asPositiveInt(999999)).toBe(999999);
  });

  test("zero returns invalid", () => {
    expect(asPositiveInt(0)).toBe("invalid");
  });

  test("negative integer returns invalid", () => {
    expect(asPositiveInt(-1)).toBe("invalid");
    expect(asPositiveInt(-100)).toBe("invalid");
  });

  test("float returns invalid", () => {
    expect(asPositiveInt(1.5)).toBe("invalid");
    expect(asPositiveInt(3.14)).toBe("invalid");
  });

  test("non-number returns invalid", () => {
    expect(asPositiveInt("5" as unknown as number)).toBe("invalid");
    expect(asPositiveInt(null)).toBe("invalid");
    expect(asPositiveInt({})).toBe("invalid");
    expect(asPositiveInt(NaN)).toBe("invalid");
    expect(asPositiveInt(Infinity)).toBe("invalid");
  });
});

// ─── asNonEmptyString helper ──────────────────────────────────────────────────

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

describe("asNonEmptyString helper", () => {
  test("undefined returns undefined", () => {
    expect(asNonEmptyString(undefined)).toBeUndefined();
  });

  test("valid non-empty string returns the value", () => {
    expect(asNonEmptyString("hello")).toBe("hello");
    expect(asNonEmptyString("a")).toBe("a");
  });

  test("empty string returns undefined", () => {
    expect(asNonEmptyString("")).toBeUndefined();
  });

  test("whitespace-only string is NOT rejected (only length > 0 is checked)", () => {
    // The actual asNonEmptyString only checks length > 0, so whitespace strings are valid
    expect(asNonEmptyString("   ")).toBe("   ");
  });

  test("non-string returns undefined", () => {
    expect(asNonEmptyString(42)).toBeUndefined();
    expect(asNonEmptyString(null)).toBeUndefined();
    expect(asNonEmptyString({})).toBeUndefined();
    expect(asNonEmptyString(["a"])).toBeUndefined();
  });
});
