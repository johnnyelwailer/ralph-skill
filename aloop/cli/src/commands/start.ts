import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { discoverWorkspace, type DiscoveryResult } from './project.js';
import { resolveHomeDir } from './session.js';
import type { OutputMode } from './status.js';
import { compileLoopPlan } from './compile-loop-plan.js';

type ProviderName = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode';
type LoopProvider = ProviderName | 'round-robin';
type LoopMode = 'plan' | 'build' | 'review' | 'plan-build' | 'plan-build-review' | 'single';
type LaunchMode = 'start' | 'restart' | 'resume';
type StartMonitorMode = 'dashboard' | 'terminal' | 'none';

const LAUNCH_MODE_SET = new Set<LaunchMode>(['start', 'restart', 'resume']);
const PROVIDER_SET = new Set<LoopProvider>(['claude', 'codex', 'gemini', 'copilot', 'opencode', 'round-robin']);
const MODEL_PROVIDER_SET = new Set<ProviderName>(['claude', 'codex', 'gemini', 'copilot', 'opencode']);
const LOOP_MODE_SET = new Set<LoopMode>(['plan', 'build', 'review', 'plan-build', 'plan-build-review', 'single']);
const DEFAULT_MODELS: Record<ProviderName, string> = {
  claude: 'opus',
  codex: 'gpt-5.3-codex',
  gemini: 'gemini-3.1-pro-preview',
  copilot: 'gpt-5.3-codex',
  opencode: 'opencode-default',
};

interface ParsedAloopConfig {
  values: Record<string, string | number | boolean | null>;
  enabled_providers: string[];
  round_robin_order: string[];
  models: Record<string, string>;
  retry_models: Record<string, string | null>;
  on_start: {
    monitor?: string;
    auto_open?: boolean;
  };
}

export interface StartCommandOptions {
  projectRoot?: string;
  homeDir?: string;
  provider?: string;
  mode?: string;
  launch?: string;
  plan?: boolean;
  build?: boolean;
  review?: boolean;
  inPlace?: boolean;
  maxIterations?: number | string;
  output?: OutputMode;
  sessionId?: string;
}

export interface StartCommandResult {
  session_id: string;
  session_dir: string;
  prompts_dir: string;
  work_dir: string;
  worktree: boolean;
  worktree_path: string | null;
  branch: string | null;
  provider: LoopProvider;
  mode: LoopMode;
  launch_mode: LaunchMode;
  max_iterations: number;
  max_stuck: number;
  pid: number;
  started_at: string;
  monitor_mode: StartMonitorMode;
  monitor_auto_open: boolean;
  monitor_pid: number | null;
  dashboard_url: string | null;
  warnings: string[];
}

interface StartDeps {
  discoverWorkspace: (options: { projectRoot?: string; homeDir?: string }) => Promise<DiscoveryResult>;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  cp: (src: string, dest: string, options: { recursive: boolean }) => Promise<void>;
  existsSync: (path: string) => boolean;
  spawn: typeof spawn;
  spawnSync: typeof spawnSync;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  nodePath: string;
  aloopPath: string;
}

const defaultDeps: StartDeps = {
  discoverWorkspace,
  readFile,
  writeFile,
  mkdir,
  cp,
  existsSync,
  spawn,
  spawnSync,
  platform: process.platform,
  env: process.env,
  now: () => new Date(),
  nodePath: process.execPath,
  aloopPath: path.resolve(process.argv[1]),
};

function isStartDeps(value: unknown): value is StartDeps {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<StartDeps>;
  return typeof candidate.discoverWorkspace === 'function'
    && typeof candidate.readFile === 'function'
    && typeof candidate.writeFile === 'function'
    && typeof candidate.mkdir === 'function'
    && typeof candidate.cp === 'function'
    && typeof candidate.existsSync === 'function'
    && typeof candidate.spawn === 'function'
    && typeof candidate.spawnSync === 'function';
}

export function resolveStartDeps(depsOrCommand: unknown, fallback: StartDeps = defaultDeps): StartDeps {
  // Commander passes the Command object as the 3rd argument to .action(...).
  // Treat non-StartDeps values as framework arguments, not injected deps.
  return isStartDeps(depsOrCommand) ? depsOrCommand : fallback;
}

function stripInlineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      const prev = i > 0 ? raw[i - 1] : ' ';
      if (prev === ' ' || prev === '\t') {
        return raw.slice(0, i).trimEnd();
      }
    }
  }
  return raw.trimEnd();
}

