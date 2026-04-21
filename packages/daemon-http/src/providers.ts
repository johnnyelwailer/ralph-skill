import {
  OVERRIDES_DEFAULT,
  parseOverridesConfig,
  type ConfigStore,
} from "@aloop/daemon-config";
import type { EventWriter } from "@aloop/state-sqlite";
import { badRequest, jsonResponse, methodNotAllowed, parseJsonBody } from "./http-helpers.ts";

export type ProvidersDeps = {
  readonly config: ConfigStore;
  readonly events: EventWriter;
};

export async function handleProviders(
  req: Request,
  deps: ProvidersDeps,
  pathname: string,
): Promise<Response | undefined> {
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
