import {
  OVERRIDES_DEFAULT,
  parseOverridesConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";
import {
  type InMemoryProviderHealthStore,
  type ProviderRegistry,
} from "@aloop/provider";
import {
  errorMessage,
  classifyProviderProbeFailure,
} from "./providers-failure-classify.ts";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "./http-helpers.ts";
import { parseRequestedChain, resolveChain } from "./providers-resolve-chain.ts";

export type ProvidersDeps = {
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
};

export async function handleProviders(
  req: Request,
  deps: ProvidersDeps,
  pathname: string,
): Promise<Response | undefined> {
  if (pathname === "/v1/providers") {
    if (req.method !== "GET") return methodNotAllowed();
    return jsonResponse(200, {
      _v: 1,
      items: deps.providerRegistry.list().map((adapter) => ({
        id: adapter.id,
        capabilities: adapter.capabilities,
        health: deps.providerHealth.get(adapter.id),
      })),
    });
  }

  const quotaMatch = pathname.match(/^\/v1\/providers\/([^/]+)\/quota$/);
  if (quotaMatch) {
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
      await deps.events.append("provider.health", health);
      return errorResponse(502, "quota_probe_failed", `quota probe failed for ${providerId}`, {
        provider_id: providerId,
        classification,
        message: errorMessage(err),
      });
    }
  }

  if (pathname === "/v1/providers/resolve-chain") {
    if (req.method !== "POST") return methodNotAllowed();
    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data as { session_id?: unknown; provider_chain?: unknown };
    if (typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
      return badRequest("session_id is required");
    }
    const requestedChain = parseRequestedChain(body.provider_chain);
    if (!requestedChain.ok) return badRequest(requestedChain.error);
    const baseChain = requestedChain.value ?? deps.providerRegistry.list().map((adapter) => adapter.id);
    const resolved = resolveChain(baseChain, deps.config.overrides(), deps.providerHealth);
    return jsonResponse(200, {
      _v: 1,
      session_id: body.session_id,
      input_chain: baseChain,
      resolved_chain: resolved.chain,
      excluded_overrides: resolved.excludedOverrides,
      excluded_health: resolved.excludedHealth,
    });
  }

  if (pathname !== "/v1/providers/overrides") return undefined;

  if (req.method === "GET") {
    return jsonResponse(200, { _v: 1, ...deps.config.overrides() });
  }

  if (req.method === "DELETE") {
    deps.config.setOverrides(OVERRIDES_DEFAULT);
    await deps.events.append("provider.override.changed", { ...OVERRIDES_DEFAULT });
    return jsonResponse(200, { _v: 1, ...deps.config.overrides() });
  }

  if (req.method !== "PUT") return methodNotAllowed();

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;

  const result = parseOverridesConfig(parsed.data);
  if (!result.ok) return badRequest("invalid provider overrides", { errors: result.errors });

  deps.config.setOverrides(result.value);
  await deps.events.append("provider.override.changed", { ...result.value });
  return jsonResponse(200, { _v: 1, ...deps.config.overrides() });
}
