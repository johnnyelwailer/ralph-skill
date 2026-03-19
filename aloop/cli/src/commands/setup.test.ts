import test from 'node:test';
import assert from 'node:assert/strict';
import { setupCommandWithDeps, getZdrWarnings, type PromptFunction } from './setup.js';
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
      devcontainer: { enabled: false, config_path: null },
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
    mode: 'loop',
    autonomyLevel: 'autonomous',
    dataPrivacy: 'private',
  }, deps);

  assert.equal(discoverCalled, true);
  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.projectRoot, '/my/project');
  assert.equal(scaffoldCalledOpts.homeDir, '/my/home');
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['MY_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini', 'codex']);
  assert.equal(scaffoldCalledOpts.mode, 'plan-build-review');
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'autonomous');
  assert.equal(scaffoldCalledOpts.dataPrivacy, 'private');
  assert.equal(promptCalled, false, 'Prompt should not be called in non-interactive mode');
});

test('setupCommandWithDeps - non-interactive mode accepts provider alias', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
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
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const deps = {
    discover: mockDiscover,
    scaffold: mockScaffold,
    prompt: async () => '',
  };

  await setupCommandWithDeps({
    nonInteractive: true,
    provider: 'claude',
  }, deps);

  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['claude']);
});

test('setupCommandWithDeps - non-interactive mode with single mode', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
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
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const deps = {
    discover: mockDiscover,
    scaffold: mockScaffold,
    prompt: async () => '',
  };

  await setupCommandWithDeps({
    nonInteractive: true,
    mode: 'single',
  }, deps);

  assert.equal(scaffoldCalledOpts.mode, 'plan-build-review');
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
      devcontainer: { enabled: false, config_path: null },
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
    if (question.includes('Data Privacy')) return 'public';
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
  assert.equal(promptCallCount, 10, 'Should ask 10 questions including confirmation');
  assert.ok(scaffoldCalledOpts);
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['CUSTOM_SPEC.md']);
  assert.deepEqual(scaffoldCalledOpts.enabledProviders, ['gemini']);
  assert.equal(scaffoldCalledOpts.language, 'python');
  assert.equal(scaffoldCalledOpts.provider, 'gemini');
  assert.equal(scaffoldCalledOpts.mode, 'custom-mode');
  assert.equal(scaffoldCalledOpts.autonomyLevel, 'autonomous');
  assert.equal(scaffoldCalledOpts.dataPrivacy, 'public');
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
      devcontainer: { enabled: false, config_path: null },
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
  assert.equal(scaffoldCalledOpts.dataPrivacy, 'private');
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
    devcontainer: { enabled: false, config_path: null },
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
      devcontainer: { enabled: false, config_path: null },
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

test('setupCommandWithDeps - interactive confirmation allows adjustment before scaffolding', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
  let specPromptCount = 0;

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
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  let confirmationCount = 0;
  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Spec File')) {
      specPromptCount += 1;
      return specPromptCount === 1 ? 'SPEC-draft.md' : 'SPEC-final.md';
    }
    if (question.includes('Setup Confirmation')) {
      confirmationCount += 1;
      return confirmationCount === 1 ? 'adjust' : 'confirm';
    }
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.ok(scaffoldCalledOpts);
  assert.deepEqual(scaffoldCalledOpts.specFiles, ['SPEC-final.md']);
});

test('setupCommandWithDeps - interactive confirmation cancel exits without scaffolding', async () => {
  let scaffoldCallCount = 0;

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
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (_opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCallCount += 1;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Setup Confirmation')) return 'cancel';
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.equal(scaffoldCallCount, 0);
});

test('setupCommandWithDeps - rejects invalid data privacy value', async () => {
  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const deps = {
    discover: mockDiscover,
    scaffold: async (): Promise<ScaffoldResult> => ({ config_path: '', prompts_dir: '', project_dir: '', project_hash: '' }),
    prompt: async (_q: string, d: string) => d,
  };

  await assert.rejects(
    setupCommandWithDeps({ nonInteractive: true, dataPrivacy: 'invalid' }, deps),
    (error) => {
      assert.match((error as Error).message, /Invalid data privacy/);
      return true;
    },
  );
});

test('setupCommandWithDeps - non-interactive mode with dataPrivacy=public', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  await setupCommandWithDeps({
    nonInteractive: true,
    dataPrivacy: 'public',
  }, { discover: mockDiscover, scaffold: mockScaffold, prompt: async () => '' });

  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.dataPrivacy, 'public');
});

