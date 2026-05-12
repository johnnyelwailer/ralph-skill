import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import {
  advanceSessionIteration,
  deleteQueueItem,
  deleteSession,
  getQueueItem,
  getSessionById,
  insertQueueItem,
  insertSession,
  listQueueItems,
  listSessionsFromDb,
  updateSessionLastEventId,
  updateSessionPhase,
  updateSessionStatus,
} from "./sessions-queries.ts";
import type { Session } from "./sessions-store.ts";

function makeSession(overrides: Partial<{
  id: string;
  projectId: string;
  kind: string;
  status: string;
  workflow: string;
  providerChain: string[];
  issueRef: string | null;
  parentSessionId: string | null;
  maxIterations: number | null;
  notes: string;
  currentIteration: number;
  currentPhase: string | null;
  currentProviderId: string | null;
  lastEventId: string | null;
  createdAt: string;
  updatedAt: string;
  stoppedAt: string | null;
  startedAt: string | null;
}> = {}): Session {
  const now = "2025-01-01T00:00:00.000Z";
  return {
    id: "s_test1",
    projectId: "p_proj1",
    kind: "standalone",
    status: "pending",
    workflow: "plan-build-review",
    providerChain: ["opencode"],
    issueRef: null,
    parentSessionId: null,
    maxIterations: null,
    notes: "",
    currentIteration: 0,
    currentPhase: null,
    currentProviderId: null,
    lastEventId: null,
    createdAt: now,
    updatedAt: now,
    stoppedAt: null,
    startedAt: null,
    ...overrides,
  };
}

function makeQueueItem(overrides: Partial<{
  id: string;
  sessionId: string;
  filename: string;
  instruction: string;
  affectsCompletedWork: string;
  position: number;
  createdAt: string;
}> = {}): Parameters<typeof insertQueueItem>[1] {
  const now = "2025-01-01T00:00:00.000Z";
  return {
    id: "q_1",
    sessionId: "s_test1",
    filename: "plan.md",
    instruction: "write the spec",
    affectsCompletedWork: "unknown",
    position: 0,
    createdAt: now,
    ...overrides,
  };
}