function parseYamlScalar(raw: string): string | number | boolean | null {
  const cleaned = stripInlineComment(raw).trim();
  if (cleaned === '') return '';
  if (/^null$/i.test(cleaned)) return null;
  if (/^true$/i.test(cleaned)) return true;
  if (/^false$/i.test(cleaned)) return false;
  if (/^-?\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/''/g, "'");
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/\\"/g, '"');
  }
  return cleaned;
}

function parseAloopConfig(content: string): ParsedAloopConfig {
  const parsed: ParsedAloopConfig = {
    values: {},
    enabled_providers: [],
    round_robin_order: [],
    models: {},
    retry_models: {},
    on_start: {},
  };

  const listSections = new Set(['enabled_providers', 'round_robin_order']);
  const mapSections = new Set(['models', 'retry_models', 'on_start']);

  let activeSection: string | null = null;
  let inBlockScalar = false;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    if (inBlockScalar) {
      if (indent > 0) {
        continue;
      }
      inBlockScalar = false;
      activeSection = null;
    }

    if (indent === 0) {
      const topLevel = trimmed.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
      if (!topLevel) {
        activeSection = null;
        continue;
      }
      const key = topLevel[1];
      const rawValue = topLevel[2] ?? '';
      if (rawValue === '') {
        activeSection = key;
        continue;
      }
      if (rawValue === '|' || rawValue === '>') {
        inBlockScalar = true;
        activeSection = null;
        continue;
      }
      parsed.values[key] = parseYamlScalar(rawValue);
      activeSection = null;
      continue;
    }

    if (!activeSection || indent < 2) {
      continue;
    }

    if (listSections.has(activeSection)) {
      const listMatch = trimmed.match(/^-\s+(.+)$/);
      if (!listMatch) {
        continue;
      }
      const value = parseYamlScalar(listMatch[1]);
      if (typeof value === 'string' && value.length > 0) {
        if (activeSection === 'enabled_providers') {
          parsed.enabled_providers.push(value);
        } else if (activeSection === 'round_robin_order') {
          parsed.round_robin_order.push(value);
        }
      }
      continue;
    }

    if (mapSections.has(activeSection)) {
      const mapMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!mapMatch) {
        continue;
      }
      const mapKey = mapMatch[1];
      const mapValue = parseYamlScalar(mapMatch[2]);
      if (activeSection === 'models') {
        if (typeof mapValue === 'string' && mapValue.length > 0) {
          parsed.models[mapKey] = mapValue;
        }
      } else if (activeSection === 'retry_models') {
        if (mapValue === null) {
          parsed.retry_models[mapKey] = null;
        } else if (typeof mapValue === 'string' && mapValue.length > 0) {
          parsed.retry_models[mapKey] = mapValue;
        }
      } else if (activeSection === 'on_start') {
        if (mapKey === 'monitor' && typeof mapValue === 'string' && mapValue.length > 0) {
          parsed.on_start.monitor = mapValue;
        } else if (mapKey === 'auto_open' && typeof mapValue === 'boolean') {
          parsed.on_start.auto_open = mapValue;
        }
      }
    }
  }

  return parsed;
}

function emptyParsedConfig(): ParsedAloopConfig {
  return {
    values: {},
    enabled_providers: [],
    round_robin_order: [],
    models: {},
    retry_models: {},
    on_start: {},
  };
}

async function readOptionalConfig(configPath: string, deps: StartDeps): Promise<ParsedAloopConfig | null> {
  if (!deps.existsSync(configPath)) return null;
  const content = await deps.readFile(configPath, 'utf8');
  return parseAloopConfig(content);
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function hasConfiguredValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^true$/i.test(value)) return true;
    if (/^false$/i.test(value)) return false;
  }
  return fallback;
}

function normalizeProviderList(values: string[]): ProviderName[] {
  const normalized: ProviderName[] = [];
  for (const raw of values) {
    const candidate = raw.trim().toLowerCase();
    if (!MODEL_PROVIDER_SET.has(candidate as ProviderName)) {
      continue;
    }
    const provider = candidate as ProviderName;
    if (!normalized.includes(provider)) {
      normalized.push(provider);
    }
  }
  return normalized;
}

