import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry, SessionRegistry } from "@aloop/state-sqlite";
import {
  createSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  getSessionMetricsHandler,
  getNextTurnHandler,
  runTurnHandler,
  deleteSessionHandler,
  resumeSessionHandler,
  pauseSessionHandler,
  unpauseSessionHandler,
  listSessionQueueHandler,
  deleteSessionQueueItemHandler,
  steerSessionHandler,
  recompileSessionHandler,
} from "./sessions-handlers.ts";
import type { RunTurnDeps, SessionsDeps } from "./sessions-handlers.ts";
import { TurnRegistry } from "@aloop/state-sqlite";
import { ProviderRegistry } from "@aloop/provider";
import type { AgentChunk, ProviderAdapter, ResolvedModel } from "@aloop/provider";
import type { Permit } from "@aloop/state-sqlite";
import type { PermitDecision } from "@aloop/scheduler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resJson(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

function makeDeps(dir: string, workflowsDir?: string): SessionsDeps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const sessions = new SessionRegistry(db);
  const projects = new ProjectRegistry(db);
  (sessions as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  return { sessions, projects, sessionsDir: () => dir, workflowsDir: workflowsDir ?? join(tmpdir(), "aloop-workflows") };
}

// ─────────────────────────────────────────────────────────────────
// getSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("getSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-get-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with session data when session exists", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}`);
    const res = getSessionHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.id).toBe(sessionId);
    expect(body.kind).toBe("standalone");
    expect(body.status).toBe("pending");
    expect(body.workflow).toBe("test-workflow");
    expect(body.provider_chain).toEqual(["provider-1"]);
  });

  test("returns 404 with session_not_found code when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent-id");
    const res = getSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("deleteSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-delete-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 and stops session with default mode=graceful", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    // Verify session still exists but status is "stopped"
    const getRes = getSessionHandler(sessionId, deps);
    expect(getRes.status).toBe(200);
    const body = await resJson(getRes);
    expect(body.status).toBe("stopped");
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent-id", {
      method: "DELETE",
    });
    const res = deleteSessionHandler("nonexistent-id", req, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 400 when mode query param is invalid", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=invalid`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("mode must be one of");
  });

  test("accepts mode=force query param without error", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=force`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const getRes = getSessionHandler(sessionId, deps);
    expect(getRes.status).toBe(200);
    const body = await resJson(getRes);
    expect(body.status).toBe("stopped");
  });

  test("accepts mode=graceful query param without error", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=graceful`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    // mode=graceful stops the session (doesn't hard-delete)
    const getRes = getSessionHandler(sessionId, deps);
    expect(getRes.status).toBe(200);
    const body = await resJson(getRes);
    expect(body.status).toBe("stopped");
  });

  for (const status of ["completed", "failed", "archived"] as const) {
    test(`returns 409 when session is in ${status} status (terminal)`, async () => {
      deps.sessions.updateStatus(sessionId, status);
      const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=graceful`, {
        method: "DELETE",
      });
      const res = deleteSessionHandler(sessionId, req, deps);
      expect(res.status).toBe(409);
      const body = await resJson(res);
      expect(body.error.code).toBe("session_not_stoppable");
      expect(body.error.message).toContain("cannot delete session");
      expect(body.error.details).toMatchObject({ id: sessionId, status });
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// resumeSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("resumeSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-resume-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 when resuming a session in interrupted status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "interrupted");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("running");
  });

  test("returns 200 when resuming a session in stopped status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "stopped");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("running");
  });

  test("returns 200 when resuming a session in paused status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "paused");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("running");
  });

  test("returns 409 when session is in pending status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("pending");
  });

  test("returns 409 when session is in running status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "running");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("running");
  });

  test("returns 409 when session is in completed status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "completed");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("completed");
  });

  test("returns 404 when session does not exist", async () => {
    const res = resumeSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// pauseSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("pauseSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-pause-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 when pausing a running session", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    // Force status to running (create gives pending)
    deps.sessions.updateStatus(id, "running");
    const res = pauseSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("paused");
  });

  test("returns 200 when pausing a pending session", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = pauseSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("paused");
  });

  test("returns 409 when session is in stopped status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "stopped");
    const res = pauseSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot pause session in status");
    expect(body.error.message).toContain("stopped");
  });

  test("returns 404 when session does not exist", async () => {
    const res = pauseSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// unpauseSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("unpauseSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-unpause-"));
    deps = makeDeps(dir);
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 when unpausing a paused session", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "paused");
    const res = unpauseSessionHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("running");
  });

  test("returns 409 when session is in running status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "running");
    const res = unpauseSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot unpause session in status");
    expect(body.error.message).toContain("running");
  });

  test("returns 409 when session is in pending status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = unpauseSessionHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.message).toContain("cannot unpause session in status");
    expect(body.error.message).toContain("pending");
  });

  test("returns 404 when session does not exist", async () => {
    const res = unpauseSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// listSessionQueueHandler
// ─────────────────────────────────────────────────────────────────

describe("listSessionQueueHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-queue-list-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty items when queue is empty", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/queue`);
    const res = listSessionQueueHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toEqual([]);
  });

  test("returns 200 with queue items when queue has entries", async () => {
    // Enqueue two items
    deps.sessions.enqueue({
      sessionId,
      filename: "steer-1.md",
      instruction: "do the thing",
      affectsCompletedWork: "no",
      position: 0,
    });
    deps.sessions.enqueue({
      sessionId,
      filename: "steer-2.md",
      instruction: "do another thing",
      affectsCompletedWork: "yes",
      position: 1,
    });

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/queue`);
    const res = listSessionQueueHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].filename).toBe("steer-1.md");
    expect(body.items[0].instruction).toBe("do the thing");
    expect(body.items[1].filename).toBe("steer-2.md");
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent/queue");
    const res = listSessionQueueHandler("nonexistent", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteSessionQueueItemHandler
// ─────────────────────────────────────────────────────────────────

describe("deleteSessionQueueItemHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;
  let queueItemId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-queue-delete-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const item = deps.sessions.enqueue({
      sessionId,
      filename: "steer-1.md",
      instruction: "do the thing",
      affectsCompletedWork: "no",
      position: 0,
    });
    queueItemId = item.id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 204 when queue item is deleted", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/queue/${queueItemId}`, {
      method: "DELETE",
    });
    const res = deleteSessionQueueItemHandler(sessionId, queueItemId, deps);
    expect(res.status).toBe(204);
    // Verify queue is now empty
    const listRes = listSessionQueueHandler(sessionId, deps);
    const body = await resJson(listRes);
    expect(body.items).toEqual([]);
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request(`http://localhost/v1/sessions/nonexistent/queue/${queueItemId}`, {
      method: "DELETE",
    });
    const res = deleteSessionQueueItemHandler("nonexistent", queueItemId, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });
});

