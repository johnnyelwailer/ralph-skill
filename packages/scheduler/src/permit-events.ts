import type { EventWriter } from "@aloop/state-sqlite";
import type { PermitDecision } from "./decisions.ts";

export async function appendPermitGrant(
  events: EventWriter,
  input: {
    permitId: string;
    sessionId: string;
    providerId: string;
    ttlSeconds: number;
    grantedAt: string;
    expiresAt: string;
  },
): Promise<void> {
  await events.append("scheduler.permit.grant", {
    permit_id: input.permitId,
    session_id: input.sessionId,
    provider_id: input.providerId,
    ttl_seconds: input.ttlSeconds,
    granted_at: input.grantedAt,
    expires_at: input.expiresAt,
  });
}

export async function appendPermitRelease(
  events: EventWriter,
  input: { permitId: string; sessionId: string },
): Promise<void> {
  await events.append("scheduler.permit.release", {
    permit_id: input.permitId,
    session_id: input.sessionId,
  });
}

export async function appendPermitExpired(
  events: EventWriter,
  input: { permitId: string; sessionId: string },
): Promise<void> {
  await events.append("scheduler.permit.expired", {
    permit_id: input.permitId,
    session_id: input.sessionId,
  });
}

export async function appendPermitDeny(
  events: EventWriter,
  input: {
    sessionId: string;
    reason: string;
    gate: string;
    details: Record<string, unknown>;
    retryAfterSeconds?: number;
  },
): Promise<PermitDecision> {
  await events.append("scheduler.permit.deny", {
    session_id: input.sessionId,
    reason: input.reason,
    gate: input.gate,
    details: input.details,
    ...(input.retryAfterSeconds !== undefined
      ? { retry_after_seconds: input.retryAfterSeconds }
      : {}),
  });
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