function isValidOpenRouterModelPath(model: string): boolean {
  if (!model.startsWith('openrouter/')) {
    return true;
  }
  const parts = model.split('/');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function sanitizeSessionToken(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'session';
}

function padNumber(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatSessionTimestamp(date: Date): string {
  return `${date.getUTCFullYear()}${padNumber(date.getUTCMonth() + 1)}${padNumber(date.getUTCDate())}-${padNumber(date.getUTCHours())}${padNumber(date.getUTCMinutes())}${padNumber(date.getUTCSeconds())}`;
}

function resolveModeFromFlags(options: StartCommandOptions): LoopMode | null {
  const modeFlags = [options.plan, options.build, options.review].filter(Boolean).length;
  if (modeFlags > 1) {
    throw new Error('Choose at most one of --plan, --build, or --review.');
  }
  if (options.plan) return 'plan';
  if (options.build) return 'build';
  if (options.review) return 'review';
  return null;
}

function assertLoopMode(value: string): LoopMode {
  const normalized = value.trim().toLowerCase() as LoopMode;
  if (!LOOP_MODE_SET.has(normalized)) {
    throw new Error(`Invalid mode: ${value}`);
  }
  return normalized;
}

function resolveConfiguredStartMode(value: string): LoopMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'loop') {
    return 'plan-build-review';
  }
  if (normalized === 'single') {
    return 'single';
  }
  if (normalized === 'orchestrate') {
    throw new Error('Invalid mode: orchestrate (use `aloop orchestrate` for orchestrator sessions).');
  }
  return assertLoopMode(value);
}

function assertLaunchMode(value: string): LaunchMode {
  const normalized = value.trim().toLowerCase() as LaunchMode;
  if (!LAUNCH_MODE_SET.has(normalized)) {
    throw new Error(`Invalid launch mode: ${value} (must be start, restart, or resume)`);
  }
  return normalized;
}

function assertLoopProvider(value: string): LoopProvider {
  const normalized = value.trim().toLowerCase() as LoopProvider;
  if (!PROVIDER_SET.has(normalized)) {
    throw new Error(`Invalid provider: ${value}`);
  }
  return normalized;
}

function trySpawnSync(deps: StartDeps, command: string, args: string[]): number | null {
  try {
    const result = deps.spawnSync(command, args, { encoding: 'utf8', stdio: 'ignore', windowsHide: true });
    return result.status;
  } catch {
    return null;
  }
}

