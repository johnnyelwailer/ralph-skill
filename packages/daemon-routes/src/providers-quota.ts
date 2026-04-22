import type { ProviderRegistry, InMemoryProviderHealthStore } from "@aloop/provider";
import type { EventWriter } from "@aloop/state-sqlite";
import { classifyProviderProbeFailure, errorMessage } from "@aloop/provider";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  quotaProbeFailureHttp,
} from "./providers-http.ts";

export type ProviderQuotaDeps = {
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
};

export async function handleProviderQuota(
  req: Request,
  deps: ProviderQuotaDeps,
  pathname: string,
): Promise<Response | undefined> {
  const quotaMatch = pathname.match(/^\/v1\/providers\/([^/]+)\/quota$/);
  if (!quotaMatch) return undefined;

  if (req.method !== "GET") return methodNotAllowed();

  const providerId = decodeURIComponent(quotaMatch[1]!);
  const adapter = deps.providerRegistry.get(providerId);
  if (!adapter) return notFoundResponse(pathname);
  if (!adapter.probeQuota) {
    return errorResponse(
      501,
      "quota_probe_unavailable",
      `provider ${providerId} does not support quota probes`,
    );
  }

  const authHandle = req.headers.get("x-aloop-auth-handle");
  if (!authHandle || authHandle.trim().length === 0) {
    return badRequest("x-aloop-auth-handle header is required for quota probe");
  }

  try {
    const quota = await adapter.probeQuota(authHandle);
    deps.providerHealth.noteSuccess(providerId);
    const health = deps.providerHealth.setQuota(providerId, quota);
    await deps.events.append("provider.quota", {
      provider_id: providerId,
      remaining: quota.remaining,
      total: quota.total,
      reset_at: quota.resetsAt,
      currency: quota.currency,
      probed_at: quota.probedAt,
    });
    await deps.events.append("provider.health", health);
    return jsonResponse(200, { _v: 1, provider_id: providerId, quota });
  } catch (err) {
    const classification = classifyProviderProbeFailure(err);
    const health = deps.providerHealth.noteFailure(providerId, classification);
    const failureHttp = quotaProbeFailureHttp(classification);
    await deps.events.append("provider.health", health);
    return errorResponse(failureHttp.status, failureHttp.code, `quota probe failed for ${providerId}`, {
      provider_id: providerId,
      classification,
      message: errorMessage(err),
    });
  }
}
