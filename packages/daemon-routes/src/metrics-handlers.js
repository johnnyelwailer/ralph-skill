"use strict";
/**
 * Metrics route handlers.
 *
 * Exposes the metrics projection tables defined in metrics.md §Exposure:
 *   GET /v1/metrics          — Prometheus-compatible text exposition
 *   GET /v1/metrics/aggregates — windowed aggregates (histograms / ratios)
 *
 * All values are daemon-computed from events. No agent-reported metrics
 * are accepted here — that path is blocked by the DGM-resistance rule
 * (metrics.md §Emission discipline).
 */
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
exports.getMetrics = getMetrics;
exports.getMetricAggregates = getMetricAggregates;
exports.getMetricHistory = getMetricHistory;
exports.handleMetrics = handleMetrics;
var http_helpers_ts_1 = require("./http-helpers.ts");
// ── Prometheus text exposition ──────────────────────────────────────────────────
/**
 * Render scheduler_metrics, system_metrics, and provider_metrics as
 * Prometheus text exposition format.
 */
function renderPrometheusText(db) {
    var lines = [];
    // Scheduler metrics
    var schedRows = db
        .query("SELECT metric_name, value, updated_at FROM scheduler_metrics")
        .all();
    for (var _i = 0, schedRows_1 = schedRows; _i < schedRows_1.length; _i++) {
        var r = schedRows_1[_i];
        // Prometheus metric line: metric_name value timestamp_ms
        lines.push("".concat(r.metric_name, " ").concat(r.value, " ").concat(new Date(r.updated_at).getTime()));
    }
    // System metrics
    var sysRows = db
        .query("SELECT metric_name, value, updated_at FROM system_metrics")
        .all();
    for (var _a = 0, sysRows_1 = sysRows; _a < sysRows_1.length; _a++) {
        var r = sysRows_1[_a];
        lines.push("".concat(r.metric_name, " ").concat(r.value, " ").concat(new Date(r.updated_at).getTime()));
    }
    // Provider metrics (with provider_id as a label)
    var provRows = db
        .query("SELECT provider_id, metric_name, value, updated_at FROM provider_metrics")
        .all();
    for (var _b = 0, provRows_1 = provRows; _b < provRows_1.length; _b++) {
        var r = provRows_1[_b];
        var labels = "{provider_id=\"".concat(r.provider_id, "\"}");
        lines.push("".concat(r.metric_name).concat(labels, " ").concat(r.value, " ").concat(new Date(r.updated_at).getTime()));
    }
    // Orchestrator metrics (labels are stored as JSON)
    var orchRows = db
        .query("SELECT metric_name, labels, value, updated_at FROM orchestrator_metrics")
        .all();
    for (var _c = 0, orchRows_1 = orchRows; _c < orchRows_1.length; _c++) {
        var r = orchRows_1[_c];
        var parsed = JSON.parse(r.labels);
        var labelParts = Object.entries(parsed)
            .map(function (_a) {
            var k = _a[0], v = _a[1];
            return "".concat(k, "=\"").concat(v, "\"");
        })
            .join(",");
        var labelStr = labelParts ? "{".concat(labelParts, "}") : "";
        lines.push("".concat(r.metric_name).concat(labelStr, " ").concat(r.value, " ").concat(new Date(r.updated_at).getTime()));
    }
    return lines.join("\n") + "\n";
}
// ── GET /v1/metrics ─────────────────────────────────────────────────────────────
function getMetrics(_req, deps) {
    var text = renderPrometheusText(deps.db);
    return new Response(text, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        },
    });
}
// ── GET /v1/metrics/aggregates ─────────────────────────────────────────────────
function getMetricAggregates(req, deps) {
    return __awaiter(this, void 0, void 0, function () {
        var url, metricName, windowKind, windowHours, stat, limit, rows, items;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            url = new URL(req.url);
            metricName = url.searchParams.get("metric");
            windowKind = (_a = url.searchParams.get("window")) !== null && _a !== void 0 ? _a : "rolling";
            windowHours = Number((_b = url.searchParams.get("window_hours")) !== null && _b !== void 0 ? _b : 24);
            stat = (_c = url.searchParams.get("stat")) !== null && _c !== void 0 ? _c : "mean";
            limit = Math.min(1000, Number((_d = url.searchParams.get("limit")) !== null && _d !== void 0 ? _d : 100));
            if (!metricName) {
                return [2 /*return*/, (0, http_helpers_ts_1.badRequest)("metric query param is required", { metric: metricName })];
            }
            if (!["rolling", "calendar"].includes(windowKind)) {
                return [2 /*return*/, (0, http_helpers_ts_1.badRequest)("window must be 'rolling' or 'calendar'", { window: windowKind })];
            }
            if (!["sum", "mean", "min", "max", "p50", "p95", "count"].includes(stat)) {
                return [2 /*return*/, (0, http_helpers_ts_1.badRequest)("stat must be one of: sum, mean, min, max, p50, p95, count", { stat: stat })];
            }
            try {
                rows = deps.db
                    .query("SELECT metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at\n         FROM metric_aggregates\n         WHERE metric_name = ?\n           AND window_kind = ?\n           AND stat = ?\n         ORDER BY window_start DESC\n         LIMIT ?")
                    .all(metricName, windowKind, stat, limit);
                items = rows.map(function (r) { return ({
                    metric_name: r.metric_name,
                    labels: JSON.parse(r.labels),
                    window_start: r.window_start,
                    window_end: r.window_end,
                    window_kind: r.window_kind,
                    stat: r.stat,
                    value: r.value,
                    computed_at: r.computed_at,
                }); });
                return [2 /*return*/, (0, http_helpers_ts_1.jsonResponse)(200, { _v: 1, items: items, next_cursor: null })];
            }
            catch (err) {
                return [2 /*return*/, (0, http_helpers_ts_1.errorResponse)(500, "internal_error", String(err))];
            }
            return [2 /*return*/];
        });
    });
}
// ── GET /v1/metrics/history ─────────────────────────────────────────────────────
function getMetricHistory(req, deps) {
    return __awaiter(this, void 0, void 0, function () {
        var url, metricName, limit, rows, items;
        var _a;
        return __generator(this, function (_b) {
            url = new URL(req.url);
            metricName = url.searchParams.get("metric");
            limit = Math.min(10000, Number((_a = url.searchParams.get("limit")) !== null && _a !== void 0 ? _a : 1000));
            if (!metricName) {
                return [2 /*return*/, (0, http_helpers_ts_1.badRequest)("metric query param is required")];
            }
            try {
                rows = deps.db
                    .query("SELECT id, metric_name, labels, value, timestamp\n         FROM metric_history\n         WHERE metric_name = ?\n         ORDER BY timestamp DESC\n         LIMIT ?")
                    .all(metricName, limit);
                items = rows.map(function (r) { return ({
                    id: r.id,
                    metric_name: r.metric_name,
                    labels: JSON.parse(r.labels),
                    value: r.value,
                    timestamp: r.timestamp,
                }); });
                return [2 /*return*/, (0, http_helpers_ts_1.jsonResponse)(200, { _v: 1, items: items, next_cursor: null })];
            }
            catch (err) {
                return [2 /*return*/, (0, http_helpers_ts_1.errorResponse)(500, "internal_error", String(err))];
            }
            return [2 /*return*/];
        });
    });
}
// ── Dispatcher ──────────────────────────────────────────────────────────────────
function handleMetrics(req, deps, pathname) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!pathname.startsWith("/v1/metrics"))
                return [2 /*return*/, undefined];
            if (pathname === "/v1/metrics" && req.method === "GET") {
                return [2 /*return*/, getMetrics(req, deps)];
            }
            if (pathname === "/v1/metrics/aggregates" && req.method === "GET") {
                return [2 /*return*/, getMetricAggregates(req, deps)];
            }
            if (pathname === "/v1/metrics/history" && req.method === "GET") {
                return [2 /*return*/, getMetricHistory(req, deps)];
            }
            return [2 /*return*/, undefined];
        });
    });
}
