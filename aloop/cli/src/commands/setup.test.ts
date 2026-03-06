import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCommandWithDeps, type PromptFunction } from './setup.js';
import type { DiscoveryResult, ScaffoldResult, ScaffoldOptions } from './project.js';

test('setupCommandWithDeps - non-interactive mode', async () => {
  let discoverCalled = false;
  let scaffoldCalledOpts: ScaffoldOptions | null = null;
  let promptCalled = false;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    discoverCalled = true;
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: ['npm run typecheck', 'npm test'] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async () => {
    promptCalled = true;
    return '';
  };

  const deps = {
    discover: mockDiscover,
    scaffold: mockScaffold,
    prompt: mockPrompt,
  };

  await setupCommandWithDeps({
    projectRoot: '/my/project',
    homeDir: '/my/home',
    nonInteractive: true,
    spec: 'MY_SPEC.md',
    providers: 'gemini,codex'
  }, deps);

  assert.equal(discoverCalled, true);
  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.projectRoot, '/my/project');
  assert.equal(scaffoldCalledOpts.homeDir, '/my/home');
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['MY_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini', 'codex']);
  assert.equal(promptCalled, false, 'Prompt should not be called in non-interactive mode');
});

test('setupCommandWithDeps - interactive mode', async () => {
  let discoverCalled = false;
  let scaffoldCalledOpts: ScaffoldOptions | null = null;
  let promptCallCount = 0;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    discoverCalled = true;
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: ['npm run typecheck', 'npm test'] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    promptCallCount++;
    if (question.includes('Spec File')) return 'CUSTOM_SPEC.md';
    if (question.includes('Enabled Providers')) return 'gemini';
    if (question.includes('Language')) return 'python';
    if (question.includes('Primary Provider')) return 'gemini';
    if (question.includes('Mode')) return 'custom-mode';
    if (question.includes('Validation')) return 'pytest, ruff check .';
    if (question.includes('Safety')) return 'No rm -rf, No dropping tables';
    return defaultValue;
  };

  const deps = {
    discover: mockDiscover,
    scaffold: mockScaffold,
    prompt: mockPrompt,
  };

  await setupCommandWithDeps({}, deps);

  assert.equal(discoverCalled, true);
  assert.equal(promptCallCount, 7, 'Should ask 7 questions');
  assert.ok(scaffoldCalledOpts);
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['CUSTOM_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini']);
  assert.equal(scaffoldCalledOpts.language, 'python');
  assert.equal(scaffoldCalledOpts.provider, 'gemini');
  assert.equal(scaffoldCalledOpts.mode, 'custom-mode');
  assert.deepEqual(scaffoldCalledOpts.validationCommands, ['pytest', 'ruff check .']);
  assert.deepEqual(scaffoldCalledOpts.safetyRules, ['No rm -rf', 'No dropping tables']);
});

test('setupCommandWithDeps - interactive mode uses defaults', async () => {
  let scaffoldCalledOpts: ScaffoldOptions | null = null;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'rust',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: ['cargo test'] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['codex'], missing: [], default_provider: 'codex', default_models: {}, round_robin_default: [] },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (_question: string, defaultValue: string) => {
    return defaultValue; // Return default value
  };

  const deps = {
    discover: mockDiscover,
    scaffold: mockScaffold,
    prompt: mockPrompt,
  };

  await setupCommandWithDeps({}, deps);

  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.language, 'rust');
  assert.equal(scaffoldCalledOpts.provider, 'codex');
  assert.equal(scaffoldCalledOpts.mode, 'plan-build-review');
  assert.deepEqual(scaffoldCalledOpts.validationCommands, ['cargo test']);
  assert.deepEqual(scaffoldCalledOpts.safetyRules, ['Never delete the project directory or run destructive commands', 'Never push to remote without explicit user approval']);
});
