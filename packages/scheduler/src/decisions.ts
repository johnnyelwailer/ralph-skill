import type { ProviderOverrides, SchedulerLimits } from "@aloop/scheduler-gates";
import type { Permit } from "@aloop/state-sqlite";

export type { ProviderOverrides, SchedulerLimits };

export type SchedulerConfigView = {
  scheduler(): SchedulerLimits;
  overrides(): ProviderOverrides;
  updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult>;
};

/**
 * The owner of a scheduler permit. Exactly one of these four fields must be set.
 * A permit may be owned by an implementation session, an incubation research run,
 * a composer turn, or a scoped control subagent run.
 */
export type PermitOwner =
  | { readonly sessionId: string; readonly researchRunId?: undefined; readonly composerTurnId?: undefined; readonly controlSubagentRunId?: undefined }
  | { readonly sessionId?: undefined; readonly researchRunId: string; readonly composerTurnId?: undefined; readonly controlSubagentRunId?: undefined }
  | { readonly sessionId?: undefined; readonly researchRunId?: undefined; readonly composerTurnId: string; readonly controlSubagentRunId?: undefined }
  | { readonly sessionId?: undefined; readonly researchRunId?: undefined; readonly composerTurnId?: undefined; readonly controlSubagentRunId: string };

export type AcquirePermitInput = PermitOwner & {
  /** The project this owner belongs to. Used for project-gate evaluation. */
  readonly projectId: string | null;
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