function resolvePowerShellBinary(deps: StartDeps): string {
  for (const candidate of ['pwsh', 'powershell']) {
    if (trySpawnSync(deps, candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']) === 0) {
      return candidate;
    }
  }
  throw new Error('PowerShell is required to launch loop.ps1 but neither pwsh nor powershell was found.');
}

export function normalizeGitBashPathForWindows(value: string): string {
  const match = value.match(/^[\\/](?![\\/])([a-zA-Z])(?:[\\/](.*))?$/);
  if (!match) {
    return value;
  }
  const drive = match[1].toUpperCase();
  const tail = (match[2] ?? '').replace(/[\\/]+/g, '\\');
  return tail.length > 0 ? `${drive}:\\${tail}` : `${drive}:\\`;
}

interface SessionMeta {
  session_id: string;
  session_dir: string;
  project_root: string;
  worktree: boolean;
  worktree_path: string | null;
  work_dir: string;
  branch: string | null;
  prompts_dir: string;
  provider: string;
  mode: string;
  enabled_providers: string[];
  round_robin_order: string[];
  max_iterations: number;
  max_stuck: number;
  pid?: number;
}

async function readSessionMeta(sessionDir: string, deps: StartDeps): Promise<SessionMeta | null> {
  const metaPath = path.join(sessionDir, 'meta.json');
  if (!deps.existsSync(metaPath)) return null;
  try {
    const content = await deps.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(content) as SessionMeta;
    if (!parsed || typeof parsed !== 'object' || !parsed.session_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readActiveMap(activePath: string, deps: StartDeps): Promise<Record<string, unknown>> {
  if (!deps.existsSync(activePath)) {
    return {};
  }
  try {
    const content = await deps.readFile(activePath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveSessionId(baseName: string, sessionsRoot: string, deps: StartDeps): string {
  const now = deps.now();
  const baseSessionId = `${sanitizeSessionToken(baseName)}-${formatSessionTimestamp(now)}`;
  let sessionId = baseSessionId;
  let suffix = 1;
  while (deps.existsSync(path.join(sessionsRoot, sessionId))) {
    sessionId = `${baseSessionId}-${suffix}`;
    suffix += 1;
  }
  return sessionId;
}

function selectValue<T>(...values: Array<T | undefined | null>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function collectModelProviders(enabledProviders: ProviderName[], provider: LoopProvider): ProviderName[] {
  const set = new Set<ProviderName>(enabledProviders);
  if (provider !== 'round-robin') {
    set.add(provider);
  }
  return Array.from(set);
}

function createGitFailureWarning(stderr: string, stdout: string): string {
  const detail = [stderr, stdout].map((value) => value.trim()).filter(Boolean).join(' | ');
  if (!detail) {
    return 'git worktree add failed; falling back to in-place execution.';
  }
  return `git worktree add failed (${detail}); falling back to in-place execution.`;
}

function normalizeMonitorMode(value: unknown): StartMonitorMode | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dashboard' || normalized === 'terminal' || normalized === 'none') {
    return normalized;
  }
  return null;
}

function quotePowerShellSingle(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function resolveOnStartBehavior(projectConfig: ParsedAloopConfig, globalConfig: ParsedAloopConfig): { mode: StartMonitorMode; autoOpen: boolean } {
  const monitor = normalizeMonitorMode(selectValue(projectConfig.on_start.monitor, globalConfig.on_start.monitor)) ?? 'dashboard';
  const autoOpen = toBoolean(selectValue(projectConfig.on_start.auto_open, globalConfig.on_start.auto_open), true);
  return { mode: monitor, autoOpen };
}

function runShortCommand(
  deps: StartDeps,
  command: string,
  args: string[],
  cwd: string,
): { ok: boolean; message: string | null } {
  try {
    const result = deps.spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'ignore', windowsHide: true });
    if (result.status === 0) {
      return { ok: true, message: null };
    }
    return { ok: false, message: `exit code ${result.status ?? 'unknown'}` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

function spawnDetached(deps: StartDeps, command: string, args: string[], cwd: string): number | null {
  try {
    const child = deps.spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: { ...deps.env },
      windowsHide: true,
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    return null;
  }
}

function openInBrowser(deps: StartDeps, url: string, cwd: string): { ok: boolean; message: string | null } {
  if (deps.platform === 'win32') {
    const powerShell = resolvePowerShellBinary(deps);
    return runShortCommand(deps, powerShell, ['-NoProfile', '-Command', `Start-Process ${quotePowerShellSingle(url)}`], cwd);
  }
  if (deps.platform === 'darwin') {
    return runShortCommand(deps, 'open', [url], cwd);
  }
  return runShortCommand(deps, 'xdg-open', [url], cwd);
}

function openStatusTerminal(deps: StartDeps, homeDir: string, cwd: string): { ok: boolean; message: string | null } {
  const statusCommand = `"${deps.nodePath}" "${deps.aloopPath}" status --watch --home-dir "${homeDir.replace(/"/g, '\\"')}"`;
  if (deps.platform === 'win32') {
    const powerShell = resolvePowerShellBinary(deps);
    const terminalShell = trySpawnSync(deps, 'pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']) === 0 ? 'pwsh' : 'powershell';
    const launchCommand = `Start-Process ${quotePowerShellSingle(terminalShell)} -ArgumentList @('-NoExit','-Command',${quotePowerShellSingle(statusCommand)})`;
    return runShortCommand(deps, powerShell, ['-NoProfile', '-Command', launchCommand], cwd);
  }
  if (deps.platform === 'darwin') {
    const escapedStatus = statusCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return runShortCommand(
      deps,
      'osascript',
      ['-e', `tell application "Terminal" to do script "${escapedStatus}"`],
      cwd,
    );
  }
  return runShortCommand(deps, 'x-terminal-emulator', ['-e', statusCommand], cwd);
}

async function reserveLocalPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => reject(error));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to reserve dashboard port.'));
        return;
      }
      const reservedPort = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(reservedPort);
      });
    });
  });
}

function isAloopRepo(dir: string, existsSync: (p: string) => boolean): boolean {
  return existsSync(path.join(dir, 'install.ps1')) && existsSync(path.join(dir, 'aloop', 'bin'));
}

