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
  deleteSessionHandler,
  resumeSessionHandler,
  pauseSessionHandler,
  unpauseSessionHandler,
  listSessionQueueHandler,
  deleteSessionQueueItemHandler,
  steerSessionHandler,
  recompileSessionHandler,
} from "./sessions-handlers.ts";
import type { SessionsDeps } from "./sessions-handlers.ts";

async function resJson<T>(res: Response): Promise<T> {
  return JSON.parse(await res.text()) as T;
}

function makeDeps(dir: string): SessionsDeps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const sessions = new SessionRegistry(db);
  const projects = new ProjectRegistry(db);
  (sessions as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  return { sessions, projects, sessionsDir: () => dir };
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
    const body = await resJson<{ _v: number; id: string; kind: string; status: string; workflow: string; provider_chain: readonly string[] }>(res);
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
    const body = await resJson<{ error: { code: string } }>(res);
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
    const body = await (getRes as Response).json();
    expect(body.status).toBe("stopped");
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent-id", {
      method: "DELETE",
    });
    const res = deleteSessionHandler("nonexistent-id", req, deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 400 when mode query param is invalid", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=invalid`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
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
    const body = await (getRes as Response).json();
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
    const body = await (getRes as Response).json();
    expect(body.status).toBe("stopped");
  });
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("completed");
  });

  test("returns 404 when session does not exist", async () => {
    const res = resumeSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot pause session in status");
    expect(body.error.message).toContain("stopped");
  });

  test("returns 404 when session does not exist", async () => {
    const res = pauseSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot unpause session in status");
    expect(body.error.message).toContain("pending");
  });

  test("returns 404 when session does not exist", async () => {
    const res = unpauseSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].filename).toBe("steer-1.md");
    expect(body.items[0].instruction).toBe("do the thing");
    expect(body.items[1].filename).toBe("steer-2.md");
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/v1/sessions/nonexistent/queue");
    const res = listSessionQueueHandler("nonexistent", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
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
    const body = await (listRes as Response).json();
    expect(body.items).toEqual([]);
  });

  test("returns 404 when session does not exist", async () => {
    const req = new Request(`http://localhost/v1/sessions/nonexistent/queue/${queueItemId}`, {
      method: "DELETE",
    });
    const res = deleteSessionQueueItemHandler("nonexistent", queueItemId, deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].kind).toBe("orchestrator");
  });

  test("filters sessions by parent query param", async () => {
    const parentId = deps.sessions.create({ id: "s_parent", projectId, kind: "orchestrator", workflow: "wf", providerChain: ["p"] }).id;
    deps.sessions.create({ id: "s_child", projectId, kind: "child", workflow: "wf", providerChain: ["p"], parentSessionId: parentId });
    const req = new Request(`http://localhost/v1/sessions?parent=${parentId}`);
    const res = listSessionsHandler(req, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.notes).toBe("test session");
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();

    // Verify the stored queue item has the correct default
    const queueReq = new Request(`http://localhost/v1/sessions/${sessionId}/queue`);
    const queueRes = listSessionQueueHandler(sessionId, deps);
    const queueBody = await (queueRes as Response).json();
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
      const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.error.code).toBe("bad_request");
  });
});

// ─────────────────────────────────────────────────────────────────
// recompileSessionHandler
// ─────────────────────────────────────────────────────────────────

describe("recompileSessionHandler", () => {
  let dir: string;
  let deps: SessionsDeps;
  let sessionId: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aloop-session-recompile-"));
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

  test("returns 200 and writes workflow-plan.json", async () => {
    const res = recompileSessionHandler(sessionId, deps);
    expect(res.status).toBe(200);
    const body = await (res as Response).json();
    expect(body._v).toBe(1);
    expect(body.session_id).toBe(sessionId);
    expect(body.workflow_plan_version).toBe(1);
    expect(body.workflow).toBe("test-workflow");
  });

  test("workflow-plan.json is written to session dir", async () => {
    recompileSessionHandler(sessionId, deps);
    const sessionDir = `${dir}/${sessionId}`;
    const { existsSync, readFileSync } = require("node:fs");
    expect(existsSync(`${sessionDir}/workflow-plan.json`)).toBe(true);
    const plan = JSON.parse(readFileSync(`${sessionDir}/workflow-plan.json`, "utf-8"));
    expect(plan.version).toBe(1);
    expect(plan.workflow).toBe("test-workflow");
    expect(plan.compiled_at).toBeTruthy();
  });

  test("returns 404 when session does not exist", async () => {
    const res = recompileSessionHandler("nonexistent-id", deps);
    expect(res.status).toBe(404);
    const body = await (res as Response).json();
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns 200 for session in any status (pending, running, stopped)", async () => {
    const runningId = deps.sessions.create({
      projectId: "proj-1",
      kind: "orchestrator",
      workflow: "orch-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(runningId, "running");

    const stoppedId = deps.sessions.create({
      projectId: "proj-1",
      kind: "child",
      workflow: "child-workflow",
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
    const body = await (res as Response).json();
    expect(body._v).toBe(1);
    expect(body.session_id).toBe(sessionId);
    expect(body.metrics).toEqual([]);
  });

  test("returns 200 with all session metrics", async () => {
    const reg = deps.sessions as unknown as { _db: { run(sql: string): void } };
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
    expect(body.error.code).toBe("session_not_found");
  });

  test("returns metrics sorted by name", async () => {
    const reg = deps.sessions as unknown as { _db: { run(sql: string): void } };
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
    const body = await (res as Response).json();
    expect(body.metrics.map((m: { name: string }) => m.name)).toEqual(["a_metric", "m_metric", "z_metric"]);
  });

  test("only returns metrics for that specific session", async () => {
    const reg = deps.sessions as unknown as { _db: { run(sql: string): void } };
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
    const body = await (res as Response).json();
    expect(body.metrics).toHaveLength(1);
    expect(body.metrics[0]?.value).toBe(1.0);
  });
});
