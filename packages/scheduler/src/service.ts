import { PermitRegistry, type EventWriter, type Permit } from "@aloop/state-sqlite";
import type {
  AcquirePermitInput,
  LimitsUpdateResult,
  PermitDecision,
  SchedulerConfigView,
} from "./decisions.ts";
import type { SchedulerProbes } from "./probes.ts";
import { applyOverrides, checkBurnRateGate, checkSystemGate } from "./gates.ts";

export class SchedulerService {
  constructor(
    private readonly permits: PermitRegistry,
    private readonly config: SchedulerConfigView,
    private readonly events: EventWriter,
    private readonly probes: SchedulerProbes = {},
  ) {}

  listPermits(): Permit[] {
    return this.permits.list();
  }

  currentLimits() {
    return this.config.scheduler();
  }

  async updateLimits(rawPatch: Record<string, unknown>): Promise<LimitsUpdateResult> {
    return this.config.updateLimits(rawPatch);
  }

  async acquirePermit(input: AcquirePermitInput): Promise<PermitDecision> {
    const overrideDecision = applyOverrides(input.providerCandidate, this.config.overrides());
    if (!overrideDecision.ok) {
      return this.denyPermit(input.sessionId, overrideDecision.reason, "overrides", overrideDecision.details);
    }

    const cap = this.config.scheduler().concurrencyCap;
    const active = this.permits.countActive();
    if (active >= cap) {
      return this.denyPermit(input.sessionId, "concurrency_cap_reached", "concurrency", {
        active_permits: active,
        concurrency_cap: cap,
      });
    }

    const systemGate = checkSystemGate(
      this.probes.systemSample,
      this.config.scheduler().systemLimits,
    );
    if (!systemGate.ok) {
      return this.denyPermit(input.sessionId, systemGate.reason, "system", systemGate.details);
    }

    const quota = await this.probes.providerQuota?.(overrideDecision.providerId);
    if (quota && !quota.ok) {
      return this.denyPermit(
        input.sessionId,
        quota.reason ?? "provider_quota_exceeded",
        "provider",
        {
          provider_id: overrideDecision.providerId,
          ...(quota.remaining !== undefined ? { remaining: quota.remaining } : {}),
          ...(quota.resetAt !== undefined ? { reset_at: quota.resetAt } : {}),
          ...(quota.details ?? {}),
        },
        quota.retryAfterSeconds,
      );
    }

    const burn = await this.probes.burnRate?.(input.sessionId);
    if (burn) {
      const burnGate = await checkBurnRateGate(
        this.events,
        input.sessionId,
        burn,
        this.config.scheduler().burnRate,
      );
      if (!burnGate.ok) {
        return this.denyPermit(input.sessionId, "burn_rate_exceeded", "burn_rate", burnGate.details);
      }
    }

    const ttlSeconds = this.resolveTtl(input.ttlSeconds);
    const permitId = `perm_${crypto.randomUUID()}`;
    const grantedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(grantedAt) + ttlSeconds * 1000).toISOString();

    await this.events.append("scheduler.permit.grant", {
      permit_id: permitId,
      session_id: input.sessionId,
      provider_id: overrideDecision.providerId,
      ttl_seconds: ttlSeconds,
      granted_at: grantedAt,
      expires_at: expiresAt,
    });

    return { granted: true, permit: this.permits.get(permitId)! };
  }

  async releasePermit(id: string): Promise<boolean> {
    const permit = this.permits.get(id);
    if (!permit) return false;
    await this.events.append("scheduler.permit.release", {
      permit_id: permit.id,
      session_id: permit.sessionId,
    });
    return true;
  }

  async expirePermits(nowIso: string = new Date().toISOString()): Promise<number> {
    const expired = this.permits.listExpired(nowIso);
    for (const permit of expired) {
      await this.events.append("scheduler.permit.expired", {
        permit_id: permit.id,
        session_id: permit.sessionId,
      });
    }
    return expired.length;
  }

  private resolveTtl(requested: number | undefined): number {
    const scheduler = this.config.scheduler();
    if (requested === undefined) return scheduler.permitTtlDefaultSeconds;
    return Math.min(requested, scheduler.permitTtlMaxSeconds);
  }

  private async denyPermit(
    sessionId: string,
    reason: string,
    gate: string,
    details: Record<string, unknown>,
    retryAfterSeconds?: number,
  ): Promise<PermitDecision> {
    await this.events.append("scheduler.permit.deny", {
      session_id: sessionId,
      reason,
      gate,
      details,
      ...(retryAfterSeconds !== undefined ? { retry_after_seconds: retryAfterSeconds } : {}),
    });
    return {
      granted: false,
      reason,
      gate,
      details,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
}
