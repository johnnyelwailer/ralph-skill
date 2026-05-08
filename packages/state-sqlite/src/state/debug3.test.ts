
import { describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import { MetricsProjector } from "./metrics-projector.ts";

const MIGRATION_008 = `
CREATE TABLE IF NOT EXISTS session_metrics (
  session_id   TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, metric_name)
);
CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name  TEXT NOT NULL PRIMARY KEY,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL
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
  metric_name   TEXT NOT NULL,
  labels        TEXT NOT NULL DEFAULT '{}',
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL,
  window_kind   TEXT NOT NULL DEFAULT 'rolling',
  stat          TEXT NOT NULL,
  value         REAL NOT NULL,
  computed_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, labels, window_start, window_kind, stat)
);
`;

test("debug projector with more detail", () => {
  const { db } = openDatabase(":memory:");
  db.run(MIGRATION_008);
  const projector = new MetricsProjector();

  // Check what asEvent returns
  const env = { topic: "session.created", data: { session_id: "s1", kind: "child" }, timestamp: "2025-01-01T00:00:00Z" };
  console.log("env:", JSON.stringify(env));
  
  // Apply
  projector.apply(db, env);
  
  const all = db.query("SELECT * FROM scheduler_metrics").all();
  console.log("scheduler_metrics after apply:", JSON.stringify(all));
  
  expect(all.length).toBeGreaterThan(0);
});
