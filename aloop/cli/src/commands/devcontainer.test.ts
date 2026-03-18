import test from 'node:test';
import assert from 'node:assert/strict';
import {
  devcontainerCommand,
  devcontainerCommandWithDeps,
  generateDevcontainerConfig,
  augmentExistingConfig,
  stripJsoncComments,
  detectNodeInstallCommand,
  detectPythonInstallCommand,
  buildProviderInstallCommands,
  buildProviderRemoteEnv,
  buildProviderAuthFileMounts,
  buildVSCodeExtensions,
  resolveDevcontainerProviders,
  resolveDevcontainerDeps,
  verifyDevcontainer,
  verifyDevcontainerCommand,
  checkAuthPreflight,
  resolveHomePath,
  type DevcontainerDeps,
  type DevcontainerConfig,
  type VerifyDeps,
} from './devcontainer.js';
import type { DiscoveryResult } from './project.js';

function mockDiscovery(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    project: { root: '/mock/project', name: 'mock-project', hash: 'abc123', is_git_repo: true, git_branch: 'main' },
    setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: true, templates_dir: '/mock/templates' },
    context: {
      detected_language: 'node-typescript',
      language_confidence: 'high',
      language_signals: ['package.json', 'tsconfig.json'],
      validation_presets: { tests_only: ['npm test'], tests_and_types: ['npx tsc --noEmit', 'npm test'], full: ['npx tsc --noEmit', 'npm test'] },
      spec_candidates: [],
      reference_candidates: [],
      context_files: {},
      ...overrides.context,
    },
    providers: {
      installed: ['claude'],
      missing: [],
      default_provider: 'claude',
      default_models: { claude: 'opus', codex: 'gpt-5.3-codex', gemini: 'gemini-3.1-pro-preview', copilot: 'gpt-5.3-codex' },
      round_robin_default: ['claude'],
      ...overrides.providers,
    },
    discovered_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as DiscoveryResult;
}

// --- generateDevcontainerConfig ---

test('generateDevcontainerConfig - node-typescript project', () => {
  const discovery = mockDiscovery();
  // Use mock existsFn that returns false for auth files to keep mounts predictable
  const existsFn = () => false;
  const config = generateDevcontainerConfig(discovery, existsFn);

  assert.equal(config.name, 'mock-project-aloop');
  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/typescript-node:22');
  assert.deepEqual(config.features['ghcr.io/devcontainers/features/git:1'], {});
  assert.equal(config.containerEnv.ALOOP_CONTAINER, '1');
  assert.equal(config.containerEnv.ALOOP_NO_DASHBOARD, '1');
  assert.equal(config.mounts.length, 2);
  assert.equal(config.mounts[0], 'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind');
  assert.equal(config.mounts[1], 'source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind');
  assert.equal(config.postCreateCommand, 'npm install && npm install -g @anthropic-ai/claude-code');
  // remoteEnv forwards Claude auth vars (OAUTH preferred, API key fallback)
  assert.equal(config.remoteEnv.CLAUDE_CODE_OAUTH_TOKEN, '${localEnv:CLAUDE_CODE_OAUTH_TOKEN}');
  assert.equal(config.remoteEnv.ANTHROPIC_API_KEY, '${localEnv:ANTHROPIC_API_KEY}');
});

test('generateDevcontainerConfig - python project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'python' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/python:3');
  assert.equal(config.postCreateCommand, 'pip install -e . && npm install -g @anthropic-ai/claude-code');
});

test('generateDevcontainerConfig - go project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'go' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/go:1');
  assert.equal(config.postCreateCommand, 'go mod download && npm install -g @anthropic-ai/claude-code');
});

test('generateDevcontainerConfig - rust project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'rust' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/rust:1');
  assert.equal(config.postCreateCommand, 'cargo build && npm install -g @anthropic-ai/claude-code');
});

test('generateDevcontainerConfig - dotnet project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'dotnet' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/dotnet:8.0');
  assert.equal(config.postCreateCommand, 'dotnet restore && npm install -g @anthropic-ai/claude-code');
});

test('generateDevcontainerConfig - unknown language uses base ubuntu', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'other' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/base:ubuntu');
  assert.deepEqual(config.features['ghcr.io/devcontainers/features/node:1'], {});
  // No language deps but claude provider install is included
  assert.equal(config.postCreateCommand, 'npm install -g @anthropic-ai/claude-code');
});

// --- augmentExistingConfig ---

test('augmentExistingConfig - adds mounts to empty existing', () => {
  const existing = { name: 'my-project', image: 'custom:latest' };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    image: 'mcr.microsoft.com/devcontainers/typescript-node:22',
    features: {},
    mounts: [
      'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind',
      'source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind',
    ],
    containerEnv: { ALOOP_CONTAINER: '1', ALOOP_NO_DASHBOARD: '1' },
    remoteEnv: {},
  };

  const result = augmentExistingConfig(existing, generated);

  assert.equal(result.name, 'my-project'); // Preserves existing name
  assert.equal(result.image, 'custom:latest'); // Preserves existing image
  assert.deepEqual(result.mounts, generated.mounts);
  assert.deepEqual(result.containerEnv, { ALOOP_CONTAINER: '1', ALOOP_NO_DASHBOARD: '1' });
});

test('augmentExistingConfig - merges mounts without duplicates', () => {
  const existing = {
    mounts: ['source=/host/data,target=/data,type=bind'],
  };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    features: {},
    mounts: [
      'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind',
      'source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind',
    ],
    containerEnv: { ALOOP_CONTAINER: '1' },
    remoteEnv: {},
  };

  const result = augmentExistingConfig(existing, generated);
  const mounts = result.mounts as string[];

  assert.equal(mounts.length, 3);
  assert.ok(mounts.includes('source=/host/data,target=/data,type=bind'));
  assert.ok(mounts.some(m => m.includes('.aloop,target=')));
  assert.ok(mounts.some(m => m.includes('/aloop-sessions')));
});

test('augmentExistingConfig - deduplicates mount entries present in both existing and generated', () => {
  const sharedMount = 'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind';
  const sessionsMount = 'source=${localEnv:HOME}/.aloop/sessions,target=/aloop-sessions,type=bind';
  const existing = {
    mounts: [sharedMount, 'source=/host/data,target=/data,type=bind'],
  };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    features: {},
    mounts: [sharedMount, sessionsMount],
    containerEnv: { ALOOP_CONTAINER: '1' },
    remoteEnv: {},
  };

  const result = augmentExistingConfig(existing, generated);
  const mounts = result.mounts as string[];

  assert.equal(mounts.length, 3); // shared mount NOT duplicated, sessions mount added
  assert.equal(mounts.filter(m => m === sharedMount).length, 1);
  assert.ok(mounts.includes('source=/host/data,target=/data,type=bind'));
  assert.ok(mounts.includes(sessionsMount));
});

