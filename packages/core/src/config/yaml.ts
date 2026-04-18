import { existsSync, readFileSync } from "node:fs";
import { parse, YAMLParseError } from "yaml";
import type { ParseResult } from "../compile/types.ts";

/**
 * Load and parse a YAML file. Returns a ParseResult; never throws on
 * user-authored content. The only throws are non-ENOENT I/O errors.
 *
 * Missing files return a typed failure rather than a thrown ENOENT — config
 * loaders branch on that to fall back to defaults.
 */
export function loadYamlFile(path: string): ParseResult<unknown> {
  if (!existsSync(path)) {
    return { ok: false, errors: [`file not found: ${path}`] };
  }
  let source: string;
  try {
    source = readFileSync(path, "utf-8");
  } catch (err) {
    return { ok: false, errors: [`cannot read ${path}: ${(err as Error).message}`] };
  }
  return parseYamlString(source);
}

export function parseYamlString(source: string): ParseResult<unknown> {
  try {
    const parsed = parse(source) as unknown;
    return { ok: true, value: parsed };
  } catch (err) {
    if (err instanceof YAMLParseError) {
      return { ok: false, errors: [`yaml parse error: ${err.message}`] };
    }
    throw err;
  }
}

/** True if a value is a non-null, non-array object suitable for indexing. */
export function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
