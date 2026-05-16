import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createHumanSteeringProvider } from "./human-steering";

function makeFakeInput(sessionId = "s1", projectId = "p1"): import("@aloop/core").ContextInput {
  return {
    sessionId,
    projectId,
    authHandle: "auth_handle",
    agentRole: "orchestrator",
    contextId: "human_steering",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("human_steering provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-humsteering-test-${Date.now()}-${Math.random()}`);
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

  test("returns recent human comments block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "orchestrator", "running", now, now],
    );
    db.run(
      `INSERT INTO artifacts (id, project_id, session_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "s1", "other", "consider-different-approach.txt", "text/plain", 100, now],
    );

    const provider = createHumanSteeringProvider({ db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    const commentsBlock = blocks.find((b) => b.id === "recent-comments");
    expect(commentsBlock).not.toBeNull();
    expect(commentsBlock!.body).toContain("consider-different-approach");
  });

  test("returns explicit steering block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO artifacts (id, project_id, session_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "s1", "other", "focus-on-error-handling.txt", "text/plain", 100, now],
    );

    const provider = createHumanSteeringProvider({ db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    const steeringBlock = blocks.find((b) => b.id === "explicit-steering");
    expect(steeringBlock).not.toBeNull();
    expect(steeringBlock!.body).toContain("focus-on-error-handling");
  });

  test("returns active orchestrator session block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "orchestrator", "running", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s2", "p1", "child", "running", now, now],
    );

    const provider = createHumanSteeringProvider({ db });
    const input = makeFakeInput("s2", "p1");
    const blocks = await provider.build(input);

    const orchBlock = blocks.find((b) => b.id === "active-orchestrator");
    expect(orchBlock).not.toBeNull();
    expect(orchBlock!.body).toContain("s1");
    expect(orchBlock!.body).toContain("running");
  });

  test("returns empty when no steering data", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );

    const provider = createHumanSteeringProvider({ db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });

  test("blocks have proper sources", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "orchestrator", "running", now, now],
    );
    db.run(
      `INSERT INTO artifacts (id, project_id, session_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "s1", "other", "test-steering.txt", "text/plain", 100, now],
    );

    const provider = createHumanSteeringProvider({ db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    for (const block of blocks) {
      expect(block.sources).toBeDefined();
      expect(block.sources.length).toBeGreaterThan(0);
    }
  });
});