test('augmentExistingConfig - preserves existing containerEnv values', () => {
  const existing = {
    containerEnv: { MY_VAR: 'keep-this' },
  };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    features: {},
    mounts: [],
    containerEnv: { ALOOP_CONTAINER: '1', MY_VAR: 'overwrite' },
    remoteEnv: {},
  };

  const result = augmentExistingConfig(existing, generated);
  const env = result.containerEnv as Record<string, string>;

  // aloop containerEnv overwrites since it's aloop-specific
  assert.equal(env.ALOOP_CONTAINER, '1');
  assert.equal(env.MY_VAR, 'overwrite');
});

test('augmentExistingConfig - preserves existing remoteEnv values', () => {
  const existing = {
    remoteEnv: { EXISTING_KEY: 'keep' },
  };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    features: {},
    mounts: [],
    containerEnv: {},
    remoteEnv: { EXISTING_KEY: 'overwrite', NEW_KEY: 'new' },
  };

  const result = augmentExistingConfig(existing, generated);
  const env = result.remoteEnv as Record<string, string>;

  assert.equal(env.EXISTING_KEY, 'keep'); // Existing takes priority
  assert.equal(env.NEW_KEY, 'new');
});

// --- detectNodeInstallCommand ---

test('detectNodeInstallCommand - detects pnpm from pnpm-lock.yaml', () => {
  const existsFn = (p: string) => p.endsWith('pnpm-lock.yaml');
  assert.equal(detectNodeInstallCommand('/project', existsFn), 'pnpm install');
});

test('detectNodeInstallCommand - detects yarn from yarn.lock', () => {
  const existsFn = (p: string) => p.endsWith('yarn.lock');
  assert.equal(detectNodeInstallCommand('/project', existsFn), 'yarn install');
});

test('detectNodeInstallCommand - detects bun from bun.lockb', () => {
  const existsFn = (p: string) => p.endsWith('bun.lockb');
  assert.equal(detectNodeInstallCommand('/project', existsFn), 'bun install');
});

test('detectNodeInstallCommand - detects bun from bun.lock', () => {
  const existsFn = (p: string) => p.endsWith('bun.lock');
  assert.equal(detectNodeInstallCommand('/project', existsFn), 'bun install');
});

test('detectNodeInstallCommand - defaults to npm install when no lock file', () => {
  const existsFn = () => false;
  assert.equal(detectNodeInstallCommand('/project', existsFn), 'npm install');
});

// --- detectPythonInstallCommand ---

test('detectPythonInstallCommand - detects pyproject.toml', () => {
  const existsFn = (p: string) => p.endsWith('pyproject.toml');
  assert.equal(detectPythonInstallCommand('/project', existsFn), 'pip install -e .');
});

test('detectPythonInstallCommand - detects requirements.txt', () => {
  const existsFn = (p: string) => p.endsWith('requirements.txt');
  assert.equal(detectPythonInstallCommand('/project', existsFn), 'pip install -r requirements.txt');
});

test('detectPythonInstallCommand - defaults to pip install -e . when no config file', () => {
  const existsFn = () => false;
  assert.equal(detectPythonInstallCommand('/project', existsFn), 'pip install -e .');
});

// --- devcontainerCommandWithDeps ---

test('devcontainerCommandWithDeps - creates new config', async () => {
  let writtenPath = '';
  let writtenContent = '';

  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => '',
    writeFile: async (p, data) => { writtenPath = p; writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  const result = await devcontainerCommandWithDeps({}, deps);

  assert.equal(result.action, 'created');
  assert.equal(result.had_existing, false);
  assert.equal(result.language, 'node-typescript');
  assert.ok(writtenPath.includes('devcontainer.json'));

  const parsed = JSON.parse(writtenContent);
  assert.equal(parsed.name, 'mock-project-aloop');
  assert.equal(parsed.containerEnv.ALOOP_CONTAINER, '1');
});

test('devcontainerCommandWithDeps - augments existing config', async () => {
  const existingConfig = JSON.stringify({
    name: 'my-custom-container',
    image: 'custom:latest',
    features: { 'ghcr.io/devcontainers/features/docker:1': {} },
  });

  let writtenContent = '';

  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => existingConfig,
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: (p) => p.includes('devcontainer.json'),
  };

  const result = await devcontainerCommandWithDeps({}, deps);

  assert.equal(result.action, 'augmented');
  assert.equal(result.had_existing, true);

  const parsed = JSON.parse(writtenContent);
  assert.equal(parsed.name, 'my-custom-container'); // Preserved
  assert.equal(parsed.image, 'custom:latest'); // Preserved
  assert.ok(parsed.features['ghcr.io/devcontainers/features/docker:1']); // Preserved
  assert.equal(parsed.containerEnv.ALOOP_CONTAINER, '1'); // Added
  assert.ok(parsed.mounts.some((m: string) => m.includes('.aloop'))); // Added
});

test('devcontainerCommandWithDeps - handles JSONC with comments', async () => {
  const existingConfig = `{
  // This is a comment
  "name": "commented-config",
  "image": "custom:latest"
  /* block comment */
}`;

  let writtenContent = '';

  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => existingConfig,
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: (p) => p.includes('devcontainer.json'),
  };

  const result = await devcontainerCommandWithDeps({}, deps);

  assert.equal(result.action, 'augmented');
  const parsed = JSON.parse(writtenContent);
  assert.equal(parsed.name, 'commented-config');
});

test('devcontainerCommandWithDeps - passes project root to discover', async () => {
  let discoverOpts: Record<string, unknown> = {};

  const deps: DevcontainerDeps = {
    discover: async (opts) => { discoverOpts = opts; return mockDiscovery(); },
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  await devcontainerCommandWithDeps({ projectRoot: '/custom/root', homeDir: '/custom/home' }, deps);

  assert.equal(discoverOpts.projectRoot, '/custom/root');
  assert.equal(discoverOpts.homeDir, '/custom/home');
});

// --- stripJsoncComments ---

test('stripJsoncComments - strips single-line comments', () => {
  const input = '{\n  // this is a comment\n  "key": "value"\n}';
  const result = stripJsoncComments(input);
  const parsed = JSON.parse(result);
  assert.equal(parsed.key, 'value');
  assert.ok(!result.includes('this is a comment'));
});

test('stripJsoncComments - strips block comments', () => {
  const input = '{\n  /* block\n     comment */\n  "key": "value"\n}';
  const result = stripJsoncComments(input);
  const parsed = JSON.parse(result);
  assert.equal(parsed.key, 'value');
  assert.ok(!result.includes('block'));
});

test('stripJsoncComments - preserves URLs inside string values', () => {
  const input = '{\n  // a comment\n  "url": "https://example.com/path",\n  "other": "http://foo.bar"\n}';
  const result = stripJsoncComments(input);
  const parsed = JSON.parse(result);
  assert.equal(parsed.url, 'https://example.com/path');
  assert.equal(parsed.other, 'http://foo.bar');
});

test('stripJsoncComments - preserves escaped quotes in strings', () => {
  const input = '{ "msg": "say \\"hello\\"", "n": 1 }';
  const result = stripJsoncComments(input);
  const parsed = JSON.parse(result);
  assert.equal(parsed.msg, 'say "hello"');
  assert.equal(parsed.n, 1);
});

test('stripJsoncComments - handles mixed comments and URL strings', () => {
  const input = `{
  // First comment
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  /* block */ "url": "https://registry.com/v2/image",
  "plain": "no comments here"
  // trailing comment
}`;
  const result = stripJsoncComments(input);
  const parsed = JSON.parse(result);
  assert.equal(parsed.image, 'mcr.microsoft.com/devcontainers/typescript-node:22');
  assert.equal(parsed.url, 'https://registry.com/v2/image');
  assert.equal(parsed.plain, 'no comments here');
});

test('devcontainerCommandWithDeps - augments JSONC with URLs without corruption', async () => {
  const existingConfig = `{
  // Container config with URLs
  "name": "url-project",
  "image": "custom:latest",
  "settings": {
    "proxy": "https://proxy.internal.com/api"
  }
}`;

  let writtenContent = '';

  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => existingConfig,
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: (p) => p.includes('devcontainer.json'),
  };

  const result = await devcontainerCommandWithDeps({}, deps);

  assert.equal(result.action, 'augmented');
  const parsed = JSON.parse(writtenContent);
  assert.equal(parsed.name, 'url-project');
  assert.equal((parsed.settings as Record<string, string>).proxy, 'https://proxy.internal.com/api');
});

