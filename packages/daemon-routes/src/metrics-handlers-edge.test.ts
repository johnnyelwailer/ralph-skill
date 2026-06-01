import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMetricAggregates, getMetricHistory, type MetricsHandlerDeps } from "./metrics-handlers.ts";

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
    CREATE TABLE metric_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      value REAL NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX idx_metric_history_name_time
      ON metric_history(metric_name, timestamp DESC);
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

// ─── getMetricHistory — limit NaN/zero/negative input validation ─────────────
//
// The implementation at metrics-handlers.ts:173 is:
//   const limit = Math.min(10000, Number(url.searchParams.get("limit") ?? 1000));
// Number("abc") is NaN, NaN propagates through Math.min → SQL `LIMIT ?` with NaN
// → 500 "internal_error". Number("") is 0 → no rows returned. Per the spec the
// handler should validate the input and return 400, mirroring getMetricAggregates
// at line 109-110. These tests assert spec behavior (which is the same shape as
// the existing getMetricAggregates NaN tests above).

describe("getMetricHistory", () => {
  test("returns 400 when limit is not a number", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=abc");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when limit is a non-numeric word", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=xyz");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when limit is negative", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=-5");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when limit is zero", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=0");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 400 when limit is empty string", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json() as unknown as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
  });

  test("accepts limit=1 (minimum positive)", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=1");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown as { items: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("uses default limit of 1000 when limit is omitted", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json() as unknown as { items: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.items)).toBe(true);
  });
});
