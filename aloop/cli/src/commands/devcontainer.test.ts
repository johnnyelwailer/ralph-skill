import test from 'node:test';
import assert from 'node:assert/strict';
import {
  devcontainerCommandWithDeps,
  generateDevcontainerConfig,
  augmentExistingConfig,
  stripJsoncComments,
  type DevcontainerDeps,
  type DevcontainerConfig,
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
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.name, 'mock-project-aloop');
  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/typescript-node:22');
  assert.deepEqual(config.features['ghcr.io/devcontainers/features/git:1'], {});
  assert.equal(config.containerEnv.ALOOP_CONTAINER, '1');
  assert.equal(config.containerEnv.ALOOP_NO_DASHBOARD, '1');
  assert.equal(config.mounts.length, 1);
  assert.equal(config.mounts[0], 'source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind');
});

test('generateDevcontainerConfig - python project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'python' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/python:3');
});

test('generateDevcontainerConfig - go project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'go' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/go:1');
  assert.equal(config.postCreateCommand, 'go mod download');
});

test('generateDevcontainerConfig - rust project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'rust' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/rust:1');
  assert.equal(config.postCreateCommand, 'cargo build');
});

test('generateDevcontainerConfig - dotnet project', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'dotnet' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/dotnet:8.0');
  assert.equal(config.postCreateCommand, 'dotnet restore');
});

test('generateDevcontainerConfig - unknown language uses base ubuntu', () => {
  const discovery = mockDiscovery({ context: { detected_language: 'other' } as DiscoveryResult['context'] });
  const config = generateDevcontainerConfig(discovery);

  assert.equal(config.image, 'mcr.microsoft.com/devcontainers/base:ubuntu');
  assert.deepEqual(config.features['ghcr.io/devcontainers/features/node:1'], {});
  assert.equal(config.postCreateCommand, undefined);
});

// --- augmentExistingConfig ---

test('augmentExistingConfig - adds mounts to empty existing', () => {
  const existing = { name: 'my-project', image: 'custom:latest' };
  const generated: DevcontainerConfig = {
    name: 'proj-aloop',
    image: 'mcr.microsoft.com/devcontainers/typescript-node:22',
    features: {},
    mounts: ['source=${localWorkspaceFolder}/.aloop,target=${containerWorkspaceFolder}/.aloop,type=bind'],
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
    ],
    containerEnv: { ALOOP_CONTAINER: '1' },
    remoteEnv: {},
  };

  const result = augmentExistingConfig(existing, generated);
  const mounts = result.mounts as string[];

  assert.equal(mounts.length, 2);
  assert.ok(mounts.includes('source=/host/data,target=/data,type=bind'));
  assert.ok(mounts.some(m => m.includes('.aloop')));
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
