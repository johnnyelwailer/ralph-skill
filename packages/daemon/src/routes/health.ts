import { VERSION } from "../version.ts";

export type HealthPayload = {
  _v: 1;
  status: "ok";
  version: string;
  uptime_seconds: number;
  counters: {
    sessions_total: number;
    sessions_by_status: Record<string, number>;
    permits_in_flight: number;
  };
};

export type HealthCounters = {
  sessionsTotal: number;
  sessionsByStatus: Record<string, number>;
  permitsInFlight: number;
};

function toSnakeCounters(c?: HealthCounters): HealthPayload["counters"] {
  if (!c) return { sessions_total: 0, sessions_by_status: {}, permits_in_flight: 0 };
  return {
    sessions_total: c.sessionsTotal,
    sessions_by_status: c.sessionsByStatus,
    permits_in_flight: c.permitsInFlight,
  };
}

export function buildHealth(
  startedAt: number,
  now: number = Date.now(),
  counters?: HealthCounters,
): HealthPayload {
  return {
    _v: 1,
    status: "ok",
    version: VERSION,
    uptime_seconds: Math.max(0, Math.floor((now - startedAt) / 1000)),
    counters: toSnakeCounters(counters),
  };
}
