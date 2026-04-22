import {
  createUnknownHealth,
  isProviderAvailable,
  type InMemoryProviderHealthStore,
} from "@aloop/provider-health";
import { providerIdFromRef } from "./ref.ts";

export type ResolvedProviderChain = {
  chain: string[];
  excludedOverrides: string[];
  excludedHealth: string[];
};

export type ProviderOverrides = {
  allow: readonly string[] | null;
  deny: readonly string[] | null;
  force: string | null;
};

export function parseRequestedProviderChain(
  raw: unknown,
): { ok: true; value: readonly string[] | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false, error: "provider_chain must be an array of provider refs" };
  if (raw.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    return { ok: false, error: "provider_chain must only contain non-empty strings" };
  }
  return { ok: true, value: raw as readonly string[] };
}

export function resolveProviderChain(
  refs: readonly string[],
  overrides: ProviderOverrides,
  healthStore: InMemoryProviderHealthStore,
): ResolvedProviderChain {
  const overridden = overrides.force ? [overrides.force] : [...refs];
  const excludedOverrides: string[] = [];
  const afterOverrides = overridden.filter((ref) => {
    const providerId = safeProviderId(ref);
    if (overrides.allow && !overrides.allow.includes(providerId)) {
      excludedOverrides.push(ref);
      return false;
    }
    if (overrides.deny?.includes(providerId)) {
      excludedOverrides.push(ref);
      return false;
    }
    return true;
  });
  const excludedHealth: string[] = [];
  const chain = afterOverrides.filter((ref) => {
    const providerId = safeProviderId(ref);
    const state = healthStore.peek(providerId) ?? createUnknownHealth(providerId);
    const isAvailable = isProviderAvailable(state);
    if (!isAvailable) excludedHealth.push(ref);
    return isAvailable;
  });
  return { chain, excludedOverrides, excludedHealth };
}

function safeProviderId(ref: string): string {
  try {
    return providerIdFromRef(ref);
  } catch {
    return ref;
  }
}
