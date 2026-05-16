import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createTaskRecallProvider } from "./task-recall";

function makeFakeInput(sessionId = "s1"): import("@aloop/core").ContextInput {
  return {
    sessionId,
    projectId: "p1",
    authHandle: "auth_handle",
    agentRole: "build",
    contextId: "task_recall",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("task_recall provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-taskrecall-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'child',
        parent_session_id TEXT,
        workflow TEXT,
        provider_chain TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'running',
        worktree_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        cost_usd REAL NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        commits INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS session_metrics (
        session_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (session_id, metric_name)
      );
    `);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns current task block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "build-api", "running", now, now],
    );

    const provider = createTaskRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    const taskBlock = blocks.find((b) => b.id === "current-task");
    expect(taskBlock).not.toBeNull();
    expect(taskBlock!.body).toContain("build-api");
    expect(taskBlock!.body).toContain("running");
  });

  test("returns failed attempts block when stuck count > 0", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "iteration_stuck_count", 3, now],
    );

    const provider = createTaskRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    const failedBlock = blocks.find((b) => b.id === "failed-attempts");
    expect(failedBlock).not.toBeNull();
    expect(failedBlock!.body).toContain("stuck count: 3");
  });

  test("returns blockers block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "phase_retry_exhaustion_rate", 0.5, now],
    );

    const provider = createTaskRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    const blockersBlock = blocks.find((b) => b.id === "blockers");
    expect(blockersBlock).not.toBeNull();
  });

  test("returns empty when session not found", async () => {
    const provider = createTaskRecallProvider({ db });
    const input = makeFakeInput("nonexistent");
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });

  test("all blocks have proper structure", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "build-api", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "iteration_stuck_count", 2, now],
    );

    const provider = createTaskRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    for (const block of blocks) {
      expect(block.id).toBeDefined();
      expect(block.title).toBeDefined();
      expect(block.body).toBeDefined();
      expect(block.sources).toBeDefined();
      expect(block.createdAt).toBeDefined();
    }
  });
});