// ─────────────────────────────────────────────────────────────────
// listSessionsHandler
// ─────────────────────────────────────────────────────────────────

describe("listSessionsHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-list-"));
    deps = makeDeps(dir);
    projectId = deps.projects.create({ absPath: join(dir, "proj1") }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty items when no sessions exist", async () => {
    const req = new Request("http://localhost/v1/sessions");
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toEqual([]);
    expect(body._v).toBe(1);
  });

  test("returns 200 with all sessions when no filter is provided", async () => {
    const s1 = deps.sessions.create({
      id: "s_list1",
      projectId,
      kind: "standalone",
      workflow: "wf1",
      providerChain: ["p1"],
    });
    const s2 = deps.sessions.create({
      id: "s_list2",
      projectId,
      kind: "orchestrator",
      workflow: "wf2",
      providerChain: ["p2"],
    });
    const req = new Request("http://localhost/v1/sessions");
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(2);
    const ids = body.items.map((i: { id: string }) => i.id).sort();
    expect(ids).toEqual(["s_list1", "s_list2"]);
  });

  test("filters sessions by project_id query param", async () => {
    const otherDir = mkdtempSync(join(tmpdir(), "aloop-session-list-other-"));
    const otherProjectId = deps.projects.create({ absPath: join(otherDir, "proj2") }).id;
    deps.sessions.create({ id: "s_proj1", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.create({ id: "s_proj2", projectId: otherProjectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    const req = new Request(`http://localhost/v1/sessions?project_id=${projectId}`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("s_proj1");
    rmSync(otherDir, { recursive: true, force: true });
  });

  test("filters sessions by single status query param", async () => {
    deps.sessions.create({ id: "s_pending", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.create({ id: "s_running", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.updateStatus("s_running", "running");
    const req = new Request(`http://localhost/v1/sessions?status=running`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("s_running");
    expect(body.items[0].status).toBe("running");
  });

  test("filters sessions by multiple comma-separated statuses", async () => {
    deps.sessions.create({ id: "s_pen", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.create({ id: "s_run", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.create({ id: "s_comp", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.updateStatus("s_run", "running");
    deps.sessions.updateStatus("s_comp", "completed");
    const req = new Request(`http://localhost/v1/sessions?status=pending,running`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(2);
    const statuses = body.items.map((i: { status: string }) => i.status).sort();
    expect(statuses).toEqual(["pending", "running"]);
  });

  test("filters sessions by kind query param", async () => {
    deps.sessions.create({ id: "s_stand", projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    deps.sessions.create({ id: "s_orc", projectId, kind: "orchestrator", workflow: "wf", providerChain: ["p"] });
    const req = new Request(`http://localhost/v1/sessions?kind=orchestrator`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].kind).toBe("orchestrator");
  });

  test("filters sessions by parent query param", async () => {
    const parentId = deps.sessions.create({ id: "s_parent", projectId, kind: "orchestrator", workflow: "wf", providerChain: ["p"] }).id;
    deps.sessions.create({ id: "s_child", projectId, kind: "child", workflow: "wf", providerChain: ["p"], parentSessionId: parentId });
    const req = new Request(`http://localhost/v1/sessions?parent=${parentId}`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("s_child");
  });

  test("enforces limit query param", async () => {
    for (let i = 0; i < 5; i++) {
      deps.sessions.create({ id: `s_lim_${i}`, projectId, kind: "standalone", workflow: "wf", providerChain: ["p"] });
    }
    const req = new Request(`http://localhost/v1/sessions?limit=3`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.items).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────
// createSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("createSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let projectId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-create-"));
    deps = makeDeps(dir);
    projectId = deps.projects.create({ absPath: join(dir, "proj1") }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 201 with the created session on success", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: {
          id: "s_new",
          project_id: projectId,
          kind: "standalone",
          workflow: "plan-build-review",
          provider_chain: ["opencode", "claude"],
        },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.id).toBe("s_new");
    expect(body.kind).toBe("standalone");
    expect(body.workflow).toBe("plan-build-review");
    expect(body.provider_chain).toEqual(["opencode", "claude"]);
    expect(body.status).toBe("pending");
  });

  test("auto-generates session id when not provided", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: {
          project_id: projectId,
          kind: "standalone",
          workflow: "wf",
          provider_chain: ["p1"],
        },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("returns 400 when project_id is missing", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { kind: "standalone", workflow: "wf", provider_chain: ["p"] } }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("project_id");
  });

  test("returns 404 when project does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: "nonexistent-proj", kind: "standalone", workflow: "wf", provider_chain: ["p"] },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("project_not_found");
  });

  test("returns 400 when kind is invalid", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "invalid-kind", workflow: "wf", provider_chain: ["p"] },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("kind");
  });

  test("returns 400 when workflow is missing", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", provider_chain: ["p"] },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("workflow");
  });

  test("returns 400 when provider_chain is not an array", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: "not-an-array" },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("provider_chain");
  });

  test("returns 400 when kind=child and parent_session_id is missing", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "child", workflow: "wf", provider_chain: ["p"] },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("parent_session_id");
  });

  test("returns 400 when parent session does not exist for kind=child", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "child", workflow: "wf", provider_chain: ["p"], parent_session_id: "nonexistent" },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when child session targets a grandchild parent", async () => {
    const parentId = deps.sessions.create({ id: "s_gc_parent", projectId, kind: "orchestrator", workflow: "wf", providerChain: ["p"] }).id;
    const childId = deps.sessions.create({ id: "s_actual_child", projectId, kind: "child", workflow: "wf", providerChain: ["p"], parentSessionId: parentId }).id;
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "child", workflow: "wf", provider_chain: ["p"], parent_session_id: childId },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.message).toContain("grandchild");
  });

  test("accepts max_iterations when provided", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: ["p"], max_iterations: 10 },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.max_iterations).toBe(10);
  });

  test("accepts notes when provided", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: ["p"], notes: "test session" },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.notes).toBe("test session");
  });

  test("accepts numeric issue and returns it as issue_ref string", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: ["p"], issue: 42 },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.issue_ref).toBe("42");
  });

  test("sets issue_ref to null when issue is a non-numeric string", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: ["p"], issue: "not-a-number" },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.issue_ref).toBe(null);
  });

  test("sets issue_ref to null when issue is NaN", async () => {
    const req = new Request("http://localhost/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: { project_id: projectId, kind: "standalone", workflow: "wf", provider_chain: ["p"], issue: NaN },
      }),
    });
    const res = await createSessionHandler(req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.issue_ref).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────
// steerSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("steerSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-steer-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 201 with queue_item_id and filename when instruction is valid", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "take a different approach" }),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.queue_item_id).toBeTruthy();
    expect(body.filename).toMatch(/^steer-\d+\.md$/);
    expect(body.position).toBe(0);
    expect(body.session_id).toBe(sessionId);
  });

  test("returns 201 and increments queue position for subsequent steer items", async () => {
    // Enqueue first item
    deps.sessions.enqueue({
      sessionId,
      filename: "steer-0.md",
      instruction: "first instruction",
      affectsCompletedWork: "no",
      position: 0,
    });

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "second instruction" }),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);
    expect(body.position).toBe(1);
    expect(body.filename).toMatch(/^steer-\d+\.md$/);
  });

  test("defaults affects_completed_work to 'no' when not provided", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "try again" }),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(201);
    const body = await resJson(res);

    // Verify the stored queue item has the correct default
    const queueReq = new Request(`http://localhost/v1/sessions/${sessionId}/queue`);
    const queueRes = listSessionQueueHandler(sessionId, deps);
    const queueBody = await resJson(queueRes);
    expect(queueBody.items[0].affects_completed_work).toBe("no");
  });

  test("accepts explicit affects_completed_work values", async () => {
    const affectsValues = ["yes", "no", "unknown"] as const;
    for (const affects of affectsValues) {
      // Create a fresh session for each iteration to avoid queue position conflicts
      const sid = deps.sessions.create({
        projectId: "proj-1",
        kind: "standalone",
        workflow: "test-workflow",
        providerChain: ["provider-1"],
      }).id;

      const req = new Request(`http://localhost/v1/sessions/${sid}/steer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: `instruction ${affects}`, affects_completed_work: affects }),
      });
      const res = await steerSessionHandler(sid, req, deps);
      expect(res.status).toBe(201);
      const body = await resJson(res);
      expect(body._v).toBe(1);
    }
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent/steer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "steer me" }),
    });
    const res = await steerSessionHandler("nonexistent", req, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 400 when instruction is missing", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("instruction");
  });

  test("returns 400 when instruction is an empty string", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "" }),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("instruction");
  });

  test("returns 400 when instruction is not a string", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: 12345 }),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("instruction");
  });

  test("returns 400 when body is invalid JSON", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not valid json {{{",
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when body is a JSON array", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([{ instruction: "steer" }]),
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toBe("request body must be a JSON object");
  });

  test("returns 400 when body is JSON null", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    const res = await steerSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await resJson(res);
    expect(body.error.code).toBe("bad_request");
  });
});

// ─────────────────────────────────────────────────────────────────
// recompileSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("recompileSessionHandler", () => {
  let dir: string;
  let workflowsDir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-recompile-"));
    workflowsDir = mkdtempSync(join(tmpdir(), "aloop-workflows-"));
    deps = makeDeps(dir, workflowsDir);
    const projectId = deps.projects.create({ absPath: join(dir, "proj1") }).id;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(workflowsDir, "aloop/workflows"), { recursive: true });
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - agent: build
`,
      "utf-8",
    );
    sessionId = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(workflowsDir, { recursive: true, force: true });
  });

  test("returns 200 and writes compiled workflow-plan.json", async () => {
    const res = recompileSessionHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body._v).toBe(1);
    expect(body.session_id).toBe(sessionId);
    expect(body.workflow_plan_version).toBe(1);
    expect(body.workflow).toBe("aloop/workflows/test-workflow");
  });

  test("workflow-plan.json is written to session dir with compiled handlers", async () => {
    recompileSessionHandler(sessionId, deps);
    const sessionDir = `${dir}/${sessionId}`;
    const { existsSync, readFileSync } = require("node:fs");
    expect(existsSync(`${sessionDir}/workflow-plan.json`)).toBe(true);
    const plan = JSON.parse(readFileSync(`${sessionDir}/workflow-plan.json`, "utf-8"));
    expect(plan.version).toBe(1);
    expect(plan.workflow).toBe("aloop/workflows/test-workflow");
    expect(plan.handlers.start.cycle).toBe(true);
    expect(plan.handlers.start.pipeline).toEqual([
      { kind: "agent", ref: "PROMPT_plan.md" },
      { kind: "agent", ref: "PROMPT_build.md" },
    ]);
  });

  test("returns 404 when session does not exist", async () => {
    const res = recompileSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 404 when project does not exist", async () => {
    const orphanSessionId = deps.sessions.create({
      projectId: "nonexistent-project",
      kind: "standalone",
      workflow: "aloop/workflows/test",
      providerChain: ["provider-1"],
    }).id;
    const res = recompileSessionHandler(orphanSessionId, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("project_not_found");
  });

  test("returns 422 when workflow file does not exist", async () => {
    const noWorkflowId = deps.sessions.create({
      projectId: deps.projects.create({ absPath: join(dir, "proj2") }).id,
      kind: "standalone",
      workflow: "aloop/workflows/nonexistent",
      providerChain: ["provider-1"],
    }).id;
    const res = recompileSessionHandler(noWorkflowId, deps);
    expect(res.status).toBe(422);
    const body = await resJson(res);
    expect(body.error.code).toBe("workflow_compile_failed");
  });

  test("returns 200 for session in any status (pending, running, stopped)", async () => {
    const projectId = deps.projects.create({ absPath: join(dir, "proj3") }).id;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(workflowsDir, "aloop/workflows"), { recursive: true });
    writeFileSync(
      join(workflowsDir, "aloop/workflows/orch-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
`,
      "utf-8",
    );
    writeFileSync(
      join(workflowsDir, "aloop/workflows/child-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: build
`,
      "utf-8",
    );
    const runningId = deps.sessions.create({
      projectId,
      kind: "orchestrator",
      workflow: "aloop/workflows/orch-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(runningId, "running");

    const stoppedId = deps.sessions.create({
      projectId,
      kind: "child",
      workflow: "aloop/workflows/child-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(stoppedId, "stopped");

    const resRunning = recompileSessionHandler(runningId, deps);
    expect(resRunning.status).toBe(200);
    const resStopped = recompileSessionHandler(stoppedId, deps);
    expect(resStopped.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
// getSessionMetricsHandler
// ─────────────────────────────────────────────────────────────────

describe("getSessionMetricsHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-metrics-"));
    deps = makeDeps(dir);
    sessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns 200 with empty metrics array when session has no metrics", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/metrics`);
    const res = getSessionMetricsHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body._v).toBe(1);
    expect(body.session_id).toBe(sessionId);
    expect(body.metrics).toEqual([]);
  });

  test("returns 200 with all session metrics", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg = deps.sessions as any;
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'burn_rate.tokens_since_last_commit', 1234.5, '2025-01-01T00:00:00.000Z')`,
      sessionId,
    );
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'turn_success_rate', 0.8, '2025-01-01T00:01:00.000Z')`,
      sessionId,
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/metrics`);
    const res = getSessionMetricsHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.metrics).toHaveLength(2);
    const names = body.metrics.map((m: { name: string }) => m.name).sort();
    expect(names).toEqual(["burn_rate.tokens_since_last_commit", "turn_success_rate"]);
    const burnRate = body.metrics.find((m: { name: string }) => m.name === "burn_rate.tokens_since_last_commit");
    expect(burnRate?.value).toBe(1234.5);
    expect(burnRate?.updated_at).toBe("2025-01-01T00:00:00.000Z");
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent-id/metrics");
    const res = getSessionMetricsHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns metrics sorted by name", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg = deps.sessions as any;
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'z_metric', 1, '2025-01-01T00:00:00.000Z')`,
      sessionId,
    );
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'a_metric', 2, '2025-01-01T00:00:00.000Z')`,
      sessionId,
    );
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'm_metric', 3, '2025-01-01T00:00:00.000Z')`,
      sessionId,
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/metrics`);
    const res = getSessionMetricsHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.metrics.map((m: { name: string }) => m.name)).toEqual(["a_metric", "m_metric", "z_metric"]);
  });

  test("only returns metrics for that specific session", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reg = deps.sessions as any;
    const otherSessionId = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;

    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'turn_success_rate', 1.0, '2025-01-01T00:00:00.000Z')`,
      sessionId,
    );
    reg._db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at)
       VALUES (?, 'turn_success_rate', 0.5, '2025-01-01T00:00:00.000Z')`,
      otherSessionId,
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/metrics`);
    const res = getSessionMetricsHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.metrics).toHaveLength(1);
    expect(body.metrics[0]?.value).toBe(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────
// getNextTurnHandler
// ─────────────────────────────────────────────────────────────────

describe("getNextTurnHandler", () => {
  let dir: string;
  let workflowsDir: string;
  let deps: SessionsDeps;
  let sessionId: string;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-next-"));
    workflowsDir = mkdtempSync(join(tmpdir(), "aloop-workflows-next-"));
    deps = makeDeps(dir, workflowsDir);
    projectId = deps.projects.create({ absPath: join(dir, "proj1") }).id;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(workflowsDir, "aloop/workflows"), { recursive: true });
    mkdirSync(`${dir}/sessions`, { recursive: true });
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(workflowsDir, { recursive: true, force: true });
  });

  test("returns 404 when session does not exist", async () => {
    const res = getNextTurnHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 409 when session is completed", async () => {
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "completed");
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_terminated");
  });

  test("returns 409 when session is failed", async () => {
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "failed");
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_terminated");
  });

  test("returns 409 when session is paused", async () => {
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "paused");
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_runnable");
  });

  test("returns 409 when session has no workflow", async () => {
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "",
      providerChain: ["provider-1"],
    }).id;
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_no_workflow");
  });

  test("returns 409 when workflow-plan.json does not exist", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
`,
      "utf-8",
    );
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("workflow_plan_missing");
  });

  test("returns 200 with first turn when session is pending and plan exists", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - agent: review
`,
      "utf-8",
    );
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["opencode"],
    }).id;
    mkdirSync(`${dir}/${id}`, { recursive: true });
    writeFileSync(
      `${dir}/${id}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/test-workflow",
        version: 1,
        handlers: {
          start: {
            cycle: true,
            pipeline: [
              { kind: "agent", ref: "PROMPT_plan.md" },
              { kind: "agent", ref: "PROMPT_review.md" },
            ],
          },
        },
      }),
      "utf-8",
    );
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.session_id).toBe(id);
    expect(body.phase).toBe("PROMPT_plan.md");
    expect(body.step_kind).toBe("agent");
    expect(body.cycle_position).toBe(0);
    expect(body.cycle_length).toBe(2);
    expect(body.done).toBe(false);
    expect(body.turn_id).toMatch(/^turn_\d+_/);
    expect(body.provider_chain).toEqual(["opencode"]);
  });

  test("returns 200 with second turn when current_phase is set to first ref", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
      - agent: review
`,
      "utf-8",
    );
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["opencode"],
    }).id;
    mkdirSync(`${dir}/${id}`, { recursive: true });
    writeFileSync(
      `${dir}/${id}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/test-workflow",
        version: 1,
        handlers: {
          start: {
            cycle: true,
            pipeline: [
              { kind: "agent", ref: "PROMPT_plan.md" },
              { kind: "agent", ref: "PROMPT_review.md" },
            ],
          },
        },
      }),
      "utf-8",
    );
    deps.sessions.updatePhase(id, "PROMPT_plan.md", null);
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.phase).toBe("PROMPT_review.md");
    expect(body.cycle_position).toBe(1);
    expect(body.done).toBe(false);
  });

  test("returns done=true when at end of cycle", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
`,
      "utf-8",
    );
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["opencode"],
    }).id;
    mkdirSync(`${dir}/${id}`, { recursive: true });
    writeFileSync(
      `${dir}/${id}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/test-workflow",
        version: 1,
        handlers: {
          start: {
            cycle: true,
            pipeline: [
              { kind: "agent", ref: "PROMPT_plan.md" },
            ],
          },
        },
      }),
      "utf-8",
    );
    deps.sessions.updatePhase(id, "PROMPT_plan.md", null);
    const res = getNextTurnHandler(id, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("completed");
    expect(body.done).toBe(true);
  });

  test("transitions pending session to running when first turn is requested", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(
      join(workflowsDir, "aloop/workflows/test-workflow.yaml"),
      `on:
  start:
    cycle: true
    pipeline:
      - agent: plan
`,
      "utf-8",
    );
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "aloop/workflows/test-workflow",
      providerChain: ["opencode"],
    }).id;
    mkdirSync(`${dir}/${id}`, { recursive: true });
    writeFileSync(
      `${dir}/${id}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/test-workflow",
        version: 1,
        handlers: {
          start: {
            cycle: true,
            pipeline: [{ kind: "agent", ref: "PROMPT_plan.md" }],
          },
        },
      }),
      "utf-8",
    );
    expect(deps.sessions.get(id)!.status).toBe("pending");
    getNextTurnHandler(id, deps);
    expect(deps.sessions.get(id)!.status).toBe("running");
  });
});

