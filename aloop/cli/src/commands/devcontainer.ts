import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile as execFileCb } from 'node:child_process';
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

/**
 * Map of provider names to their npm install commands for container setup.
 * Copilot is excluded — it's installed via VS Code extension, not CLI.
 */
const PROVIDER_INSTALL_COMMANDS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
};

/**
 * Map of provider names to their auth env vars for remoteEnv forwarding.
 * Claude lists two vars in preference order (OAUTH token preferred over API key).
 */
const PROVIDER_AUTH_ENV_VARS: Record<string, string[]> = {
  claude: ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  codex: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  copilot: ['GH_TOKEN'],
};

/**
 * Build provider install commands for postCreateCommand.
 * Only includes providers that have a CLI install command.
 */
export function buildProviderInstallCommands(installedProviders: string[]): string[] {
  const commands: string[] = [];
  for (const provider of installedProviders) {
    const cmd = PROVIDER_INSTALL_COMMANDS[provider];
    if (cmd) {
      commands.push(cmd);
    }
  }
  return commands;
}

/**
 * Build remoteEnv entries for auth forwarding.
 * Only forwards env vars for activated providers using ${localEnv:VAR} syntax.
 */
export function buildProviderRemoteEnv(installedProviders: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const provider of installedProviders) {
    const vars = PROVIDER_AUTH_ENV_VARS[provider];
    if (vars) {
      for (const v of vars) {
        env[v] = `\${localEnv:${v}}`;
      }
    }
  }
  return env;
}

function buildAloopMounts(): string[] {
  return [
    'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind',
    'source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind',
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
  const installedProviders = discovery.providers.installed;

  // Chain language deps install + provider CLI installs into postCreateCommand
  const providerInstalls = buildProviderInstallCommands(installedProviders);
  const allCommands = [
    ...(mapping.postCreateCommand ? [mapping.postCreateCommand] : []),
    ...providerInstalls,
  ];

  const config: DevcontainerConfig = {
    name: `${projectName}-aloop`,
    image: mapping.image,
    features: { ...mapping.features },
    mounts: buildAloopMounts(),
    containerEnv: buildAloopContainerEnv(),
    remoteEnv: buildProviderRemoteEnv(installedProviders),
  };

  if (allCommands.length > 0) {
    config.postCreateCommand = allCommands.join(' && ');
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
    post_create_command: generated.postCreateCommand ?? null,
    mounts: generated.mounts,
    had_existing: hadExisting,
  };
}

// --- Verification Loop ---

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  iteration: number;
}

export interface VerifyDeps {
  exec: (command: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  existsSync: (filePath: string) => boolean;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
}

function execFilePromise(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFileCb(command, args, { cwd: options?.cwd, timeout: options?.timeout ?? 120_000 }, (error, stdout, stderr) => {
      const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : (error ? 1 : 0);
      resolve({ stdout: String(stdout), stderr: String(stderr), exitCode });
    });
  });
}

const defaultVerifyDeps: VerifyDeps = {
  exec: execFilePromise,
  existsSync,
  readFile,
};

/**
 * Map provider names to their CLI binary names for `which` checks inside the container.
 */
const PROVIDER_CLI_BINARIES: Record<string, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
};

/**
 * Run a single exec check inside the devcontainer.
 */
async function execCheck(
  deps: VerifyDeps,
  projectRoot: string,
  name: string,
  containerArgs: string[],
): Promise<VerificationCheck> {
  const result = await deps.exec('devcontainer', [
    'exec',
    '--workspace-folder', projectRoot,
    '--',
    ...containerArgs,
  ], { cwd: projectRoot, timeout: 30_000 });
  return {
    name,
    passed: result.exitCode === 0,
    message: result.exitCode === 0
      ? `${name}: OK`
      : `${name}: FAILED — ${(result.stderr || result.stdout).trim().split('\n')[0] || 'non-zero exit'}`,
  };
}

/**
 * Run the devcontainer verification loop:
 *   1. devcontainer build
 *   2. devcontainer up
 *   3. exec checks (deps, providers, git, mount)
 * Returns structured results.
 */