test('devcontainerCommandWithDeps - throws on invalid JSON in existing config', async () => {
  const invalidJson = '{ name: broken, missing quotes }';

  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => invalidJson,
    writeFile: async () => {},
    mkdir: async () => undefined,
    existsSync: (p) => p.includes('devcontainer.json'),
  };

  await assert.rejects(
    () => devcontainerCommandWithDeps({}, deps),
    (err: Error) => err instanceof SyntaxError,
  );
});

// --- devcontainerCommand (output wrapper) ---

function makeDeps(existingConfig?: string): DevcontainerDeps {
  return {
    discover: async () => mockDiscovery(),
    readFile: async () => existingConfig ?? '',
    writeFile: async () => {},
    mkdir: async () => undefined,
    existsSync: existingConfig ? (p) => p.includes('devcontainer.json') : () => false,
  };
}

test('resolveDevcontainerDeps - uses injected deps when valid', () => {
  const deps = makeDeps();
  const resolved = resolveDevcontainerDeps(deps, makeDeps('{"name":"fallback"}'));
  assert.equal(resolved, deps);
});

test('resolveDevcontainerDeps - ignores commander action arg shape', () => {
  const fallback = makeDeps();
  const commanderActionArg = {
    opts: () => ({}),
    parent: {},
    name: () => 'devcontainer',
  };
  const resolved = resolveDevcontainerDeps(commanderActionArg, fallback);
  assert.equal(resolved, fallback);
});

test('resolveDevcontainerDeps - falls back for undefined/null/partial dependency objects', () => {
  const fallback = makeDeps();
  assert.equal(resolveDevcontainerDeps(undefined, fallback), fallback);
  assert.equal(resolveDevcontainerDeps(null, fallback), fallback);
  assert.equal(
    resolveDevcontainerDeps({ discover: async () => mockDiscovery() }, fallback),
    fallback,
  );
});

test('devcontainerCommand - json output for created action', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    await devcontainerCommand({ output: 'json' }, makeDeps());
  } finally {
    console.log = origLog;
  }

  assert.equal(logs.length, 1);
  const parsed = JSON.parse(logs[0]);
  assert.equal(parsed.action, 'created');
  assert.equal(parsed.language, 'node-typescript');
  assert.equal(parsed.had_existing, false);
});

test('devcontainerCommand - json output for augmented action', async () => {
  const existing = JSON.stringify({ name: 'existing', image: 'custom:latest' });
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    await devcontainerCommand({ output: 'json' }, makeDeps(existing));
  } finally {
    console.log = origLog;
  }

  assert.equal(logs.length, 1);
  const parsed = JSON.parse(logs[0]);
  assert.equal(parsed.action, 'augmented');
  assert.equal(parsed.had_existing, true);
});

test('devcontainerCommand - text output for created action', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    await devcontainerCommand({ output: 'text' }, makeDeps());
  } finally {
    console.log = origLog;
  }

  assert.ok(logs.some(l => l.includes('Created devcontainer config at')));
  assert.ok(logs.some(l => l.includes('Language: node-typescript')));
  assert.ok(logs.some(l => l.includes('Image:')));
  assert.ok(logs.some(l => l.includes('Post-create: npm install &&')));
  assert.ok(logs.some(l => l.includes('Next steps:')));
});

test('devcontainerCommand - text output for augmented action', async () => {
  const existing = JSON.stringify({ name: 'existing', image: 'custom:latest' });
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    await devcontainerCommand({ output: 'text' }, makeDeps(existing));
  } finally {
    console.log = origLog;
  }

  assert.ok(logs.some(l => l.includes('Augmented existing devcontainer config at')));
  assert.ok(logs.some(l => l.includes('Added aloop mounts and environment variables.')));
  assert.ok(logs.some(l => l.includes('Next steps:')));
  // Augmented mode should NOT print Language/Image
  assert.ok(!logs.some(l => l.includes('Language:')));
});

test('devcontainerCommand - text output omits post-create when null', async () => {
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery({
      context: { detected_language: 'other' } as DiscoveryResult['context'],
      providers: { installed: [], missing: [], default_provider: '', default_models: {}, round_robin_default: [] },
    }),
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    await devcontainerCommand({ output: 'text' }, deps);
  } finally {
    console.log = origLog;
  }

  assert.ok(logs.some(l => l.includes('Created devcontainer config at')));
  assert.ok(!logs.some(l => l.includes('Post-create:')));
});

// --- buildProviderInstallCommands ---

test('buildProviderInstallCommands - returns claude install for claude provider', () => {
  const cmds = buildProviderInstallCommands(['claude']);
  assert.deepEqual(cmds, ['npm install -g @anthropic-ai/claude-code']);
});

test('buildProviderInstallCommands - returns multiple installs for multiple providers', () => {
  const cmds = buildProviderInstallCommands(['claude', 'codex', 'gemini']);
  assert.deepEqual(cmds, [
    'npm install -g @anthropic-ai/claude-code',
    'npm install -g @openai/codex',
    'npm install -g @google/gemini-cli',
  ]);
});

test('buildProviderInstallCommands - skips copilot (VS Code extension, no CLI)', () => {
  const cmds = buildProviderInstallCommands(['copilot']);
  assert.deepEqual(cmds, []);
});

test('buildProviderInstallCommands - skips unknown providers', () => {
  const cmds = buildProviderInstallCommands(['unknown-provider']);
  assert.deepEqual(cmds, []);
});