// ─────────────────────────────────────────────────────────────────
// runTurnHandler
// ─────────────────────────────────────────────────────────────────

// ─── runTurnHandler test helpers ───────────────────────────────────────────────

type CapturedEvent = { readonly topic: string; readonly data: unknown };

function makeRunTurnEventWriter(): {
  readonly events: CapturedEvent[];
  append: <T>(topic: string, data: T) => Promise<{ _v: 1; id: string; timestamp: string; topic: string; data: T }>;
} {
  const events: CapturedEvent[] = [];
  return {
    events,
    append: async <T>(topic: string, data: T) => {
      events.push({ topic, data });
      return { _v: 1 as const, id: `test-${Date.now()}`, timestamp: new Date().toISOString(), topic, data };
    },
  };
}

function makeFakeAdapter(chunks: readonly AgentChunk[]): ProviderAdapter {
  return {
    id: "opencode",
    capabilities: {
      streaming: true,
      vision: false,
      toolUse: false,
      reasoningEffort: false,
      sessionResume: false,
      costReporting: true,
      maxContextTokens: null,
      quotaProbe: false,
    },
    resolveModel: (() => ({ providerId: "opencode", modelId: "opencode/default" })) as unknown as (
      ref: string,
    ) => ResolvedModel,
    sendTurn: (async function* () {
      for (const c of chunks) yield c;
    }) as unknown as ProviderAdapter["sendTurn"],
  };
}

