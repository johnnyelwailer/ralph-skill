import { PermitRegistry, type EventWriter } from "@aloop/state-sqlite";
import {
  applyOverrides,
  checkBurnRateGate,
  checkProjectGate,
  checkSystemGate,
  type SchedulerProbes,
} from "@aloop/scheduler-gates";
import type {
  AcquirePermitInput,
  PermitDecision,
  PermitOwner,
  SchedulerConfigView,
} from "./decisions.ts";
import {
  appendPermitDeny,
  appendPermitGrant,
  resolvePermitTtl,
} from "./permit-events.ts";

export type AcquirePermitDeps = {
  readonly permits: PermitRegistry;
  readonly config: SchedulerConfigView;
  readonly events: EventWriter;
  readonly probes: SchedulerProbes;
};

/** Extract the PermitOwner discriminant from an AcquirePermitInput. */
function ownerFrom(input: AcquirePermitInput): PermitOwner {
  if ("sessionId" in input) return { sessionId: input.sessionId };
  if ("researchRunId" in input) return { researchRunId: input.researchRunId };
  if ("composerTurnId" in input) return { composerTurnId: input.composerTurnId };
  return { controlSubagentRunId: (input as { controlSubagentRunId: string }).controlSubagentRunId };
}

/** Primary ID string for a PermitOwner (used as lookup key in gates/probes). */
function primaryId(owner: PermitOwner): string {
  if ("sessionId" in owner) return owner.sessionId;
  if ("researchRunId" in owner) return owner.researchRunId;
  if ("composerTurnId" in owner) return owner.composerTurnId;
  return (owner as { controlSubagentRunId: string }).controlSubagentRunId;
}

export async function acquirePermitDecision(
  deps: AcquirePermitDeps,
  input: AcquirePermitInput,
): Promise<PermitDecision> {
  const owner = ownerFrom(input);
  const primaryKey = primaryId(owner);

  const overrideDecision = applyOverrides(input.providerCandidate, deps.config.overrides());
  if (!overrideDecision.ok) {
    return appendPermitDeny(deps.events, {
      owner,
      reason: overrideDecision.reason,
      gate: "overrides",
      details: overrideDecision.details,
    });
  }

  const cap = deps.config.scheduler().concurrencyCap;
  const active = deps.permits.countActive();
  if (active >= cap) {
    return appendPermitDeny(deps.events, {
      owner,
      reason: "concurrency_cap_reached",
      gate: "concurrency",
      details: {
        active_permits: active,
        concurrency_cap: cap,
      },
    });
  }

  const systemGate = checkSystemGate(
    deps.probes.systemSample,
    deps.config.scheduler().systemLimits,
  );
  if (!systemGate.ok) {
    return appendPermitDeny(deps.events, {
      owner,
      reason: systemGate.reason,
      gate: "system",
      details: systemGate.details,
    });
  }

  const quota = await deps.probes.providerQuota?.(overrideDecision.providerId);
  if (quota && !quota.ok) {
    return appendPermitDeny(deps.events, {
      owner,
      reason: quota.reason ?? "provider_quota_exceeded",
      gate: "provider",
      details: {
        provider_id: overrideDecision.providerId,
        ...(quota.remaining !== undefined ? { remaining: quota.remaining } : {}),
        ...(quota.resetAt !== undefined ? { reset_at: quota.resetAt } : {}),
        ...(quota.details ?? {}),
      },
      ...(quota.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: quota.retryAfterSeconds }
        : {}),
    });
  }

  const burn = await deps.probes.burnRate?.(primaryKey);
  if (burn) {
    const burnGate = await checkBurnRateGate(
      deps.events,
      primaryKey,
      burn,
      deps.config.scheduler().burnRate,
    );
    if (!burnGate.ok) {
      return appendPermitDeny(deps.events, {
        owner,
        reason: "burn_rate_exceeded",
        gate: "burn_rate",
        details: burnGate.details,
      });
    }
  }

  // Project-level gate: concurrency cap and daily cost cap per project.
  // Only evaluated when input.projectId is non-null and project limits are configured.
  if (input.projectId !== null) {
    const projectGate = await checkProjectGate(
      input.projectId,
      deps.permits.countByProject(input.projectId),
      deps.config.projectLimits(input.projectId),
      deps.probes,
    );
    if (!projectGate.ok) {
      return appendPermitDeny(deps.events, {
        owner,
        reason: projectGate.reason,
        gate: "project",
        details: projectGate.details,
      });
    }
  }

  const scheduler = deps.config.scheduler();
  const ttlSeconds = resolvePermitTtl(
    input.ttlSeconds,
    scheduler.permitTtlDefaultSeconds,
    scheduler.permitTtlMaxSeconds,
  );
  const permitId = `perm_${crypto.randomUUID()}`;
  const grantedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(grantedAt) + ttlSeconds * 1000).toISOString();

  await appendPermitGrant(deps.events, {
    permitId,
    owner,
    projectId: input.projectId,
    providerId: overrideDecision.providerId,
    ttlSeconds,
    grantedAt,
    expiresAt,
  });

  return { granted: true, permit: deps.permits.get(permitId)! };
}
