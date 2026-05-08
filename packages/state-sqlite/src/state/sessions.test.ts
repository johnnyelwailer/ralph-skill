import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./database.ts";
import { SessionRegistry, SessionNotFoundError } from "./sessions.ts";
import type { SessionKind, SessionStatus } from "@aloop/core";

describe("SessionRegistry", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];
  let registry: SessionRegistry;

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-session-test-${Date.now()}-${Math.random()}`);
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
    expect(session.workflow).toBe("plan-build-review");
    expect(session.providerChain).toEqual(["opencode", "claude"]);
    expect(session.status).toBe("pending");
    expect(session.parentSessionId).toBeNull();
    expect(session.worktreePath).toBeNull();
    expect(session.createdAt).toBe(now);
    expect(session.updatedAt).toBe(now);
    expect(session.endedAt).toBeNull();
    expect(session.costUsd).toBe(0);
    expect(session.tokensIn).toBe(0);
    expect(session.tokensOut).toBe(0);
    expect(session.commits).toBe(0);
  });

  test("create auto-generates id when not provided", () => {
    const session = registry.create({
      projectId: "p_proj1",
      kind: "orchestrator",
    });
    expect(session.id).not.toBeUndefined();
    expect(session.id.length).toBeGreaterThan(0);
    expect(registry.get(session.id)).toBeDefined();
  });

  test("create sets nulls for optional fields", () => {
    const session = registry.create({
      id: "s_opts",
      projectId: "p_proj1",
      kind: "child",
      parentSessionId: "s_parent1",
    });
    expect(session.workflow).toBeNull();
    expect(session.providerChain).toEqual([]);
    expect(session.worktreePath).toBeNull();
    expect(session.parentSessionId).toBe("s_parent1");
  });

  test("create uses provided now timestamp", () => {
    const now = "2024-06-15T12:00:00.000Z";
    const session = registry.create({ id: "s_ts", projectId: "p_1", kind: "standalone", now });
    expect(session.createdAt).toBe(now);
    expect(session.updatedAt).toBe(now);
  });

  // ─── get ─────────────────────────────────────────────────────────────────────

  test("get returns undefined for unknown id", () => {
    expect(registry.get("s_does_not_exist")).toBeUndefined();
  });

  test("get finds an inserted session", () => {
    registry.create({ id: "s_find", projectId: "p_1", kind: "standalone" });
    const found = registry.get("s_find");
    expect(found?.id).toBe("s_find");
  });

  // ─── list ────────────────────────────────────────────────────────────────────

  test("list returns empty array when no sessions exist", () => {
    const result = registry.list();
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test("list returns sessions ordered by created_at then id", () => {
    // Use a fixed now so created_at is identical; order falls through to id.
    const now = "2025-01-01T00:00:00.000Z";
    registry.create({ id: "s_b", projectId: "p_1", kind: "standalone", now });
    registry.create({ id: "s_a", projectId: "p_1", kind: "standalone", now });
    const { items } = registry.list();
    expect(items.map((s) => s.id)).toEqual(["s_a", "s_b"]);
  });

  test("list filters by project_id", () => {
    registry.create({ id: "s_p1", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_p2", projectId: "p_2", kind: "standalone" });
    const { items } = registry.list({ projectId: "p_1" });
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe("s_p1");
  });

  test("list filters by single status", () => {
    registry.create({ id: "s_r1", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_r2", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_r1", "running");
    const { items } = registry.list({ status: "running" });
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe("s_r1");
  });

  test("list filters by multiple statuses", () => {
    registry.create({ id: "s_1", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_2", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_3", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_1", "running");
    registry.updateStatus("s_2", "completed");
    const { items } = registry.list({ status: ["running", "completed"] });
    expect(items.map((s) => s.id).sort()).toEqual(["s_1", "s_2"]);
  });

  test("list filters by kind", () => {
    registry.create({ id: "s_orc", projectId: "p_1", kind: "orchestrator" });
    registry.create({ id: "s_ch", projectId: "p_1", kind: "child" });
    const { items } = registry.list({ kind: "orchestrator" });
    expect(items.length).toBe(1);
    expect(items[0]!.kind).toBe("orchestrator");
  });

  test("list filters by parent_session_id", () => {
    registry.create({ id: "s_par", projectId: "p_1", kind: "orchestrator" });
    registry.create({ id: "s_ch1", projectId: "p_1", kind: "child", parentSessionId: "s_par" });
    registry.create({ id: "s_ch2", projectId: "p_1", kind: "child", parentSessionId: "s_par" });
    const { items } = registry.list({ parentSessionId: "s_par" });
    expect(items.length).toBe(2);
    expect(items.every((s) => s.parentSessionId === "s_par")).toBe(true);
  });

  test("list enforces limit", () => {
    for (let i = 0; i < 5; i++) {
      registry.create({ id: `s_${i}`, projectId: "p_1", kind: "standalone" });
    }
    const { items, nextCursor } = registry.list({ limit: 3 });
    expect(items.length).toBe(3);
    expect(nextCursor).not.toBeNull();
  });

  test("list supports cursor pagination", () => {
    for (let i = 0; i < 5; i++) {
      registry.create({ id: `s_${i}`, projectId: "p_1", kind: "standalone" });
    }
    const { items: page1, nextCursor } = registry.list({ limit: 2 });
    expect(page1.length).toBe(2);
    const { items: page2 } = registry.list({ limit: 2, cursor: nextCursor! });
    expect(page2.length).toBe(2);
    expect(page1[0]!.id).not.toBe(page2[0]!.id);
  });

  // ─── updateStatus ────────────────────────────────────────────────────────────

  test("updateStatus transitions to running", () => {
    registry.create({ id: "s_us1", projectId: "p_1", kind: "standalone" });
    const updated = registry.updateStatus("s_us1", "running");
    expect(updated.status).toBe("running");
    expect(updated.endedAt).toBeNull();
  });

  test("updateStatus sets ended_at for terminal statuses", () => {
    registry.create({ id: "s_us2", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_us2", "running");
    const now = new Date().toISOString();
    const updated = registry.updateStatus("s_us2", "completed", now);
    expect(updated.status).toBe("completed");
    expect(updated.endedAt).toBe(now);
  });

  test("updateStatus throws SessionNotFoundError for unknown id", () => {
    expect(() => registry.updateStatus("s_unknown", "running")).toThrow(SessionNotFoundError);
  });

  test("updateStatus leaves ended_at unchanged for non-terminal transitions", () => {
    registry.create({ id: "s_us3", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_us3", "running");
    const firstEnd = registry.get("s_us3")!.endedAt;
    registry.updateStatus("s_us3", "paused");
    const afterPause = registry.get("s_us3")!.endedAt;
    expect(afterPause).toBe(firstEnd); // ended_at stays null
  });

  // ─── touchActivity ────────────────────────────────────────────────────────────

  test("touchActivity updates all aggregates", () => {
    registry.create({ id: "s_ta", projectId: "p_1", kind: "standalone" });
    registry.touchActivity("s_ta", 150, 5000, 3000, 3);
    const s = registry.get("s_ta")!;
    expect(s.costUsd).toBe(150);
    expect(s.tokensIn).toBe(5000);
    expect(s.tokensOut).toBe(3000);
    expect(s.commits).toBe(3);
  });

  test("touchActivity accumulates cost values (replaces, not adds)", () => {
    registry.create({ id: "s_ta2", projectId: "p_1", kind: "standalone" });
    registry.touchActivity("s_ta2", 100, 0, 0, 0);
    registry.touchActivity("s_ta2", 50, 0, 0, 0);
    expect(registry.get("s_ta2")!.costUsd).toBe(50); // replaced, not accumulated
  });

  // ─── archive ─────────────────────────────────────────────────────────────────

  test("archive sets status to archived and ended_at", () => {
    registry.create({ id: "s_arch", projectId: "p_1", kind: "standalone" });
    const archived = registry.archive("s_arch");
    expect(archived.status).toBe("archived");
    expect(archived.endedAt).not.toBeNull();
  });

  test("archive throws SessionNotFoundError for unknown id", () => {
    expect(() => registry.archive("s_unknown")).toThrow(SessionNotFoundError);
  });

  // ─── findRunning ─────────────────────────────────────────────────────────────

  test("findRunning returns only sessions with status=running", () => {
    registry.create({ id: "s_fr1", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_fr2", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_fr1", "running");
    const running = registry.findRunning();
    expect(running.length).toBe(1);
    expect(running[0]!.id).toBe("s_fr1");
  });

  test("findRunning returns empty array when no running sessions", () => {
    registry.create({ id: "s_fr3", projectId: "p_1", kind: "standalone" });
    expect(registry.findRunning()).toEqual([]);
  });

  // ─── interruptAllRunning ─────────────────────────────────────────────────────

  test("interruptAllRunning transitions all running sessions to interrupted", () => {
    registry.create({ id: "s_iar1", projectId: "p_1", kind: "standalone" });
    registry.create({ id: "s_iar2", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_iar1", "running");
    registry.updateStatus("s_iar2", "running");
    const now = "2025-01-01T00:00:00.000Z";
    const changed = registry.interruptAllRunning(now);
    expect(changed).toBe(2);
    expect(registry.get("s_iar1")!.status).toBe("interrupted");
    expect(registry.get("s_iar2")!.status).toBe("interrupted");
  });

  test("interruptAllRunning returns 0 when no running sessions", () => {
    expect(registry.interruptAllRunning()).toBe(0);
  });

  test("interruptAllRunning only affects running sessions", () => {
    registry.create({ id: "s_iar3", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_iar3", "running");
    registry.create({ id: "s_iar4", projectId: "p_1", kind: "standalone" });
    registry.updateStatus("s_iar4", "completed");
    const changed = registry.interruptAllRunning();
    expect(changed).toBe(1);
    expect(registry.get("s_iar3")!.status).toBe("interrupted");
    expect(registry.get("s_iar4")!.status).toBe("completed"); // unchanged
  });

  // ─── provider_chain column ───────────────────────────────────────────────────

  test("providerChain is stored and retrieved as a JSON array", () => {
    registry.create({
      id: "s_pc",
      projectId: "p_1",
      kind: "orchestrator",
      providerChain: ["codex", "claude", "gemini"],
    });
    const s = registry.get("s_pc")!;
    expect(s.providerChain).toEqual(["codex", "claude", "gemini"]);
  });

  test("providerChain defaults to empty array", () => {
    registry.create({ id: "s_pc2", projectId: "p_1", kind: "standalone" });
    expect(registry.get("s_pc2")!.providerChain).toEqual([]);
  });

  // ─── worktree_path column ────────────────────────────────────────────────────

  test("worktreePath is stored and retrieved correctly", () => {
    registry.create({
      id: "s_wt",
      projectId: "p_1",
      kind: "standalone",
      worktreePath: "/home/user/projects/myproj/.aloop/worktrees/s_wt",
    });
    expect(registry.get("s_wt")!.worktreePath).toBe(
      "/home/user/projects/myproj/.aloop/worktrees/s_wt",
    );
  });
});