function makeGrantedPermit(providerId = "opencode"): Permit {
  return {
    id: `perm_${Math.random().toString(36).slice(2, 10)}`,
    sessionId: "s_run",
    composerTurnId: null,
    controlSubagentRunId: null,
    projectId: "proj-1",
    providerId,
    ttlSeconds: 60,
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function makeScheduler(opts: {
  decision?: PermitDecision;
  releaseCalls?: string[];
}): { acquirePermit: RunTurnDeps["scheduler"]["acquirePermit"]; releasePermit: (id: string) => Promise<boolean> } {
  const releaseCalls = opts.releaseCalls ?? [];
  return {
    acquirePermit: async (): Promise<PermitDecision> => {
      if (opts.decision) return opts.decision;
      return { granted: true, permit: makeGrantedPermit() };
    },
    releasePermit: async (id: string) => {
      releaseCalls.push(id);
      return true;
    },
  };
}

function makeRunTurnDeps(opts: {
  dir: string;
  workflowsDir: string;
  events?: ReturnType<typeof makeRunTurnEventWriter>;
  scheduler?: ReturnType<typeof makeScheduler>;
  adapter?: ProviderAdapter;
  providerId?: string;
}): RunTurnDeps {
  const { db } = openDatabase(join(opts.dir, "db.sqlite"));
  const sessions = new SessionRegistry(db);
  const projects = new ProjectRegistry(db);
  const turns = new TurnRegistry(db);
  (sessions as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  const providerRegistry = new ProviderRegistry();
  const adapter = opts.adapter ?? makeFakeAdapter([]);
  providerRegistry.register(adapter);
  const events = opts.events ?? makeRunTurnEventWriter();
  const scheduler = opts.scheduler ?? makeScheduler({});
  return {
    sessions,
    projects,
    sessionsDir: () => opts.dir,
    workflowsDir: opts.workflowsDir,
    events,
    turns,
    scheduler: scheduler as unknown as RunTurnDeps["scheduler"],
    providerRegistry,
  };
}

async function readSseEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice("data: ".length)) as Record<string, unknown>);
}

