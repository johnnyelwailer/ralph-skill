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

import type { Database } from "bun:sqlite";
import { badRequest, errorResponse, jsonResponse } from "./http-helpers.ts";

export type MetricsHandlerDeps = { readonly db: Database };

// ── Prometheus text exposition ──────────────────────────────────────────────────

/**
 * Render scheduler_metrics, system_metrics, and provider_metrics as
 * Prometheus text exposition format.
 */
function renderPrometheusText(db: Database): string {
  const lines: string[] = [];

  // Scheduler metrics
  const schedRows = db
    .query<{ metric_name: string; value: number; updated_at: string }, []>(
      `SELECT metric_name, value, updated_at FROM scheduler_metrics`,
    )
    .all();
  for (const r of schedRows) {
    // Prometheus metric line: metric_name value timestamp_ms
    lines.push(`${r.metric_name} ${r.value} ${new Date(r.updated_at).getTime()}`);
  }

  // System metrics
  const sysRows = db
    .query<{ metric_name: string; value: number; updated_at: string }, []>(
      `SELECT metric_name, value, updated_at FROM system_metrics`,
    )
    .all();
  for (const r of sysRows) {
    lines.push(`${r.metric_name} ${r.value} ${new Date(r.updated_at).getTime()}`);
  }

  // Provider metrics (with provider_id as a label)
  const provRows = db
    .query<{ provider_id: string; metric_name: string; value: number; updated_at: string }, []>(
      `SELECT provider_id, metric_name, value, updated_at FROM provider_metrics`,
    )
    .all();
  for (const r of provRows) {
    const labels = `{provider_id="${r.provider_id}"}`;
    lines.push(`${r.metric_name}${labels} ${r.value} ${new Date(r.updated_at).getTime()}`);
  }

  // Orchestrator metrics (labels are stored as JSON)
  const orchRows = db
    .query<{ metric_name: string; labels: string; value: number; updated_at: string }, []>(
      `SELECT metric_name, labels, value, updated_at FROM orchestrator_metrics`,
    )
    .all();
  for (const r of orchRows) {
    const parsed = JSON.parse(r.labels) as Record<string, string>;
    const labelParts = Object.entries(parsed)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    const labelStr = labelParts ? `{${labelParts}}` : "";
    lines.push(`${r.metric_name}${labelStr} ${r.value} ${new Date(r.updated_at).getTime()}`);
  }

  return lines.join("\n") + "\n";
}

// ── GET /v1/metrics ─────────────────────────────────────────────────────────────

export function getMetrics(_req: Request, deps: MetricsHandlerDeps): Response {
  const text = renderPrometheusText(deps.db);
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}

// ── GET /v1/metrics/aggregates ─────────────────────────────────────────────────

export async function getMetricAggregates(
  req: Request,
  deps: MetricsHandlerDeps,
): Promise<Response> {
  const url = new URL(req.url);

  const metricName = url.searchParams.get("metric");
  const windowKind = url.searchParams.get("window") ?? "rolling"; // 'rolling' | 'calendar'
  const windowHours = Number(url.searchParams.get("window_hours") ?? 24);
  const stat = url.searchParams.get("stat") ?? "mean"; // 'sum' | 'mean' | 'min' | 'max' | 'p50' | 'p95' | 'count'
  const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 100));

  if (!metricName) {
    return badRequest("metric query param is required", { metric: metricName });
  }
  if (!["rolling", "calendar"].includes(windowKind)) {
    return badRequest("window must be 'rolling' or 'calendar'", { window: windowKind });
  }
  if (!["sum", "mean", "min", "max", "p50", "p95", "count"].includes(stat)) {
    return badRequest(
      `stat must be one of: sum, mean, min, max, p50, p95, count`,
      { stat },
    );
  }

  try {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const rows = deps.db
      .query<{
        metric_name: string;
        labels: string;
        window_start: string;
        window_end: string;
        window_kind: string;
        stat: string;
        value: number;
        computed_at: string;
      }, [string, string, string, string, number]>(
        `SELECT metric_name, labels, window_start, window_end, window_kind, stat, value, computed_at
         FROM metric_aggregates
         WHERE metric_name = ?
           AND window_kind = ?
           AND stat = ?
           AND window_start >= ?
         ORDER BY window_start DESC
         LIMIT ?`,
      )
      .all(metricName, windowKind, stat, since, limit);

    const items = rows.map((r) => ({
      metric_name: r.metric_name,
      labels: JSON.parse(r.labels) as Record<string, string>,
      window_start: r.window_start,
      window_end: r.window_end,
      window_kind: r.window_kind,
      stat: r.stat,
      value: r.value,
      computed_at: r.computed_at,
    }));

    return jsonResponse(200, { _v: 1, items, next_cursor: null });
  } catch (err) {
    return errorResponse(500, "internal_error", String(err));
  }
}

// ── GET /v1/metrics/history ─────────────────────────────────────────────────────

export async function getMetricHistory(
  req: Request,
  deps: MetricsHandlerDeps,
): Promise<Response> {
  const url = new URL(req.url);

  const metricName = url.searchParams.get("metric");
  const limit = Math.min(10000, Number(url.searchParams.get("limit") ?? 1000));

  if (!metricName) {
    return badRequest("metric query param is required");
  }

  try {
    const rows = deps.db
      .query<{
        id: number;
        metric_name: string;
        labels: string;
        value: number;
        timestamp: string;
      }, [string, number]>(
        `SELECT id, metric_name, labels, value, timestamp
         FROM metric_history
         WHERE metric_name = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(metricName, limit);

    const items = rows.map((r) => ({
      id: r.id,
      metric_name: r.metric_name,
      labels: JSON.parse(r.labels) as Record<string, string>,
      value: r.value,
      timestamp: r.timestamp,
    }));

    return jsonResponse(200, { _v: 1, items, next_cursor: null });
  } catch (err) {
    return errorResponse(500, "internal_error", String(err));
  }
}

// ── Dispatcher ──────────────────────────────────────────────────────────────────

export async function handleMetrics(
  req: Request,
  deps: MetricsHandlerDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/v1/metrics")) return undefined;

  if (pathname === "/v1/metrics" && req.method === "GET") {
    return getMetrics(req, deps);
  }

  if (pathname === "/v1/metrics/aggregates" && req.method === "GET") {
    return getMetricAggregates(req, deps);
  }

  if (pathname === "/v1/metrics/history" && req.method === "GET") {
    return getMetricHistory(req, deps);
  }

  return undefined;
}
