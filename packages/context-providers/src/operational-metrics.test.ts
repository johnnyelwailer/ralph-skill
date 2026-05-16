import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@aloop/state-sqlite";
import { createOperationalMetricsProvider } from "./operational-metrics";

function makeFakeInput(projectId = "p1"): import("@aloop/core").ContextInput {
  return {
    sessionId: "s1",
    projectId,
    authHandle: "auth_handle",
    agentRole: "orchestrator",
    contextId: "operational_metrics",
    budgetTokens: 8000,
    worktreeRoot: "/tmp/worktree",
  };
}

describe("operational_metrics provider", () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>["db"];

  beforeEach(() => {
    dir = join(tmpdir(), `aloop-opmetrics-test-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const opened = openDatabase(join(dir, "db.sqlite"));
    db = opened.db;
    db.run(`
      CREATE TABLE IF NOT EXISTS scheduler_metrics (
        metric_name TEXT NOT NULL,
        gate TEXT NOT NULL DEFAULT '',
        value REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (metric_name, gate)
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS provider_metrics (
        provider_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider_id, metric_name)
      );
    `);
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

  test("returns scheduler metrics block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["concurrency_in_flight", "", 2, now],
    );
    db.run(
      `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["concurrency_cap", "", 3, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const schedulerBlock = blocks.find((b) => b.id === "scheduler-metrics");
    expect(schedulerBlock).not.toBeNull();
    expect(schedulerBlock!.body).toContain("concurrency_in_flight");
  });

  test("returns concurrency block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["concurrency_in_flight", "", 2, now],
    );
    db.run(
      `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["concurrency_cap", "", 3, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const concurrencyBlock = blocks.find((b) => b.id === "concurrency");
    expect(concurrencyBlock).not.toBeNull();
    expect(concurrencyBlock!.body).toContain("2");
    expect(concurrencyBlock!.body).toContain("3");
  });

  test("returns provider health block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["opencode", "provider_consecutive_failures", 2, now],
    );
    db.run(
      `INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["opencode", "provider_quota_utilization", 0.75, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const providerBlock = blocks.find((b) => b.id === "provider-health");
    expect(providerBlock).not.toBeNull();
    expect(providerBlock!.body).toContain("opencode");
  });

  test("returns provider failures block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["opencode", "provider_consecutive_failures", 3, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const failuresBlock = blocks.find((b) => b.id === "provider-failures");
    expect(failuresBlock).not.toBeNull();
    expect(failuresBlock!.body).toContain("consecutive failures");
  });

  test("returns burn rate block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "burn_rate.tokens_since_last_commit", 50000, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const burnBlock = blocks.find((b) => b.id === "burn-rate");
    expect(burnBlock).not.toBeNull();
    expect(burnBlock!.body).toContain("50000");
  });

  test("returns stuck sessions signals block", async () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO sessions (id, project_id, kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ["s1", "p1", "child", "running", now, now],
    );
    db.run(
      `INSERT INTO session_metrics (session_id, metric_name, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "iteration_stuck_count", 5, now],
    );

    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);

    const stuckBlock = blocks.find((b) => b.id === "stuck-signals");
    expect(stuckBlock).not.toBeNull();
    expect(stuckBlock!.body).toContain("stuck=5");
  });

  test("returns empty blocks when no metrics", async () => {
    const provider = createOperationalMetricsProvider({ db });
    const input = makeFakeInput();
    const blocks = await provider.build(input);
    expect(blocks).toHaveLength(0);
  });
});