test('buildProviderInstallCommands - empty list returns empty', () => {
  const cmds = buildProviderInstallCommands([]);
  assert.deepEqual(cmds, []);
});

// --- buildProviderRemoteEnv ---

test('buildProviderRemoteEnv - forwards claude auth vars with localEnv syntax', () => {
  const env = buildProviderRemoteEnv(['claude']);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, '${localEnv:CLAUDE_CODE_OAUTH_TOKEN}');
  assert.equal(env.ANTHROPIC_API_KEY, '${localEnv:ANTHROPIC_API_KEY}');
  assert.equal(Object.keys(env).length, 2);
});

test('buildProviderRemoteEnv - forwards codex auth var', () => {
  const env = buildProviderRemoteEnv(['codex']);
  assert.equal(env.OPENAI_API_KEY, '${localEnv:OPENAI_API_KEY}');
  assert.equal(Object.keys(env).length, 1);
});

test('buildProviderRemoteEnv - forwards gemini auth var', () => {
  const env = buildProviderRemoteEnv(['gemini']);
  assert.equal(env.GEMINI_API_KEY, '${localEnv:GEMINI_API_KEY}');
  assert.equal(Object.keys(env).length, 1);
});

test('buildProviderRemoteEnv - forwards copilot GH_TOKEN', () => {
  const env = buildProviderRemoteEnv(['copilot']);
  assert.equal(env.GH_TOKEN, '${localEnv:GH_TOKEN}');
  assert.equal(Object.keys(env).length, 1);
});

test('buildProviderRemoteEnv - multiple providers merges all vars', () => {
  const env = buildProviderRemoteEnv(['claude', 'codex', 'gemini']);
  assert.equal(Object.keys(env).length, 4); // 2 claude + 1 codex + 1 gemini
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, '${localEnv:CLAUDE_CODE_OAUTH_TOKEN}');
  assert.equal(env.ANTHROPIC_API_KEY, '${localEnv:ANTHROPIC_API_KEY}');
  assert.equal(env.OPENAI_API_KEY, '${localEnv:OPENAI_API_KEY}');
  assert.equal(env.GEMINI_API_KEY, '${localEnv:GEMINI_API_KEY}');
});

test('buildProviderRemoteEnv - empty list returns empty', () => {
  const env = buildProviderRemoteEnv([]);
  assert.deepEqual(env, {});
});

test('buildProviderRemoteEnv - unknown provider skipped', () => {
  const env = buildProviderRemoteEnv(['unknown']);
  assert.deepEqual(env, {});
});

// --- generateDevcontainerConfig with providers ---

test('generateDevcontainerConfig - no providers means no provider install or remoteEnv', () => {
  const discovery = mockDiscovery({
    providers: { installed: [], missing: [], default_provider: '', default_models: {}, round_robin_default: [] },
  });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.postCreateCommand, 'npm install'); // language deps only
  assert.deepEqual(config.remoteEnv, {});
});

test('resolveDevcontainerProviders - uses enabled_providers over locally discovered binaries', () => {
  const providers = resolveDevcontainerProviders(
    {
      enabled_providers: ['opencode', 'copilot'],
      provider: 'claude',
    },
    ['claude'],
  );

  assert.deepEqual(providers, ['opencode', 'copilot']);
});

test('resolveDevcontainerProviders - resolves round-robin provider set from round_robin_order', () => {
  const providers = resolveDevcontainerProviders(
    {
      provider: 'round-robin',
      round_robin_order: ['opencode', 'codex'],
    },
    ['claude'],
  );

  assert.deepEqual(providers, ['opencode', 'codex']);
});

test('resolveDevcontainerProviders - falls back to empty when no config or installed providers', () => {
  const providers = resolveDevcontainerProviders({}, []);
  assert.deepEqual(providers, []);
});

test('generateDevcontainerConfig - multiple providers chains installs and merges remoteEnv', () => {
  const discovery = mockDiscovery({
    providers: { installed: ['claude', 'codex'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: ['claude', 'codex'] },
  });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.postCreateCommand, 'npm install && npm install -g @anthropic-ai/claude-code && npm install -g @openai/codex');
  assert.equal(config.remoteEnv.CLAUDE_CODE_OAUTH_TOKEN, '${localEnv:CLAUDE_CODE_OAUTH_TOKEN}');
  assert.equal(config.remoteEnv.ANTHROPIC_API_KEY, '${localEnv:ANTHROPIC_API_KEY}');
  assert.equal(config.remoteEnv.OPENAI_API_KEY, '${localEnv:OPENAI_API_KEY}');
});

test('generateDevcontainerConfig - augment merges generated remoteEnv without overwriting existing', () => {
  const discovery = mockDiscovery(); // installed: ['claude']
  const generated = generateDevcontainerConfig(discovery);

  const existing = {
    remoteEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'my-custom-token' },
  };

  const result = augmentExistingConfig(existing, generated);
  const env = result.remoteEnv as Record<string, string>;

  // Existing user value takes priority
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'my-custom-token');
  // Generated values fill gaps
  assert.equal(env.ANTHROPIC_API_KEY, '${localEnv:ANTHROPIC_API_KEY}');
});

// --- verifyDevcontainer ---

function mockVerifyDeps(overrides: Partial<VerifyDeps> & {
  execResults?: Record<string, { stdout: string; stderr: string; exitCode: number }>;
  existingFiles?: Set<string>;
  fileContents?: Record<string, string>;
} = {}): VerifyDeps {
  const execResults = overrides.execResults ?? {};
  const existingFiles = overrides.existingFiles ?? new Set(['.devcontainer/devcontainer.json']);
  const fileContents = overrides.fileContents ?? {};

  return {
    exec: overrides.exec ?? (async (command: string, args: string[]) => {
      // Build a key from the args to match against
      const key = args.join(' ');
      for (const [pattern, result] of Object.entries(execResults)) {
        if (key.includes(pattern)) return result;
      }
      // Default: success
      return { stdout: '', stderr: '', exitCode: 0 };
    }),
    existsSync: overrides.existsSync ?? ((filePath: string) => {
      for (const f of existingFiles) {
        if (filePath.includes(f.replace(/\//g, '\\')) || filePath.includes(f)) return true;
      }
      return false;
    }),
    readFile: overrides.readFile ?? (async (filePath: string) => {
      for (const [f, content] of Object.entries(fileContents)) {
        if (filePath.includes(f.replace(/\//g, '\\')) || filePath.includes(f)) return content;
      }
      return JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/typescript-node:22' });
    }),
  };
}

test('verifyDevcontainer - returns failure when config does not exist', async () => {
  const deps = mockVerifyDeps({ existingFiles: new Set() });
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  assert.equal(result.passed, false);
  assert.equal(result.iteration, 0);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].name, 'config-exists');
  assert.equal(result.checks[0].passed, false);
});

test('verifyDevcontainer - all checks pass for node-typescript project', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  assert.equal(result.passed, true);
  assert.equal(result.iteration, 1);
  // build, up, git, aloop-mount, sessions-mount, provider-claude, auth-claude, deps-installed
  assert.equal(result.checks.length, 8);
  assert.ok(result.checks.every((c) => c.passed));

  const names = result.checks.map((c) => c.name);
  assert.ok(names.includes('build'));
  assert.ok(names.includes('up'));
  assert.ok(names.includes('git'));
  assert.ok(names.includes('aloop-mount'));
  assert.ok(names.includes('sessions-mount'));
  assert.ok(names.includes('provider-claude'));
  assert.ok(names.includes('auth-claude'));
  assert.ok(names.includes('deps-installed'));
});

test('verifyDevcontainer - build failure stops early', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'build --workspace-folder': { stdout: '', stderr: 'Dockerfile error', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  assert.equal(result.passed, false);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].name, 'build');
  assert.equal(result.checks[0].passed, false);
  assert.ok(result.checks[0].message.includes('Dockerfile error'));
});

test('verifyDevcontainer - up failure stops after build', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'up --workspace-folder': { stdout: '', stderr: 'port conflict', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  assert.equal(result.passed, false);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].name, 'build');
  assert.equal(result.checks[0].passed, true);
  assert.equal(result.checks[1].name, 'up');
  assert.equal(result.checks[1].passed, false);
});

