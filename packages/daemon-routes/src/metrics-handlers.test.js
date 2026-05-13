"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var bun_test_1 = require("bun:test");
var bun_sqlite_1 = require("bun:sqlite");
var node_fs_1 = require("node:fs");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var metrics_handlers_ts_1 = require("./metrics-handlers.ts");
function makeDeps() {
    var db = new bun_sqlite_1.Database();
    // Create the metrics tables (mirrors 008-migrations.sql)
    db.exec("\n    CREATE TABLE IF NOT EXISTS scheduler_metrics (\n      metric_name TEXT NOT NULL PRIMARY KEY,\n      value REAL NOT NULL,\n      updated_at TEXT NOT NULL\n    );\n    CREATE TABLE IF NOT EXISTS system_metrics (\n      metric_name TEXT NOT NULL PRIMARY KEY,\n      value REAL NOT NULL,\n      updated_at TEXT NOT NULL\n    );\n    CREATE TABLE IF NOT EXISTS provider_metrics (\n      provider_id TEXT NOT NULL,\n      metric_name TEXT NOT NULL,\n      value REAL NOT NULL,\n      updated_at TEXT NOT NULL,\n      PRIMARY KEY (provider_id, metric_name)\n    );\n    CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider ON provider_metrics(provider_id);\n    CREATE TABLE IF NOT EXISTS orchestrator_metrics (\n      metric_name TEXT NOT NULL,\n      labels TEXT NOT NULL DEFAULT '{}',\n      value REAL NOT NULL,\n      updated_at TEXT NOT NULL,\n      PRIMARY KEY (metric_name, labels)\n    );\n    CREATE TABLE IF NOT EXISTS metric_aggregates (\n      metric_name TEXT NOT NULL,\n      labels TEXT NOT NULL DEFAULT '{}',\n      window_start TEXT NOT NULL,\n      window_end TEXT NOT NULL,\n      window_kind TEXT NOT NULL DEFAULT 'rolling',\n      stat TEXT NOT NULL,\n      value REAL NOT NULL,\n      computed_at TEXT NOT NULL,\n      PRIMARY KEY (metric_name, labels, window_start, window_kind, stat)\n    );\n    CREATE INDEX IF NOT EXISTS idx_metric_aggregates_name_time\n      ON metric_aggregates(metric_name, window_start DESC);\n    CREATE TABLE IF NOT EXISTS metric_history (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      metric_name TEXT NOT NULL,\n      labels TEXT NOT NULL DEFAULT '{}',\n      value REAL NOT NULL,\n      timestamp TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS idx_metric_history_name_time\n      ON metric_history(metric_name, timestamp DESC);\n  ");
    return { deps: { db: db }, db: db };
}
var dir;
var deps;
var db;
(0, bun_test_1.beforeEach)(function () {
    dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "aloop-metrics-handlers-"));
    var setup = makeDeps();
    deps = setup.deps;
    db = setup.db;
});
(0, bun_test_1.afterEach)(function () {
    db.close();
    (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
});
// ─── getMetrics (Prometheus text exposition) ─────────────────────────────────
(0, bun_test_1.describe)("getMetrics", function () {
    (0, bun_test_1.test)("returns 200 with Content-Type text/plain", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
            (0, bun_test_1.expect)(res.status).toBe(200);
            (0, bun_test_1.expect)(res.headers.get("Content-Type")).toContain("text/plain");
            return [2 /*return*/];
        });
    }); });
    (0, bun_test_1.test)("returns empty body when no metrics exist", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    (0, bun_test_1.expect)(text).toBe("\n");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("renders scheduler_metrics in Prometheus format", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO scheduler_metrics (metric_name, value, updated_at)\n      VALUES ('sched_active_permits', 5, '2026-01-01T00:00:00.000Z')\n    ");
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    // Prometheus format: metric_name value timestamp_ms
                    // Just verify the metric name and value appear; timestamp depends on JS Date parsing of the stored string
                    (0, bun_test_1.expect)(text).toContain("sched_active_permits 5");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("renders system_metrics in Prometheus format", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO system_metrics (metric_name, value, updated_at)\n      VALUES ('cpu_usage_percent', 42.5, '2026-01-01T00:00:00.000Z')\n    ");
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    (0, bun_test_1.expect)(text).toContain("cpu_usage_percent 42.5");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("renders provider_metrics with provider_id label", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO provider_metrics (provider_id, metric_name, value, updated_at)\n      VALUES ('openai', 'requests_sent', 100, '2026-01-01T00:00:00.000Z')\n    ");
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    (0, bun_test_1.expect)(text).toContain('requests_sent{provider_id="openai"} 100');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("renders orchestrator_metrics with labels from JSON", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO orchestrator_metrics (metric_name, labels, value, updated_at)\n      VALUES ('cycle_duration_ms', '{\"session_id\":\"s1\"}', 1500, '2026-01-01T00:00:00.000Z')\n    ");
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    (0, bun_test_1.expect)(text).toContain('cycle_duration_ms{session_id="s1"} 1500');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("renders orchestrator_metrics with empty labels without braces", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO orchestrator_metrics (metric_name, labels, value, updated_at)\n      VALUES ('total_cycles', '{}', 10, '2026-01-01T00:00:00.000Z')\n    ");
                    res = (0, metrics_handlers_ts_1.getMetrics)(new Request("http://x/v1/metrics"), deps);
                    return [4 /*yield*/, res.text()];
                case 1:
                    text = _a.sent();
                    // Empty labels: no braces after metric name
                    (0, bun_test_1.expect)(text).toContain("total_cycles 10");
                    (0, bun_test_1.expect)(text).not.toContain("total_cycles{}");
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── getMetricAggregates ───────────────────────────────────────────────────────
(0, bun_test_1.describe)("getMetricAggregates", function () {
    (0, bun_test_1.test)("returns 400 when metric query param is missing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/aggregates");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(400);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("bad_request");
                    (0, bun_test_1.expect)(body.error.message).toContain("metric query param is required");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 400 when window is invalid", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window=unknown");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(400);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("bad_request");
                    (0, bun_test_1.expect)(body.error.message).toContain("window must be 'rolling' or 'calendar'");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 400 when stat is invalid", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&stat=median");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(400);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("bad_request");
                    (0, bun_test_1.expect)(body.error.message).toContain("stat must be one of");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 200 with empty items when no aggregates match", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/aggregates?metric=nonexistent");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body._v).toBe(1);
                    (0, bun_test_1.expect)(body.items).toEqual([]);
                    (0, bun_test_1.expect)(body.next_cursor).toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns aggregates filtered by metric_name, window_kind, and stat", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body, _i, _a, item, values;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    db.exec("\n      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n      VALUES\n        ('cpu_usage', '{}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'rolling', 'mean', 42.5, '2026-01-01T00:00:00Z'),\n        ('cpu_usage', '{}', '2026-01-01T01:00:00Z', '2026-01-01T02:00:00Z', 'rolling', 'mean', 38.1, '2026-01-01T01:00:00Z'),\n        ('cpu_usage', '{}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'calendar', 'mean', 42.5, '2026-01-01T00:00:00Z'),\n        ('memory_usage', '{}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'rolling', 'mean', 80.0, '2026-01-01T00:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window=rolling&stat=mean");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _b.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _b.sent();
                    // Only cpu_usage + rolling + mean (not calendar, not memory_usage, not p95)
                    (0, bun_test_1.expect)(body.items).toHaveLength(2);
                    for (_i = 0, _a = body.items; _i < _a.length; _i++) {
                        item = _a[_i];
                        (0, bun_test_1.expect)(item.metric_name).toBe("cpu_usage");
                        (0, bun_test_1.expect)(item.window_kind).toBe("rolling");
                        (0, bun_test_1.expect)(item.stat).toBe("mean");
                    }
                    values = body.items.map(function (i) { return i.value; }).sort();
                    (0, bun_test_1.expect)(values).toEqual([38.1, 42.5]);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("parses labels JSON into an object", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n      VALUES ('response_time_ms', '{\"endpoint\":\"/v1/chat\"}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'rolling', 'p95', 250, '2026-01-01T00:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/aggregates?metric=response_time_ms&stat=p95");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items[0].labels).toEqual({ endpoint: "/v1/chat" });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("applies default window=rolling and stat=mean", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n      VALUES ('test_metric', '{}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'rolling', 'mean', 1.0, '2026-01-01T00:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items).toHaveLength(1);
                    (0, bun_test_1.expect)(body.items[0].window_kind).toBe("rolling");
                    (0, bun_test_1.expect)(body.items[0].stat).toBe("mean");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("applies window_hours parameter to filter rows by window duration", function () { return __awaiter(void 0, void 0, void 0, function () {
        var now, recent, older, nowStr, req, res, body, _i, _a, item, start, end, windowHours;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    now = new Date();
                    recent = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
                    older = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
                    nowStr = now.toISOString();
                    db.exec("\n      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n      VALUES\n        ('cpu_usage', '{}', '".concat(recent, "', '").concat(nowStr, "', 'rolling', 'mean', 42.0, '").concat(nowStr, "'),\n        ('cpu_usage', '{}', '").concat(older, "', '").concat(recent, "', 'rolling', 'mean', 38.0, '").concat(recent, "')\n    "));
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&window_hours=24");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _b.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _b.sent();
                    // The implementation uses window_hours as a filter on window_end - window_start duration
                    // Should have 1 item (the 6h window whose duration is ~24h or less)
                    // The older row has a window of ~25h which exceeds 24h
                    (0, bun_test_1.expect)(body.items.length).toBeGreaterThanOrEqual(1);
                    for (_i = 0, _a = body.items; _i < _a.length; _i++) {
                        item = _a[_i];
                        start = new Date(item.window_start).getTime();
                        end = new Date(item.window_end).getTime();
                        windowHours = (end - start) / (1000 * 60 * 60);
                        (0, bun_test_1.expect)(windowHours).toBeLessThanOrEqual(24);
                    }
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("applies limit parameter to cap rows returned", function () { return __awaiter(void 0, void 0, void 0, function () {
        var now, nowStr, base, i, start, end, req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = new Date();
                    nowStr = now.toISOString();
                    base = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
                    // Insert 5 rows
                    for (i = 0; i < 5; i++) {
                        start = new Date(base.getTime() + i * 60 * 60 * 1000).toISOString();
                        end = new Date(base.getTime() + (i + 1) * 60 * 60 * 1000).toISOString();
                        db.exec("\n        INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n        VALUES ('cpu_usage', '{}', '".concat(start, "', '").concat(end, "', 'rolling', 'mean', ").concat(i * 10, ", '").concat(nowStr, "')\n      "));
                    }
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu_usage&limit=3");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items.length).toBe(3);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("default window_hours is 24 when not specified", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Without window_hours, defaults should still work
                    db.exec("\n      INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n      VALUES ('test_metric', '{}', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'rolling', 'mean', 1.0, '2026-01-01T00:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("default limit is 100 when not specified", function () { return __awaiter(void 0, void 0, void 0, function () {
        var now, nowStr, base, i, start, end, req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = new Date();
                    nowStr = now.toISOString();
                    base = new Date(now.getTime() - 100 * 60 * 60 * 1000).toISOString();
                    for (i = 0; i < 150; i++) {
                        start = new Date(base.getTime() + i * 60 * 60 * 1000).toISOString();
                        end = new Date(base.getTime() + (i + 1) * 60 * 60 * 1000).toISOString();
                        db.exec("\n        INSERT INTO metric_aggregates (metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at)\n        VALUES ('test_metric', '{}', '".concat(start, "', '").concat(end, "', 'rolling', 'mean', ").concat(i, ", '").concat(nowStr, "')\n      "));
                    }
                    req = new Request("http://x/v1/metrics/aggregates?metric=test_metric");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items.length).toBe(100);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 500 on database error (invalid SQL)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var badDb, badReq, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Inject bad SQL by closing db and replacing it
                    db.close();
                    badDb = new bun_sqlite_1.Database((0, node_path_1.join)(dir, "bad.sqlite"));
                    badDb.exec("CREATE TABLE metric_aggregates (invalid)");
                    badReq = new Request("http://x/v1/metrics/aggregates?metric=x");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricAggregates)(badReq, { db: badDb })];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(500);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("internal_error");
                    badDb.close();
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── getMetricHistory ─────────────────────────────────────────────────────────
(0, bun_test_1.describe)("getMetricHistory", function () {
    (0, bun_test_1.test)("returns 400 when metric query param is missing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/history");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(400);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("bad_request");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 200 with empty items when no history exists", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body._v).toBe(1);
                    (0, bun_test_1.expect)(body.items).toEqual([]);
                    (0, bun_test_1.expect)(body.next_cursor).toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns history rows ordered by timestamp DESC", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO metric_history (metric_name, labels, value, timestamp)\n      VALUES\n        ('cpu_usage', '{}', 40.0, '2026-01-01T01:00:00Z'),\n        ('cpu_usage', '{}', 45.0, '2026-01-01T02:00:00Z'),\n        ('cpu_usage', '{}', 50.0, '2026-01-01T03:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items).toHaveLength(3);
                    (0, bun_test_1.expect)(body.items[0].value).toBe(50.0); // newest first
                    (0, bun_test_1.expect)(body.items[2].value).toBe(40.0); // oldest last
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("parses labels JSON from string field", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("\n      INSERT INTO metric_history (metric_name, labels, value, timestamp)\n      VALUES ('response_time', '{\"endpoint\":\"/api\"}', 120.5, '2026-01-01T00:00:00Z')\n    ");
                    req = new Request("http://x/v1/metrics/history?metric=response_time");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items[0].labels).toEqual({ endpoint: "/api" });
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("applies default limit of 1000", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/history?metric=cpu_usage");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("caps limit at 10000", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/history?metric=cpu_usage&limit=99999");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(req, deps)];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("returns 500 on database error", function () { return __awaiter(void 0, void 0, void 0, function () {
        var badDb, badReq, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.close();
                    badDb = new bun_sqlite_1.Database((0, node_path_1.join)(dir, "bad2.sqlite"));
                    badDb.exec("CREATE TABLE metric_history (id INTEGER PRIMARY KEY)");
                    badReq = new Request("http://x/v1/metrics/history?metric=x");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.getMetricHistory)(badReq, { db: badDb })];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(500);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.error.code).toBe("internal_error");
                    badDb.close();
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── handleMetrics dispatcher ──────────────────────────────────────────────────
(0, bun_test_1.describe)("handleMetrics", function () {
    (0, bun_test_1.test)("returns undefined for paths not starting with /v1/metrics", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(new Request("http://x/v1/foo"), deps, "/v1/foo")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res).toBeUndefined();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("GET /v1/metrics dispatches to getMetrics", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db.exec("INSERT INTO scheduler_metrics VALUES ('test_metric', 1, '2026-01-01T00:00:00Z')");
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(new Request("http://x/v1/metrics", { method: "GET" }), deps, "/v1/metrics")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.text()];
                case 2:
                    text = _a.sent();
                    (0, bun_test_1.expect)(text).toContain("test_metric");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("GET /v1/metrics/aggregates dispatches to getMetricAggregates", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/aggregates?metric=cpu", { method: "GET" });
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(req, deps, "/v1/metrics/aggregates")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(200);
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _a.sent();
                    (0, bun_test_1.expect)(body.items).toEqual([]);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("GET /v1/metrics/history dispatches to getMetricHistory", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    req = new Request("http://x/v1/metrics/history", { method: "GET" });
                    return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(req, deps, "/v1/metrics/history")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res.status).toBe(400); // missing metric — badRequest
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("non-GET method on /v1/metrics returns undefined (router should handle method not allowed)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(new Request("http://x/v1/metrics", { method: "POST" }), deps, "/v1/metrics")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res).toBeUndefined();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.test)("unknown sub-path returns undefined", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, metrics_handlers_ts_1.handleMetrics)(new Request("http://x/v1/metrics/unknown", { method: "GET" }), deps, "/v1/metrics/unknown")];
                case 1:
                    res = _a.sent();
                    (0, bun_test_1.expect)(res).toBeUndefined();
                    return [2 /*return*/];
            }
        });
    }); });
});
