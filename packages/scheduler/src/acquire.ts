import { PermitRegistry, type EventWriter } from "@aloop/state-sqlite";
import {
  applyOverrides,
  checkBurnRateGate,
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
  if (input.sessionId !== undefined) return { sessionId: input.sessionId };
  if (input.researchRunId !== undefined) return { researchRunId: input.researchRunId };
  if (input.composerTurnId !== undefined) return { composerTurnId: input.composerTurnId };
  return { controlSubagentRunId: input.controlSubagentRunId as string };
}

/** Primary ID string for a PermitOwner (used as lookup key in gates/probes). */
function primaryId(owner: PermitOwner): string {
  if (owner.sessionId !== undefined) return owner.sessionId;
  if (owner.researchRunId !== undefined) return owner.researchRunId;
  if (owner.composerTurnId !== undefined) return owner.composerTurnId;
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

  // Project-level gates — only evaluated when projectId is set
  if (input.projectId != null) {
    const limits = deps.config.projectLimits(input.projectId);

    // Project concurrency cap
    if (limits.concurrencyCap != null) {
      const activeInProject = deps.permits.countByProject(input.projectId);
      if (activeInProject >= limits.concurrencyCap) {
        return appendPermitDeny(deps.events, {
          owner,
          reason: "project_concurrency_cap_exceeded",
          gate: "project",
          details: {
            project_id: input.projectId,
            active_permits: activeInProject,
            concurrency_cap: limits.concurrencyCap,
          },
        });
      }
    }

    // Project daily cost cap
    if (limits.dailyCostCapCents != null) {
      const dailyCostProbe = deps.probes.projectDailyCost?.(input.projectId);
      if (dailyCostProbe && dailyCostProbe.costUsdCents > limits.dailyCostCapCents) {
        return appendPermitDeny(deps.events, {
          owner,
          reason: "project_daily_cost_cap_exceeded",
          gate: "project",
          details: {
            project_id: input.projectId,
            cost_usd_cents: dailyCostProbe.costUsdCents,
            daily_cost_cap_cents: limits.dailyCostCapCents,
          },
        });
      }
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
    providerId: overrideDecision.providerId,
    ttlSeconds,
    grantedAt,
    expiresAt,
  });

  return { granted: true, permit: deps.permits.get(permitId)! };
}