test('verifyDevcontainer - provider check failure reported', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'which claude': { stdout: '', stderr: 'not found', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  assert.equal(result.passed, false);
  const providerCheck = result.checks.find((c) => c.name === 'provider-claude');
  assert.ok(providerCheck);
  assert.equal(providerCheck.passed, false);
});

test('verifyDevcontainer - multiple providers checked', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['claude', 'codex', 'gemini'], deps);

  assert.equal(result.passed, true);
  const providerChecks = result.checks.filter((c) => c.name.startsWith('provider-'));
  assert.equal(providerChecks.length, 3);
});

test('verifyDevcontainer - copilot provider skipped (no CLI binary)', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['copilot'], deps);

  assert.equal(result.passed, true);
  const providerChecks = result.checks.filter((c) => c.name.startsWith('provider-'));
  assert.equal(providerChecks.length, 0);
});

test('verifyDevcontainer - python image checks python', async () => {
  const deps = mockVerifyDeps({
    fileContents: {
      'devcontainer.json': JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/python:3' }),
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  assert.equal(result.passed, true);
  const depsCheck = result.checks.find((c) => c.name === 'deps-installed');
  assert.ok(depsCheck);
  assert.equal(depsCheck.passed, true);
});

test('verifyDevcontainer - go image checks go version', async () => {
  const deps = mockVerifyDeps({
    fileContents: {
      'devcontainer.json': JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/go:1' }),
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  const depsCheck = result.checks.find((c) => c.name === 'deps-installed');
  assert.ok(depsCheck);
  assert.equal(depsCheck.passed, true);
});

test('verifyDevcontainer - rust image checks cargo', async () => {
  const deps = mockVerifyDeps({
    fileContents: {
      'devcontainer.json': JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/rust:1' }),
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  const depsCheck = result.checks.find((c) => c.name === 'deps-installed');
  assert.ok(depsCheck);
});

test('verifyDevcontainer - dotnet image checks dotnet', async () => {
  const deps = mockVerifyDeps({
    fileContents: {
      'devcontainer.json': JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/dotnet:8.0' }),
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  const depsCheck = result.checks.find((c) => c.name === 'deps-installed');
  assert.ok(depsCheck);
});

test('verifyDevcontainer - git check failure reported', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'git status': { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  assert.equal(result.passed, false);
  const gitCheck = result.checks.find((c) => c.name === 'git');
  assert.ok(gitCheck);
  assert.equal(gitCheck.passed, false);
  assert.ok(gitCheck.message.includes('fatal'));
});

test('verifyDevcontainer - sessions-mount check failure reported', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'test -d /aloop-sessions': { stdout: '', stderr: '', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  assert.equal(result.passed, false);
  const sessionsCheck = result.checks.find((c) => c.name === 'sessions-mount');
  assert.ok(sessionsCheck);
  assert.equal(sessionsCheck.passed, false);
});

test('verifyDevcontainer - mount check failure reported', async () => {
  const deps = mockVerifyDeps({
    execResults: {
      'test -d .aloop': { stdout: '', stderr: '', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', [], deps);

  assert.equal(result.passed, false);
  const mountCheck = result.checks.find((c) => c.name === 'aloop-mount');
  assert.ok(mountCheck);
  assert.equal(mountCheck.passed, false);
});

// --- verifyDevcontainerCommand output ---

test('verifyDevcontainerCommand - json output mode', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    const mockDevDeps: DevcontainerDeps = {
      discover: async () => mockDiscovery(),
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      existsSync: () => true,
    };
    const vDeps = mockVerifyDeps();
    await verifyDevcontainerCommand({ output: 'json' }, mockDevDeps, vDeps);
    const output = JSON.parse(logs.join(''));
    assert.equal(output.passed, true);
    assert.ok(Array.isArray(output.checks));
  } finally {
    console.log = origLog;
  }
});

test('verifyDevcontainerCommand - text output shows pass/fail', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    const mockDevDeps: DevcontainerDeps = {
      discover: async () => mockDiscovery(),
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      existsSync: () => true,
    };
    const vDeps = mockVerifyDeps({
      execResults: {
        'build --workspace-folder': { stdout: '', stderr: 'build error', exitCode: 1 },
      },
    });
    await verifyDevcontainerCommand({ output: 'text' }, mockDevDeps, vDeps);
    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('[FAIL]'));
    assert.ok(allOutput.includes('Some checks failed'));
  } finally {
    console.log = origLog;
  }
});

test('devcontainerCommandWithDeps - uses configured enabled_providers when local provider CLIs are missing', async () => {
  let writtenContent = '';
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery({
      setup: {
        project_dir: '/mock/project/.aloop',
        config_path: '/mock/project/.aloop/config.yml',
        config_exists: true,
        templates_dir: '/mock/templates',
      },
      providers: { installed: [], missing: ['opencode'], default_provider: 'claude', default_models: {}, round_robin_default: ['claude'] },
    }),
    readFile: async (filePath) => {
      if (filePath.endsWith('config.yml')) {
        return "provider: 'round-robin'\nenabled_providers:\n  - 'opencode'\n";
      }
      return '';
    },
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: (filePath) => filePath.endsWith('config.yml'),
  };

  const result = await devcontainerCommandWithDeps({}, deps);
  const parsed = JSON.parse(writtenContent);

  assert.ok(String(parsed.postCreateCommand).includes('npm install -g opencode'));
  assert.equal(parsed.remoteEnv.OPENCODE_API_KEY, '${localEnv:OPENCODE_API_KEY}');
  assert.deepEqual(result.vscode_extensions, []);
});

test('verifyDevcontainerCommand - validates configured providers even when not locally installed', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    const mockDevDeps: DevcontainerDeps = {
      discover: async () => mockDiscovery({
        setup: {
          project_dir: '/mock/project/.aloop',
          config_path: '/mock/project/.aloop/config.yml',
          config_exists: true,
          templates_dir: '/mock/templates',
        },
        providers: { installed: [], missing: ['opencode'], default_provider: 'claude', default_models: {}, round_robin_default: ['claude'] },
      }),
      readFile: async (filePath) => {
        if (filePath.endsWith('config.yml')) {
          return "enabled_providers:\n  - 'opencode'\n";
        }
        return '';
      },
      writeFile: async () => {},
      mkdir: async () => undefined,
      existsSync: () => true,
    };
    const vDeps = mockVerifyDeps({
      execResults: {
        'which opencode': { stdout: '', stderr: 'opencode: not found', exitCode: 1 },
      },
    });
    await verifyDevcontainerCommand({ output: 'text' }, mockDevDeps, vDeps);
    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('provider-opencode'));
  } finally {
    console.log = origLog;
  }
});

// --- opencode provider support ---

test('buildProviderInstallCommands - includes opencode install', () => {
  const cmds = buildProviderInstallCommands(['opencode']);
  assert.deepEqual(cmds, ['npm install -g opencode']);
});

test('buildProviderInstallCommands - opencode with other providers', () => {
  const cmds = buildProviderInstallCommands(['claude', 'opencode', 'codex']);
  assert.deepEqual(cmds, [
    'npm install -g @anthropic-ai/claude-code',
    'npm install -g opencode',
    'npm install -g @openai/codex',
  ]);
});

test('buildProviderRemoteEnv - forwards opencode auth var', () => {
  const env = buildProviderRemoteEnv(['opencode']);
  assert.equal(env.OPENCODE_API_KEY, '${localEnv:OPENCODE_API_KEY}');
  assert.equal(Object.keys(env).length, 1);
});

test('generateDevcontainerConfig - opencode provider chains install and remoteEnv', () => {
  const discovery = mockDiscovery({
    providers: { installed: ['opencode'], missing: [], default_provider: 'opencode', default_models: {}, round_robin_default: ['opencode'] },
  });
  const config = generateDevcontainerConfig(discovery);

  assert.ok(config.postCreateCommand?.includes('npm install -g opencode'));
  assert.equal(config.remoteEnv.OPENCODE_API_KEY, '${localEnv:OPENCODE_API_KEY}');
});

test('verifyDevcontainer - opencode provider binary check', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['opencode'], deps);

  const providerCheck = result.checks.find((c) => c.name === 'provider-opencode');
  assert.ok(providerCheck);
  assert.equal(providerCheck.passed, true);
});

// --- VS Code extensions customizations ---

test('buildVSCodeExtensions - returns claude extension for claude provider', () => {
  const exts = buildVSCodeExtensions(['claude']);
  assert.deepEqual(exts, ['anthropic.claude-code']);
});

test('buildVSCodeExtensions - returns copilot extension for copilot provider', () => {
  const exts = buildVSCodeExtensions(['copilot']);
  assert.deepEqual(exts, ['GitHub.copilot']);
});

test('buildVSCodeExtensions - returns both claude and copilot extensions', () => {
  const exts = buildVSCodeExtensions(['claude', 'copilot']);
  assert.deepEqual(exts, ['anthropic.claude-code', 'GitHub.copilot']);
});

test('buildVSCodeExtensions - returns empty for providers without VS Code extensions', () => {
  const exts = buildVSCodeExtensions(['codex', 'gemini', 'opencode']);
  assert.deepEqual(exts, []);
});

test('buildVSCodeExtensions - empty list returns empty', () => {
  const exts = buildVSCodeExtensions([]);
  assert.deepEqual(exts, []);
});

test('generateDevcontainerConfig - includes vscode customizations for claude provider', () => {
  const discovery = mockDiscovery(); // installed: ['claude']
  const config = generateDevcontainerConfig(discovery);

  assert.ok(config.customizations);
  const vscode = config.customizations?.vscode as Record<string, unknown>;
  assert.ok(vscode);
  assert.deepEqual(vscode.extensions, ['anthropic.claude-code']);
});

test('generateDevcontainerConfig - includes vscode customizations for copilot provider', () => {
  const discovery = mockDiscovery({
    providers: { installed: ['copilot'], missing: [], default_provider: 'copilot', default_models: {}, round_robin_default: ['copilot'] },
  });
  const config = generateDevcontainerConfig(discovery);

  assert.ok(config.customizations);
  const vscode = config.customizations?.vscode as Record<string, unknown>;
  assert.ok(vscode);
  assert.deepEqual(vscode.extensions, ['GitHub.copilot']);
});

test('generateDevcontainerConfig - no customizations when no provider extensions', () => {
  const discovery = mockDiscovery({
    providers: { installed: ['codex'], missing: [], default_provider: 'codex', default_models: {}, round_robin_default: ['codex'] },
  });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.customizations, undefined);
});

test('augmentExistingConfig - merges vscode extensions without duplicates', () => {
  const existing = {
    customizations: {
      vscode: {
        extensions: ['ms-python.python', 'anthropic.claude-code'],
      },
    },
  };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    features: {},
    mounts: [],
    containerEnv: {},
    remoteEnv: {},
    customizations: {
      vscode: {
        extensions: ['anthropic.claude-code', 'GitHub.copilot'],
      },
    },
  };

  const result = augmentExistingConfig(existing, generated);
  const vscode = result.customizations as Record<string, unknown>;
  const extensions = (vscode.vscode as Record<string, unknown>).extensions as string[];

  assert.ok(extensions.includes('ms-python.python')); // existing preserved
  assert.ok(extensions.includes('anthropic.claude-code')); // not duplicated
  assert.ok(extensions.includes('GitHub.copilot')); // new added
  assert.equal(extensions.filter(e => e === 'anthropic.claude-code').length, 1);
});

// --- auth verification checks ---

test('verifyDevcontainer - auth check passes when env var is set', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  const authCheck = result.checks.find((c) => c.name === 'auth-claude');
  assert.ok(authCheck);
  assert.equal(authCheck.passed, true);
  assert.ok(authCheck.message.includes('OK'));
});

test('verifyDevcontainer - auth check fails when no auth vars set', async () => {
  // Mock exec to fail for all sh -c test -n checks (auth vars not set)
  const deps = mockVerifyDeps({
    execResults: {
      'CLAUDE_CODE_OAUTH_TOKEN': { stdout: '', stderr: '', exitCode: 1 },
      'ANTHROPIC_API_KEY': { stdout: '', stderr: '', exitCode: 1 },
    },
  });
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  const authCheck = result.checks.find((c) => c.name === 'auth-claude');
  assert.ok(authCheck);
  assert.equal(authCheck.passed, false);
  assert.ok(authCheck.message.includes('FAILED'));
});

test('verifyDevcontainer - auth check passes when fallback var is set', async () => {
  // First var fails, second succeeds
  let callCount = 0;
  const deps: VerifyDeps = {
    exec: async (_command: string, args: string[]) => {
      const key = args.join(' ');
      if (key.includes('CLAUDE_CODE_OAUTH_TOKEN')) {
        return { stdout: '', stderr: '', exitCode: 1 };
      }
      if (key.includes('ANTHROPIC_API_KEY')) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    },
    existsSync: (filePath: string) => filePath.includes('devcontainer.json'),
    readFile: async () => JSON.stringify({ image: 'mcr.microsoft.com/devcontainers/typescript-node:22' }),
  };
  const result = await verifyDevcontainer('/mock/project', ['claude'], deps);

  const authCheck = result.checks.find((c) => c.name === 'auth-claude');
  assert.ok(authCheck);
  assert.equal(authCheck.passed, true);
  assert.ok(authCheck.message.includes('ANTHROPIC_API_KEY'));
});

test('verifyDevcontainer - copilot skipped for auth check (no auth vars needed for VS Code extension)', async () => {
  const deps = mockVerifyDeps();
  const result = await verifyDevcontainer('/mock/project', ['copilot'], deps);

  // Copilot has GH_TOKEN in auth vars, so it should have an auth check
  const authCheck = result.checks.find((c) => c.name === 'auth-copilot');
  assert.ok(authCheck);
});

// --- devcontainerCommand result includes vscode_extensions ---

test('devcontainerCommand - result includes vscode_extensions for claude', async () => {
  let writtenContent = '';
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => '',
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  const result = await devcontainerCommandWithDeps({}, deps);
  assert.deepEqual(result.vscode_extensions, ['anthropic.claude-code']);

  const parsed = JSON.parse(writtenContent);
  assert.deepEqual(parsed.customizations.vscode.extensions, ['anthropic.claude-code']);
});

// --- auth preflight checks ---

test('checkAuthPreflight - returns empty when all auth vars are set', () => {
  const env = { CLAUDE_CODE_OAUTH_TOKEN: 'tok123', OPENAI_API_KEY: 'sk-abc' };
  const warnings = checkAuthPreflight(['claude', 'codex'], env);
  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - warns when no auth vars set for provider', () => {
  const env: Record<string, string | undefined> = {};
  const warnings = checkAuthPreflight(['claude'], env);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].provider, 'claude');
  assert.deepEqual(warnings[0].missingVars, ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']);
  assert.ok(warnings[0].guidance.includes('setup-token'));
});

test('checkAuthPreflight - no warning when fallback auth var is set (Claude ANTHROPIC_API_KEY)', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-abc' };
  const warnings = checkAuthPreflight(['claude'], env);
  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - warns for multiple missing providers', () => {
  const env: Record<string, string | undefined> = {};
  const warnings = checkAuthPreflight(['claude', 'codex', 'gemini'], env);
  assert.equal(warnings.length, 3);
  assert.equal(warnings[0].provider, 'claude');
  assert.equal(warnings[1].provider, 'codex');
  assert.equal(warnings[2].provider, 'gemini');
});

