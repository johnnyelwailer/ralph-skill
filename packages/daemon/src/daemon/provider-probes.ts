import { isProviderAvailable, type InMemoryProviderHealthStore } from "@aloop/provider";
import type { SchedulerProbes } from "@aloop/scheduler";

export function createProviderQuotaProbe(
  providerHealth: InMemoryProviderHealthStore,
): NonNullable<SchedulerProbes["providerQuota"]> {
  return (providerId: string) => {
    const health = providerHealth.get(providerId);
    if (isProviderAvailable(health)) return null;

    const retryAfterSeconds = toRetryAfterSeconds(health.cooldownUntil);
    return {
      ok: false,
      reason: "provider_unavailable",
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      details: {
        provider_id: providerId,
        status: health.status,
        ...(health.failureReason ? { failure_reason: health.failureReason } : {}),
        ...(health.cooldownUntil ? { cooldown_until: health.cooldownUntil } : {}),
      },
    };
  };
}

function toRetryAfterSeconds(cooldownUntilIso: string | null): number | undefined {
  if (!cooldownUntilIso) return undefined;
  const cooldownUntilMs = Date.parse(cooldownUntilIso);
  if (!Number.isFinite(cooldownUntilMs)) return undefined;
  return Math.max(0, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
}
