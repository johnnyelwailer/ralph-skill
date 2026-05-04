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

/** Per-project daily cost snapshot returned by the projectDailyCost probe. */
export type ProjectDailyCostSample = {
  readonly costUsdCents: number;
  readonly tokens: number;
};

export type SchedulerProbes = {
  systemSample?: () => SystemSample;
  providerQuota?: (
    providerId: string,
  ) => ProviderQuotaSample | Promise<ProviderQuotaSample | null> | null;
  burnRate?: (
    sessionId: string,
  ) => BurnRateSample | Promise<BurnRateSample | null> | null;
  /**
   * Returns the number of active (non-expired) permits currently held by a project.
   * Called when a permit request arrives to evaluate the project-concurrency cap.
   *
   * @param projectId - the project the requesting session belongs to
   */
  projectPermits?: (
    projectId: string,
  ) => number | Promise<number> | null;
  /**
   * Returns per-project daily cost/token usage for the project a session belongs to.
   * Called when a permit request arrives to evaluate the project-gate.
   *
   * @param projectId - the project the requesting session belongs to
   * @param date      - YYYY-MM-DD date string for the daily bucket
   */
  projectDailyCost?: (
    projectId: string,
    date: string,
  ) => ProjectDailyCostSample | Promise<ProjectDailyCostSample | null> | null;
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
