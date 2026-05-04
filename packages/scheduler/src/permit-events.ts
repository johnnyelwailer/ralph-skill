import type { EventWriter } from "@aloop/state-sqlite";
import type { PermitDecision, PermitOwner } from "./decisions.ts";

export type PermitGrantEvent = {
  readonly permitId: string;
  readonly owner: PermitOwner;
  readonly projectId: string | null;
  readonly providerId: string;
  readonly ttlSeconds: number;
  readonly grantedAt: string;
  readonly expiresAt: string;
};

export type PermitReleaseEvent = {
  readonly permitId: string;
  readonly owner: PermitOwner;
};

export type PermitExpiredEvent = {
  readonly permitId: string;
  readonly owner: PermitOwner;
};

export type PermitDenyEvent = {
  readonly owner: PermitOwner;
  readonly reason: string;
  readonly gate: string;
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
};

/** Serialise a PermitOwner to snake_case event fields. */
function ownerToFields(owner: PermitOwner): Record<string, string> {
  if ("sessionId" in owner) return { session_id: owner.sessionId };
  if ("researchRunId" in owner) return { research_run_id: owner.researchRunId };
  if ("composerTurnId" in owner) return { composer_turn_id: owner.composerTurnId };
  return { control_subagent_run_id: (owner as { controlSubagentRunId: string }).controlSubagentRunId };
}

export async function appendPermitGrant(
  events: EventWriter,
  input: PermitGrantEvent,
): Promise<void> {
  await events.append("scheduler.permit.grant", {
    permit_id: input.permitId,
    ...ownerToFields(input.owner),
    ...(input.projectId !== null ? { project_id: input.projectId } : {}),
    provider_id: input.providerId,
    ttl_seconds: input.ttlSeconds,
    granted_at: input.grantedAt,
    expires_at: input.expiresAt,
  });
}

export async function appendPermitRelease(
  events: EventWriter,
  input: PermitReleaseEvent,
): Promise<void> {
  await events.append("scheduler.permit.release", {
    permit_id: input.permitId,
    ...ownerToFields(input.owner),
  });
}

export async function appendPermitExpired(
  events: EventWriter,
  input: PermitExpiredEvent,
): Promise<void> {
  await events.append("scheduler.permit.expired", {
    permit_id: input.permitId,
    ...ownerToFields(input.owner),
  });
}

export async function appendPermitDeny(
  events: EventWriter,
  input: PermitDenyEvent,
): Promise<PermitDecision> {
  try {
    await events.append("scheduler.permit.deny", {
      ...ownerToFields(input.owner),
      reason: input.reason,
      gate: input.gate,
      details: input.details,
      ...(input.retryAfterSeconds !== undefined
        ? { retry_after_seconds: input.retryAfterSeconds }
        : {}),
    });
  } catch {
    // Audit log failure must not prevent the denial response from being returned.
    // The permit decision is authoritative; event logging is best-effort.
  }
  return {
    granted: false,
    reason: input.reason,
    gate: input.gate,
    details: input.details,
    ...(input.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: input.retryAfterSeconds }
      : {}),
  };
}

export function resolvePermitTtl(
  requested: number | undefined,
  defaultTtlSeconds: number,
  maxTtlSeconds: number,
): number {
  if (requested === undefined) return defaultTtlSeconds;
  return Math.min(requested, maxTtlSeconds);
}
