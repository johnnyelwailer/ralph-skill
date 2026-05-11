
import { describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";
import { MetricsProjector } from "./metrics-projector.ts";

const MIGRATION_008 = `
CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name  TEXT NOT NULL,
  gate         TEXT NOT NULL DEFAULT '',
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, gate)
);
CREATE TABLE IF NOT EXISTS session_metrics (
  session_id   TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, metric_name)
);
`;

test("debug projector", () => {
  const { db } = openDatabase(":memory:");
  db.run(MIGRATION_008);
  const projector = new MetricsProjector();

  const env1 = { topic: "session.created", data: { session_id: "s1", kind: "child" }, timestamp: "2025-01-01T00:00:00Z" };
  const env2 = { topic: "session.created", data: { session_id: "s2", kind: "child" }, timestamp: "2025-01-01T00:00:00Z" };
  
  projector.apply(db, env1);
  projector.apply(db, env2);
  
  // Check what happened
  const all = db.query("SELECT * FROM scheduler_metrics").all();
  console.log("scheduler_metrics:", JSON.stringify(all));
  
  const row = db.query<{ value: number }, [string]>("SELECT value FROM scheduler_metrics WHERE metric_name = ?").get("concurrency_in_flight");
  console.log("row:", JSON.stringify(row));
  expect(row?.value).toBe(2);
});
