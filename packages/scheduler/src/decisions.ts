import type { ProjectGateConfig, ProviderOverrides, SchedulerLimits } from "@aloop/scheduler-gates";
import type { Permit } from "@aloop/state-sqlite";

export type { ProviderOverrides, SchedulerLimits, ProjectGateConfig };

export type SchedulerConfigView = {
  scheduler(): SchedulerLimits;
  overrides(): ProviderOverrides;
  /**
   * Returns per-project gate limits for the given project.
   * Returns an empty config (both caps = 0 / absent) when the project has no overrides.
   */
  projectLimits(projectId: string): ProjectGateConfig;
  updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult>;
};

/**
 * The owner of a scheduler permit. Exactly one of these three fields must be set.
 * A permit may be owned by an implementation session, a composer turn, or a
 * scoped control subagent run.
 */
export type PermitOwner =
  | { readonly sessionId: string; readonly composerTurnId?: undefined; readonly controlSubagentRunId?: undefined }
  | { readonly sessionId?: undefined; readonly composerTurnId: string; readonly controlSubagentRunId?: undefined }
  | { readonly sessionId?: undefined; readonly composerTurnId?: undefined; readonly controlSubagentRunId: string };

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

export type PermitDenied = {
  readonly granted: false;
  readonly reason: string;
  readonly gate: string;
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
};

export type { PermitGranted };

export type PermitDecision = PermitGranted | PermitDenied;

export type LimitsUpdateResult =
  | { ok: true; limits: SchedulerLimits }
  | { ok: false; errors: readonly string[] }
  | { ok: false; code: "tune_out_of_bounds"; violations: readonly { readonly field: string; readonly requested: number; readonly min: number; readonly max: number }[] };
