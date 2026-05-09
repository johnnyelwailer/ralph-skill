import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, ProjectRegistry, SessionRegistry } from "@aloop/state-sqlite";
import {
  getSessionHandler,
  deleteSessionHandler,
  resumeSessionHandler,
  pauseSessionHandler,
  unpauseSessionHandler,
  listSessionQueueHandler,
  deleteSessionQueueItemHandler,
} from "./sessions-handlers.ts";
import type { SessionsDeps } from "./sessions-handlers.ts";

function makeDeps(dir: string): SessionsDeps {
  const { db } = openDatabase(join(dir, "db.sqlite"));
  const sessions = new SessionRegistry(db);
  const projects = new ProjectRegistry(db);
  // Close db when deps is torn down — stored on registry via closure
  (sessions as unknown as { _db: ReturnType<typeof openDatabase>["db"] })._db = db;
  return { sessions, projects };
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
    const body = await (res as Response).json();
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
    const body = await (res as Response).json();
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

  test("returns 204 when session is deleted", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(204);
    // Verify it's gone
    const getRes = getSessionHandler(sessionId, deps);
    expect(getRes.status).toBe(404);
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
    expect(res.status).toBe(204);
  });

  test("accepts mode=graceful query param without error", async () => {
    const req = new Request(`http://localhost/v1/sessions/${sessionId}?mode=graceful`, {
      method: "DELETE",
    });
    const res = deleteSessionHandler(sessionId, req, deps);
    expect(res.status).toBe(204);
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

  test("returns 400 when session is in pending status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("pending");
  });

  test("returns 400 when session is in running status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "running");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot resume session in status");
    expect(body.error.message).toContain("running");
  });

  test("returns 400 when session is in completed status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "completed");
    const res = resumeSessionHandler(id, deps);
    expect(res.status).toBe(400);
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

  test("returns 400 when session is in pending status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = pauseSessionHandler(id, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot pause session in status");
    expect(body.error.message).toContain("pending");
  });

  test("returns 400 when session is in stopped status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "stopped");
    const res = pauseSessionHandler(id, deps);
    expect(res.status).toBe(400);
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

  test("returns 400 when session is in running status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    deps.sessions.updateStatus(id, "running");
    const res = unpauseSessionHandler(id, deps);
    expect(res.status).toBe(400);
    const body = await (res as Response).json();
    expect(body.error.message).toContain("cannot unpause session in status");
    expect(body.error.message).toContain("running");
  });

  test("returns 400 when session is in pending status", async () => {
    const id = deps.sessions.create({
      projectId: "proj-1",
      kind: "standalone",
      workflow: "test-workflow",
      providerChain: ["provider-1"],
    }).id;
    const res = unpauseSessionHandler(id, deps);
    expect(res.status).toBe(400);
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
