import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { discoverWorkspace, type DiscoveryResult } from './project.js';

export interface DevcontainerCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  output?: 'json' | 'text';
}

export interface DevcontainerConfig {
  name: string;
  image?: string;
  build?: { dockerfile: string };
  features: Record<string, Record<string, unknown>>;
  postCreateCommand?: string;
  mounts: string[];
  containerEnv: Record<string, string>;
  remoteEnv: Record<string, string>;
  customizations?: Record<string, unknown>;
}

export interface DevcontainerResult {
  action: 'created' | 'augmented';
  config_path: string;
  language: string;
  image: string;
  features: string[];
  post_create_command: string | null;
  mounts: string[];
  had_existing: boolean;
}

interface LanguageMapping {
  image: string;
  features: Record<string, Record<string, unknown>>;
  postCreateCommand: string | null;
}

export interface DevcontainerDeps {
  discover: (opts: { projectRoot?: string; homeDir?: string }) => Promise<DiscoveryResult>;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (filePath: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir: (dirPath: string, opts?: { recursive: boolean }) => Promise<string | undefined>;
  existsSync: (filePath: string) => boolean;
}

const defaultDeps: DevcontainerDeps = {
  discover: discoverWorkspace,
  readFile,
  writeFile,
  mkdir,
  existsSync,
};

function getLanguageMapping(language: string, projectRoot: string, existsFn: (p: string) => boolean = existsSync): LanguageMapping {
  switch (language) {
    case 'node-typescript':
      return {
        image: 'mcr.microsoft.com/devcontainers/typescript-node:22',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
        },
        postCreateCommand: detectNodeInstallCommand(projectRoot, existsFn),
      };
    case 'python':
      return {
        image: 'mcr.microsoft.com/devcontainers/python:3',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
        },
        postCreateCommand: detectPythonInstallCommand(projectRoot, existsFn),
      };
    case 'go':
      return {
        image: 'mcr.microsoft.com/devcontainers/go:1',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
        },
        postCreateCommand: 'go mod download',
      };
    case 'rust':
      return {
        image: 'mcr.microsoft.com/devcontainers/rust:1',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
        },
        postCreateCommand: 'cargo build',
      };
    case 'dotnet':
      return {
        image: 'mcr.microsoft.com/devcontainers/dotnet:8.0',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
        },
        postCreateCommand: 'dotnet restore',
      };
    default:
      return {
        image: 'mcr.microsoft.com/devcontainers/base:ubuntu',
        features: {
          'ghcr.io/devcontainers/features/git:1': {},
          'ghcr.io/devcontainers/features/node:1': {},
        },
        postCreateCommand: null,
      };
  }
}

