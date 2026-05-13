/**
 * Runtime extension manifest loader.
 *
 * Reads YAML manifest files from the templates directory and parses them into
 * typed RuntimeExtensionManifest objects.
 *
 * Spec: docs/spec/pipeline.md §Runtime extension manifests
 *       docs/spec/pipeline.md §Exec step manifest format
 *       docs/spec/context.md §Context provider manifests
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import YAML from "yaml";
import type { ExecManifest, ContextProviderManifest, RuntimeExtensionManifest, Runtime, Platform } from "./types.ts";

const EXEC_MANIFEST_PREFIX = "EXEC_";
const CONTEXT_MANIFEST_PREFIX = "CONTEXT_";
const MANIFEST_SUFFIX = ".yml";

function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(ms|[smh])$/);
  if (!match) throw new Error(`Invalid timeout format: ${timeout}`);
  const value = parseInt(match[1]!, 10);
  switch (match[2]) {
    case "ms": return value;
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    default: throw new Error(`Invalid timeout unit: ${match[2]}`);
  }
}

function parsePlatforms(platforms: unknown): readonly Platform[] | undefined {
  if (!platforms) return undefined;
  if (!Array.isArray(platforms)) throw new Error("platforms must be an array");
  return platforms.map((p) => {
    if (p !== "darwin" && p !== "linux" && p !== "windows") {
      throw new Error(`Invalid platform: ${p}`);
    }
    return p as Platform;
  });
}

function parseRuntime(runtime: unknown): Runtime {
  if (runtime !== "bun" && runtime !== "node" && runtime !== "bash" && runtime !== "pwsh") {
    throw new Error(`Invalid runtime: ${runtime}. Expected bun, node, bash, or pwsh`);
  }
  return runtime as Runtime;
}

export type LoadManifestOptions = {
  templatesDir: string;
};

export type LoadManifestResult = {
  manifests: RuntimeExtensionManifest[];
  errors: Array<{ file: string; error: string }>;
};

function parseExecManifest(filePath: string, raw: Record<string, unknown>): ExecManifest {
  const kind = raw.kind;
  if (kind !== "exec") {
    throw new Error(`Expected kind=exec, got kind=${kind}`);
  }

  const runtime = parseRuntime(raw.runtime);
  const file = raw.file;
  if (typeof file !== "string" || !file) {
    throw new Error(`exec manifest missing required field: file`);
  }

  const timeout = raw.timeout;
  if (typeof timeout !== "string" || !timeout) {
    throw new Error(`exec manifest missing required field: timeout`);
  }
  parseTimeout(timeout);

  const cwd = raw.cwd;
  if (typeof cwd !== "string" || !cwd) {
    throw new Error(`exec manifest missing required field: cwd`);
  }
  if (cwd.startsWith("/")) {
    throw new Error(`exec manifest: cwd must not be an absolute path`);
  }
  if (cwd !== "worktree" && cwd !== "repo") {
    throw new Error(`exec manifest: cwd must be "worktree", "repo", or a relative path`);
  }

  const idempotent = raw.idempotent;
  if (typeof idempotent !== "boolean") {
    throw new Error(`exec manifest missing required field: idempotent (boolean)`);
  }

  const args: readonly string[] | undefined = Array.isArray(raw.args)
    ? Object.freeze(raw.args.map(String)) as readonly string[]
    : undefined;
  const platforms: readonly Platform[] | undefined = parsePlatforms(raw.platforms);
  const envAllowlist: readonly string[] | undefined = Array.isArray(raw.env_allowlist)
    ? Object.freeze(raw.env_allowlist.map(String)) as readonly string[]
    : undefined;

  const result: ExecManifest = {
    kind: "exec" as const,
    runtime,
    file,
    args,
    cwd: cwd as string,
    timeout,
    platforms,
    envAllowlist,
    idempotent,
  };
  return result;
}

function parseContextProviderManifest(filePath: string, raw: Record<string, unknown>): ContextProviderManifest {
  const kind = raw.kind;
  if (kind !== "context-provider") {
    throw new Error(`Expected kind=context-provider, got kind=${kind}`);
  }

  const id = raw.id;
  if (typeof id !== "string" || !id) {
    throw new Error(`context-provider manifest missing required field: id`);
  }

  const runtime = raw.runtime;
  if (typeof runtime !== "string" || !runtime) {
    throw new Error(`context-provider manifest missing required field: runtime`);
  }

  const file = raw.file;
  if (typeof file !== "string" || !file) {
    throw new Error(`context-provider manifest missing required field: file`);
  }

  const timeout = raw.timeout;
  if (typeof timeout !== "string" || !timeout) {
    throw new Error(`context-provider manifest missing required field: timeout`);
  }
  parseTimeout(timeout);

  const cwd = raw.cwd;
  if (typeof cwd !== "string" || !cwd) {
    throw new Error(`context-provider manifest missing required field: cwd`);
  }

  const capabilities = raw.capabilities;
  if (!capabilities || typeof capabilities !== "object") {
    throw new Error(`context-provider manifest missing required field: capabilities`);
  }
  const caps = capabilities as Record<string, unknown>;
  const readEvents = caps.read_events === true;
  const readTracker = caps.read_tracker === true;
  const readMetrics = caps.read_metrics === true;
  const network = caps.network === true;

  const platforms: readonly string[] | undefined = Array.isArray(raw.platforms)
    ? Object.freeze(raw.platforms.map(String)) as readonly string[]
    : undefined;
  const envAllowlist: readonly string[] | undefined = Array.isArray(raw.env_allowlist)
    ? Object.freeze(raw.env_allowlist.map(String)) as readonly string[]
    : undefined;

  const result: ContextProviderManifest = {
    kind: "context-provider" as const,
    id,
    runtime,
    file,
    timeout,
    cwd,
    capabilities: { readEvents, readTracker, readMetrics, network },
  };
  if (platforms !== undefined) {
    (result as { platforms?: readonly string[] }).platforms = platforms;
  }
  if (envAllowlist !== undefined) {
    (result as { envAllowlist?: readonly string[] }).envAllowlist = envAllowlist;
  }
  return result;
}

export function loadManifests(opts: LoadManifestOptions): LoadManifestResult {
  const { templatesDir } = opts;
  const manifests: RuntimeExtensionManifest[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  let files: string[] = [];
  try {
    files = readdirSync(templatesDir);
  } catch {
    return { manifests: [], errors: [{ file: templatesDir, error: `Templates directory does not exist: ${templatesDir}` }] };
  }

  for (const file of files) {
    if (!file.endsWith(MANIFEST_SUFFIX)) continue;

    const filePath = join(templatesDir, file);
    let rawContent: string;
    try {
      rawContent = readFileSync(filePath, "utf-8");
    } catch (err) {
      errors.push({ file, error: `Failed to read file: ${err}` });
      continue;
    }

    let raw: Record<string, unknown>;
    try {
      raw = YAML.parse(rawContent) as Record<string, unknown>;
    } catch (err) {
      errors.push({ file, error: `YAML parse error: ${err}` });
      continue;
    }

    try {
      if (file.startsWith(EXEC_MANIFEST_PREFIX)) {
        manifests.push(parseExecManifest(filePath, raw));
      } else if (file.startsWith(CONTEXT_MANIFEST_PREFIX)) {
        manifests.push(parseContextProviderManifest(filePath, raw));
      } else {
        errors.push({ file, error: `Unknown manifest kind: ${raw.kind}. Expected EXEC_*.yml or CONTEXT_*.yml prefix` });
      }
    } catch (err) {
      errors.push({ file, error: String(err) });
    }
  }

  return { manifests, errors };
}

export function loadExecManifests(opts: LoadManifestOptions): { manifests: ExecManifest[]; errors: Array<{ file: string; error: string }> } {
  const result = loadManifests(opts);
  const execManifests = result.manifests.filter((m): m is ExecManifest => m.kind === "exec");
  return { manifests: execManifests, errors: result.errors };
}

export function loadContextProviderManifests(opts: LoadManifestOptions): { manifests: ContextProviderManifest[]; errors: Array<{ file: string; error: string }> } {
  const result = loadManifests(opts);
  const contextManifests = result.manifests.filter((m): m is ContextProviderManifest => m.kind === "context-provider");
  return { manifests: contextManifests, errors: result.errors };
}

export function parseTimeoutMs(timeout: string): number {
  return parseTimeout(timeout);
}