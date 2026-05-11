
import { describe, expect, test } from "bun:test";
import { openDatabase } from "@aloop/sqlite-db";

const MIGRATION_008 = `
CREATE TABLE IF NOT EXISTS scheduler_metrics (
  metric_name  TEXT NOT NULL,
  gate         TEXT NOT NULL DEFAULT '',
  value        REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (metric_name, gate)
);
`;

test("debug", () => {
  const { db } = openDatabase(":memory:");
  db.run(MIGRATION_008);

  // Do what the projector does
  db.run(
    `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
     VALUES (?, '', ?, ?)
     ON CONFLICT(metric_name, gate) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ["concurrency_in_flight", 1, "2025-01-01T00:00:00Z"]
  );

  db.run(
    `INSERT INTO scheduler_metrics (metric_name, gate, value, updated_at)
     VALUES (?, '', ?, ?)
     ON CONFLICT(metric_name, gate) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ["concurrency_in_flight", 2, "2025-01-01T00:00:00Z"]
  );

  const row = db.query(`SELECT * FROM scheduler_metrics`).get();
  console.log("ROW:", JSON.stringify(row));
  expect(row).toBeDefined();
});
