import type { ProviderOverrides, SchedulerLimits } from "@aloop/scheduler-gates";
import type { Permit } from "@aloop/state-sqlite";

export type { ProviderOverrides, SchedulerLimits };

export type SchedulerConfigView = {
  scheduler(): SchedulerLimits;
  overrides(): ProviderOverrides;
  updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult>;
};

export type AcquirePermitInput = {
  readonly sessionId: string;
  readonly providerCandidate: string;
  readonly ttlSeconds?: number;
  /** Estimated USD cost of the turn, used for budget gate decisions. */
  readonly estimatedCostUsd?: number;
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