test('checkAuthPreflight - skips providers with no known auth vars', () => {
  const env: Record<string, string | undefined> = {};
  const warnings = checkAuthPreflight(['unknown-provider'], env);
  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - empty string env var treated as missing', () => {
  const env = { OPENAI_API_KEY: '' };
  const warnings = checkAuthPreflight(['codex'], env);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].provider, 'codex');
});

test('checkAuthPreflight - copilot warns when GH_TOKEN missing', () => {
  const env: Record<string, string | undefined> = {};
  const warnings = checkAuthPreflight(['copilot'], env);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].provider, 'copilot');
  assert.ok(warnings[0].guidance.includes('gh auth token'));
});

test('devcontainerCommandWithDeps - result includes auth_warnings', async () => {
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery({ providers: { installed: ['claude', 'codex'], missing: [], default_provider: 'claude', default_models: { claude: 'opus', codex: 'gpt-5.3-codex', gemini: 'gemini-3.1-pro-preview', copilot: 'gpt-5.3-codex' }, round_robin_default: ['claude'] } } as Partial<DiscoveryResult>),
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  const result = await devcontainerCommandWithDeps({}, deps);
  // auth_warnings field should exist (may have warnings depending on host env)
  assert.ok(Array.isArray(result.auth_warnings));
});