test('setupCommandWithDeps - dataPrivacy defaults to private in non-interactive mode', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  await setupCommandWithDeps({
    nonInteractive: true,
  }, { discover: mockDiscover, scaffold: mockScaffold, prompt: async () => '' });

  assert.ok(scaffoldCalledOpts);
  // dataPrivacy is undefined when not specified; scaffoldWorkspace applies default 'private'
  assert.equal(scaffoldCalledOpts.dataPrivacy, undefined);
});

test('setupCommandWithDeps - rejects invalid setup mode in non-interactive mode', async () => {
  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  await assert.rejects(
    setupCommandWithDeps({
      nonInteractive: true,
      mode: 'invalid-mode',
    }, {
      discover: mockDiscover,
      scaffold: async (): Promise<ScaffoldResult> => ({ config_path: '', prompts_dir: '', project_dir: '', project_hash: '' }),
      prompt: async () => '',
    }),
    (error) => {
      assert.match((error as Error).message, /Invalid setup mode/);
      return true;
    },
  );
});

test('setupCommandWithDeps - non-interactive orchestrate mode is preserved', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  await setupCommandWithDeps({
    nonInteractive: true,
    mode: 'orchestrate',
  }, { discover: mockDiscover, scaffold: mockScaffold, prompt: async () => '' });

  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.mode, 'orchestrate');
});

test('setupCommandWithDeps - interactive mode uses mode recommendation as default', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
  let capturedModeDefault = '';

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
      spec_complexity: { workstream_count: 5, parallelism_score: 4, estimated_issue_count: 12, analyzed_files: 1 },
      ci_support: { has_workflows: true, workflow_count: 2, workflow_types: ['test', 'lint'] },
      mode_recommendation: {
        recommended_mode: 'orchestrate',
        reasoning: ['Recommendation: orchestrator mode (score: 6/7)', '5 distinct workstreams — parallelism would help'],
      },
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Mode')) {
      capturedModeDefault = defaultValue;
      return 'orchestrate';
    }
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.equal(capturedModeDefault, 'orchestrate', 'default mode should be orchestrate based on recommendation');
  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.mode, 'orchestrate');
});

test('setupCommandWithDeps - interactive mode defaults to loop when recommendation is loop', async () => {
  let capturedModeDefault = '';

  const mockDiscover = async (): Promise<DiscoveryResult> => {
    return {
      project: { root: '/mock/root', name: 'mock', hash: '123', is_git_repo: true, git_branch: 'main' },
      setup: { project_dir: '/mock/dir', config_path: '/mock/config', config_exists: false, templates_dir: '/mock/templates' },
      context: {
        detected_language: 'node-typescript',
        language_confidence: 'high',
        language_signals: [],
        validation_presets: { tests_only: [], tests_and_types: [], full: [] },
        spec_candidates: [],
        reference_candidates: [],
        context_files: {},
      },
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: false, config_path: null },
      discovered_at: '2023-01-01T00:00:00.000Z',
      spec_complexity: { workstream_count: 1, parallelism_score: 0, estimated_issue_count: 2, analyzed_files: 1 },
      ci_support: { has_workflows: false, workflow_count: 0, workflow_types: [] },
      mode_recommendation: {
        recommended_mode: 'loop',
        reasoning: ['Recommendation: loop mode (score: 1/7)', 'Single workstream — loop mode is sufficient'],
      },
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Mode')) {
      capturedModeDefault = defaultValue;
    }
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.equal(capturedModeDefault, 'plan-build-review', 'default mode should be plan-build-review when recommendation is loop');
});

