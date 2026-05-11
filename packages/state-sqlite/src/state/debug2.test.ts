
import { describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";

test("debug type narrowing", () => {
  const { db } = openDatabase(":memory:");
  db.run(`CREATE TABLE IF NOT EXISTS scheduler_metrics (metric_name TEXT NOT NULL, gate TEXT NOT NULL DEFAULT '', value REAL NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (metric_name, gate))`);

  const MIGRATION_008 = `
  CREATE TABLE IF NOT EXISTS session_metrics (
    session_id   TEXT NOT NULL,
    metric_name  TEXT NOT NULL,
    value        REAL NOT NULL,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (session_id, metric_name)
  );
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
  `;
  db.run(MIGRATION_008);
  
  // Manually run what MetricsProjector.apply does for session.created kind=child
  const CONCURRENCY = "concurrency_in_flight";
  const ts = "2025-01-01T00:00:00Z";
  
  // Insert
  db.run(
    `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
     VALUES (?, '', ?, ?)
     ON CONFLICT(metric_name, gate) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [CONCURRENCY, 1, ts]
  );
  
  const row = db.query("SELECT * FROM scheduler_metrics").all();
  console.log("all rows:", JSON.stringify(row));
  
  expect(row.length).toBeGreaterThan(0);
});