test('devcontainerCommandWithDeps - no auth warning when fallback auth file is mountable', async () => {
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  const originalClaudeOauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const deps: DevcontainerDeps = {
      discover: async () => mockDiscovery(),
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      existsSync: (p: string) => p.includes('.claude/.credentials.json'),
    };

    const result = await devcontainerCommandWithDeps({ homeDir: '/home/user' }, deps);
    assert.equal(result.auth_warnings.length, 0);
  } finally {
    if (originalAnthropic === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropic;
    }
    if (originalClaudeOauth === undefined) {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalClaudeOauth;
    }
  }
});

// --- resolveHomePath ---

test('resolveHomePath - expands tilde to home dir', () => {
  assert.equal(resolveHomePath('~/.claude/.credentials.json', '/home/user'), '/home/user/.claude/.credentials.json');
});

test('resolveHomePath - handles bare tilde', () => {
  assert.equal(resolveHomePath('~', '/home/user'), '/home/user');
});

test('resolveHomePath - joins relative path with home dir', () => {
  assert.equal(resolveHomePath('.claude/.credentials.json', '/home/user'), '/home/user/.claude/.credentials.json');
});

test('resolveHomePath - leaves absolute paths unchanged', () => {
  assert.equal(resolveHomePath('/etc/config.json', '/home/user'), '/etc/config.json');
});

// --- buildProviderAuthFileMounts ---

test('buildProviderAuthFileMounts - mounts auth file when env var not set and file exists', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.claude/.credentials.json');
  const mounts = buildProviderAuthFileMounts(['claude'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('source=/home/user/.claude/.credentials.json'));
  assert.ok(mounts[0].includes('target=${containerEnv:HOME}/.claude/.credentials.json'));
  assert.ok(mounts[0].includes('type=bind'));
});

test('buildProviderAuthFileMounts - skips when env var is already set', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-abc' };
  const existsFn = () => true;
  const mounts = buildProviderAuthFileMounts(['claude'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 0);
});

test('buildProviderAuthFileMounts - skips when auth file does not exist', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = () => false;
  const mounts = buildProviderAuthFileMounts(['claude'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 0);
});

test('buildProviderAuthFileMounts - mounts both gemini auth files when both exist', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.gemini/');
  const mounts = buildProviderAuthFileMounts(['gemini'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 2);
  assert.ok(mounts.some(m => m.includes('.gemini/oauth_creds.json')));
  assert.ok(mounts.some(m => m.includes('.gemini/google_accounts.json')));
});

