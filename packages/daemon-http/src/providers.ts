import {
  OVERRIDES_DEFAULT,
  parseOverridesConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";
import type { InMemoryProviderHealthStore, ProviderRegistry } from "@aloop/provider";
import {
  badRequest,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from "./http-helpers.ts";

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
    const quota = await adapter.probeQuota(authHandle);
    deps.providerHealth.setQuota(providerId, quota);
    return jsonResponse(200, { _v: 1, provider_id: providerId, quota });
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
