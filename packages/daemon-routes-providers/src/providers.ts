import {
  OVERRIDES_DEFAULT,
  parseOverridesConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";
import {
  parseRequestedProviderChain,
  resolveProviderChain,
  type InMemoryProviderHealthStore,
  type ProviderRegistry,
} from "@aloop/provider";
import {
  badRequest,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
} from "./providers-http.ts";
import { handleProviderQuota } from "./providers-quota.ts";

export type ProvidersDeps = {
  readonly config: ConfigStore;
  readonly events: EventWriter;
  readonly providerRegistry: ProviderRegistry;
  readonly providerHealth: InMemoryProviderHealthStore;
  readonly cooldownMultipliers?: ReadonlyMap<string, number>;
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

  const quotaResponse = await handleProviderQuota(req, deps, pathname);
  if (quotaResponse) return quotaResponse;

  if (pathname === "/v1/providers/resolve-chain") {
    if (req.method !== "POST") return methodNotAllowed();
    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data as { session_id?: unknown; provider_chain?: unknown };
    if (typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
      return badRequest("session_id is required");
    }
    const requestedChain = parseRequestedProviderChain(body.provider_chain);
    if (!requestedChain.ok) return badRequest(requestedChain.error);
    const baseChain = requestedChain.value ?? deps.providerRegistry.list().map((adapter) => adapter.id);
    const resolved = resolveProviderChain(baseChain, deps.config.overrides(), deps.providerHealth);
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