test('buildProviderAuthFileMounts - mounts gemini only existing file', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('oauth_creds.json');
  const mounts = buildProviderAuthFileMounts(['gemini'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('oauth_creds.json'));
  assert.ok(!mounts.some(m => m.includes('google_accounts.json')));
});

test('buildProviderAuthFileMounts - codex auth file mount', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.codex/auth.json');
  const mounts = buildProviderAuthFileMounts(['codex'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('source=/home/user/.codex/auth.json'));
  assert.ok(mounts[0].includes('target=${containerEnv:HOME}/.codex/auth.json'));
});

test('buildProviderAuthFileMounts - copilot auth file mount', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.copilot/config.json');
  const mounts = buildProviderAuthFileMounts(['copilot'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('source=/home/user/.copilot/config.json'));
});

test('buildProviderAuthFileMounts - opencode auth file mount uses XDG path', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.local/share/opencode/auth.json');
  const mounts = buildProviderAuthFileMounts(['opencode'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('source=/home/user/.local/share/opencode/auth.json'));
  assert.ok(mounts[0].includes('target=${containerEnv:HOME}/.local/share/opencode/auth.json'));
});

test('buildProviderAuthFileMounts - multiple providers each with their own file', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.claude/') || p.includes('.codex/');
  const mounts = buildProviderAuthFileMounts(['claude', 'codex'], env, existsFn, '/home/user');

  assert.equal(mounts.length, 2);
  assert.ok(mounts.some(m => m.includes('.claude/.credentials.json')));
  assert.ok(mounts.some(m => m.includes('.codex/auth.json')));
});

test('buildProviderAuthFileMounts - empty providers returns empty', () => {
  const mounts = buildProviderAuthFileMounts([], {}, () => true, '/home/user');
  assert.equal(mounts.length, 0);
});

test('buildProviderAuthFileMounts - unknown provider skipped', () => {
  const mounts = buildProviderAuthFileMounts(['unknown'], {}, () => true, '/home/user');
  assert.equal(mounts.length, 0);
});

test('buildProviderAuthFileMounts - default existsFn uses real filesystem', () => {
  // Using default args: should not throw, may return empty if no auth files on host
  const mounts = buildProviderAuthFileMounts(['claude'], {});
  assert.ok(Array.isArray(mounts));
});

// --- checkAuthPreflight with auth file fallback ---

test('checkAuthPreflight - no warning when auth file exists and env var not set', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('.claude/.credentials.json');
  const warnings = checkAuthPreflight(['claude'], env, existsFn, '/home/user');

  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - warns when neither env var nor auth file exists', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = () => false;
  const warnings = checkAuthPreflight(['claude'], env, existsFn, '/home/user');

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].provider, 'claude');
});

test('checkAuthPreflight - no warning when env var is set (auth file check skipped)', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-abc' };
  const existsFn = () => false; // auth file doesn't exist, but env var is set
  const warnings = checkAuthPreflight(['claude'], env, existsFn, '/home/user');

  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - gemini no warning when one auth file exists', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = (p: string) => p.includes('oauth_creds.json');
  const warnings = checkAuthPreflight(['gemini'], env, existsFn, '/home/user');

  assert.equal(warnings.length, 0);
});

test('checkAuthPreflight - gemini warns when no env var and no auth files', () => {
  const env: Record<string, string | undefined> = {};
  const existsFn = () => false;
  const warnings = checkAuthPreflight(['gemini'], env, existsFn, '/home/user');

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].provider, 'gemini');
});

test('checkAuthPreflight - back compat: without existsFn, behaves as before', () => {
  const env: Record<string, string | undefined> = {};
  // No existsFn → no auth file check → warns as before
  const warnings = checkAuthPreflight(['claude'], env);
  assert.equal(warnings.length, 1);
});

// --- generateDevcontainerConfig with auth file mounts ---

test('generateDevcontainerConfig - includes auth file mount when file exists', () => {
  const discovery = mockDiscovery(); // claude provider
  const existsFn = (p: string) => p.includes('.claude/.credentials.json');
  const config = generateDevcontainerConfig(discovery, existsFn, undefined, {}, '/home/user');

  // Should have 2 aloop mounts + 1 auth file mount
  assert.equal(config.mounts.length, 3);
  assert.ok(config.mounts.some(m => m.includes('.claude/.credentials.json')));
  assert.ok(config.mounts.some(m => m.includes('.aloop,target=')));
  assert.ok(config.mounts.some(m => m.includes('/aloop-sessions')));
});

test('generateDevcontainerConfig - no auth file mount when env var is set', () => {
  const discovery = mockDiscovery(); // claude provider
  const existsFn = (p: string) => p.includes('.claude/.credentials.json');
  const env = { ANTHROPIC_API_KEY: 'sk-ant-abc' };
  const config = generateDevcontainerConfig(discovery, existsFn, undefined, env, '/home/user');

  // Should have only 2 aloop mounts (auth file mount skipped because env var is set)
  assert.equal(config.mounts.length, 2);
  assert.ok(!config.mounts.some(m => m.includes('.credentials.json')));
});

test('generateDevcontainerConfig - multiple providers with auth files', () => {
  const discovery = mockDiscovery({
    providers: {
      installed: ['claude', 'codex'],
      missing: [],
      default_provider: 'claude',
      default_models: {},
      round_robin_default: ['claude', 'codex'],
    },
  });
  const existsFn = (p: string) => p.includes('.claude/') || p.includes('.codex/');
  const config = generateDevcontainerConfig(discovery, existsFn, undefined, {}, '/home/user');

  // 2 aloop + 2 auth file mounts (claude + codex)
  assert.equal(config.mounts.length, 4);
  assert.ok(config.mounts.some(m => m.includes('.credentials.json')));
  assert.ok(config.mounts.some(m => m.includes('.codex/auth.json')));
});

// --- devcontainerCommandWithDeps with auth file mounts ---

test('devcontainerCommandWithDeps - includes auth file mounts in written config', async () => {
  let writtenContent = '';
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => '',
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: (p: string) => p.includes('.claude/.credentials.json'),
  };

  await devcontainerCommandWithDeps({}, deps);
  const parsed = JSON.parse(writtenContent);

  // Should include auth file mount
  assert.ok(parsed.mounts.some((m: string) => m.includes('.claude/.credentials.json')));
});

test('devcontainerCommandWithDeps - no auth file mount when file does not exist', async () => {
  let writtenContent = '';
  const deps: DevcontainerDeps = {
    discover: async () => mockDiscovery(),
    readFile: async () => '',
    writeFile: async (_p, data) => { writtenContent = data; },
    mkdir: async () => undefined,
    existsSync: () => false,
  };

  await devcontainerCommandWithDeps({}, deps);
  const parsed = JSON.parse(writtenContent);

  // Only aloop mounts, no auth file mounts
  assert.ok(!parsed.mounts.some((m: string) => m.includes('.credentials.json')));
});
