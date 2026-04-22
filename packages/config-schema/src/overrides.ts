import { writeFileSync } from "node:fs";
import type { ParseResult } from "@aloop/core";
import { isMapping, loadYamlFile } from "@aloop/config-schema-utils";
import { stringify as yamlStringify } from "yaml";

/**
 * Live provider overrides. Source: ~/.aloop/overrides.yml. Applied by the
 * scheduler at permit-grant time per provider-contract.md §Overrides.
 *
 *   allow:  whitelist (null = no restriction)
 *   deny:   blacklist (null = none). deny wins over allow on conflict.
 *   force:  override entire chain to this single ref (null = off)
 */
export type OverridesConfig = {
  readonly allow: readonly string[] | null;
  readonly deny: readonly string[] | null;
  readonly force: string | null;
};

export const OVERRIDES_DEFAULT: OverridesConfig = {
  allow: null,
  deny: null,
  force: null,
};

const TOP_LEVEL_KEYS = ["allow", "deny", "force"] as const;

export function loadOverridesConfig(path: string): ParseResult<OverridesConfig> {
  const raw = loadYamlFile(path);
  if (!raw.ok) {
    if (raw.errors[0]?.startsWith("file not found:")) {
      return { ok: true, value: OVERRIDES_DEFAULT };
    }
    return raw as ParseResult<OverridesConfig>;
  }
  return parseOverridesConfig(raw.value);
}

export function parseOverridesConfig(raw: unknown): ParseResult<OverridesConfig> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: OVERRIDES_DEFAULT };
  }
  if (!isMapping(raw)) {
    return { ok: false, errors: ["overrides.yml must be a YAML mapping at the top level"] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.includes(key as (typeof TOP_LEVEL_KEYS)[number])) {
      errors.push(`unknown top-level field: ${key}`);
    }
  }

  const allow = parseProviderList(raw.allow, "allow", errors);
  const deny = parseProviderList(raw.deny, "deny", errors);
  const force = parseForce(raw.force, errors);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { allow, deny, force } };
}

/** Persist overrides back to disk so daemon restart preserves them. */
export function saveOverridesConfig(path: string, overrides: OverridesConfig): void {
  // Only write the keys that are non-null to keep the file readable.
  const toWrite: Record<string, unknown> = {};
  if (overrides.allow !== null) toWrite.allow = overrides.allow;
  if (overrides.deny !== null) toWrite.deny = overrides.deny;
  if (overrides.force !== null) toWrite.force = overrides.force;
  writeFileSync(path, yamlStringify(toWrite), { encoding: "utf-8" });
}

function parseProviderList(
  raw: unknown,
  path: string,
  errors: string[],
): readonly string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    errors.push(`${path}: must be an array of provider strings or null`);
    return null;
  }
  for (let i = 0; i < raw.length; i++) {
    if (typeof raw[i] !== "string" || (raw[i] as string).length === 0) {
      errors.push(`${path}[${i}]: must be a non-empty string`);
      return null;
    }
  }
  return raw as readonly string[];
}

function parseForce(raw: unknown, errors: string[]): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" || raw.length === 0) {
    errors.push("force: must be a provider reference string or null");
    return null;
  }
  return raw;
}
