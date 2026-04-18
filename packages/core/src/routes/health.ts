import { VERSION } from "../version.ts";

export type HealthPayload = {
  _v: 1;
  status: "ok";
  version: string;
  uptime_seconds: number;
};

export function buildHealth(startedAt: number, now: number = Date.now()): HealthPayload {
  return {
    _v: 1,
    status: "ok",
    version: VERSION,
    uptime_seconds: Math.max(0, Math.floor((now - startedAt) / 1000)),
  };
}