test('getZdrWarnings - returns warnings for providers with org-level constraints', () => {
  const warnings = getZdrWarnings(['claude', 'gemini', 'codex', 'copilot']);
  assert.equal(warnings.length, 4);
  assert.ok(warnings[0].startsWith('claude:'));
  assert.ok(warnings[0].includes('org agreement'));
  assert.ok(warnings[1].startsWith('gemini:'));
  assert.ok(warnings[1].includes('project-level'));
  assert.ok(warnings[2].startsWith('codex:'));
  assert.ok(warnings[2].includes('sales agreement'));
  assert.ok(warnings[2].includes('images are excluded'));
  assert.ok(warnings[3].startsWith('copilot:'));
  assert.ok(warnings[3].includes('Business or Enterprise'));
});

test('getZdrWarnings - skips providers without ZDR constraints (opencode)', () => {
  const warnings = getZdrWarnings(['opencode']);
  assert.equal(warnings.length, 0);
});

test('getZdrWarnings - returns only matching provider warnings', () => {
  const warnings = getZdrWarnings(['claude', 'opencode']);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].startsWith('claude:'));
});

test('getZdrWarnings - returns empty array for empty providers', () => {
  const warnings = getZdrWarnings([]);
  assert.equal(warnings.length, 0);
});

test('setupCommandWithDeps - interactive mode shows ZDR warnings for private mode', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

  try {
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
        providers: { installed: ['claude', 'copilot'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
        devcontainer: { enabled: false, config_path: null },
        discovered_at: '2023-01-01T00:00:00.000Z',
      } as unknown as DiscoveryResult;
    };

    const mockScaffold = async (): Promise<ScaffoldResult> => {
      return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
    };

    const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
      if (question.includes('Data Privacy')) return 'private';
      return defaultValue;
    };

    await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

    const warningLines = logs.filter(l => l.includes('⚠'));
    assert.equal(warningLines.length, 2, 'Should show warnings for claude and copilot');
    assert.ok(warningLines.some(l => l.includes('claude') && l.includes('org agreement')));
    assert.ok(warningLines.some(l => l.includes('copilot') && l.includes('Business or Enterprise')));
  } finally {
    console.log = origLog;
  }
});

test('setupCommandWithDeps - interactive mode skips ZDR warnings for public mode', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };

  try {
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
        providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
        devcontainer: { enabled: false, config_path: null },
        discovered_at: '2023-01-01T00:00:00.000Z',
      } as unknown as DiscoveryResult;
    };

    const mockScaffold = async (): Promise<ScaffoldResult> => {
      return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
    };

    const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
      if (question.includes('Data Privacy')) return 'public';
      return defaultValue;
    };

    await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

    const warningLines = logs.filter(l => l.includes('⚠'));
    assert.equal(warningLines.length, 0, 'Should not show ZDR warnings for public mode');
  } finally {
    console.log = origLog;
  }
});

test('setupCommandWithDeps - interactive mode prompts for devcontainer strategy when enabled', async () => {
  let scaffoldCalledOpts = null as unknown as ScaffoldOptions;
  let capturedStrategyDefault = '';
  let strategyPromptCalled = false;

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
      providers: { installed: ['claude'], missing: [], default_provider: 'claude', default_models: {}, round_robin_default: [] },
      devcontainer: { enabled: true, config_path: '/mock/root/.devcontainer/devcontainer.json' },
      discovered_at: '2023-01-01T00:00:00.000Z',
    } as unknown as DiscoveryResult;
  };

  const mockScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    scaffoldCalledOpts = opts;
    return { config_path: '/mock/config', prompts_dir: '/mock/prompts', project_dir: '/mock/dir', project_hash: '123' };
  };

  const mockPrompt: PromptFunction = async (question: string, defaultValue: string) => {
    if (question.includes('Devcontainer Auth Strategy')) {
      strategyPromptCalled = true;
      capturedStrategyDefault = defaultValue;
      return 'env-first';
    }
    return defaultValue;
  };

  await setupCommandWithDeps({}, { discover: mockDiscover, scaffold: mockScaffold, prompt: mockPrompt });

  assert.equal(strategyPromptCalled, true, 'Devcontainer strategy prompt should be called');
  assert.equal(capturedStrategyDefault, 'mount-first', 'Default strategy should be mount-first');
  assert.ok(scaffoldCalledOpts);
  assert.equal(scaffoldCalledOpts.devcontainerAuthStrategy, 'env-first');
});
