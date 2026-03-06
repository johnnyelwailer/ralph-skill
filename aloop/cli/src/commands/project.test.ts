import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { discoverWorkspace, scaffoldWorkspace } from './project.js';

test('discoverWorkspace resolves project details and language signals', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-'));
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(tempRoot, 'RESEARCH.md'), '# research', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.project.root, tempRoot);
  assert.equal(result.project.hash.length, 8);
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.ok(result.context.spec_candidates.includes('SPEC.md'));
  assert.ok(result.context.reference_candidates.includes('RESEARCH.md'));
});

test('scaffoldWorkspace writes config and prompt files with substitutions', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(tempRoot, 'RESEARCH.md'), '# research', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Specs: {{SPEC_FILES}}\nRefs: {{REFERENCE_FILES}}\n{{VALIDATION_COMMANDS}}\n{{SAFETY_RULES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build {{SPEC_FILES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review {{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer {{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof {{SPEC_FILES}}', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    specFiles: ['SPEC.md'],
    validationCommands: ['npm test'],
    safetyRules: ['Do not delete files'],
    provider: 'copilot',
  });

  const config = await readFile(result.config_path, 'utf8');
  const planPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.match(config, /provider: 'copilot'/);
  assert.match(config, /- 'SPEC.md'/);
  assert.match(config, /reference_files:/);
  assert.match(config, /- 'RESEARCH.md'/);
  assert.match(planPrompt, /Specs: SPEC.md/);
  assert.match(planPrompt, /Refs: RESEARCH.md/);
  assert.match(planPrompt, /- npm test/);
  assert.match(planPrompt, /- Do not delete files/);
});

test('scaffoldWorkspace allows explicit reference file overrides', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Refs: {{REFERENCE_FILES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build {{SPEC_FILES}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    specFiles: ['SPEC.md'],
    referenceFiles: ['docs/guide.md', 'notes.md'],
    validationCommands: ['npm test'],
    safetyRules: ['Do not delete files'],
    provider: 'copilot',
  });

  const config = await readFile(result.config_path, 'utf8');
  const planPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.match(config, /- 'docs\/guide.md'/);
  assert.match(config, /- 'notes.md'/);
  assert.match(planPrompt, /Refs: docs\/guide.md, notes.md/);
});

test('discoverWorkspace reports non-git workspaces', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.project.is_git_repo, false);
  assert.equal(result.project.git_branch, null);
});

test('discoverWorkspace falls back to node defaults when package.json is missing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-'));
  await writeFile(path.join(tempRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }), 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.equal(result.context.language_confidence, 'medium');
  assert.deepEqual(result.context.language_signals, ['tsconfig.json']);
  assert.deepEqual(result.context.validation_presets.tests_only, ['npx vitest run']);
  assert.deepEqual(result.context.validation_presets.tests_and_types, ['npx tsc --noEmit', 'npx vitest run']);
  assert.deepEqual(result.context.validation_presets.full, ['npx tsc --noEmit', 'npx eslint .', 'npx vitest run']);
});

test('discoverWorkspace uses package.json scripts for validation presets', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-pkg-scripts-'));
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({
    name: 'demo',
    scripts: {
      test: 'jest',
      typecheck: 'tsc',
      lint: 'eslint',
      build: 'vite build'
    }
  }), 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.deepEqual(result.context.validation_presets.tests_only, ['npm test']);
  assert.deepEqual(result.context.validation_presets.tests_and_types, ['npm run typecheck', 'npm test']);
  assert.deepEqual(result.context.validation_presets.full, ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build']);
});

test('discoverWorkspace handles node-typescript with NO scripts and NO tsconfig', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-no-nothing-'));
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.deepEqual(result.context.validation_presets.tests_only, ['npx vitest run']);
  assert.deepEqual(result.context.validation_presets.tests_and_types, ['npx vitest run']); // no tsc because no tsconfig.json
  assert.deepEqual(result.context.validation_presets.full, ['npx eslint .', 'npx vitest run']);
});

test('scaffoldWorkspace respects explicit enabledProviders and roundRobinOrder', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaf-options-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    enabledProviders: ['claude', 'gemini'],
    roundRobinOrder: ['gemini', 'claude'],
    specFiles: ['none']
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /- 'claude'\r?\n  - 'gemini'/);
  assert.match(config, /round_robin_order:\r?\n  - 'gemini'\r?\n  - 'claude'/);
});

