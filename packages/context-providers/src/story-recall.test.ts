import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createStoryRecallProvider } from "./story-recall";

function makeFakeInput(sessionId = "s1"): import("@aloop/core").ContextInput {
  return {
    sessionId,
    projectId: "p1",
    authHandle: "auth_handle",
    agentRole: "plan",
    contextId: "story_recall",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("story_recall provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-storyrecall-test-${Date.now()}-${Math.random()}`);
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
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns current story block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, parent_session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "orchestrator", "epic-42", null, "running", now, now],
    );

    const provider = createStoryRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    const storyBlock = blocks.find((b) => b.id === "current-story");
    expect(storyBlock).not.toBeNull();
    expect(storyBlock!.body).toContain("epic-42");
    expect(storyBlock!.body).toContain("orchestrator");
  });

  test("returns story history block with child sessions", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, parent_session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["parent1", "p1", "orchestrator", null, "running", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, parent_session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["child1", "p1", "child", "parent1", "completed", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, parent_session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["child2", "p1", "child", "parent1", "failed", now, now],
    );

    const provider = createStoryRecallProvider({ db });
    const input = makeFakeInput("parent1");
    const blocks = await provider.build(input);

    const historyBlock = blocks.find((b) => b.id === "story-history");
    expect(historyBlock).not.toBeNull();
    expect(historyBlock!.body).toContain("child1");
    expect(historyBlock!.body).toContain("child2");
  });

  test("returns child sessions block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["parent1", "p1", "orchestrator", "running", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, parent_session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["child1", "p1", "child", "parent1", "completed", now, now],
    );

    const provider = createStoryRecallProvider({ db });
    const input = makeFakeInput("parent1");
    const blocks = await provider.build(input);

    const childBlock = blocks.find((b) => b.id === "child-sessions");
    expect(childBlock).not.toBeNull();
    expect(childBlock!.body).toContain("child1");
  });

  test("returns recent proof block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "orchestrator", "running", now, now],
    );
    db.run(
      `INSERT INTO artifacts (id, project_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "other", "implementation-approved.txt", "text/plain", 100, now],
    );

    const provider = createStoryRecallProvider({ db });
    const input = makeFakeInput("s1");
    const blocks = await provider.build(input);

    const proofBlock = blocks.find((b) => b.id === "recent-proof");
    expect(proofBlock).not.toBeNull();
  });

  test("returns empty when session not found", async () => {
    const provider = createStoryRecallProvider({ db });
    const input = makeFakeInput("nonexistent");
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });
});