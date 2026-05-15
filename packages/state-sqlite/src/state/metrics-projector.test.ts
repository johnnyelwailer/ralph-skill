import { describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import { MetricsProjector } from "./metrics-projector.ts";

/** Inline migration 008 — duplicated here so tests are self-contained before the migration is wired into the bundle. */
const MIGRATION_008 = `
CREATE TABLE IF NOT EXISTS session_metrics (
  session_id   TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_metrics_name    ON session_metrics(metric_name);

CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name  TEXT NOT NULL,
  gate         TEXT NOT NULL DEFAULT '',
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, gate)
);

CREATE TABLE IF NOT EXISTS provider_metrics (
  provider_id  TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (provider_id, metric_name)
);
CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider ON provider_metrics(provider_id);

CREATE TABLE IF NOT EXISTS system_metrics (
  metric_name  TEXT NOT NULL PRIMARY KEY,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orchestrator_metrics (
  metric_name  TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '{}',
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, labels)
);

CREATE TABLE IF NOT EXISTS metric_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name  TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '{}',
  value        REAL NOT NULL,
  timestamp    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metric_history_name_time ON metric_history(metric_name, timestamp DESC);

CREATE TABLE IF NOT EXISTS metric_aggregates (
  id              TEXT PRIMARY KEY,
  scope           TEXT NOT NULL,
  window_start    TEXT NOT NULL,
  window_end      TEXT NOT NULL,
  window_label    TEXT NOT NULL,
  group_by        TEXT NOT NULL,
  labels          TEXT NOT NULL,
  sample_size     INTEGER NOT NULL DEFAULT 0,
  directional     INTEGER NOT NULL DEFAULT 1,
  metrics         TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(scope, window_label, group_by, labels)
);
CREATE INDEX IF NOT EXISTS idx_metric_aggregates_scope_window ON metric_aggregates(scope, window_label);
CREATE INDEX IF NOT EXISTS idx_metric_aggregates_updated ON metric_aggregates(updated_at);
`;

function makeProjector() {
  const { db } = openDatabase(":memory:");
  db.run(MIGRATION_008);
  const projector = new MetricsProjector();
  return { db, projector };
}

function makeEnv(topic: string, data: Record<string, unknown>, timestamp?: string) {
  return { _v: 1 as const, id: "1.1", topic, data, timestamp: timestamp ?? "2025-01-01T00:00:00.000Z" };
}

describe("MetricsProjector", () => {
  test("session.created kind=child increments concurrency_in_flight", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("session.created", { session_id: "s2", kind: "child" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    expect(row?.value).toBe(2);
  });

  test("session.created kind=standalone does NOT increment concurrency_in_flight", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "standalone" }));
    projector.apply(db, makeEnv("session.created", { session_id: "s2", kind: "standalone" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    // concurrency_in_flight only tracks child sessions; standalone sessions do not affect it
    expect(row).toBeNull();
  });

  test("session.created kind=orchestrator does NOT increment concurrency_in_flight", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "orchestrator" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    // concurrency_in_flight only tracks child sessions; orchestrator sessions do not affect it
    expect(row).toBeNull();
  });

  test("session.created initialises session metric rows", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "orchestrator" }));

    const stuck = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "iteration_stuck_count");
    expect(stuck?.value).toBe(0);

    const rate = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "turn_success_rate");
    expect(rate?.value).toBe(0);
  });

  test("session.ended decrements concurrency_in_flight", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("session.ended", { session_id: "s1" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    expect(row?.value).toBe(0);
  });

  test("turn.completed resets iteration_stuck_count", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("turn.failed", { session_id: "s1" }));
    projector.apply(db, makeEnv("turn.failed", { session_id: "s1" }));
    projector.apply(db, makeEnv("turn.completed", { session_id: "s1" }));

    const stuck = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "iteration_stuck_count");
    expect(stuck?.value).toBe(0);
  });

  test("turn.failed increments iteration_stuck_count", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("turn.failed", { session_id: "s1" }));
    projector.apply(db, makeEnv("turn.failed", { session_id: "s1" }));

    const stuck = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "iteration_stuck_count");
    expect(stuck?.value).toBe(2);
  });

  test("usage accumulates tokens for burn-rate gate", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("usage", { session_id: "s1", tokens_in: 1000, tokens_out: 500 }));
    projector.apply(db, makeEnv("usage", { session_id: "s1", tokens_in: 2000, tokens_out: 1000 }));

    const row = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "burn_rate.tokens_since_last_commit");
    expect(row?.value).toBe(4500);
  });

  test("commit resets burn_rate.tokens_since_last_commit to 0", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("usage", { session_id: "s1", tokens_in: 5000, tokens_out: 0 }));
    projector.apply(db, makeEnv("commit", { session_id: "s1" }));

    const row = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "burn_rate.tokens_since_last_commit");
    expect(row?.value).toBe(0);
  });

  test("change_set.merged resets burn_rate and increments merge counter", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("usage", { session_id: "s1", tokens_in: 5000, tokens_out: 0 }));
    projector.apply(db, makeEnv("change_set.merged", { session_id: "s1" }));

    const tokens = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM session_metrics WHERE session_id = ? AND metric_name = ?`,
      )
      .get("s1", "burn_rate.tokens_since_last_commit");
    expect(tokens?.value).toBe(0);

    const merged = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("change_sets_merged_total");
    expect(merged?.value).toBe(1);
  });

  test("scheduler.permit.deny increments permits_denied_total", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("scheduler.permit.deny", { gate: "burn_rate", reason: "threshold exceeded" }));
    projector.apply(db, makeEnv("scheduler.permit.deny", { gate: "provider_quota", reason: "no quota" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("permits_denied_total");
    expect(row?.value).toBe(2);
  });

  test("scheduler.permit.grant increments concurrency", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("scheduler.permit.grant", { session_id: "s1", provider_id: "opencode", timestamp: "2025-01-01T00:00:00Z" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    expect(row?.value).toBe(1);
  });

  test("scheduler.permit.release decrements concurrency", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("scheduler.permit.grant", { session_id: "s1", provider_id: "opencode" }));
    projector.apply(db, makeEnv("scheduler.permit.release", { session_id: "s1" }));

    const row = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM scheduler_metrics WHERE metric_name = ?`,
      )
      .get("concurrency_in_flight");
    expect(row?.value).toBe(0);
  });

  test("provider.health writes cooldown_remaining_seconds", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("provider.health", { provider_id: "opencode", status: "cooldown", cooldown_seconds: 30 }));

    const row = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
      )
      .get("opencode", "provider_cooldown_remaining_seconds");
    expect(row?.value).toBe(30);
  });

  test("provider.health healthy status resets consecutive_failures", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("error", { provider_id: "opencode" }));
    projector.apply(db, makeEnv("error", { provider_id: "opencode" }));
    projector.apply(db, makeEnv("provider.health", { provider_id: "opencode", status: "healthy" }));

    const row = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
      )
      .get("opencode", "provider_consecutive_failures");
    expect(row?.value).toBe(0);
  });

  test("provider.quota computes quota_utilization", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("provider.quota", { provider_id: "opencode", used: 50, limit: 100 }));

    const row = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
      )
      .get("opencode", "provider_quota_utilization");
    expect(row?.value).toBe(0.5);
  });

  test("error increments consecutive_failures and failure classification counter", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("error", { provider_id: "opencode" }));

    const failures = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
      )
      .get("opencode", "provider_consecutive_failures");
    expect(failures?.value).toBe(1);

    const classCount = db
      .query<{ value: number }, [string, string]>(
        `SELECT value FROM provider_metrics WHERE provider_id = ? AND metric_name = ?`,
      )
      .get("opencode", "provider_failure_classification_total");
    expect(classCount?.value).toBe(1);
  });

  test("usage with cost_usd appends to metric_history", () => {
    const { db, projector } = makeProjector();
    projector.apply(db, makeEnv("session.created", { session_id: "s1", kind: "child" }));
    projector.apply(db, makeEnv("usage", { session_id: "s1", cost_usd: 0.25 }));

    const rows = db
      .query<{ metric_name: string; value: number }, []>(
        `SELECT metric_name, value FROM metric_history`,
      )
      .all();
    expect(rows).toContainEqual({ metric_name: "cost_per_story", value: 0.25 });
  });

  test("unknown topics are silently ignored", () => {
    const { db, projector } = makeProjector();
    expect(() => projector.apply(db, makeEnv("some.random.topic", {}))).not.toThrow();
  });
});