describe("runTurnHandler", () => {
  let dir: string;
  let workflowsDir: string;
  let deps: RunTurnDeps;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "aloop-run-turn-"));
    workflowsDir = mkdtempSync(join(tmpdir(), "aloop-run-turn-wf-"));
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(workflowsDir, "aloop/workflows"), { recursive: true });
    mkdirSync(`${dir}/proj-1/aloop/templates`, { recursive: true });
    deps = makeRunTurnDeps({ dir, workflowsDir });
  });

  afterEach(() => {
    const reg = deps.sessions as unknown as { _db: { close(): void } };
    reg._db?.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(workflowsDir, { recursive: true, force: true });
  });

  // Helper: create a project + session in a fresh test, both linked.
  function createProjectAndSession(
    workflow = "aloop/workflows/run-turn",
    kind: "standalone" | "orchestrator" | "child" = "standalone",
  ): { projectId: string; sessionId: string } {
    const projectId = deps.projects.create({ absPath: join(dir, "proj-1") }).id;
    const sessionId = deps.sessions.create({
      projectId,
      kind,
      workflow,
      providerChain: ["opencode"],
    }).id;
    return { projectId, sessionId };
  }

  // ── error paths (no plan file / no scheduler interaction) ──────────────────

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent/run-turn", { method: "POST" });
    const res = await runTurnHandler("nonexistent", req, deps);
    expect(res.status).toBe(404);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_not_found");
  });

  for (const status of ["completed", "failed", "archived"] as const) {
    test(`returns 409 session_terminated when session is ${status}`, async () => {
      const { sessionId } = createProjectAndSession();
      deps.sessions.updateStatus(sessionId, status);
      const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
      const res = await runTurnHandler(sessionId, req, deps);
      expect(res.status).toBe(409);
      const body = await resJson(res);
      expect(body.error.code).toBe("session_terminated");
      expect(body.error.message).toContain(status);
    });
  }

  for (const status of ["paused", "stopped"] as const) {
    test(`returns 409 session_not_runnable when session is ${status}`, async () => {
      const { sessionId } = createProjectAndSession();
      deps.sessions.updateStatus(sessionId, status);
      const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
      const res = await runTurnHandler(sessionId, req, deps);
      expect(res.status).toBe(409);
      const body = await resJson(res);
      expect(body.error.code).toBe("session_not_runnable");
    });
  }

  test("returns 409 session_no_workflow when session has no workflow", async () => {
    const projectId = deps.projects.create({ absPath: join(dir, "proj-1") }).id;
    const id = deps.sessions.create({
      projectId,
      kind: "standalone",
      workflow: "",
      providerChain: ["opencode"],
    }).id;
    const req = new Request(`http://localhost/v1/sessions/${id}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(id, req, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("session_no_workflow");
  });

  test("returns 409 workflow_plan_missing when workflow-plan.json does not exist", async () => {
    const { sessionId } = createProjectAndSession();
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(409);
    const body = await resJson(res);
    expect(body.error.code).toBe("workflow_plan_missing");
    expect(body.error.message).toContain("workflow-plan.json");
  });

  test("returns 500 workflow_plan_read_failed when workflow-plan.json is malformed", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(`${dir}/${sessionId}/workflow-plan.json`, "this is not json {{{", "utf-8");
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(500);
    const body = await resJson(res);
    expect(body.error.code).toBe("workflow_plan_read_failed");
  });

  test("returns 422 workflow_plan_invalid when plan has no 'start' handler", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({ _v: 1, workflow: "x", version: 1, handlers: {} }),
      "utf-8",
    );
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(422);
    const body = await resJson(res);
    expect(body.error.code).toBe("workflow_plan_invalid");
  });

  // ── empty / terminal pipeline paths ───────────────────────────────────────

  test("returns 200 done=true when start handler has empty pipeline", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: { start: { cycle: false, pipeline: [] } },
      }),
      "utf-8",
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.session_id).toBe(sessionId);
    expect(body.status).toBe("completed");
    expect(body.done).toBe(true);
    // session status should be updated to completed
    expect(deps.sessions.get(sessionId)!.status).toBe("completed");
  });

  test("returns 200 done=true when current_phase is past last cycle step", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: { cycle: true, pipeline: [{ kind: "agent", ref: "PROMPT_a.md" }] },
        },
      }),
      "utf-8",
    );
    deps.sessions.updatePhase(sessionId, "PROMPT_a.md", null);
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.status).toBe("completed");
    expect(body.done).toBe(true);
  });

  // ── exec kind fast path ────────────────────────────────────────────────────

  test("returns 200 done=true immediately for exec-kind steps (no scheduler/provider)", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");

    let acquireCalls = 0;
    const trackingScheduler = {
      acquirePermit: async () => {
        acquireCalls++;
        return { granted: true, permit: makeGrantedPermit() };
      },
      releasePermit: async () => true,
    };
    // Replace scheduler with the tracking one
    (deps as unknown as { scheduler: typeof trackingScheduler }).scheduler = trackingScheduler;
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: { cycle: false, pipeline: [{ kind: "exec", ref: "echo hi" }] },
        },
      }),
      "utf-8",
    );
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.turn_id).toMatch(/^turn_\d+_/);
    expect(body.status).toBe("completed");
    expect(body.phase).toBe("echo hi");
    expect(body.done).toBe(true);
    // exec kind must not call scheduler.acquirePermit
    expect(acquireCalls).toBe(0);
  });

  // ── scheduler-denied path ──────────────────────────────────────────────────

  test("returns 200 granted=false when scheduler denies permit, reverts pending→pending", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const denied: PermitDecision = {
      granted: false,
      reason: "concurrency_cap",
      gate: "concurrency",
      details: { cap: 1, active: 1 },
    };
    const releaseCalls: string[] = [];
    (deps as unknown as { scheduler: ReturnType<typeof makeScheduler> }).scheduler = makeScheduler({
      decision: denied,
      releaseCalls,
    });
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: { cycle: false, pipeline: [{ kind: "agent", ref: "PROMPT_a.md" }] },
        },
      }),
      "utf-8",
    );

    // session is pending
    expect(deps.sessions.get(sessionId)!.status).toBe("pending");
    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const body = await resJson(res);
    expect(body.granted).toBe(false);
    expect(body.reason).toBe("concurrency_cap");
    expect(body.gate).toBe("concurrency");
    expect(body.details).toEqual({ cap: 1, active: 1 });
    // session should remain pending (reverted from the auto-promoted 'running' state)
    expect(deps.sessions.get(sessionId)!.status).toBe("pending");
    // permit was denied, so it must not be released
    expect(releaseCalls.length).toBe(0);
  });

  // ── happy path: stream chunks, accumulate usage, complete cycle ────────────

  test("streams chunks, updates turn, and emits end event on successful run", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(`${dir}/proj-1/aloop/templates/PROMPT_a.md`, "You are a helpful agent.\n", "utf-8");

    const chunks: AgentChunk[] = [
      { type: "text", content: { delta: "Hello" } },
      { type: "text", content: { delta: " world" } },
      { type: "usage", content: { tokensIn: 10, tokensOut: 20, costUsd: 0.5 }, final: true },
    ];
    const releaseCalls: string[] = [];
    (deps as unknown as { providerRegistry: ProviderRegistry }).providerRegistry = new ProviderRegistry();
    deps.providerRegistry.register(makeFakeAdapter(chunks));
    (deps as unknown as { scheduler: ReturnType<typeof makeScheduler> }).scheduler = makeScheduler({ releaseCalls });
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: { cycle: true, pipeline: [{ kind: "agent", ref: "PROMPT_a.md" }] },
        },
      }),
      "utf-8",
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const sseEvents = await readSseEvents(res);
    // start + 3 chunks + final usage + end
    expect(sseEvents.length).toBe(6);
    expect(sseEvents[0]!.type).toBe("start");
    expect(sseEvents[1]!.type).toBe("text");
    expect(sseEvents[2]!.type).toBe("text");
    expect(sseEvents[3]!.type).toBe("usage");
    expect(sseEvents[4]!.type).toBe("usage");
    expect(sseEvents[4]!.final).toBe(true);
    expect(sseEvents[4]!.content).toEqual({ tokens: 30, cost_usd: 0.5 });
    expect(sseEvents[5]!.type).toBe("end");
    expect(sseEvents[5]!.status).toBe("completed");

    // session marked completed since pipeline was single-step
    expect(deps.sessions.get(sessionId)!.status).toBe("completed");
    // permit must have been released
    expect(releaseCalls.length).toBe(1);
  });

  test("advances current_phase to next pipeline step on successful non-terminal turn", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(`${dir}/proj-1/aloop/templates/PROMPT_a.md`, "step a\n", "utf-8");

    (deps as unknown as { providerRegistry: ProviderRegistry }).providerRegistry = new ProviderRegistry();
    deps.providerRegistry.register(makeFakeAdapter([{ type: "text", content: { delta: "ok" } }]));
    (deps as unknown as { scheduler: ReturnType<typeof makeScheduler> }).scheduler = makeScheduler({});
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: {
            cycle: true,
            pipeline: [
              { kind: "agent", ref: "PROMPT_a.md" },
              { kind: "agent", ref: "PROMPT_b.md" },
            ],
          },
        },
      }),
      "utf-8",
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const sseEvents = await readSseEvents(res);
    // end event should advertise the next phase
    const endEvent = sseEvents.find((e) => e.type === "end");
    expect(endEvent).toBeDefined();
    expect(endEvent!.status).toBe("running");
    expect(endEvent!.next_phase).toBe("PROMPT_b.md");
    // session should now have current_phase set to PROMPT_b.md
    expect(deps.sessions.get(sessionId)!.currentPhase).toBe("PROMPT_b.md");
  });

  // ── error path inside the stream ───────────────────────────────────────────

  test("sets session status to failed when adapter throws mid-stream", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    writeFileSync(`${dir}/proj-1/aloop/templates/PROMPT_a.md`, "step a\n", "utf-8");

    const failingAdapter: ProviderAdapter = {
      id: "opencode",
      capabilities: {
        streaming: true,
        vision: false,
        toolUse: false,
        reasoningEffort: false,
        sessionResume: false,
        costReporting: false,
        maxContextTokens: null,
        quotaProbe: false,
      },
      resolveModel: (() => ({ providerId: "opencode", modelId: "opencode/default" })) as unknown as (
        ref: string,
      ) => ResolvedModel,
      sendTurn: (async function* () {
        yield { type: "text", content: { delta: "before-fail" } };
        throw new Error("provider exploded");
      }) as unknown as ProviderAdapter["sendTurn"],
    };
    const releaseCalls: string[] = [];
    (deps as unknown as { providerRegistry: ProviderRegistry }).providerRegistry = new ProviderRegistry();
    deps.providerRegistry.register(failingAdapter);
    (deps as unknown as { scheduler: ReturnType<typeof makeScheduler> }).scheduler = makeScheduler({ releaseCalls });
    const { sessionId } = createProjectAndSession();
    mkdirSync(`${dir}/${sessionId}`, { recursive: true });
    writeFileSync(
      `${dir}/${sessionId}/workflow-plan.json`,
      JSON.stringify({
        _v: 1,
        workflow: "aloop/workflows/run-turn",
        version: 1,
        handlers: {
          start: { cycle: true, pipeline: [{ kind: "agent", ref: "PROMPT_a.md" }] },
        },
      }),
      "utf-8",
    );

    const req = new Request(`http://localhost/v1/sessions/${sessionId}/run-turn`, { method: "POST" });
    const res = await runTurnHandler(sessionId, req, deps);
    expect(res.status).toBe(200);
    const sseEvents = await readSseEvents(res);
    const errorEvent = sseEvents.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBe("provider exploded");
    const endEvent = sseEvents.find((e) => e.type === "end");
    expect(endEvent).toBeDefined();
    expect(endEvent!.status).toBe("failed");
    // session should be marked failed
    expect(deps.sessions.get(sessionId)!.status).toBe("failed");
    // permit should still be released
    expect(releaseCalls.length).toBe(1);
  });
});