// FOREIGN KEY constraint failures in tests
// (e.g., "p_proj2", "s_parentX") that don't exist in the projects table.
// The database has PRAGMA foreign_keys = ON, so insertSession fails for any
// session whose projectId doesn't reference an existing projects row.
// Root cause: test setup doesn't seed the projects table before inserting
// sessions. Fix: create a real project row in beforeEach, or use a project
// registry to create projects for each test session.
// Affected tests: insertSession stores all session fields, listSessionsFromDb
// filters by parentSessionId, getQueueItem finds queue item by id and sessionId
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-sq-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // ── insertSession / getSessionById ─────────────────────────────────────────

  test("insertSession and getSessionById round-trip", () => {
    const s = makeSession({ id: "s_round", projectId: "p_x" });
    insertSession(db, s);
    const found = getSessionById(db, "s_round");
    expect(found).not.toBeUndefined();
    expect(found!.id).toBe("s_round");
    expect(found!.projectId).toBe("p_x");
    expect(found!.workflow).toBe("plan-build-review");
    expect(found!.providerChain).toEqual(["opencode"]);
  });

  test("getSessionById returns undefined for unknown id", () => {
    expect(getSessionById(db, "nonexistent")).toBeUndefined();
  });

  test("insertSession stores all session fields", () => {
    const now = "2025-06-15T10:30:00.000Z";
    const s = makeSession({
      id: "s_allfields",
      projectId: "p_proj2",
      kind: "child",
      status: "running",
      workflow: "debug-only",
      providerChain: ["codex", "claude"],
      issueRef: "issue-42",
      parentSessionId: "s_parent1",
      maxIterations: 10,
      notes: "some notes",
      currentIteration: 3,
      currentPhase: "pipeline",
      currentProviderId: "codex",
      lastEventId: "evt_99",
      createdAt: now,
      updatedAt: now,
      stoppedAt: null,
      startedAt: now,
    });
    insertSession(db, s);
    const found = getSessionById(db, "s_allfields")!;
    expect(found.kind).toBe("child");
    expect(found.status).toBe("running");
    expect(found.workflow).toBe("debug-only");
    expect(found.providerChain).toEqual(["codex", "claude"]);
    expect(found.issueRef).toBe("issue-42");
    expect(found.parentSessionId).toBe("s_parent1");
    expect(found.maxIterations).toBe(10);
    expect(found.notes).toBe("some notes");
    expect(found.currentIteration).toBe(3);
    expect(found.currentPhase).toBe("pipeline");
    expect(found.currentProviderId).toBe("codex");
    expect(found.lastEventId).toBe("evt_99");
    expect(found.startedAt).toBe(now);
  });

  // ── listSessionsFromDb ─────────────────────────────────────────────────────

  test("listSessionsFromDb returns all sessions when no filter", () => {
    insertSession(db, makeSession({ id: "s_a", projectId: "p_a" }));
    insertSession(db, makeSession({ id: "s_b", projectId: "p_b" }));
    const rows = listSessionsFromDb(db);
    expect(rows).toHaveLength(2);
  });

  test("listSessionsFromDb filters by projectId", () => {
    insertSession(db, makeSession({ id: "s_a", projectId: "p_filter" }));
    insertSession(db, makeSession({ id: "s_b", projectId: "p_other" }));
    const rows = listSessionsFromDb(db, { projectId: "p_filter" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("s_a");
  });

  test("listSessionsFromDb filters by status", () => {
    insertSession(db, makeSession({ id: "s_a", status: "running" }));
    insertSession(db, makeSession({ id: "s_b", status: "completed" }));
    insertSession(db, makeSession({ id: "s_c", status: "running" }));
    const rows = listSessionsFromDb(db, { status: ["running"] });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "running")).toBe(true);
  });

  test("listSessionsFromDb filters by kind", () => {
    insertSession(db, makeSession({ id: "s_a", kind: "standalone" }));
    insertSession(db, makeSession({ id: "s_b", kind: "orchestrator" }));
    const rows = listSessionsFromDb(db, { kind: ["orchestrator"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("orchestrator");
  });

  test("listSessionsFromDb filters by parentSessionId", () => {
    insertSession(db, makeSession({ id: "s_a", parentSessionId: "s_parentX" }));
    insertSession(db, makeSession({ id: "s_b", parentSessionId: null }));
    const rows = listSessionsFromDb(db, { parentSessionId: "s_parentX" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("s_a");
  });

  test("listSessionsFromDb respects limit", () => {
    for (let i = 0; i < 5; i++) {
      insertSession(db, makeSession({ id: `s_${i}` }));
    }
    const rows = listSessionsFromDb(db, { limit: 3 });
    expect(rows).toHaveLength(3);
  });

  test("listSessionsFromDb returns empty array when no matches", () => {
    const rows = listSessionsFromDb(db, { projectId: "nonexistent" });
    expect(rows).toHaveLength(0);
  });

  // ── updateSessionStatus ───────────────────────────────────────────────────

  test("updateSessionStatus changes status", () => {
    insertSession(db, makeSession({ id: "s_upd", status: "pending" }));
    updateSessionStatus(db, "s_upd", "running", "2025-07-01T00:00:00.000Z");
    const found = getSessionById(db, "s_upd");
    expect(found!.status).toBe("running");
    expect(found!.updatedAt).toBe("2025-07-01T00:00:00.000Z");
  });

  test("updateSessionStatus sets stoppedAt when provided", () => {
    insertSession(db, makeSession({ id: "s_stop", status: "running" }));
    updateSessionStatus(
      db,
      "s_stop",
      "stopped",
      "2025-07-01T00:00:00.000Z",
      "2025-07-01T00:05:00.000Z",
    );
    const found = getSessionById(db, "s_stop");
    expect(found!.status).toBe("stopped");
    expect(found!.stoppedAt).toBe("2025-07-01T00:05:00.000Z");
  });

  test("updateSessionStatus sets startedAt when provided", () => {
    insertSession(db, makeSession({ id: "s_start", status: "pending" }));
    updateSessionStatus(
      db,
      "s_start",
      "running",
      "2025-07-01T00:00:00.000Z",
      undefined,
      "2025-07-01T00:01:00.000Z",
    );
    const found = getSessionById(db, "s_start");
    expect(found!.status).toBe("running");
    expect(found!.startedAt).toBe("2025-07-01T00:01:00.000Z");
  });

  test("updateSessionStatus sets both stoppedAt and startedAt", () => {
    insertSession(db, makeSession({ id: "s_both", status: "running" }));
    updateSessionStatus(
      db,
      "s_both",
      "completed",
      "2025-07-01T00:00:00.000Z",
      "2025-07-01T00:10:00.000Z",
      "2025-07-01T00:00:30.000Z",
    );
    const found = getSessionById(db, "s_both");
    expect(found!.status).toBe("completed");
    expect(found!.stoppedAt).toBe("2025-07-01T00:10:00.000Z");
    expect(found!.startedAt).toBe("2025-07-01T00:00:30.000Z");
  });

  // ── updateSessionPhase ───────────────────────────────────────────────────

  test("updateSessionPhase changes phase and provider", () => {
    insertSession(db, makeSession({ id: "s_phase" }));
    updateSessionPhase(db, "s_phase", "finalizer", "provider_xyz", "2025-08-01T00:00:00.000Z");
    const found = getSessionById(db, "s_phase");
    expect(found!.currentPhase).toBe("finalizer");
    expect(found!.currentProviderId).toBe("provider_xyz");
    expect(found!.updatedAt).toBe("2025-08-01T00:00:00.000Z");
  });

  // ── advanceSessionIteration ───────────────────────────────────────────────

  test("advanceSessionIteration increments currentIteration", () => {
    insertSession(db, makeSession({ id: "s_iter", currentIteration: 4 }));
    advanceSessionIteration(db, "s_iter", "2025-09-01T00:00:00.000Z");
    const found = getSessionById(db, "s_iter");
    expect(found!.currentIteration).toBe(5);
    expect(found!.updatedAt).toBe("2025-09-01T00:00:00.000Z");
  });

  // ── updateSessionLastEventId ──────────────────────────────────────────────

  test("updateSessionLastEventId sets lastEventId", () => {
    insertSession(db, makeSession({ id: "s_evt", lastEventId: null }));
    updateSessionLastEventId(db, "s_evt", "evt_new", "2025-10-01T00:00:00.000Z");
    const found = getSessionById(db, "s_evt");
    expect(found!.lastEventId).toBe("evt_new");
    expect(found!.updatedAt).toBe("2025-10-01T00:00:00.000Z");
  });

  // ── deleteSession ────────────────────────────────────────────────────────

  test("deleteSession removes the session", () => {
    insertSession(db, makeSession({ id: "s_del" }));
    deleteSession(db, "s_del");
    expect(getSessionById(db, "s_del")).toBeUndefined();
  });

  test("deleteSession is safe on non-existent id", () => {
    expect(() => deleteSession(db, "s_none")).not.toThrow();
  });

  // ── Queue: insertQueueItem / listQueueItems / getQueueItem / deleteQueueItem ──

  test("insertQueueItem and listQueueItems round-trip", () => {
    const session = makeSession({ id: "s_q1" });
    insertSession(db, session);
    const item = makeQueueItem({ id: "q_a", sessionId: "s_q1" });
    insertQueueItem(db, item);
    const rows = listQueueItems(db, "s_q1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("q_a");
    expect(rows[0]!.filename).toBe("plan.md");
    expect(rows[0]!.affectsCompletedWork).toBe("unknown");
  });

  test("listQueueItems returns empty array for session with no queue items", () => {
    const session = makeSession({ id: "s_empty" });
    insertSession(db, session);
    expect(listQueueItems(db, "s_empty")).toHaveLength(0);
  });

  test("listQueueItems orders by position ASC, createdAt ASC", () => {
    const session = makeSession({ id: "s_order" });
    insertSession(db, session);
    insertQueueItem(db, makeQueueItem({ id: "q_third", sessionId: "s_order", position: 2 }));
    insertQueueItem(db, makeQueueItem({ id: "q_first", sessionId: "s_order", position: 0 }));
    insertQueueItem(db, makeQueueItem({ id: "q_second", sessionId: "s_order", position: 1 }));
    const rows = listQueueItems(db, "s_order");
    expect(rows[0]!.id).toBe("q_first");
    expect(rows[1]!.id).toBe("q_second");
    expect(rows[2]!.id).toBe("q_third");
  });

  test("getQueueItem finds queue item by id and sessionId", () => {
    const session = makeSession({ id: "s_getq" });
    insertSession(db, session);
    insertQueueItem(db, makeQueueItem({ id: "q_find", sessionId: "s_getq" }));
    const found = getQueueItem(db, "q_find", "s_getq");
    expect(found).not.toBeUndefined();
    expect(found!.id).toBe("q_find");
  });

  test("getQueueItem returns undefined when not found", () => {
    expect(getQueueItem(db, "q_missing", "s_missing")).toBeUndefined();
  });

  test("deleteQueueItem removes the item", () => {
    const session = makeSession({ id: "s_delq" });
    insertSession(db, session);
    insertQueueItem(db, makeQueueItem({ id: "q_del", sessionId: "s_delq" }));
    deleteQueueItem(db, "q_del");
    expect(getQueueItem(db, "q_del", "s_delq")).toBeUndefined();
  });

  test("deleteQueueItem is safe on non-existent id", () => {
    expect(() => deleteQueueItem(db, "q_none")).not.toThrow();
  });
});
