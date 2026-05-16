import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createReviewHistoryProvider } from "./review-history";

function makeFakeInput(): import("@aloop/core").ContextInput {
  return {
    sessionId: "s1",
    projectId: "p1",
    authHandle: "auth_handle",
    agentRole: "review",
    contextId: "review_history",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("review_history provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-reviewhistory-test-${Date.now()}-${Math.random()}`);
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
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        scope TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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

  test("returns review findings block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO artifacts (id, project_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "other", "error-handling-review.txt", "text/plain", 100, now],
    );
    db.run(
      `INSERT INTO artifacts (id, project_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["a2", "p1", "other", "type-definitions-review.txt", "text/plain", 100, now],
    );

    const provider = createReviewHistoryProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const findingsBlock = blocks.find((b) => b.id === "review-findings");
    expect(findingsBlock).not.toBeNull();
    expect(findingsBlock!.body).toContain("error-handling-review.txt");
    expect(findingsBlock!.body).toContain("type-definitions-review.txt");
  });

  test("returns unresolved follow-ups block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "pending", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s2", "p1", "child", "running", now, now],
    );

    const provider = createReviewHistoryProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const followupsBlock = blocks.find((b) => b.id === "unresolved-followups");
    expect(followupsBlock).not.toBeNull();
    expect(followupsBlock!.body).toContain("pending");
    expect(followupsBlock!.body).toContain("running");
  });

  test("returns recurring module risks block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s2", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "iteration_stuck_count", 3, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s2", "iteration_stuck_count", 5, now],
    );

    const provider = createReviewHistoryProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const risksBlock = blocks.find((b) => b.id === "recurring-risks");
    expect(risksBlock).not.toBeNull();
    expect(risksBlock!.body).toContain("iteration_stuck_count");
  });

  test("returns prior review sessions block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "review-api", "completed", now, now],
    );

    const provider = createReviewHistoryProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const sessionsBlock = blocks.find((b) => b.id === "prior-review-sessions");
    expect(sessionsBlock).not.toBeNull();
    expect(sessionsBlock!.body).toContain("review-api");
  });

  test("returns empty when no review history", async () => {
    const provider = createReviewHistoryProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });
});