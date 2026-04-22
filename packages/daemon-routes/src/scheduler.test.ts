import { describe, expect, test } from "bun:test";
import { handleScheduler, type SchedulerDeps } from "./scheduler.ts";

function makeDeps(overrides: Partial<SchedulerDeps["scheduler"]> = {}): SchedulerDeps {
  return {
    scheduler: {
      currentLimits() { return { max_permits: 10, ttl_seconds: 3600, ...overrides }; },
      listPermits() { return []; },
      updateLimits() { return { ok: true, limits: { max_permits: 5, ttl_seconds: 1800 }, errors: [] }; },
      acquirePermit() { throw new Error("not stubbed"); },
      releasePermit() { throw new Error("not stubbed"); },
      expirePermits() { throw new Error("not stubbed"); },
    },
  };
}

async function resJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return JSON.parse(text) as T;
}

// ─── /v1/scheduler/limits GET ─────────────────────────────────────────────────

describe("GET /v1/scheduler/limits", () => {
  test("returns 200 with current limits", async () => {
    const deps = makeDeps({ max_permits: 42, ttl_seconds: 7200 });
    const res = await handleScheduler(new Request("http://x/v1/scheduler/limits"), deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; max_permits: number; ttl_seconds: number }>(res!);
    expect(body._v).toBe(1);
    expect(body.max_permits).toBe(42);
    expect(body.ttl_seconds).toBe(7200);
  });

  test("returns 200 with defaults when no overrides", async () => {
    const deps = makeDeps();
    const res = await handleScheduler(new Request("http://x/v1/scheduler/limits"), deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ max_permits: number }>(res!);
    expect(body.max_permits).toBe(10);
  });
});

// ─── /v1/scheduler/limits PUT ────────────────────────────────────────────────

describe("PUT /v1/scheduler/limits", () => {
  test("returns 200 when limits are valid", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ max_permits: 5, ttl_seconds: 1800 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; max_permits: number; ttl_seconds: number }>(res!);
    expect(body._v).toBe(1);
    expect(body.max_permits).toBe(5);
    expect(body.ttl_seconds).toBe(1800);
  });

  test("returns 400 when limits are invalid", async () => {
    const deps = makeDeps();
    deps.scheduler.updateLimits = () => ({
      ok: false,
      limits: { max_permits: 5, ttl_seconds: 1800 },
      errors: [{ path: "max_permits", message: "must be positive" }],
    });
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ max_permits: -1 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string; details: { errors: unknown[] } } }>(res!);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.details.errors).toHaveLength(1);
  });

  test("returns 400 when body is not valid JSON", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(400);
  });

  test("returns 400 when body is an array instead of object", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ max_permits: 5 }]),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 405 for non-GET/PUT methods", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/limits", { method: "POST" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/limits");
    expect(res!.status).toBe(405);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("method_not_allowed");
  });
});

// ─── /v1/scheduler/permits GET ───────────────────────────────────────────────

describe("GET /v1/scheduler/permits", () => {
  test("returns 200 with empty list when no permits", async () => {
    const deps = makeDeps();
    const res = await handleScheduler(new Request("http://x/v1/scheduler/permits"), deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: unknown[] }>(res!);
    expect(body.items).toEqual([]);
  });

  test("returns 200 with permit list", async () => {
    const deps = makeDeps();
    deps.scheduler.listPermits = () => [
      { id: "p1", sessionId: "s1", providerCandidate: "prov1", createdAt: "t1", expiresAt: "t2", grantedAt: "t1" },
    ];
    const res = await handleScheduler(new Request("http://x/v1/scheduler/permits"), deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ items: unknown[] }>(res!);
    expect(body.items).toHaveLength(1);
    expect((body.items[0] as { id: string }).id).toBe("p1");
  });
});

// ─── /v1/scheduler/permits POST ──────────────────────────────────────────────

describe("POST /v1/scheduler/permits", () => {
  test("returns 200 with granted=true when permit is granted", async () => {
    const deps = makeDeps();
    deps.scheduler.acquirePermit = () =>
      Promise.resolve({
        granted: true,
        permit: { id: "new-permit", sessionId: "s1", providerCandidate: "prov1", createdAt: "", expiresAt: "", grantedAt: "" },
      });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; granted: boolean; permit: unknown }>(res!);
    expect(body.granted).toBe(true);
    expect(body.permit).toBeTruthy();
  });

  test("returns 200 with granted=false when permit is not granted", async () => {
    const deps = makeDeps();
    deps.scheduler.acquirePermit = () => Promise.resolve({ granted: false, reason: "no capacity" });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
    const body = await resJson<{ _v: number; granted: boolean; reason?: string }>(res!);
    expect(body.granted).toBe(false);
    expect(body.reason).toBe("no capacity");
  });

  test("returns 200 with ttl_seconds passed through", async () => {
    const deps = makeDeps();
    deps.scheduler.acquirePermit = ({ ttlSeconds }: { sessionId: string; providerCandidate: string; ttlSeconds?: number }) =>
      Promise.resolve({ granted: true, permit: { id: "p", sessionId: "s", providerCandidate: "prov", createdAt: "", expiresAt: "", grantedAt: "" } });
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1", ttl_seconds: 600 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(200);
  });

  test("returns 400 when session_id is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_candidate: "prov1" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when provider_candidate is missing", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
  });

  test("returns 400 when ttl_seconds is not a positive integer", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1", ttl_seconds: -5 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when ttl_seconds is a float", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1", ttl_seconds: 3.14 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
  });

  test("returns 400 when ttl_seconds is an empty string", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1", ttl_seconds: "" }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when ttl_seconds is zero", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: "s1", provider_candidate: "prov1", ttl_seconds: 0 }),
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 for invalid JSON body", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(400);
  });

  test("returns 405 for non-POST/GET methods", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits", { method: "DELETE" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits");
    expect(res!.status).toBe(405);
  });
});

// ─── /v1/scheduler/permits/:id DELETE ───────────────────────────────────────

describe("DELETE /v1/scheduler/permits/:id", () => {
  test("returns 204 when permit is released", async () => {
    const deps = makeDeps();
    deps.scheduler.releasePermit = () => Promise.resolve(true);
    const req = new Request("http://x/v1/scheduler/permits/my-id", { method: "DELETE" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/my-id");
    expect(res!.status).toBe(204);
    expect(res!.body).toBeNull();
  });

  test("returns 404 when permit is not found", async () => {
    const deps = makeDeps();
    deps.scheduler.releasePermit = () => Promise.resolve(false);
    const req = new Request("http://x/v1/scheduler/permits/nonexistent", { method: "DELETE" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/nonexistent");
    expect(res!.status).toBe(404);
    const body = await resJson<{ error: { code: string } }>(res!);
    expect(body.error.code).toBe("not_found");
  });

  test("returns 405 for non-DELETE methods on permit route", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/permits/my-id", { method: "GET" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/permits/my-id");
    expect(res!.status).toBe(405);
  });
});

// ─── unknown routes ───────────────────────────────────────────────────────────

describe("unknown routes", () => {
  test("returns undefined for unrecognized paths", async () => {
    const deps = makeDeps();
    const req = new Request("http://x/v1/scheduler/foo", { method: "GET" });
    const res = await handleScheduler(req, deps, "/v1/scheduler/foo");
    expect(res).toBeUndefined();
  });
});
