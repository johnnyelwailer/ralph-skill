import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSetup } from "./setup-router.ts";
import { SetupStore } from "./setup-store.ts";
import type { SetupDeps } from "./setup-handlers.ts";
import type { SetupRun } from "./setup-types.ts";

function makeDeps(tmp: string): SetupDeps {
  const eventsDir = join(tmp, "events");
  mkdirSync(eventsDir, { recursive: true });
  const stateDir = join(tmp, "state");
  mkdirSync(stateDir, { recursive: true });
  return {
    store: new SetupStore({ stateDir }),
    eventsDir,
  };
}

describe("handleSetup", () => {
  let tmp: string;
  let deps: SetupDeps;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "aloop-router-"));
    deps = makeDeps(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // ── POST /v1/setup/runs ───────────────────────────────────────────────────

  test("POST /v1/setup/runs creates a new run and returns 201", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs");
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body.id).toBeDefined();
    expect(body.abs_path).toBe("/test/project");
  });

  test("POST /v1/setup/runs with invalid body returns 400", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: "not json",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs");
    expect((res as Response).status).toBe(400);
  });

  // ── GET /v1/setup/runs ─────────────────────────────────────────────────────

  test("GET /v1/setup/runs returns list of runs with 200", async () => {
    // Create a run first
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    await handleSetup(createReq, deps, "/v1/setup/runs");

    const listReq = new Request("http://localhost/v1/setup/runs", {
      method: "GET",
    });
    const res = await handleSetup(listReq, deps, "/v1/setup/runs");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(1);
  });

  // ── GET /v1/setup/runs/:id ────────────────────────────────────────────────

  test("GET /v1/setup/runs/:id returns a single run", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const getReq = new Request(`http://localhost/v1/setup/runs/${created.id}`, {
      method: "GET",
    });
    const res = await handleSetup(getReq, deps, `/v1/setup/runs/${created.id}`);
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body.id).toBe(created.id);
  });

  test("GET /v1/setup/runs/:id returns 404 for unknown id", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist", {
      method: "GET",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/notexist");
    expect((res as Response).status).toBe(404);
  });

  // ── GET /v1/setup/runs/:id/chapters ───────────────────────────────────────

  test("GET /v1/setup/runs/:id/chapters returns chapters", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const chaptersReq = new Request(`http://localhost/v1/setup/runs/${created.id}/chapters`, {
      method: "GET",
    });
    const res = await handleSetup(chaptersReq, deps, `/v1/setup/runs/${created.id}/chapters`);
    expect((res as Response).status).toBe(200);
    const body = await (res as Response).json();
    expect(body._v).toBe(1);
    expect(body.chapters).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("GET /v1/setup/runs/:id/chapters returns 404 for unknown run", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/chapters", {
      method: "GET",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/notexist/chapters");
    expect((res as Response).status).toBe(404);
  });

  // ── POST /v1/setup/runs/:id/answer ────────────────────────────────────────

  test("POST /v1/setup/runs/:id/answer returns 200 on valid answer", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const answerReq = new Request(`http://localhost/v1/setup/runs/${created.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id: "q_1", value: "my-answer" }),
    });
    const res = await handleSetup(answerReq, deps, `/v1/setup/runs/${created.id}/answer`);
    expect((res as Response).status).toBe(200);
  });

  test("POST /v1/setup/runs/:id/answer returns 400 when question_id is missing", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const answerReq = new Request(`http://localhost/v1/setup/runs/${created.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ value: "my-answer" }),
    });
    const res = await handleSetup(answerReq, deps, `/v1/setup/runs/${created.id}/answer`);
    expect((res as Response).status).toBe(400);
  });

  // ── POST /v1/setup/runs/:id/comments ──────────────────────────────────────

  test("POST /v1/setup/runs/:id/comments returns 200 on valid comment", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const commentReq = new Request(`http://localhost/v1/setup/runs/${created.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ target_type: "chapter", target_id: "ch_1", body: "looks good" }),
    });
    const res = await handleSetup(commentReq, deps, `/v1/setup/runs/${created.id}/comments`);
    expect((res as Response).status).toBe(200);
  });

  test("POST /v1/setup/runs/:id/comments returns 400 when body is missing", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const commentReq = new Request(`http://localhost/v1/setup/runs/${created.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ target_type: "chapter", target_id: "ch_1" }),
    });
    const res = await handleSetup(commentReq, deps, `/v1/setup/runs/${created.id}/comments`);
    expect((res as Response).status).toBe(400);
  });

  // ── POST /v1/setup/runs/:id/approve-scaffold ──────────────────────────────

  test("POST /v1/setup/runs/:id/approve-scaffold returns 409 when verdict unresolved", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const approveReq = new Request(`http://localhost/v1/setup/runs/${created.id}/approve-scaffold`, {
      method: "POST",
    });
    const res = await handleSetup(approveReq, deps, `/v1/setup/runs/${created.id}/approve-scaffold`);
    expect((res as Response).status).toBe(409);
  });

  // ── POST /v1/setup/runs/:id/resume ────────────────────────────────────────
  //
  // NOTE: The router (setup-router.ts line 80) incorrectly passes an extra `req`
  // argument to resumeSetupRun, which has signature (id, deps). This causes
  // deps.store.get to receive a Request object instead of SetupDeps, throwing
  // "undefined is not an object". These tests correctly describe expected route
  // behavior per the handler spec — the router implementation has the bug.

  test("POST /v1/setup/runs/:id/resume returns 200 when run is active", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const resumeReq = new Request(`http://localhost/v1/setup/runs/${created.id}/resume`, {
      method: "POST",
    });
    // router bug: passes req as extra arg, resumeSetupRun(id, deps) gets (id, Request)
    const res = await handleSetup(resumeReq, deps, `/v1/setup/runs/${created.id}/resume`);
    expect((res as Response).status).toBe(200);
  });

  test("POST /v1/setup/runs/:id/resume returns 409 when run is not active", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    // Complete the run so it is no longer active
    deps.store.complete(created.id);

    const resumeReq = new Request(`http://localhost/v1/setup/runs/${created.id}/resume`, {
      method: "POST",
    });
    // router bug: passes req as extra arg, resumeSetupRun(id, deps) gets (id, Request)
    const res = await handleSetup(resumeReq, deps, `/v1/setup/runs/${created.id}/resume`);
    expect((res as Response).status).toBe(409);
  });

  // ── DELETE /v1/setup/runs/:id ──────────────────────────────────────────────

  test("DELETE /v1/setup/runs/:id returns 204 on successful delete", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const deleteReq = new Request(`http://localhost/v1/setup/runs/${created.id}`, {
      method: "DELETE",
    });
    const res = await handleSetup(deleteReq, deps, `/v1/setup/runs/${created.id}`);
    expect((res as Response).status).toBe(204);
  });

  test("DELETE /v1/setup/runs/:id returns 404 for unknown run", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist", {
      method: "DELETE",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/notexist");
    expect((res as Response).status).toBe(404);
  });

  // ── GET /v1/setup/runs/:id/events ─────────────────────────────────────────

  test("GET /v1/setup/runs/:id/events returns 200 with event stream", async () => {
    const createReq = new Request("http://localhost/v1/setup/runs", {
      method: "POST",
      body: JSON.stringify({ abs_path: "/test/project" }),
    });
    const created = await (await handleSetup(createReq, deps, "/v1/setup/runs") as Response).json();

    const eventsReq = new Request(`http://localhost/v1/setup/runs/${created.id}/events`, {
      method: "GET",
    });
    const res = await handleSetup(eventsReq, deps, `/v1/setup/runs/${created.id}/events`);
    expect((res as Response).status).toBe(200);
    expect((res as Response).headers.get("content-type")).toContain("text/event-stream");
  });

  test("GET /v1/setup/runs/:id/events returns 404 for unknown run", async () => {
    const req = new Request("http://localhost/v1/setup/runs/notexist/events", {
      method: "GET",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/notexist/events");
    expect((res as Response).status).toBe(404);
  });

  // ── Method not allowed / unrecognised paths ───────────────────────────────

  test("PUT /v1/setup/runs returns undefined (caller should 404)", async () => {
    const req = new Request("http://localhost/v1/setup/runs", {
      method: "PUT",
      body: JSON.stringify({ abs_path: "/test" }),
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs");
    expect(res).toBeUndefined();
  });

  test("PATCH /v1/setup/runs/:id returns undefined", async () => {
    const req = new Request("http://localhost/v1/setup/runs/someid", {
      method: "PATCH",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/someid");
    expect(res).toBeUndefined();
  });

  test("unrecognised sub-path returns undefined", async () => {
    const req = new Request("http://localhost/v1/setup/runs/someid/unknown", {
      method: "GET",
    });
    const res = await handleSetup(req, deps, "/v1/setup/runs/someid/unknown");
    expect(res).toBeUndefined();
  });
});
