import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCommandWithDeps, type PromptFunction } from './setup.js';
import type { DiscoveryResult, ScaffoldResult, ScaffoldOptions } from './project.js';

test('setupCommandWithDeps - non-interactive mode', async () => {
  let discoverCalled = false;
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
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
    providers: 'gemini,codex',
    autonomyLevel: 'autonomous',
  }, deps);

  assert.equal(discoverCalled, true);
  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.projectRoot, '/my/project');
  assert.equal(scaffoldCalledOpts.homeDir, '/my/home');
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['MY_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini', 'codex']);
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'autonomous');
  assert.equal(promptCalled, false, 'Prompt should not be called in non-interactive mode');
});

test('setupCommandWithDeps - interactive mode', async () => {
  let discoverCalled = false;
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
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
    if (question.includes('Autonomy Level')) return 'autonomous';
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
  assert.equal(promptCallCount, 8, 'Should ask 8 questions');
  assert.ok(scaffoldCalledOpts);
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['CUSTOM_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini']);
  assert.equal(scaffoldCalledOpts.language, 'python');
  assert.equal(scaffoldCalledOpts.provider, 'gemini');
  assert.equal(scaffoldCalledOpts.mode, 'custom-mode');
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'autonomous');
  assert.deepEqual(scaffoldCalledOpts.validationCommands, ['pytest', 'ruff check .']);
  assert.deepEqual(scaffoldCalledOpts.safetyRules, ['No rm -rf', 'No dropping tables']);
});

test('setupCommandWithDeps - interactive mode uses defaults', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

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
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'balanced');
  assert.deepEqual(scaffoldCalledOpts.validationCommands, ['cargo test']);
  assert.deepEqual(scaffoldCalledOpts.safetyRules, ['Never delete the project directory or run destructive commands', 'Never push to remote without explicit user approval']);
});

test('setupCommandWithDeps - propagates discover failure with exact error', async () => {
  const deps = {
    discover: async () => {
      throw new Error('discover failed: unable to inspect workspace');
    },
    scaffold: async (_opts: ScaffoldOptions): Promise<ScaffoldResult> => {
      return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
    },
    prompt: async (_question: string, defaultValue: string) => defaultValue,
  };

  await assert.rejects(
    setupCommandWithDeps({ nonInteractive: true }, deps),
    (error) => {
      assert.equal((error as Error).message, 'discover failed: unable to inspect workspace');
      return true;
    },
  );
});

test('setupCommandWithDeps - propagates scaffold failure with exact error', async () => {
  const mockDiscovery = {
    project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
    setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
    context: {
      detected_language: 'node-typescript',
      language_confidence: 'high',
      language_signals: [],
      validation_presets: { tests_only: [], tests_and_types: [], full: ['npm test'] },
      spec_candidates: ['SPEC.md'],
      reference_candidates: [],
      context_files: {},
    },
    providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
    discovered_at: '2023-01-01T00:00:00.000Z',
  } as unknown as DiscoveryResult;

  const deps = {
    discover: async (): Promise<DiscoveryResult> => mockDiscovery,
    scaffold: async (_opts: ScaffoldOptions): Promise<ScaffoldResult> => {
      throw new Error('scaffold failed: template write denied');
    },
    prompt: async (_question: string, defaultValue: string) => defaultValue,
  };

  await assert.rejects(
    setupCommandWithDeps({}, deps),
    (error) => {
      assert.equal((error as Error).message, 'scaffold failed: template write denied');
      return true;
    },
  );
});

test('setupCommandWithDeps - interactive prompt parsing trims and filters comma lists', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
  let providerPromptDefault = '';

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: ['npm test'] },
        spec_candidates: ['SPEC.md'],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude', 'codex'], missing: [], default_provider: 'copilot', default_models: {}, round_robin_default: [] },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Spec File')) return 'SPEC.custom.md';
    if (question.includes('Enabled Providers')) return '  , codex ,,  gemini  , ';
    if (question.includes('Language')) return 'typescript';
    if (question.includes('Primary Provider')) {
      providerPromptDefault = defaultValue;
      return defaultValue;
    }
    if (question.includes('Mode')) return 'plan-build-review';
    if (question.includes('Autonomy Level')) return 'cautious';
    if (question.includes('Validation')) return ' npm test , , npm run typecheck ,, ';
    if (question.includes('Safety')) return ' Rule 1 , , Rule 2 ,, ';
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.equal(providerPromptDefault, 'codex');
  assert.ok(scaffoldCalledOpts);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['codex', 'gemini']);
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'cautious');
  assert.deepEqual(scaffoldCalledOpts.validationCommands, ['npm test', 'npm run typecheck']);
  assert.deepEqual(scaffoldCalledOpts.safetyRules, ['Rule 1', 'Rule 2']);
});
