import type { Permit } from "@aloop/state-sqlite";

export type SchedulerLimits = {
  readonly concurrencyCap: number;
  readonly permitTtlDefaultSeconds: number;
  readonly permitTtlMaxSeconds: number;
  readonly systemLimits: {
    readonly cpuMaxPct: number;
    readonly memMaxPct: number;
    readonly loadMax: number;
  };
  readonly burnRate: {
    readonly maxTokensSinceCommit: number;
    readonly minCommitsPerHour: number;
  };
};

export type ProviderOverrides = {
  readonly allow: readonly string[] | null;
  readonly deny: readonly string[] | null;
  readonly force: string | null;
};

export type SchedulerConfigView = {
  scheduler(): SchedulerLimits;
  overrides(): ProviderOverrides;
  updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult>;
};

export type AcquirePermitInput = {
  readonly sessionId: string;
  readonly providerCandidate: string;
  readonly ttlSeconds?: number;
};

type PermitGranted = {
  readonly granted: true;
  readonly permit: Permit;
};

type PermitDenied = {
  readonly granted: false;
  readonly reason: string;
  readonly gate: string;
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
};

export type PermitDecision = PermitGranted | PermitDenied;

export type LimitsUpdateResult =
  | { ok: true; limits: SchedulerLimits }
  | { ok: false; errors: readonly string[] };
