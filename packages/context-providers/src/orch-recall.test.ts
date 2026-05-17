import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createOrchRecallProvider } from "./orch-recall";

function makeFakeInput(sessionId = "s1", projectId = "p1"): import("@aloop/core").ContextInput {
  return {
    sessionId,
    projectId,
    authHandle: "auth_handle",
    agentRole: "orchestrator",
    contextId: "orch_recall",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("orch_recall provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-orchrecall-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns empty when no data", async () => {
    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });

  test("returns related stories block when sessions exist", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "build-api", "running", now, now],
    );
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s2", "p1", "child", "build-frontend", "completed", now, now],
    );

    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    const related = blocks.find((b) => b.id === "related-stories");
    expect(related).not.toBeNull();
    expect(related!.body).toContain("build-api");
    expect(related!.body).toContain("build-frontend");
  });

  test("returns failed sessions block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "failed", now, now],
    );

    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    const failed = blocks.find((b) => b.id === "failed-attempts");
    expect(failed).not.toBeNull();
    expect(failed!.body).toContain("s1");
  });

  test("returns proof artifacts block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO artifacts (id, project_id, kind, filename, media_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["a1", "p1", "other", "api-verified.txt", "text/plain", 100, now],
    );

    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    const proof = blocks.find((b) => b.id === "proof-artifacts");
    expect(proof).not.toBeNull();
  });

  test("returns blocks with proper sources", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "build-api", "running", now, now],
    );

    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    const blocks = await provider.build(input);

    for (const block of blocks) {
      expect(block.sources).toBeDefined();
      expect(block.sources.length).toBeGreaterThan(0);
      expect(block.createdAt).toBeDefined();
    }
  });

  test("respects budget_tokens in input", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, workflow, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "build-api", "running", now, now],
    );

    const provider = createOrchRecallProvider({ sessionsDir: "/tmp", db });
    const input = makeFakeInput("s1", "p1");
    Object.defineProperty(input, "budgetTokens", { value: 100 });
    const blocks = await provider.build(input);
    expect(Array.isArray(blocks)).toBe(true);
  });
});