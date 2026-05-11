
import { describe, expect, test } from "bun:test";
import { makeEvent, makeIdGenerator } from "@aloop/core";
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

let nextId = makeIdGenerator(() => 1700000000000);

test("debug projector with makeEvent", () => {
  const { db } = openDatabase(":memory:");
  db.run(MIGRATION_008);
  const projector = new MetricsProjector();

  // Use makeEvent like the real codebase does
  const event = makeEvent(
    "session.created",
    { session_id: "s1", kind: "child" },
    nextId,
    () => 1700000000000,
  );
  
  console.log("event:", JSON.stringify(event));
  console.log("event type:", typeof event);
  console.log("event.topic:", event.topic);
  
  projector.apply(db, event);
  
  const all = db.query("SELECT * FROM scheduler_metrics").all();
  console.log("scheduler_metrics after apply:", JSON.stringify(all));
  
  expect(all.length).toBeGreaterThan(0);
});
