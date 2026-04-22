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

export async function acquirePermitDecision(
  deps: AcquirePermitDeps,
  input: AcquirePermitInput,
): Promise<PermitDecision> {
  const overrideDecision = applyOverrides(input.providerCandidate, deps.config.overrides());
  if (!overrideDecision.ok) {
    return appendPermitDeny(deps.events, {
      sessionId: input.sessionId,
      reason: overrideDecision.reason,
      gate: "overrides",
      details: overrideDecision.details,
    });
  }

  const cap = deps.config.scheduler().concurrencyCap;
  const active = deps.permits.countActive();
  if (active >= cap) {
    return appendPermitDeny(deps.events, {
      sessionId: input.sessionId,
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
      sessionId: input.sessionId,
      reason: systemGate.reason,
      gate: "system",
      details: systemGate.details,
    });
  }

  const quota = await deps.probes.providerQuota?.(overrideDecision.providerId);
  if (quota && !quota.ok) {
    return appendPermitDeny(deps.events, {
      sessionId: input.sessionId,
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

  const burn = await deps.probes.burnRate?.(input.sessionId);
  if (burn) {
    const burnGate = await checkBurnRateGate(
      deps.events,
      input.sessionId,
      burn,
      deps.config.scheduler().burnRate,
    );
    if (!burnGate.ok) {
      return appendPermitDeny(deps.events, {
        sessionId: input.sessionId,
        reason: "burn_rate_exceeded",
        gate: "burn_rate",
        details: burnGate.details,
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
    sessionId: input.sessionId,
    providerId: overrideDecision.providerId,
    ttlSeconds,
    grantedAt,
    expiresAt,
  });

  return { granted: true, permit: deps.permits.get(permitId)! };
}