export function detectNodeInstallCommand(projectRoot: string, existsFn: (p: string) => boolean = existsSync): string {
  if (existsFn(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm install';
  if (existsFn(path.join(projectRoot, 'yarn.lock'))) return 'yarn install';
  if (existsFn(path.join(projectRoot, 'bun.lockb')) || existsFn(path.join(projectRoot, 'bun.lock'))) return 'bun install';
  return 'npm install';
}

export function detectPythonInstallCommand(projectRoot: string, existsFn: (p: string) => boolean = existsSync): string {
  if (existsFn(path.join(projectRoot, 'pyproject.toml'))) return 'pip install -e .';
  if (existsFn(path.join(projectRoot, 'requirements.txt'))) return 'pip install -r requirements.txt';
  return 'pip install -e .';
}

function buildAloopMounts(): string[] {
  return [
    'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind',
  ];
}

function buildAloopContainerEnv(): Record<string, string> {
  return {
    ALOOP_NO_DASHBOARD: '1',
    ALOOP_CONTAINER: '1',
  };
}

export function generateDevcontainerConfig(
  discovery: DiscoveryResult,
  existsFn: (p: string) => boolean = existsSync,
): DevcontainerConfig {
  const projectRoot = discovery.project.root;
  const projectName = discovery.project.name;
  const language = discovery.context.detected_language;
  const mapping = getLanguageMapping(language, projectRoot, existsFn);

  const config: DevcontainerConfig = {
    name: `${projectName}-aloop`,
    image: mapping.image,
    features: { ...mapping.features },
    mounts: buildAloopMounts(),
    containerEnv: buildAloopContainerEnv(),
    remoteEnv: {},
  };

  if (mapping.postCreateCommand) {
    config.postCreateCommand = mapping.postCreateCommand;
  }

  return config;
}

function mergeArrayUnique(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  for (const item of additions) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

export function augmentExistingConfig(
  existing: Record<string, unknown>,
  generated: DevcontainerConfig,
): Record<string, unknown> {
  const result = { ...existing };

  // Merge mounts
  const existingMounts = Array.isArray(result.mounts) ? result.mounts as string[] : [];
  result.mounts = mergeArrayUnique(existingMounts, generated.mounts);

  // Merge containerEnv
  const existingContainerEnv = (result.containerEnv ?? {}) as Record<string, string>;
  result.containerEnv = { ...existingContainerEnv, ...generated.containerEnv };

  // Merge remoteEnv (don't overwrite existing values)
  const existingRemoteEnv = (result.remoteEnv ?? {}) as Record<string, string>;
  result.remoteEnv = { ...generated.remoteEnv, ...existingRemoteEnv };

  return result;
}

/**
 * Strip JSONC comments (single-line // and block /* ... *​/) while preserving
 * string contents. Uses a simple state machine so that `//` inside quoted
 * strings (e.g. URLs like `"https://..."`) is left untouched.
 */
export function stripJsoncComments(raw: string): string {
  let result = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    // String literal — copy through including escapes
    if (ch === '"') {
      result += ch;
      i++;
      while (i < raw.length) {
        const sc = raw[i];
        result += sc;
        i++;
        if (sc === '\\') {
          // Copy escaped char verbatim
          if (i < raw.length) { result += raw[i]; i++; }
        } else if (sc === '"') {
          break;
        }
      }
      continue;
    }
    // Single-line comment
    if (ch === '/' && i + 1 < raw.length && raw[i + 1] === '/') {
      // Skip until end of line
      i += 2;
      while (i < raw.length && raw[i] !== '\n') { i++; }
      continue;
    }
    // Block comment
    if (ch === '/' && i + 1 < raw.length && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length) {
        if (raw[i] === '*' && i + 1 < raw.length && raw[i + 1] === '/') { i += 2; break; }
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

export async function devcontainerCommandWithDeps(
  options: DevcontainerCommandOptions = {},
  deps: DevcontainerDeps = defaultDeps,
): Promise<DevcontainerResult> {
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
  });

  const projectRoot = discovery.project.root;
  const devcontainerDir = path.join(projectRoot, '.devcontainer');
  const configPath = path.join(devcontainerDir, 'devcontainer.json');
  const hadExisting = deps.existsSync(configPath);

  const generated = generateDevcontainerConfig(discovery, deps.existsSync);

  let finalConfig: Record<string, unknown>;
  let action: 'created' | 'augmented';

  if (hadExisting) {
    const raw = await deps.readFile(configPath, 'utf8');
    const stripped = stripJsoncComments(raw);
    const existing = JSON.parse(stripped) as Record<string, unknown>;
    finalConfig = augmentExistingConfig(existing, generated);
    action = 'augmented';
  } else {
    finalConfig = generated as unknown as Record<string, unknown>;
    action = 'created';
  }

  await deps.mkdir(devcontainerDir, { recursive: true });
  await deps.writeFile(configPath, JSON.stringify(finalConfig, null, 2) + '\n', 'utf8');

  const mapping = getLanguageMapping(discovery.context.detected_language, projectRoot, deps.existsSync);

  return {
    action,
    config_path: configPath,
    language: discovery.context.detected_language,
    image: mapping.image,
    features: Object.keys(generated.features),
    post_create_command: mapping.postCreateCommand,
    mounts: generated.mounts,
    had_existing: hadExisting,
  };
}

export async function devcontainerCommand(options: DevcontainerCommandOptions = {}, deps: DevcontainerDeps = defaultDeps) {
  const result = await devcontainerCommandWithDeps(options, deps);
  const outputMode = options.output || 'text';

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.action === 'augmented') {
    console.log(`Augmented existing devcontainer config at ${result.config_path}`);
    console.log('Added aloop mounts and environment variables.');
  } else {
    console.log(`Created devcontainer config at ${result.config_path}`);
    console.log(`  Language: ${result.language}`);
    console.log(`  Image: ${result.image}`);
    if (result.post_create_command) {
      console.log(`  Post-create: ${result.post_create_command}`);
    }
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Review .devcontainer/devcontainer.json');
  console.log('  2. Run `devcontainer build --workspace-folder .` to verify');
  console.log('  3. Start a loop with `aloop start` — container will be used automatically');
}
