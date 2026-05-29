import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMetricAggregates, type MetricsHandlerDeps } from "./metrics-handlers.ts";

let dir: string;
let db: Database;
let deps: MetricsHandlerDeps;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "aloop-metrics-handlers-test-"));
  db = new Database(join(dir, "metrics.sqlite"));
  db.exec(`
    CREATE TABLE metric_aggregates (
      metric_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      window_kind TEXT NOT NULL DEFAULT 'rolling',
      stat TEXT NOT NULL DEFAULT 'mean',
      value REAL NOT NULL,
      computed_at TEXT NOT NULL
    );
    CREATE INDEX idx_metric_aggregates_name ON metric_aggregates(metric_name);
  `);
  deps = { db };
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true });
});

describe("getMetricAggregates", () => {
  test("returns 400 when window_hours is not a number", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=abc");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when limit is not a number", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&limit=xyz");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when window_hours is negative", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=-5");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when window_hours is zero", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=0");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("accepts window_hours=1 (minimum positive)", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const hourAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES ('cpu_usage', '{}', '${hourAgo}', '${nowStr}', 'rolling', 'mean', 42.0, '${nowStr}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=1");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
  });

  test("accepts limit=1 (minimum positive)", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&limit=1");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
  });

  test("returns 400 when window is empty string", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window=");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when stat is empty string", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&stat=");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });
});
