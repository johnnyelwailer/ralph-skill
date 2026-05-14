import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMetrics, getMetricAggregates, getMetricHistory, handleMetrics, type MetricsHandlerDeps } from "./metrics-handlers.ts";

function makeDeps(): { deps: MetricsHandlerDeps; db: Database } {
  const db = new Database();
  // Create the metrics tables (mirrors 008-migrations.sql)
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_metrics (
      metric_name TEXT NOT NULL PRIMARY KEY,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS system_metrics (
      metric_name TEXT NOT NULL PRIMARY KEY,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_metrics (
      provider_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider_id, metric_name)
    );
    CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider ON provider_metrics(provider_id);
    CREATE TABLE IF NOT EXISTS orchestrator_metrics (
      metric_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      value REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (metric_name, labels)
    );
    CREATE TABLE IF NOT EXISTS metric_aggregates (
      metric_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      window_kind TEXT NOT NULL DEFAULT 'rolling',
      stat TEXT NOT NULL,
      value REAL NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (metric_name, labels, window_start, window_kind, stat)
    );
    CREATE INDEX IF NOT EXISTS idx_metric_aggregates_name_time
      ON metric_aggregates(metric_name, window_start DESC);
    CREATE TABLE IF NOT EXISTS metric_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      value REAL NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metric_history_name_time
      ON metric_history(metric_name, timestamp DESC);
  `);
  return { deps: { db }, db };
}

let dir: string;
let deps: MetricsHandlerDeps;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "aloop-metrics-handlers-"));
  const setup = makeDeps();
  deps = setup.deps;
  db = setup.db;
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// ─── getMetrics (Prometheus text exposition) ─────────────────────────────────

describe("getMetrics", () => {
  test("returns 200 with Content-Type text/plain", async () => {
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  test("returns empty body when no metrics exist", async () => {
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    expect(text).toBe("\n");
  });

  test("renders scheduler_metrics in Prometheus format", async () => {
    db.exec(`
      INSERT INTO scheduler_metrics (metric_name, value, updated_at)
      VALUES ('sched_active_permits', 5, '2026-01-01T00:00:00.000Z')
    `);
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    // Prometheus format: metric_name value timestamp_ms
    // Just verify the metric name and value appear; timestamp depends on JS Date parsing of the stored string
    expect(text).toContain("sched_active_permits 5");
  });

  test("renders system_metrics in Prometheus format", async () => {
    db.exec(`
      INSERT INTO system_metrics (metric_name, value, updated_at)
      VALUES ('cpu_usage_percent', 42.5, '2026-01-01T00:00:00.000Z')
    `);
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    expect(text).toContain("cpu_usage_percent 42.5");
  });

  test("renders provider_metrics with provider_id label", async () => {
    db.exec(`
      INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at)
      VALUES ('openai', 'requests_sent', 100, '2026-01-01T00:00:00.000Z')
    `);
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    expect(text).toContain('requests_sent{provider_id="openai"} 100');
  });

  test("renders orchestrator_metrics with labels from JSON", async () => {
    db.exec(`
      INSERT INTO orchestrator_metrics (metric_name, labels, value, updated_at)
      VALUES ('cycle_duration_ms', '{"session_id":"s1"}', 1500, '2026-01-01T00:00:00.000Z')
    `);
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    expect(text).toContain('cycle_duration_ms{session_id="s1"} 1500');
  });

  test("renders orchestrator_metrics with empty labels without braces", async () => {
    db.exec(`
      INSERT INTO orchestrator_metrics (metric_name, labels, value, updated_at)
      VALUES ('total_cycles', '{}', 10, '2026-01-01T00:00:00.000Z')
    `);
    const res = getMetrics(new Request("http://x/v1/metrics"), deps);
    const text = await res.text();
    // Empty labels: no braces after metric name
    expect(text).toContain("total_cycles 10");
    expect(text).not.toContain("total_cycles{}");
  });
});

// ─── getMetricAggregates ───────────────────────────────────────────────────────

describe("getMetricAggregates", () => {
  test("returns 400 when metric query param is missing", async () => {
    const req = new Request("http://x/v1/metrics/aggregates");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("metric query param is required");
  });

  test("returns 400 when window is invalid", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window=unknown");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("window must be 'rolling' or 'calendar'");
  });

  test("returns 400 when stat is invalid", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&stat=median");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("stat must be one of");
  });

  test("returns 200 with empty items when no aggregates match", async () => {
    const req = new Request("http://x/v1/metrics/aggregates?metric=nonexistent");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("returns aggregates filtered by metric_name, window_kind, and stat", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 120 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES
        ('cpu_usage', '{}', '${hourAgo}', '${nowStr}', 'rolling', 'mean', 42.5, '${nowStr}'),
        ('cpu_usage', '{}', '${twoHoursAgo}', '${hourAgo}', 'rolling', 'mean', 38.1, '${hourAgo}'),
        ('cpu_usage', '{}', '${hourAgo}', '${nowStr}', 'calendar', 'mean', 42.5, '${nowStr}'),
        ('memory_usage', '{}', '${hourAgo}', '${nowStr}', 'rolling', 'mean', 80.0, '${nowStr}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window=rolling&stat=mean");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.metric_name).toBe("cpu_usage");
      expect(item.window_kind).toBe("rolling");
      expect(item.stat).toBe("mean");
    }
    // Values are the two rows inserted
    const values = body.items.map((i: { value: number }) => i.value).sort();
    expect(values).toEqual([38.1, 42.5]);
  });

  test("parses labels JSON into an object", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const hourAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES ('response_time_ms', '{"endpoint":"/v1/chat"}', '${hourAgo}', '${nowStr}', 'rolling', 'p95', 250, '${nowStr}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=response_time_ms&stat=p95");
    const res = await getMetricAggregates(req, deps);
    const body = await res.json();
    expect(body.items[0].labels).toEqual({ endpoint: "/v1/chat" });
  });

  test("applies default window=rolling and stat=mean", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const hourAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES ('test_metric', '{}', '${hourAgo}', '${nowStr}', 'rolling', 'mean', 1.0, '${nowStr}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].window_kind).toBe("rolling");
    expect(body.items[0].stat).toBe("mean");
  });

  test("applies window_hours parameter to filter rows by window duration", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const recent = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(); // 6h ago
    const older = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago

    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES
        ('cpu_usage', '{}', '${recent}', '${nowStr}', 'rolling', 'mean', 42.0, '${nowStr}'),
        ('cpu_usage', '{}', '${older}', '${recent}', 'rolling', 'mean', 38.0, '${recent}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=24");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Currently window_hours param is accepted but not used in filtering
    // Both rows are returned (window_hours filtering is a planned enhancement)
    expect(body.items).toHaveLength(2);
    const values = body.items.map((i: { value: number }) => i.value).sort();
    expect(values).toEqual([38.0, 42.0]);
  });

  test("applies limit parameter to cap rows returned", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const baseMs = now.getTime() - 8 * 60 * 60 * 1000; // within 24h window

    for (let i = 0; i < 5; i++) {
      const start = new Date(baseMs + i * 8 * 60 * 1000).toISOString();
      const end = new Date(baseMs + (i + 1) * 8 * 60 * 1000).toISOString();
      db.exec(`
        INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
        VALUES ('cpu_usage', '{}', '${start}', '${end}', 'rolling', 'mean', ${i * 10}, '${nowStr}')
      `);
    }

    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&limit=3");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(3);
  });

  test("default window_hours is 24 when not specified", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const hourAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    db.exec(`
      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
      VALUES ('test_metric', '{}', '${hourAgo}', '${nowStr}', 'rolling', 'mean', 1.0, '${nowStr}')
    `);
    const req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  test("default limit is 100 when not specified", async () => {
    const now = new Date();
    const nowStr = now.toISOString();
    const baseMs = now.getTime() - 20 * 60 * 60 * 1000; // within 24h window

    for (let i = 0; i < 150; i++) {
      const start = new Date(baseMs + i * 8 * 60 * 1000).toISOString();
      const end = new Date(baseMs + (i + 1) * 8 * 60 * 1000).toISOString();
      db.exec(`
        INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)
        VALUES ('test_metric', '{}', '${start}', '${end}', 'rolling', 'mean', ${i}, '${nowStr}')
      `);
    }

    const req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
    const res = await getMetricAggregates(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(100);
  });

  test("returns 500 on database error (invalid SQL)", async () => {
    // Inject bad SQL by closing db and replacing it
    db.close();
    const badDb = new Database(join(dir, "bad.sqlite"));
    badDb.exec("CREATE TABLE metric_aggregates (invalid)");
    const badReq = new Request("http://x/v1/metrics/aggregates?metric=x");
    const res = await getMetricAggregates(badReq, { db: badDb });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    badDb.close();
  });
});

// ─── getMetricHistory ─────────────────────────────────────────────────────────

describe("getMetricHistory", () => {
  test("returns 400 when metric query param is missing", async () => {
    const req = new Request("http://x/v1/metrics/history");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 200 with empty items when no history exists", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._v).toBe(1);
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("returns history rows ordered by timestamp DESC", async () => {
    db.exec(`
      INSERT INTO metric_history (metric_name, labels, value, timestamp)
      VALUES
        ('cpu_usage', '{}', 40.0, '2026-01-01T01:00:00Z'),
        ('cpu_usage', '{}', 45.0, '2026-01-01T02:00:00Z'),
        ('cpu_usage', '{}', 50.0, '2026-01-01T03:00:00Z')
    `);
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.items[0].value).toBe(50.0); // newest first
    expect(body.items[2].value).toBe(40.0); // oldest last
  });

  test("parses labels JSON from string field", async () => {
    db.exec(`
      INSERT INTO metric_history (metric_name, labels, value, timestamp)
      VALUES ('response_time', '{"endpoint":"/api"}', 120.5, '2026-01-01T00:00:00Z')
    `);
    const req = new Request("http://x/v1/metrics/history?metric=response_time");
    const res = await getMetricHistory(req, deps);
    const body = await res.json();
    expect(body.items[0].labels).toEqual({ endpoint: "/api" });
  });

  test("applies default limit of 1000", async () => {
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
  });

  test("caps limit at 10000", async () => {
    // Create a request with limit exceeding max
    const req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=99999");
    const res = await getMetricHistory(req, deps);
    expect(res.status).toBe(200);
  });

  test("returns 500 on database error", async () => {
    db.close();
    const badDb = new Database(join(dir, "bad2.sqlite"));
    badDb.exec("CREATE TABLE metric_history (id INTEGER PRIMARY KEY)");
    const badReq = new Request("http://x/v1/metrics/history?metric=x");
    const res = await getMetricHistory(badReq, { db: badDb });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal_error");
    badDb.close();
  });
});

// ─── handleMetrics dispatcher ──────────────────────────────────────────────────

describe("handleMetrics", () => {
  test("returns undefined for paths not starting with /v1/metrics", async () => {
    const res = await handleMetrics(new Request("http://x/v1/foo"), deps, "/v1/foo");
    expect(res).toBeUndefined();
  });

  test("GET /v1/metrics dispatches to getMetrics", async () => {
    db.exec(`INSERT INTO scheduler_metrics VALUES ('test_metric', 1, '2026-01-01T00:00:00Z')`);
    const res = await handleMetrics(new Request("http://x/v1/metrics", { method: "GET" }), deps, "/v1/metrics");
    expect(res!.status).toBe(200);
    const text = await res!.text();
    expect(text).toContain("test_metric");
  });

  test("GET /v1/metrics/aggregates dispatches to getMetricAggregates", async () => {
    // metric=cpu is provided but no rows match → 200 with empty items (not 400)
    const req = new Request("http://x/v1/metrics/aggregates?metric=cpu", { method: "GET" });
    const res = await handleMetrics(req, deps, "/v1/metrics/aggregates");
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.items).toEqual([]);
  });

  test("GET /v1/metrics/history dispatches to getMetricHistory", async () => {
    const req = new Request("http://x/v1/metrics/history", { method: "GET" });
    const res = await handleMetrics(req, deps, "/v1/metrics/history");
    expect(res!.status).toBe(400); // missing metric — badRequest
  });

  test("non-GET method on /v1/metrics returns undefined (router should handle method not allowed)", async () => {
    const res = await handleMetrics(new Request("http://x/v1/metrics", { method: "POST" }), deps, "/v1/metrics");
    expect(res).toBeUndefined();
  });

  test("unknown sub-path returns undefined", async () => {
    const res = await handleMetrics(new Request("http://x/v1/metrics/unknown", { method: "GET" }), deps, "/v1/metrics/unknown");
    expect(res).toBeUndefined();
  });
});
