import { applyProviderFailure, applyProviderSuccess, createUnknownHealth } from "./health.ts";
import type { ProviderFailureClass, ProviderHealth } from "./health.ts";
import type { QuotaSnapshot } from "./types.ts";

export class InMemoryProviderHealthStore {
  private readonly states = new Map<string, ProviderHealth>();

  constructor(providerIds: readonly string[] = [], nowMs: number = Date.now()) {
    for (const providerId of providerIds) {
      this.states.set(providerId, createUnknownHealth(providerId, nowMs));
    }
  }

  list(): readonly ProviderHealth[] {
    return [...this.states.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  get(providerId: string): ProviderHealth {
    const existing = this.states.get(providerId);
    if (existing) return existing;
    const created = createUnknownHealth(providerId);
    this.states.set(providerId, created);
    return created;
  }

  noteSuccess(providerId: string, nowMs: number = Date.now()): ProviderHealth {
    const next = applyProviderSuccess(this.get(providerId), nowMs);
    this.states.set(providerId, next);
    return next;
  }

  noteFailure(
    providerId: string,
    failure: ProviderFailureClass,
    nowMs: number = Date.now(),
    options: {
      quotaRemaining?: number | null;
      quotaResetsAtMs?: number | null;
      backoffMsByFailureCount?: readonly number[];
    } = {},
  ): ProviderHealth {
    const next = applyProviderFailure(this.get(providerId), failure, nowMs, options);
    this.states.set(providerId, next);
    return next;
  }

  setQuota(providerId: string, quota: QuotaSnapshot, nowMs: number = Date.now()): ProviderHealth {
    const current = this.get(providerId);
    const next: ProviderHealth = {
      ...current,
      quotaRemaining: quota.remaining,
      quotaResetsAt: quota.resetsAt,
      updatedAt: new Date(nowMs).toISOString(),
    };
    this.states.set(providerId, next);
    return next;
  }
}