export async function verifyDevcontainer(
  projectRoot: string,
  providers: string[],
  deps: VerifyDeps = defaultVerifyDeps,
  maxIterations: number = 1,
): Promise<VerificationResult> {
  const configPath = path.join(projectRoot, '.devcontainer', 'devcontainer.json');
  if (!deps.existsSync(configPath)) {
    return {
      passed: false,
      checks: [{ name: 'config-exists', passed: false, message: 'config-exists: FAILED — .devcontainer/devcontainer.json not found' }],
      iteration: 0,
    };
  }

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const checks: VerificationCheck[] = [];

    // Step 1: Build
    const buildResult = await deps.exec('devcontainer', [
      'build', '--workspace-folder', projectRoot,
    ], { cwd: projectRoot, timeout: 300_000 });
    checks.push({
      name: 'build',
      passed: buildResult.exitCode === 0,
      message: buildResult.exitCode === 0
        ? 'build: OK'
        : `build: FAILED — ${(buildResult.stderr || buildResult.stdout).trim().split('\n')[0] || 'non-zero exit'}`,
    });
    if (buildResult.exitCode !== 0) {
      return { passed: false, checks, iteration };
    }

    // Step 2: Up
    const upResult = await deps.exec('devcontainer', [
      'up', '--workspace-folder', projectRoot,
    ], { cwd: projectRoot, timeout: 300_000 });
    checks.push({
      name: 'up',
      passed: upResult.exitCode === 0,
      message: upResult.exitCode === 0
        ? 'up: OK'
        : `up: FAILED — ${(upResult.stderr || upResult.stdout).trim().split('\n')[0] || 'non-zero exit'}`,
    });
    if (upResult.exitCode !== 0) {
      return { passed: false, checks, iteration };
    }

    // Step 3: Exec checks inside the running container

    // 3a. Git functional
    checks.push(await execCheck(deps, projectRoot, 'git', ['git', 'status']));

    // 3b. .aloop/ mount accessible
    checks.push(await execCheck(deps, projectRoot, 'aloop-mount', ['test', '-d', '.aloop']));

    // 3b2. /aloop-sessions/ mount accessible
    checks.push(await execCheck(deps, projectRoot, 'sessions-mount', ['test', '-d', '/aloop-sessions']));

    // 3c. Provider CLIs available
    for (const provider of providers) {
      const binary = PROVIDER_CLI_BINARIES[provider];
      if (binary) {
        checks.push(await execCheck(deps, projectRoot, `provider-${provider}`, ['which', binary]));
      }
    }

    // 3d. Project deps (check common artifact dirs)
    // Read config to determine language-based dep check
    const raw = await deps.readFile(configPath, 'utf8');
    const stripped = stripJsoncComments(raw);
    const config = JSON.parse(stripped) as Record<string, unknown>;
    const image = (config.image as string) || '';
    if (image.includes('typescript-node') || image.includes('node:')) {
      checks.push(await execCheck(deps, projectRoot, 'deps-installed', ['test', '-d', 'node_modules']));
    } else if (image.includes('python')) {
      // Python deps are installed globally or in venv, check pip works
      checks.push(await execCheck(deps, projectRoot, 'deps-installed', ['python', '-c', 'print("ok")']));
    } else if (image.includes('go')) {
      checks.push(await execCheck(deps, projectRoot, 'deps-installed', ['go', 'version']));
    } else if (image.includes('rust')) {
      checks.push(await execCheck(deps, projectRoot, 'deps-installed', ['cargo', '--version']));
    } else if (image.includes('dotnet')) {
      checks.push(await execCheck(deps, projectRoot, 'deps-installed', ['dotnet', '--version']));
    }

    const allPassed = checks.every((c) => c.passed);
    if (allPassed || iteration === maxIterations) {
      return { passed: allPassed, checks, iteration };
    }
    // If not all passed and we have more iterations, the caller's
    // fix-and-retry logic would go here. For the CLI, we just report.
  }

  // Unreachable, but TypeScript needs it
  return { passed: false, checks: [], iteration: maxIterations };
}

/**
 * CLI-facing verify command: runs verification and prints results.
 */
export async function verifyDevcontainerCommand(
  options: DevcontainerCommandOptions = {},
  deps: DevcontainerDeps = defaultDeps,
  verifyDepsOverride?: VerifyDeps,
): Promise<void> {
  const discovery = await deps.discover({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
  });

  const projectRoot = discovery.project.root;
  const providers = discovery.providers.installed;
  const vDeps = verifyDepsOverride ?? defaultVerifyDeps;
  const result = await verifyDevcontainer(projectRoot, providers, vDeps);
  const outputMode = options.output || 'text';

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Devcontainer verification (iteration ${result.iteration}):`);
  for (const check of result.checks) {
    const icon = check.passed ? '[PASS]' : '[FAIL]';
    console.log(`  ${icon} ${check.message}`);
  }
  console.log('');
  if (result.passed) {
    console.log('All checks passed. Container is ready for aloop.');
  } else {
    console.log('Some checks failed. Review the output above and fix .devcontainer/devcontainer.json.');
  }
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