test('discoverWorkspace builds language-specific validation presets for non-node projects', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-'));

  const pythonRoot = path.join(tempRoot, 'python');
  await mkdir(pythonRoot, { recursive: true });
  await writeFile(path.join(pythonRoot, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf8');

  const goRoot = path.join(tempRoot, 'go');
  await mkdir(goRoot, { recursive: true });
  await writeFile(path.join(goRoot, 'go.mod'), 'module example.com/demo\n', 'utf8');

  const rustRoot = path.join(tempRoot, 'rust');
  await mkdir(rustRoot, { recursive: true });
  await writeFile(path.join(rustRoot, 'Cargo.toml'), '[package]\nname = "demo"\nversion = "0.1.0"\n', 'utf8');

  const dotnetRoot = path.join(tempRoot, 'dotnet');
  await mkdir(dotnetRoot, { recursive: true });
  await writeFile(path.join(dotnetRoot, 'demo.sln'), 'Microsoft Visual Studio Solution File\n', 'utf8');

  const python = await discoverWorkspace({ projectRoot: pythonRoot, homeDir: tempRoot });
  const go = await discoverWorkspace({ projectRoot: goRoot, homeDir: tempRoot });
  const rust = await discoverWorkspace({ projectRoot: rustRoot, homeDir: tempRoot });
  const dotnet = await discoverWorkspace({ projectRoot: dotnetRoot, homeDir: tempRoot });

  assert.deepEqual(python.context.validation_presets.full, ['mypy .', 'ruff check .', 'pytest']);
  assert.deepEqual(go.context.validation_presets.full, ['go vet ./...', 'golangci-lint run', 'go test ./...']);
  assert.deepEqual(rust.context.validation_presets.full, ['cargo clippy -- -D warnings', 'cargo test', 'cargo build --release']);
  assert.deepEqual(dotnet.context.validation_presets.full, ['dotnet build', 'dotnet test']);
});

test('scaffoldWorkspace errors when a required template is missing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  await assert.rejects(
    () =>
      scaffoldWorkspace({
        projectRoot: tempRoot,
        homeDir: homeRoot,
        templatesDir,
      }),
    /Template not found: .*PROMPT_review\.md/,
  );
});

test('scaffoldWorkspace leaves provider hints empty for unknown providers', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    provider: 'unknown-provider',
  });

  const reviewPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_review.md'), 'utf8');
  assert.equal(reviewPrompt, 'Review');
});

test('resolveProjectRoot correctly identifies git root', async () => {
  // Use current workspace root which we know is a git repo
  const result = await discoverWorkspace({ projectRoot: process.cwd() });
  assert.ok(result.project.root.length > 0);
  assert.ok(result.project.is_git_repo);
});

test('discoverReferenceCandidates deduplicates against spec candidates', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-ref-dedupe-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(tempRoot, 'RESEARCH.md'), '# research', 'utf8');
  
  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  // SPEC.md is in both lists now, but should be excluded from references because it's a spec candidate
  assert.ok(result.context.spec_candidates.includes('SPEC.md'));
  assert.ok(!result.context.reference_candidates.includes('SPEC.md'));
  assert.ok(result.context.reference_candidates.includes('RESEARCH.md'));
});

test('readDefaultProvider handles missing or malformed config', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-home-'));
  const aloopDir = path.join(tempHome, '.aloop');
  await mkdir(aloopDir, { recursive: true });
  const configPath = path.join(aloopDir, 'config.yml');

  // Case 1: Config exists but no default_provider
  await writeFile(configPath, 'some_other_key: value', 'utf8');
  const result1 = await discoverWorkspace({ homeDir: tempHome });
  assert.equal(result1.providers.default_provider, 'claude');

  // Case 2: Config exists and has default_provider
  await writeFile(configPath, 'default_provider: gemini', 'utf8');
  const result2 = await discoverWorkspace({ homeDir: tempHome });
  assert.equal(result2.providers.default_provider, 'gemini');
});

