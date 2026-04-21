import { cpus, freemem, loadavg, totalmem } from "node:os";

export type SystemSample = {
  readonly cpuPct: number;
  readonly memPct: number;
  readonly loadAvg: number;
};

export type ProviderQuotaSample = {
  readonly ok: boolean;
  readonly reason?: string;
  readonly retryAfterSeconds?: number;
  readonly remaining?: number;
  readonly resetAt?: string;
  readonly details?: Record<string, unknown>;
};

export type BurnRateSample = {
  readonly tokensSinceLastCommit: number;
  readonly commitsPerHour: number;
};

export type SchedulerProbes = {
  systemSample?: () => SystemSample;
  providerQuota?: (
    providerId: string,
  ) => ProviderQuotaSample | Promise<ProviderQuotaSample | null> | null;
  burnRate?: (
    sessionId: string,
  ) => BurnRateSample | Promise<BurnRateSample | null> | null;
};

export const DEFAULT_SCHEDULER_PROBES: Required<Pick<SchedulerProbes, "systemSample">> = {
  systemSample: defaultSystemSample,
};

function defaultSystemSample(): SystemSample {
  const cpuCount = Math.max(1, cpus().length);
  const la = loadavg()[0] ?? 0;
  const cpuPct = clampPct((la / cpuCount) * 100);
  const total = Math.max(1, totalmem());
  const used = Math.max(0, total - freemem());
  const memPct = clampPct((used / total) * 100);
  return { cpuPct, memPct, loadAvg: la };
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
