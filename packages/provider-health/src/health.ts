export type ProviderHealthStatus = "healthy" | "cooldown" | "degraded" | "unknown";

export type ProviderFailureClass =
  | "rate_limit"
  | "timeout"
  | "auth"
  | "concurrent_cap"
  | "unknown";

export type ProviderHealth = {
  readonly providerId: string;
  readonly status: ProviderHealthStatus;
  readonly consecutiveFailures: number;
  readonly lastSuccess: string | null;
  readonly lastFailure: string | null;
  readonly failureReason: ProviderFailureClass | null;
  readonly cooldownUntil: string | null;
  readonly quotaRemaining: number | null;
  readonly quotaResetsAt: string | null;
  readonly updatedAt: string;
};

export type FailureUpdateOptions = {
  readonly quotaRemaining?: number | null;
  readonly quotaResetsAtMs?: number | null;
  readonly backoffMsByFailureCount?: readonly number[];
  readonly cooldownMultiplier?: number;
};

const DEFAULT_BACKOFF_MS_BY_FAILURE_COUNT = [
  0,
  0,
  2 * 60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const;

export function createUnknownHealth(providerId: string, nowMs: number = Date.now()): ProviderHealth {
  return {
    providerId,
    status: "unknown",
    consecutiveFailures: 0,
    lastSuccess: null,
    lastFailure: null,
    failureReason: null,
    cooldownUntil: null,
    quotaRemaining: null,
    quotaResetsAt: null,
    updatedAt: toIso(nowMs),
  };
}

export function applyProviderSuccess(prev: ProviderHealth, nowMs: number = Date.now()): ProviderHealth {
  return {
    ...prev,
    status: "healthy",
    consecutiveFailures: 0,
    lastSuccess: toIso(nowMs),
    failureReason: null,
    cooldownUntil: null,
    updatedAt: toIso(nowMs),
  };
}

export function applyProviderFailure(
  prev: ProviderHealth,
  failure: ProviderFailureClass,
  nowMs: number = Date.now(),
  options: FailureUpdateOptions = {},
): ProviderHealth {
  const consecutiveFailures = prev.consecutiveFailures + 1;
  const quotaResetsAtMs = options.quotaResetsAtMs ?? null;
  const backoff = options.backoffMsByFailureCount ?? DEFAULT_BACKOFF_MS_BY_FAILURE_COUNT;
  const multiplier = options.cooldownMultiplier ?? 1.0;
  const backoffMs = (backoff[Math.min(consecutiveFailures, backoff.length - 1)] ?? 0) * multiplier;
  const backoffUntilMs = backoffMs > 0 ? nowMs + backoffMs : null;
  const cooldownUntilMs = maxNullableMs(backoffUntilMs, quotaResetsAtMs);

  if (failure === "auth") {
    return {
      ...prev,
      status: "degraded",
      consecutiveFailures,
      lastFailure: toIso(nowMs),
      failureReason: failure,
      cooldownUntil: null,
      quotaRemaining: options.quotaRemaining ?? prev.quotaRemaining,
      quotaResetsAt: quotaResetsAtMs ? toIso(quotaResetsAtMs) : prev.quotaResetsAt,
      updatedAt: toIso(nowMs),
    };
  }

  const status: ProviderHealthStatus = cooldownUntilMs ? "cooldown" : "healthy";
  return {
    ...prev,
    status,
    consecutiveFailures,
    lastFailure: toIso(nowMs),
    failureReason: failure,
    cooldownUntil: cooldownUntilMs ? toIso(cooldownUntilMs) : null,
    quotaRemaining: options.quotaRemaining ?? prev.quotaRemaining,
    quotaResetsAt: quotaResetsAtMs ? toIso(quotaResetsAtMs) : prev.quotaResetsAt,
    updatedAt: toIso(nowMs),
  };
}

export function isProviderAvailable(state: ProviderHealth, nowMs: number = Date.now()): boolean {
  if (state.status === "degraded") return false;
  if (state.status === "cooldown") {
    return state.cooldownUntil ? nowMs >= Date.parse(state.cooldownUntil) : true;
  }
  return true;
}

function maxNullableMs(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}