test('resolveProviderHints covers all branches', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-hints-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), '{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), '{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), '{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), '{{PROVIDER_HINTS}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), '{{PROVIDER_HINTS}}', 'utf8');

  const providers = ['claude', 'codex', 'gemini', 'copilot', 'round-robin'];
  for (const p of providers) {
    const result = await scaffoldWorkspace({
      projectRoot: tempRoot,
      homeDir: homeRoot,
      templatesDir,
      provider: p,
      specFiles: ['none'], // to avoid discovery errors if no spec files found
    });
    const prompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
    assert.ok(prompt.includes(p.charAt(0).toUpperCase() + p.slice(1)));
  }
});

test('buildValidationPresets handles unknown language', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-unknown-lang-'));
  // No files that trigger language detection
  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  assert.equal(result.context.detected_language, 'other');
  assert.equal(result.context.language_confidence, 'low');
  assert.deepEqual(result.context.language_signals, []);
  assert.deepEqual(result.context.validation_presets.full, []);
});

test('workspace functions handle default parameters', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-home-default-'));
  const templatesDir = path.join(tempHome, '.aloop', 'templates');
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  // Test discoverWorkspace with no options (uses process.cwd() and os.homedir())
  const result1 = await discoverWorkspace();
  assert.ok(result1.project.root);
  assert.ok(result1.project.name);
  assert.ok(result1.providers.default_provider);

  // Test scaffoldWorkspace with explicit homeDir to avoid machine-specific failure
  const result2 = await scaffoldWorkspace({ homeDir: tempHome });
  assert.ok(result2.config_path.includes(tempHome));
  assert.ok(result2.prompts_dir.includes(tempHome));
});

import { discoverCommand } from './discover.js';
import { scaffoldCommand } from './scaffold.js';
import { resolveCommand } from './resolve.js';

test('command wrappers support json and text output', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-commands-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(homeRoot, '.aloop', 'templates');
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    // Test Discover Command with defaults
    logs.length = 0;
    await discoverCommand({ projectRoot: tempRoot, homeDir: homeRoot });
    assert.ok(logs.length > 0, 'Should have logs for discoverCommand');
    const discDefaultJson = JSON.parse(logs[0]);
    assert.equal(discDefaultJson.project.root, tempRoot);

    // Test Discover Command Text
    logs.length = 0;
    await discoverCommand({ projectRoot: tempRoot, output: 'text', homeDir: homeRoot });
    assert.ok(logs.some(l => l.includes('Project:')));

    // Test Scaffold Command with controlled homeRoot
    logs.length = 0;
    await scaffoldCommand({ projectRoot: tempRoot, homeDir: homeRoot });
    assert.ok(logs.length > 0, 'Should have logs for scaffoldCommand');
    const scafDefaultJson = JSON.parse(logs[0]);
    assert.ok(scafDefaultJson.config_path, 'Should have config_path in scaffold result');
    const normalizedConfigPath = path.resolve(scafDefaultJson.config_path);
    const normalizedHomeRoot = path.resolve(homeRoot);
    assert.ok(normalizedConfigPath.toLowerCase().includes(normalizedHomeRoot.toLowerCase()), 
      `config_path (${normalizedConfigPath}) should include homeRoot (${normalizedHomeRoot})`);

    // Test Scaffold Command Text
    logs.length = 0;
    await scaffoldCommand({ projectRoot: tempRoot, output: 'text', homeDir: homeRoot });
    assert.ok(logs.some(l => l.includes('Wrote config:')));

    // Test Resolve Command with defaults
    logs.length = 0;
    await resolveCommand({ projectRoot: tempRoot, homeDir: homeRoot });
    assert.ok(logs.length > 0, 'Should have logs for resolveCommand');
    const resDefaultJson = JSON.parse(logs[0]);
    assert.equal(resDefaultJson.project.root, tempRoot);
    assert.ok(resDefaultJson.setup.config_path, 'Should have config_path in resolve result');

    // Test Resolve Command Text
    logs.length = 0;
    await resolveCommand({ projectRoot: tempRoot, output: 'text', homeDir: homeRoot });
    assert.ok(logs.some(l => l.includes('Project config:')));

  } finally {
    console.log = originalLog;
  }
});

test('resolveCommand fails clearly for unconfigured projects', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-resolve-unconfigured-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(homeRoot, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  await assert.rejects(
    () => resolveCommand({ projectRoot: tempRoot, homeDir: homeRoot }),
    /No Aloop configuration found for this project\. Run `aloop setup` first\./,
  );
});
