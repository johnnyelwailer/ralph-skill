import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { SessionRegistry } from "./sessions-registry.ts";
import { SessionNotFoundError } from "./sessions-store.ts";
import type { AffectsCompletedWork } from "./sessions-store.ts";

describe("SessionRegistry", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];
  let registry: SessionRegistry;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-registry-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
    registry = new SessionRegistry(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  test("create inserts a session with all required fields", () => {
    const now = "2025-01-01T00:00:00.000Z";
    const session = registry.create({
      id: "s_test123",
      projectId: "p_proj1",
      kind: "standalone",
      workflow: "plan-build-review",
      providerChain: ["opencode", "claude"],
      now,
    });

    expect(session.id).toBe("s_test123");
    expect(session.projectId).toBe("p_proj1");
    expect(session.kind).toBe("standalone");
    expect(session.status).toBe("pending");
    expect(session.workflow).toBe("plan-build-review");
    expect(session.providerChain).toEqual(["opencode", "claude"]);
    expect(session.parentSessionId).toBeNull();
    expect(session.maxIterations).toBeNull();
    expect(session.notes).toBe("");
    expect(session.currentIteration).toBe(0);
    expect(session.currentPhase).toBeNull();
    expect(session.currentProviderId).toBeNull();
    expect(session.lastEventId).toBeNull();
    expect(session.createdAt).toBe(now);
    expect(session.updatedAt).toBe(now);
    expect(session.stoppedAt).toBeNull();
    expect(session.startedAt).toBeNull();
  });

  test("create auto-generates id when not provided", () => {
    const session = registry.create({
      projectId: "p_proj1",
      kind: "orchestrator",
      workflow: "default",
      providerChain: [],
    });
    expect(session.id).not.toBeUndefined();
    expect(session.id.length).toBeGreaterThan(0);
    expect(registry.get(session.id)).toBeDefined();
  });

  test("create sets default values for optional fields", () => {
    const session = registry.create({
      id: "s_opts",
      projectId: "p_proj1",
      kind: "child",
      workflow: "test",
      providerChain: [],
      parentSessionId: "s_parent1",
      issueRef: "issue/123",
      maxIterations: 5,
      notes: "test note",
    });
    expect(session.parentSessionId).toBe("s_parent1");
    expect(session.issueRef).toBe("issue/123");
    expect(session.maxIterations).toBe(5);
    expect(session.notes).toBe("test note");
  });

  test("create uses provided now timestamp", () => {
    const now = "2024-06-15T12:00:00.000Z";
    const session = registry.create({
      id: "s_ts",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    expect(session.createdAt).toBe(now);
    expect(session.updatedAt).toBe(now);
  });

  // ─── get ─────────────────────────────────────────────────────────────────────

  test("get returns undefined for unknown id", () => {
    expect(registry.get("s_does_not_exist")).toBeUndefined();
  });

  test("get finds an inserted session", () => {
    registry.create({
      id: "s_find",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const found = registry.get("s_find");
    expect(found?.id).toBe("s_find");
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  test("list returns empty array when no sessions exist", () => {
    expect(registry.list()).toEqual([]);
  });

  test("list returns sessions ordered by created_at then id", () => {
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({
      id: "s_b",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    registry.create({
      id: "s_a",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
      now,
    });
    const items = registry.list();
    expect(items.map((s) => s.id)).toEqual(["s_a", "s_b"]);
  });

  test("list filters by projectId", () => {
    registry.create({
      id: "s_p1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_p2",
      projectId: "p_2",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const items = registry.list({ projectId: "p_1" });
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe("s_p1");
  });

  test("list filters by single status", () => {
    registry.create({
      id: "s_r1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_r2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updateStatus("s_r1", "running");
    const items = registry.list({ status: ["running"] });
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe("s_r1");
  });

  test("list filters by multiple statuses", () => {
    registry.create({
      id: "s_1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_3",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updateStatus("s_1", "running");
    registry.updateStatus("s_2", "completed");
    const items = registry.list({ status: ["running", "completed"] });
    expect(items.map((s) => s.id).sort()).toEqual(["s_1", "s_2"]);
  });

  test("list filters by kind", () => {
    registry.create({
      id: "s_orc",
      projectId: "p_1",
      kind: "orchestrator",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_ch",
      projectId: "p_1",
      kind: "child",
      workflow: "test",
      providerChain: [],
    });
    const items = registry.list({ kind: ["orchestrator"] });
    expect(items.length).toBe(1);
    expect(items[0]!.kind).toBe("orchestrator");
  });

  test("list filters by parentSessionId", () => {
    registry.create({
      id: "s_par",
      projectId: "p_1",
      kind: "orchestrator",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_ch1",
      projectId: "p_1",
      kind: "child",
      workflow: "test",
      providerChain: [],
      parentSessionId: "s_par",
    });
    registry.create({
      id: "s_ch2",
      projectId: "p_1",
      kind: "child",
      workflow: "test",
      providerChain: [],
      parentSessionId: "s_par",
    });
    const items = registry.list({ parentSessionId: "s_par" });
    expect(items.length).toBe(2);
    expect(items.every((s) => s.parentSessionId === "s_par")).toBe(true);
  });

  // ─── updateStatus ────────────────────────────────────────────────────────────

  test("updateStatus transitions to running", () => {
    registry.create({
      id: "s_us1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const updated = registry.updateStatus("s_us1", "running");
    expect(updated.status).toBe("running");
    expect(updated.stoppedAt).toBeNull();
  });

  test("updateStatus sets stoppedAt for terminal statuses when provided", () => {
    registry.create({
      id: "s_us2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updateStatus("s_us2", "running");
    const now = "2025-01-01T00:00:00.000Z";
    const updated = registry.updateStatus("s_us2", "completed", { stoppedAt: now });
    expect(updated.status).toBe("completed");
    expect(updated.stoppedAt).toBe(now);
  });

  test("updateStatus accepts startedAt option", () => {
    registry.create({
      id: "s_us5",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const now = "2025-01-01T00:00:00.000Z";
    const updated = registry.updateStatus("s_us5", "running", { startedAt: now });
    expect(updated.status).toBe("running");
    expect(updated.startedAt).toBe(now);
  });

  test("updateStatus throws SessionNotFoundError for unknown id", () => {
    expect(() =>
      registry.updateStatus("s_unknown", "running"),
    ).toThrow(SessionNotFoundError);
  });

  // ─── updatePhase ─────────────────────────────────────────────────────────────

  test("updatePhase sets phase and providerId", () => {
    registry.create({
      id: "s_ph1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const updated = registry.updatePhase("s_ph1", "planning", "provider_a");
    expect(updated.currentPhase).toBe("planning");
    expect(updated.currentProviderId).toBe("provider_a");
  });

  test("updatePhase updates existing phase", () => {
    registry.create({
      id: "s_ph2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updatePhase("s_ph2", "planning", "provider_a");
    const updated = registry.updatePhase("s_ph2", "building", "provider_b");
    expect(updated.currentPhase).toBe("building");
    expect(updated.currentProviderId).toBe("provider_b");
  });

  test("updatePhase allows null providerId", () => {
    registry.create({
      id: "s_ph3",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const updated = registry.updatePhase("s_ph3", "finalizing", null);
    expect(updated.currentPhase).toBe("finalizing");
    expect(updated.currentProviderId).toBeNull();
  });

  test("updatePhase throws SessionNotFoundError for unknown id", () => {
    expect(() =>
      registry.updatePhase("s_unknown", "phase", null),
    ).toThrow(SessionNotFoundError);
  });

  // ─── advanceIteration ───────────────────────────────────────────────────────

  test("advanceIteration increments currentIteration", () => {
    registry.create({
      id: "s_ai1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const updated = registry.advanceIteration("s_ai1");
    expect(updated.currentIteration).toBe(1);
  });

  test("advanceIteration accumulates across multiple calls", () => {
    registry.create({
      id: "s_ai2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.advanceIteration("s_ai2");
    registry.advanceIteration("s_ai2");
    expect(registry.get("s_ai2")!.currentIteration).toBe(2);
  });

  test("advanceIteration throws SessionNotFoundError for unknown id", () => {
    expect(() => registry.advanceIteration("s_unknown")).toThrow(
      SessionNotFoundError,
    );
  });

  // ─── updateLastEventId ───────────────────────────────────────────────────────

  test("updateLastEventId sets lastEventId", () => {
    registry.create({
      id: "s_ule1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updateLastEventId("s_ule1", "evt_abc123");
    expect(registry.get("s_ule1")!.lastEventId).toBe("evt_abc123");
  });

  test("updateLastEventId replaces existing value", () => {
    registry.create({
      id: "s_ule2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.updateLastEventId("s_ule2", "evt_first");
    registry.updateLastEventId("s_ule2", "evt_second");
    expect(registry.get("s_ule2")!.lastEventId).toBe("evt_second");
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  test("delete removes the session", () => {
    registry.create({
      id: "s_del1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.delete("s_del1");
    expect(registry.get("s_del1")).toBeUndefined();
  });

  test("delete does not affect other sessions", () => {
    registry.create({
      id: "s_del2a",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_del2b",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.delete("s_del2a");
    expect(registry.get("s_del2b")).toBeDefined();
  });

  test("delete throws SessionNotFoundError for unknown id", () => {
    expect(() => registry.delete("s_unknown")).toThrow(SessionNotFoundError);
  });

  // ─── Queue ────────────────────────────────────────────────────────────────────

  test("enqueue inserts a queue item", () => {
    registry.create({
      id: "s_q1",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const item = registry.enqueue({
      sessionId: "s_q1",
      filename: "test.spec.ts",
      instruction: "add another test",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.sessionId).toBe("s_q1");
    expect(item.filename).toBe("test.spec.ts");
    expect(item.instruction).toBe("add another test");
    expect(item.affectsCompletedWork).toBe("no");
    expect(item.position).toBe(1);
    expect(item.createdAt).not.toBeNull();
  });

  test("enqueue auto-generates id and createdAt", () => {
    registry.create({
      id: "s_q2",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const item = registry.enqueue({
      sessionId: "s_q2",
      filename: "a.ts",
      instruction: "fix bug",
      affectsCompletedWork: "yes" as AffectsCompletedWork,
      position: 0,
    });
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.createdAt.length).toBeGreaterThan(0);
  });

  test("listQueue returns queue items for session ordered by position", () => {
    registry.create({
      id: "s_q3",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.enqueue({
      sessionId: "s_q3",
      filename: "b.ts",
      instruction: "task b",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 2,
    });
    registry.enqueue({
      sessionId: "s_q3",
      filename: "a.ts",
      instruction: "task a",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });
    registry.enqueue({
      sessionId: "s_q3",
      filename: "c.ts",
      instruction: "task c",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 3,
    });

    const items = registry.listQueue("s_q3");
    expect(items.map((i) => i.filename)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("listQueue returns empty array when no queue items", () => {
    registry.create({
      id: "s_q4",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    expect(registry.listQueue("s_q4")).toEqual([]);
  });

  test("listQueue only returns items for the given session", () => {
    registry.create({
      id: "s_q5a",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_q5b",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.enqueue({
      sessionId: "s_q5a",
      filename: "a.ts",
      instruction: "task a",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });
    registry.enqueue({
      sessionId: "s_q5b",
      filename: "b.ts",
      instruction: "task b",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });

    const itemsA = registry.listQueue("s_q5a");
    const itemsB = registry.listQueue("s_q5b");
    expect(itemsA.length).toBe(1);
    expect(itemsA[0]!.filename).toBe("a.ts");
    expect(itemsB.length).toBe(1);
    expect(itemsB[0]!.filename).toBe("b.ts");
  });

  test("dequeueItem removes the specified item", () => {
    registry.create({
      id: "s_q6",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const item = registry.enqueue({
      sessionId: "s_q6",
      filename: "x.ts",
      instruction: "task",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });
    registry.dequeueItem("s_q6", item.id);
    expect(registry.listQueue("s_q6")).toEqual([]);
  });

  test("dequeueItem throws when item not found", () => {
    registry.create({
      id: "s_q7",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    expect(() =>
      registry.dequeueItem("s_q7", "nonexistent"),
    ).toThrow("queue item not found");
  });

  test("dequeueItem throws when session does not own item", () => {
    registry.create({
      id: "s_q8a",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    registry.create({
      id: "s_q8b",
      projectId: "p_1",
      kind: "standalone",
      workflow: "test",
      providerChain: [],
    });
    const item = registry.enqueue({
      sessionId: "s_q8a",
      filename: "x.ts",
      instruction: "task",
      affectsCompletedWork: "no" as AffectsCompletedWork,
      position: 1,
    });
    expect(() => registry.dequeueItem("s_q8b", item.id)).toThrow(
      "queue item not found",
    );
  });
});