function findAloopRepoRoot(startDir: string, existsSync: (p: string) => boolean): string | null {
  const dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  let current = dir;
  while (current !== root) {
    if (isAloopRepo(current, existsSync)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export async function startCommandWithDeps(options: StartCommandOptions = {}, deps: StartDeps = defaultDeps): Promise<StartCommandResult> {
  const homeDir = resolveHomeDir(options.homeDir);
  const discovery = await deps.discoverWorkspace({ projectRoot: options.projectRoot, homeDir: options.homeDir });

  const aloopRoot = path.join(homeDir, '.aloop');
  const globalConfigPath = path.join(aloopRoot, 'config.yml');
  const hasProjectConfig = discovery.setup.config_exists && deps.existsSync(discovery.setup.config_path);
  const hasGlobalConfig = deps.existsSync(globalConfigPath);

  if (!hasProjectConfig && !hasGlobalConfig) {
    throw new Error('No Aloop configuration found for this project. Run `aloop setup` first.');
  }
  const sessionsRoot = path.join(aloopRoot, 'sessions');
  const warnings: string[] = [];

  await deps.mkdir(sessionsRoot, { recursive: true });

  // Runtime staleness check: compare installed version.json commit with current repo HEAD
  const versionJsonPath = path.join(aloopRoot, 'version.json');
  try {
    const versionRaw = await deps.readFile(versionJsonPath, 'utf8');
    const versionData = JSON.parse(versionRaw) as { commit?: string; installed_at?: string };
    if (versionData.commit) {
      // Find aloop source repo root: try current project first (if it's the aloop repo),
      // then walk up from the CLI entry point path.
      let repoRoot: string | null = null;
      if (isAloopRepo(discovery.project.root, deps.existsSync)) {
        repoRoot = discovery.project.root;
      } else {
        repoRoot = findAloopRepoRoot(path.dirname(deps.aloopPath), deps.existsSync);
      }

      if (repoRoot) {
        const headResult = deps.spawnSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
        if (headResult.status === 0) {
          const currentCommit = headResult.stdout.trim();
          if (currentCommit && currentCommit !== versionData.commit) {
            warnings.push(
              `Installed runtime (commit ${versionData.commit}, installed ${versionData.installed_at ?? 'unknown'}) ` +
              `may be stale — current repo HEAD is ${currentCommit}. Run \`aloop update\` to refresh.`,
            );
          }
        }
      }
    }
  } catch {
    // version.json missing or unreadable — skip staleness check
  }

  const projectConfig = (await readOptionalConfig(discovery.setup.config_path, deps)) ?? emptyParsedConfig();
  const globalConfig = (await readOptionalConfig(path.join(aloopRoot, 'config.yml'), deps)) ?? emptyParsedConfig();

  const enabledProviders = normalizeProviderList(
    projectConfig.enabled_providers.length > 0
      ? projectConfig.enabled_providers
      : globalConfig.enabled_providers.length > 0
        ? globalConfig.enabled_providers
        : discovery.providers.installed,
  );
  if (enabledProviders.length === 0) {
    enabledProviders.push('claude');
  }

  const forcedMode = resolveModeFromFlags(options);
  const resolvedMode = forcedMode
    ?? (options.mode ? resolveConfiguredStartMode(options.mode) : null)
    ?? resolveConfiguredStartMode(String(selectValue(projectConfig.values.mode, globalConfig.values.default_mode, 'plan-build-review')));

  const launchMode: LaunchMode = options.launch ? assertLaunchMode(options.launch) : 'start';

  const selectedProvider = options.provider
    ? assertLoopProvider(options.provider)
    : assertLoopProvider(String(selectValue(projectConfig.values.provider, globalConfig.values.default_provider, discovery.providers.default_provider, 'claude')));

  if (selectedProvider !== 'round-robin' && !enabledProviders.includes(selectedProvider)) {
    enabledProviders.push(selectedProvider);
  }

  const roundRobinOrderSource = projectConfig.round_robin_order.length > 0 ? projectConfig.round_robin_order : globalConfig.round_robin_order;
  let roundRobinOrder = normalizeProviderList(roundRobinOrderSource);
  if (roundRobinOrder.length === 0) {
    roundRobinOrder = [...enabledProviders];
  }
  roundRobinOrder = roundRobinOrder.filter((provider) => enabledProviders.includes(provider));
  if (roundRobinOrder.length === 0) {
    roundRobinOrder = [...enabledProviders];
  }

  const maxIterationsValue = selectValue(options.maxIterations, projectConfig.values.max_iterations, globalConfig.values.max_iterations);
  const parsedMaxIterations = toPositiveInt(maxIterationsValue);
  if (hasConfiguredValue(maxIterationsValue) && parsedMaxIterations === null) {
    throw new Error(`Invalid --max-iterations value: ${String(maxIterationsValue)} (must be a positive integer)`);
  }
  const maxIterations = parsedMaxIterations ?? 50;
  const maxStuck = toPositiveInt(selectValue(projectConfig.values.max_stuck, globalConfig.values.max_stuck)) ?? 3;
  const backupEnabled = toBoolean(selectValue(projectConfig.values.backup_enabled, globalConfig.values.backup_enabled), false);
  const worktreeDefault = toBoolean(selectValue(projectConfig.values.worktree_default, globalConfig.values.worktree_default), true);
  const onStartBehavior = resolveOnStartBehavior(projectConfig, globalConfig);

  const mergedModels: Record<ProviderName, string> = {
    ...DEFAULT_MODELS,
    ...Object.fromEntries(
      Object.entries(globalConfig.models).filter(([provider]) => MODEL_PROVIDER_SET.has(provider as ProviderName)),
    ) as Record<ProviderName, string>,
    ...Object.fromEntries(
      Object.entries(projectConfig.models).filter(([provider]) => MODEL_PROVIDER_SET.has(provider as ProviderName)),
    ) as Record<ProviderName, string>,
  };
  for (const [providerName, modelName] of Object.entries(mergedModels)) {
    if (!isValidOpenRouterModelPath(modelName)) {
      throw new Error(
        `Invalid OpenRouter model path for ${providerName}: ${modelName}. Expected format openrouter/<provider>/<model>.`,
      );
    }
  }
  const copilotRetryModel = String(selectValue(projectConfig.retry_models.copilot, globalConfig.retry_models.copilot, 'claude-sonnet-4.6') ?? 'claude-sonnet-4.6');

  const startedAt = deps.now().toISOString();
  let sessionId: string;
  let sessionDir: string;
  let promptsDir: string;
  let workDir = discovery.project.root;
  let worktreePath: string | null = null;
  let branchName: string | null = null;
  let useWorktree = !options.inPlace && worktreeDefault;

  if (launchMode === 'resume' && options.sessionId) {
    // Resume: reuse existing session directory, worktree, and branch
    sessionId = options.sessionId;
    sessionDir = path.join(sessionsRoot, sessionId);

    if (!deps.existsSync(sessionDir)) {
      throw new Error(`Session not found: ${sessionId}. Cannot resume a non-existent session.`);
    }

    const existingMeta = await readSessionMeta(sessionDir, deps);
    if (!existingMeta) {
      throw new Error(`Session meta.json not found or invalid for session: ${sessionId}.`);
    }

    promptsDir = existingMeta.prompts_dir ?? path.join(sessionDir, 'prompts');
    branchName = existingMeta.branch ?? null;

    if (existingMeta.worktree && existingMeta.worktree_path) {
      if (deps.existsSync(existingMeta.worktree_path)) {
        // Worktree still exists — reuse it
        worktreePath = existingMeta.worktree_path;
        workDir = existingMeta.worktree_path;
        useWorktree = true;
      } else if (branchName && discovery.project.is_git_repo) {
        // Worktree was removed but branch exists — recreate worktree on the same branch
        const candidatePath = existingMeta.worktree_path;
        const worktreeResult = deps.spawnSync('git', ['-C', discovery.project.root, 'worktree', 'add', candidatePath, branchName], { encoding: 'utf8' });
        if (worktreeResult.status === 0) {
          worktreePath = candidatePath;
          workDir = candidatePath;
          useWorktree = true;
        } else {
          warnings.push(createGitFailureWarning(String(worktreeResult.stderr ?? ''), String(worktreeResult.stdout ?? '')));
          useWorktree = false;
        }
      } else {
        warnings.push('Original worktree was removed and branch is unavailable; resuming in-place.');
        useWorktree = false;
      }
    } else {
      // Original session was in-place
      workDir = existingMeta.work_dir ?? discovery.project.root;
      useWorktree = false;
    }
  } else {
    // Normal start: create new session
    sessionId = resolveSessionId(discovery.project.name, sessionsRoot, deps);
    sessionDir = path.join(sessionsRoot, sessionId);
    const promptsSourceDir = path.join(discovery.setup.project_dir, 'prompts');
    promptsDir = path.join(sessionDir, 'prompts');

    await deps.mkdir(sessionDir, { recursive: true });

    if (!deps.existsSync(promptsSourceDir)) {
      throw new Error(`Project prompts not found: ${promptsSourceDir}. Run \`aloop setup\` first.`);
    }
    await deps.cp(promptsSourceDir, promptsDir, { recursive: true });

    if (useWorktree) {
      if (!discovery.project.is_git_repo) {
        warnings.push('Worktree requested but project is not a git repository; using in-place execution.');
        useWorktree = false;
      } else {
        const candidatePath = path.join(sessionDir, 'worktree');
        const candidateBranch = `aloop/${sessionId}`;
        const worktreeResult = deps.spawnSync('git', ['-C', discovery.project.root, 'worktree', 'add', candidatePath, '-b', candidateBranch], { encoding: 'utf8' });
        if (worktreeResult.status !== 0) {
          warnings.push(createGitFailureWarning(String(worktreeResult.stderr ?? ''), String(worktreeResult.stdout ?? '')));
          useWorktree = false;
        } else {
          worktreePath = candidatePath;
          workDir = candidatePath;
          branchName = candidateBranch;
        }
      }
    }
  }

  // Compile loop-plan.json and add frontmatter to prompt files
  await compileLoopPlan({
    mode: resolvedMode,
    provider: selectedProvider,
    promptsDir,
    sessionDir,
    enabledProviders,
    roundRobinOrder,
    models: mergedModels,
    projectRoot: discovery.project.root,
  }, {
    readFile: (p, enc) => deps.readFile(p, enc),
    writeFile: (p, data, enc) => deps.writeFile(p, data, enc),
    existsSync: deps.existsSync,
  });

  const modelProviders = collectModelProviders(enabledProviders, selectedProvider);
  const roundRobinCsv = roundRobinOrder.join(',');
  const loopBinDir = path.join(aloopRoot, 'bin');
  const launchWorkDir = deps.platform === 'win32' ? normalizeGitBashPathForWindows(workDir) : workDir;
  let command: string;
  let args: string[];

  if (deps.platform === 'win32') {
    const loopScript = normalizeGitBashPathForWindows(path.join(loopBinDir, 'loop.ps1'));
    if (!deps.existsSync(loopScript)) {
      throw new Error(`Loop script not found: ${loopScript}`);
    }
    const promptsDirForPowerShell = normalizeGitBashPathForWindows(promptsDir);
    const sessionDirForPowerShell = normalizeGitBashPathForWindows(sessionDir);
    const workDirForPowerShell = normalizeGitBashPathForWindows(workDir);
    command = resolvePowerShellBinary(deps);
    args = [
      '-NoProfile',
      '-File',
      loopScript,
      '-PromptsDir',
      promptsDirForPowerShell,
      '-SessionDir',
      sessionDirForPowerShell,
      '-WorkDir',
      workDirForPowerShell,
      '-Mode',
      resolvedMode,
      '-Provider',
      selectedProvider,
      '-RoundRobinProviders',
      roundRobinCsv,
      '-MaxIterations',
      String(maxIterations),
      '-MaxStuck',
      String(maxStuck),
      '-LaunchMode',
      launchMode,
    ];
    if (backupEnabled) {
      args.push('-BackupEnabled');
    }
    for (const provider of modelProviders) {
      const model = mergedModels[provider];
      if (!model) continue;
      if (provider === 'claude') args.push('-ClaudeModel', model);
      if (provider === 'codex') args.push('-CodexModel', model);
      if (provider === 'gemini') args.push('-GeminiModel', model);
      if (provider === 'copilot') {
        args.push('-CopilotModel', model);
      }
    }
    if (modelProviders.includes('copilot') && copilotRetryModel.length > 0) {
      args.push('-CopilotRetryModel', copilotRetryModel);
    }
  } else {
    const loopScript = path.join(loopBinDir, 'loop.sh');
    if (!deps.existsSync(loopScript)) {
      throw new Error(`Loop script not found: ${loopScript}`);
    }
    command = loopScript;
    args = [
      '--prompts-dir',
      promptsDir,
      '--session-dir',
      sessionDir,
      '--work-dir',
      workDir,
      '--mode',
      resolvedMode,
      '--provider',
      selectedProvider,
      '--round-robin',
      roundRobinCsv,
      '--max-iterations',
      String(maxIterations),
      '--max-stuck',
      String(maxStuck),
      '--launch-mode',
      launchMode,
    ];
    if (backupEnabled) {
      args.push('--backup');
    }
    for (const provider of modelProviders) {
      const model = mergedModels[provider];
      if (!model) continue;
      if (provider === 'claude') args.push('--claude-model', model);
      if (provider === 'codex') args.push('--codex-model', model);
      if (provider === 'gemini') args.push('--gemini-model', model);
      if (provider === 'copilot') args.push('--copilot-model', model);
    }
  }

  const metaPath = path.join(sessionDir, 'meta.json');
  const statusPath = path.join(sessionDir, 'status.json');
  const meta: Record<string, unknown> = {
    session_id: sessionId,
    project_name: discovery.project.name,
    project_root: discovery.project.root,
    project_hash: discovery.project.hash,
    provider: selectedProvider,
    mode: resolvedMode,
    launch_mode: launchMode,
    max_iterations: maxIterations,
    max_stuck: maxStuck,
    worktree: useWorktree,
    worktree_path: worktreePath,
    work_dir: workDir,
    branch: branchName,
    prompts_dir: promptsDir,
    session_dir: sessionDir,
    enabled_providers: enabledProviders,
    round_robin_order: roundRobinOrder,
    warnings,
    created_at: startedAt,
  };

  await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await deps.writeFile(
    statusPath,
    `${JSON.stringify({ state: 'starting', mode: resolvedMode, provider: selectedProvider, iteration: 0, updated_at: startedAt }, null, 2)}\n`,
    'utf8',
  );

  const child = deps.spawn(command, args, {
    cwd: launchWorkDir,
    detached: true,
    stdio: 'ignore',
    env: { ...deps.env },
    windowsHide: true,
  });
  child.unref();

  const pid = child.pid;
  if (!pid) {
    throw new Error('Failed to launch loop process.');
  }

  meta.pid = pid;
  meta.started_at = startedAt;
  await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const activePath = path.join(aloopRoot, 'active.json');
  let registered = false;
  try {
    const active = await readActiveMap(activePath, deps);
    active[sessionId] = {
      session_id: sessionId,
      session_dir: sessionDir,
      project_name: discovery.project.name,
      project_root: discovery.project.root,
      pid,
      work_dir: workDir,
      started_at: startedAt,
      provider: selectedProvider,
      mode: resolvedMode,
    };
    await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
    registered = true;

    let monitorPid: number | null = null;
    let dashboardUrl: string | null = null;
    if (onStartBehavior.mode === 'dashboard') {
      let dashboardPort: number | null = null;
      try {
        dashboardPort = await reserveLocalPort();
      } catch (error) {
        warnings.push(`Failed to reserve a local dashboard port: ${(error as Error).message}`);
      }

      if (dashboardPort !== null) {
        dashboardUrl = `http://localhost:${dashboardPort}`;
        monitorPid = spawnDetached(
          deps,
          deps.nodePath,
          [deps.aloopPath, 'dashboard', '--port', String(dashboardPort), '--session-dir', sessionDir, '--workdir', launchWorkDir],
          launchWorkDir,
        );
        if (!monitorPid) {
          warnings.push('Failed to launch dashboard monitor automatically. You can run `aloop dashboard` manually.');
        } else if (onStartBehavior.autoOpen) {
          const opened = openInBrowser(deps, dashboardUrl, launchWorkDir);
          if (!opened.ok) {
            warnings.push(`Failed to auto-open dashboard URL (${opened.message ?? 'unknown error'}); trying terminal monitor.`);
            const terminalLaunch = openStatusTerminal(deps, homeDir, launchWorkDir);
            if (!terminalLaunch.ok) {
              warnings.push(`Failed to open terminal monitor fallback (${terminalLaunch.message ?? 'unknown error'}). Run \`aloop dashboard\` or \`aloop status --watch\` manually.`);
            }
          }
        }
      }
    } else if (onStartBehavior.mode === 'terminal' && onStartBehavior.autoOpen) {
      const terminalLaunch = openStatusTerminal(deps, homeDir, launchWorkDir);
      if (!terminalLaunch.ok) {
        warnings.push(`Failed to launch terminal monitor (${terminalLaunch.message ?? 'unknown error'}). Run \`aloop status --watch\` manually.`);
      }
    }

    meta.monitor_mode = onStartBehavior.mode;
    meta.monitor_auto_open = onStartBehavior.autoOpen;
    meta.monitor_pid = monitorPid;
    meta.dashboard_url = dashboardUrl;
    await deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    return {
      session_id: sessionId,
      session_dir: sessionDir,
      prompts_dir: promptsDir,
      work_dir: workDir,
      worktree: useWorktree,
      worktree_path: worktreePath,
      branch: branchName,
      provider: selectedProvider,
      mode: resolvedMode,
      launch_mode: launchMode,
      max_iterations: maxIterations,
      max_stuck: maxStuck,
      pid,
      started_at: startedAt,
      monitor_mode: onStartBehavior.mode,
      monitor_auto_open: onStartBehavior.autoOpen,
      monitor_pid: monitorPid,
      dashboard_url: dashboardUrl,
      warnings,
    };
  } catch (error) {
    if (registered) {
      try {
        const active = await readActiveMap(activePath, deps);
        delete active[sessionId];
        await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
      } catch {
        // ignore cleanup failure
      }
    }
    throw error;
  }
}

export async function startCommand(sessionIdArg: string | undefined, options: StartCommandOptions = {}, depsOrCommand?: StartDeps | unknown) {
  const deps = resolveStartDeps(depsOrCommand);
  if (sessionIdArg) {
    options.sessionId = sessionIdArg;
  }
  const outputMode = options.output ?? 'text';
  const result = await startCommandWithDeps(options, deps);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Aloop loop started!');
  console.log('');
  console.log(`  Session:  ${result.session_id}`);
  console.log(`  Mode:     ${result.mode}`);
  console.log(`  Launch:   ${result.launch_mode}`);
  console.log(`  Provider: ${result.provider}`);
  console.log(`  Work dir: ${result.work_dir}`);
  console.log(`  PID:      ${result.pid}`);
  console.log(`  Prompts:  ${result.prompts_dir}`);
  console.log(`  Monitor:  ${result.monitor_mode} (auto_open=${result.monitor_auto_open ? 'true' : 'false'})`);
  if (result.dashboard_url) {
    console.log(`  Dashboard: ${result.dashboard_url}`);
  }

  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}
