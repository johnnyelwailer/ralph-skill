import type { ProviderRef, ResolvedModel } from "@aloop/provider";
import { parseProviderRef } from "@aloop/provider";

const DEFAULT_MODEL_ID = "opencode/default";

export function resolveOpencodeModel(ref: ProviderRef, defaultModelId?: string): ResolvedModel {
  const parsed = parseProviderRef(ref);
  if (parsed.providerId !== "opencode") {
    throw new Error(`opencode adapter cannot resolve provider ref: ${ref}`);
  }
  const modelPath = [parsed.track, parsed.model].filter(Boolean).join("/");
  const versionSuffix = parsed.version ? `@${parsed.version}` : "";
  return {
    providerId: "opencode",
    modelId: modelPath.length > 0 ? `${modelPath}${versionSuffix}` : defaultModelId ?? DEFAULT_MODEL_ID,
    ...(parsed.track && { track: parsed.track }),
    ...(parsed.version && { version: parsed.version }),
  };
}

export function toSdkModel(resolved: ResolvedModel): { providerID: string; modelID: string } {
  const [providerID, ...rest] = resolved.modelId.split("/");
  return rest.length === 0
    ? { providerID: "opencode", modelID: resolved.modelId }
    : { providerID: providerID!, modelID: rest.join("/") };
}