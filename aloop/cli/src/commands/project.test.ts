import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { discoverWorkspace, resolveBundledTemplatesDir, resolveBundledAgentsDir, resolveBundledBinDir, scaffoldWorkspace } from './project.js';

// Isolate tests from the repository's git root to ensure pure temporary-fixture discovery
process.env.GIT_CEILING_DIRECTORIES = os.tmpdir();

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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA {{SPEC_FILES}}', 'utf8');

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
  assert.match(config, /autonomy_level: 'balanced'/);
  assert.match(config, /data_privacy: 'private'/);
  assert.match(config, /privacy_policy:/);
  assert.match(config, /data_classification: 'private'/);
  assert.match(config, /zdr_enabled: true/);
  assert.match(config, /require_data_retention_safe: true/);
  assert.match(config, /- 'SPEC.md'/);
  assert.match(config, /reference_files:/);
  assert.match(config, /- 'RESEARCH.md'/);
  assert.match(planPrompt, /Specs: SPEC.md/);
  assert.match(planPrompt, /Refs: RESEARCH.md/);
  assert.match(planPrompt, /- npm test/);
  assert.match(planPrompt, /- Do not delete files/);
});

test('scaffoldWorkspace in orchestrate mode writes orchestrator prompts and config mode', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-orchestrate-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const orchestratorTemplates = [
    'PROMPT_orch_scan.md',
    'PROMPT_orch_product_analyst.md',
    'PROMPT_orch_arch_analyst.md',
    'PROMPT_orch_decompose.md',
    'PROMPT_orch_refine.md',
    'PROMPT_orch_sub_decompose.md',
    'PROMPT_orch_planner_frontend.md',
    'PROMPT_orch_planner_backend.md',
    'PROMPT_orch_planner_infra.md',
    'PROMPT_orch_planner_fullstack.md',
    'PROMPT_orch_estimate.md',
    'PROMPT_orch_resolver.md',
    'PROMPT_orch_replan.md',
    'PROMPT_orch_spec_consistency.md',
  ];
  for (const tmpl of orchestratorTemplates) {
    await writeFile(path.join(templatesDir, tmpl), `Template ${tmpl}`, 'utf8');
  }

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    mode: 'orchestrate',
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /mode: 'orchestrate'/);

  // Verify ALL 14 orchestrator prompt files were generated with correct content
  for (const tmpl of orchestratorTemplates) {
    const dest = path.join(result.prompts_dir, tmpl);
    assert.ok(existsSync(dest), `orchestrator prompt ${tmpl} should exist`);
    const content = await readFile(dest, 'utf8');
    assert.equal(content, `Template ${tmpl}`, `${tmpl} content should match source template`);
  }

  // Verify NO loop prompt files leaked into orchestrate output
  const loopPrompts = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of loopPrompts) {
    assert.ok(!existsSync(path.join(result.prompts_dir, tmpl)), `loop prompt ${tmpl} should NOT exist in orchestrate mode`);
  }

  // Verify exact prompt file count in output directory
  const { readdir } = await import('node:fs/promises');
  const generatedFiles = (await readdir(result.prompts_dir)).filter(f => f.endsWith('.md'));
  assert.equal(generatedFiles.length, orchestratorTemplates.length, `should generate exactly ${orchestratorTemplates.length} prompt files, got ${generatedFiles.length}`);
});

test('scaffoldWorkspace normalizes mode loop to plan-build-review', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-loop-mode-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    mode: 'loop',
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /mode: 'plan-build-review'/);
});

test('scaffoldWorkspace expands nested template includes before variable substitution', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-includes-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  const instructionsDir = path.join(templatesDir, 'instructions');
  const docsDir = path.join(tempRoot, 'docs');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(instructionsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(docsDir, 'SPEC-2.md'), '# spec 2', 'utf8');
  await writeFile(path.join(tempRoot, 'RESEARCH.md'), '# research', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), '{{include:instructions/review.md}}', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');
  await writeFile(path.join(instructionsDir, 'review.md'), 'Specs: {{SPEC_FILES}}\n{{include:instructions/common.md}}', 'utf8');
  await writeFile(path.join(instructionsDir, 'common.md'), 'Refs: {{REFERENCE_FILES}}\n{{VALIDATION_COMMANDS}}\n{{SAFETY_RULES}}', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    specFiles: ['SPEC.md', 'docs/SPEC-2.md'],
    referenceFiles: ['RESEARCH.md', 'README.md'],
    validationCommands: ['npm test'],
    safetyRules: ['No force push'],
  });

  const reviewPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_review.md'), 'utf8');
  assert.match(reviewPrompt, /Specs: SPEC\.md, docs\/SPEC-2\.md/);
  assert.match(reviewPrompt, /Refs: RESEARCH\.md, README\.md/);
  assert.match(reviewPrompt, /- npm test/);
  assert.match(reviewPrompt, /- No force push/);
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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

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

test('scaffoldWorkspace writes data_privacy and privacy_policy to config', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-privacy-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  // Test private (default)
  const privateResult = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    specFiles: ['SPEC.md'],
  });
  const privateConfig = await readFile(privateResult.config_path, 'utf8');
  assert.match(privateConfig, /data_privacy: 'private'/);
  assert.match(privateConfig, /zdr_enabled: true/);
  assert.match(privateConfig, /require_data_retention_safe: true/);

  // Test public
  const publicResult = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: path.join(tempRoot, 'home2'),
    templatesDir,
    specFiles: ['SPEC.md'],
    dataPrivacy: 'public',
  });
  const publicConfig = await readFile(publicResult.config_path, 'utf8');
  assert.match(publicConfig, /data_privacy: 'public'/);
  assert.match(publicConfig, /zdr_enabled: false/);
  assert.match(publicConfig, /require_data_retention_safe: false/);
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
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    enabledProviders: ['claude', 'gemini'],
    roundRobinOrder: ['gemini', 'claude'],
    specFiles: ['SPEC.md'],
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /- 'claude'\r?\n  - 'gemini'/);
  assert.match(config, /round_robin_order:\r?\n  - 'gemini'\r?\n  - 'claude'/);
});

test('scaffoldWorkspace writes explicit autonomy level', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaf-autonomy-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    autonomyLevel: 'autonomous',
    specFiles: ['SPEC.md'],
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /autonomy_level: 'autonomous'/);
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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

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

test('scaffoldWorkspace bootstraps templates from bundled source for fresh HOME', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-bootstrap-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(homeRoot, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  // Do NOT create templates dir or any templates — simulates fresh HOME
  // The scaffoldWorkspace should bootstrap templates from bundled aloop/templates/
  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    // No explicit templatesDir — triggers bootstrap from bundled source
  });
  // Verify templates were bootstrapped to HOME with content matching bundled sources
  const homeTemplatesDir = path.join(homeRoot, '.aloop', 'templates');
  const bundledTemplatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates');
  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    assert.ok(existsSync(path.join(homeTemplatesDir, tmpl)), `${tmpl} should be bootstrapped`);
    const bootstrapped = await readFile(path.join(homeTemplatesDir, tmpl), 'utf8');
    const bundled = await readFile(path.join(bundledTemplatesDir, tmpl), 'utf8');
    assert.equal(bootstrapped, bundled, `${tmpl} content should match bundled source`);
  }
  // Verify scaffold completed successfully
  assert.ok(result.config_path);
  assert.ok(result.prompts_dir);
});

test('resolveBundledTemplatesDir resolves templates from parent levels in packaged dist layouts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-templates-resolve-'));
  const fakeModuleDir = path.join(tempRoot, 'lib', 'node_modules', 'aloop-cli', 'dist');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(fakeModuleDir, { recursive: true });
  await mkdir(templatesDir, { recursive: true });

  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(templatesDir, tmpl), `Template ${tmpl}`, 'utf8');
  }

  const resolved = resolveBundledTemplatesDir(requiredTemplates, {
    moduleDir: fakeModuleDir,
    argv1: path.join(fakeModuleDir, 'index.js'),
    cwd: tempRoot,
  });

  assert.equal(resolved, templatesDir);
});

test('resolveBundledTemplatesDir resolves templates bundled under dist/templates', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-templates-dist-'));
  const fakeDistDir = path.join(tempRoot, 'lib', 'node_modules', 'aloop-cli', 'dist');
  const distTemplatesDir = path.join(fakeDistDir, 'templates');
  await mkdir(distTemplatesDir, { recursive: true });

  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(distTemplatesDir, tmpl), `Bundled ${tmpl}`, 'utf8');
  }

  const resolved = resolveBundledTemplatesDir(requiredTemplates, {
    moduleDir: fakeDistDir,
    argv1: path.join(tempRoot, 'bin', 'aloop'),
    cwd: tempRoot,
  });

  assert.equal(resolved, distTemplatesDir);
});

test('scaffoldWorkspace skips bootstrap when explicit templatesDir is provided', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-no-bootstrap-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'custom-templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  // Provide all required templates in explicit templatesDir
  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(templatesDir, tmpl), `Custom ${tmpl}`, 'utf8');
  }
  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
  });
  // HOME templates dir should NOT have been created — bootstrap was skipped
  const homeTemplatesDir = path.join(homeRoot, '.aloop', 'templates');
  assert.ok(!existsSync(homeTemplatesDir), 'HOME templates dir should not exist when explicit templatesDir is provided');
  // Scaffold should still succeed using the explicit templates
  assert.ok(result.config_path);
  assert.ok(result.prompts_dir);
});

test('scaffoldWorkspace does not bootstrap bundled templates when default HOME templates are already complete', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-existing-home-templates-'));
  const homeRoot = path.join(tempRoot, 'home');
  const homeTemplatesDir = path.join(homeRoot, '.aloop', 'templates');
  await mkdir(homeTemplatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(homeTemplatesDir, tmpl), `Existing ${tmpl}`, 'utf8');
  }

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
  });

  const existingPlanTemplate = await readFile(path.join(homeTemplatesDir, 'PROMPT_plan.md'), 'utf8');
  assert.equal(existingPlanTemplate, 'Existing PROMPT_plan.md');
  const generatedPlanPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.equal(generatedPlanPrompt, 'Existing PROMPT_plan.md');
});

test('scaffoldWorkspace rejects unknown provider names', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  await assert.rejects(
    () => scaffoldWorkspace({
      projectRoot: tempRoot,
      homeDir: homeRoot,
      templatesDir,
      provider: 'unknown-provider',
    }),
    /Unknown provider\(s\): unknown-provider/,
  );
});

test('scaffoldWorkspace rejects unknown providers in enabledProviders', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-bad-providers-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  await assert.rejects(
    () => scaffoldWorkspace({
      projectRoot: tempRoot,
      homeDir: homeRoot,
      templatesDir,
      enabledProviders: ['claude', 'fakeprovider'],
    }),
    /Unknown provider\(s\): fakeprovider/,
  );
});

test('scaffoldWorkspace rejects nonexistent spec files', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-bad-spec-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  await assert.rejects(
    () => scaffoldWorkspace({
      projectRoot: tempRoot,
      homeDir: homeRoot,
      templatesDir,
      specFiles: ['NONEXISTENT_SPEC.md'],
    }),
    /Spec file not found: NONEXISTENT_SPEC\.md/,
  );
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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), '{{PROVIDER_HINTS}}', 'utf8');

  const providers = ['claude', 'opencode', 'codex', 'gemini', 'copilot'];
  const expectedHintFragments: Record<string, string> = {
    claude: 'Claude hint',
    opencode: 'OpenCode hint',
    codex: 'Codex hint',
    gemini: 'Gemini hint',
    copilot: 'Copilot hint',
  };
  for (const p of providers) {
    const result = await scaffoldWorkspace({
      projectRoot: tempRoot,
      homeDir: homeRoot,
      templatesDir,
      provider: p,
      enabledProviders: [p],
    });
    const prompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
    assert.ok(prompt.includes(expectedHintFragments[p]));
  }

  const multiProviderResult = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: path.join(tempRoot, 'home-multi'),
    templatesDir,
    provider: 'claude',
    enabledProviders: ['claude', 'opencode', 'codex', 'copilot'],
  });
  const multiProviderPrompt = await readFile(path.join(multiProviderResult.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.ok(multiProviderPrompt.includes('Claude hint'));
  assert.ok(multiProviderPrompt.includes('OpenCode hint'));
  assert.ok(multiProviderPrompt.includes('Codex hint'));
  assert.ok(multiProviderPrompt.includes('Copilot hint'));
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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

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
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

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

test('discoverWorkspace includes opencode in provider metadata', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-discover-opencode-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });
  
  // Verify opencode is in the default models and round robin list
  assert.equal(result.providers.default_models.opencode, 'opencode-default');
  assert.ok(result.providers.round_robin_default.includes('opencode'));
  
  // Verify it's either in installed or missing (depending on the environment)
  const allProviders = [...result.providers.installed, ...result.providers.missing];
  assert.ok(allProviders.includes('opencode'), 'opencode should be tracked in either installed or missing');
});

test('scaffoldWorkspace includes opencode in generated config models', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-opencode-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    enabledProviders: ['opencode', 'claude'],
    specFiles: ['SPEC.md'],
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /opencode: 'opencode-default'/);
  assert.match(config, /- 'opencode'/);
});

test('scaffoldWorkspace allows explicitly enabled providers even if missing locally', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-missing-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_plan.md'), 'Plan', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_build.md'), 'Build', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_review.md'), 'Review', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_steer.md'), 'Steer', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_proof.md'), 'Proof', 'utf8');
  await writeFile(path.join(templatesDir, 'PROMPT_qa.md'), 'QA', 'utf8');

  // Request a provider that is known but likely missing in the test environment (e.g., gemini or opencode if not in path)
  // We don't need to mock spawnSync because scaffoldWorkspace only uses discovery results, 
  // and we know discovery will put missing ones in 'missing'.
  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    enabledProviders: ['opencode'],
    specFiles: ['SPEC.md'],
  });

  const config = await readFile(result.config_path, 'utf8');
  assert.match(config, /- 'opencode'/, 'opencode should be in enabled_providers even if missing locally');
});

test('resolveBundledAgentsDir resolves agents from parent levels in packaged dist layouts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-agents-resolve-'));
  const fakeModuleDir = path.join(tempRoot, 'lib', 'node_modules', 'aloop-cli', 'dist');
  const agentsDir = path.join(tempRoot, 'agents', 'opencode');
  await mkdir(fakeModuleDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  const agentFiles = ['vision-reviewer.md', 'error-analyst.md', 'code-critic.md'];
  for (const f of agentFiles) {
    await writeFile(path.join(agentsDir, f), `Agent ${f}`, 'utf8');
  }

  const resolved = resolveBundledAgentsDir({
    moduleDir: fakeModuleDir,
    argv1: path.join(fakeModuleDir, 'index.js'),
    cwd: tempRoot,
  });

  assert.equal(resolved, agentsDir);
});

test('resolveBundledAgentsDir returns null when agent files are missing', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-agents-missing-'));
  const fakeModuleDir = path.join(tempRoot, 'lib', 'node_modules', 'aloop-cli', 'dist');
  // Create an agents dir with only SOME files (not all required)
  const partialAgentsDir = path.join(tempRoot, 'agents', 'opencode');
  await mkdir(fakeModuleDir, { recursive: true });
  await mkdir(partialAgentsDir, { recursive: true });
  // Write only 1 of 3 required files - this should NOT satisfy the check
  await writeFile(path.join(partialAgentsDir, 'vision-reviewer.md'), 'partial', 'utf8');

  const resolved = resolveBundledAgentsDir({
    moduleDir: fakeModuleDir,
    argv1: path.join(fakeModuleDir, 'index.js'),
    cwd: tempRoot,
  });

  // Should return null because not all 3 agent files are present
  assert.equal(resolved, null);
});

test('resolveBundledBinDir resolves loop scripts from parent levels in packaged dist layouts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-bin-resolve-'));
  const fakeModuleDir = path.join(tempRoot, 'lib', 'node_modules', 'aloop-cli', 'dist');
  const binDir = path.join(tempRoot, 'bin');
  await mkdir(fakeModuleDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(path.join(binDir, 'loop.sh'), '#!/bin/sh\n', 'utf8');
  await writeFile(path.join(binDir, 'loop.ps1'), 'Write-Host "loop"', 'utf8');

  const resolved = resolveBundledBinDir({
    moduleDir: fakeModuleDir,
    argv1: path.join(fakeModuleDir, 'index.js'),
    cwd: tempRoot,
  });

  assert.equal(resolved, binDir);
});

test('resolveBundledBinDir resolves loop scripts from aloop/bin in packaged dist layouts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-bin-resolve-aloop-'));
  const fakeModuleDir = path.join(tempRoot, 'dist', 'cli');
  const binDir = path.join(tempRoot, 'aloop', 'bin');
  await mkdir(fakeModuleDir, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await writeFile(path.join(binDir, 'loop.sh'), '#!/bin/sh\n', 'utf8');
  await writeFile(path.join(binDir, 'loop.ps1'), 'Write-Host "loop"', 'utf8');

  const resolved = resolveBundledBinDir({
    moduleDir: fakeModuleDir,
    argv1: path.join(fakeModuleDir, 'index.js'),
    cwd: tempRoot,
  });

  assert.equal(resolved, binDir);
});

test('resolveBundledBinDir resolves dist/bin/ in actual package layout', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-bin-resolve-dist-'));
  const distDir = path.join(tempRoot, 'dist');
  const binDir = path.join(distDir, 'bin');
  await mkdir(binDir, { recursive: true });
  await writeFile(path.join(binDir, 'loop.sh'), '#!/bin/sh\n', 'utf8');
  await writeFile(path.join(binDir, 'loop.ps1'), 'Write-Host "loop"', 'utf8');

  const resolved = resolveBundledBinDir({
    moduleDir: distDir,
    argv1: path.join(distDir, 'index.js'),
    cwd: tempRoot,
  });

  assert.equal(resolved, binDir);
});

test('scaffoldWorkspace bootstraps loop scripts to home bin for fresh HOME', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-bootstrap-bin-'));
  const homeRoot = path.join(tempRoot, 'home');
  const bundledBinDir = path.join(tempRoot, 'fake-bundled-bin');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(bundledBinDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(bundledBinDir, 'loop.sh'), '#!/bin/sh\necho loop', 'utf8');
  await writeFile(path.join(bundledBinDir, 'loop.ps1'), 'Write-Host "loop"', 'utf8');

  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    bundledBinDir,
  });

  const homeBinDir = path.join(homeRoot, '.aloop', 'bin');
  const requiredScripts = ['loop.sh', 'loop.ps1'];
  for (const scriptName of requiredScripts) {
    const copiedScriptPath = path.join(homeBinDir, scriptName);
    assert.ok(existsSync(copiedScriptPath), `${scriptName} should be bootstrapped`);
    const copiedContent = await readFile(copiedScriptPath, 'utf8');
    const sourceContent: string = await readFile(path.join(bundledBinDir, scriptName), 'utf8');
    assert.equal(copiedContent, sourceContent, `${scriptName} content should match bundled source`);
  }
});

test('scaffoldWorkspace copies opencode agent files when opencode is enabled', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-agents-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(homeRoot, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  // Create bundled templates dir
  const bundledTemplatesDir = path.join(tempRoot, 'templates');
  await mkdir(bundledTemplatesDir, { recursive: true });
  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(bundledTemplatesDir, tmpl), `Template ${tmpl}`, 'utf8');
  }

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    enabledProviders: ['opencode'],
    templatesDir: bundledTemplatesDir,
  });

  // Verify opencode agents were copied from the bundled agents dir with exact content parity.
  const opencodeAgentsDir = path.join(tempRoot, '.opencode', 'agents');
  const bundledAgentsDir = resolveBundledAgentsDir();
  assert.ok(bundledAgentsDir, 'bundled opencode agents dir should resolve for test fixture');
  const agentFiles = ['vision-reviewer.md', 'error-analyst.md', 'code-critic.md'];
  const sourceContents = new Map();
  for (const fileName of agentFiles) {
    sourceContents.set(fileName, await readFile(path.join(bundledAgentsDir, fileName), 'utf8'));
  }
  for (let index = 0; index < agentFiles.length; index++) {
    const fileName = agentFiles[index];
    const dest = path.join(opencodeAgentsDir, fileName);
    assert.ok(existsSync(dest), `${fileName} should be copied to .opencode/agents/`);
    const copiedContent = await readFile(dest, 'utf8');
    assert.equal(
      copiedContent,
      sourceContents.get(fileName),
      `${fileName} content should exactly match bundled source`,
    );

    const wrongFile = agentFiles[(index + 1) % agentFiles.length];
    assert.notEqual(
      copiedContent,
      sourceContents.get(wrongFile),
      `${fileName} should not match ${wrongFile} content`,
    );
    assert.notEqual(
      copiedContent,
      `CORRUPTED ${fileName}`,
      `${fileName} should not match corrupted content`,
    );
  }

  assert.ok(result.config_path);
});

test('scaffoldWorkspace does not copy opencode agent files when opencode is not enabled', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-scaffold-no-agents-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(homeRoot, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  // Create bundled templates dir
  const bundledTemplatesDir = path.join(tempRoot, 'templates');
  await mkdir(bundledTemplatesDir, { recursive: true });
  const requiredTemplates = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md'];
  for (const tmpl of requiredTemplates) {
    await writeFile(path.join(bundledTemplatesDir, tmpl), `Template ${tmpl}`, 'utf8');
  }

  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    enabledProviders: ['claude'],
    templatesDir: bundledTemplatesDir,
  });

  // Verify .opencode/agents/ was NOT created
  const opencodeAgentsDir = path.join(tempRoot, '.opencode', 'agents');
  assert.ok(!existsSync(opencodeAgentsDir), '.opencode/agents/ should not exist when opencode is not enabled');
});

test('discoverWorkspace includes spec complexity analysis', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-complexity-'));
  const specContent = `# Project Spec

## Frontend
Build the UI with React.

## Backend
Build the REST API with Node.js.

## Database
Set up PostgreSQL with migrations.

### Parallel development
Frontend and backend can be developed in parallel and concurrent workstreams.

## Acceptance Criteria
- [ ] User can login
- [ ] User can view dashboard
- [ ] API returns correct data

## Infrastructure
Deploy to AWS with Kubernetes.
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), specContent, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.spec_complexity, 'should include spec_complexity');
  assert.ok(result.spec_complexity.workstream_count >= 3, `workstream_count should be >= 3, got ${result.spec_complexity.workstream_count}`);
  assert.ok(result.spec_complexity.parallelism_score >= 2, `parallelism_score should be >= 2, got ${result.spec_complexity.parallelism_score}`);
  assert.ok(result.spec_complexity.estimated_issue_count >= 3, `estimated_issue_count should be >= 3, got ${result.spec_complexity.estimated_issue_count}`);
  assert.equal(result.spec_complexity.analyzed_files, 1);
});

test('discoverWorkspace includes CI workflow support detection', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-ci-detect-'));
  const workflowsDir = path.join(tempRoot, '.github', 'workflows');
  await mkdir(workflowsDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await writeFile(path.join(workflowsDir, 'ci.yml'), 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n', 'utf8');
  await writeFile(path.join(workflowsDir, 'lint.yml'), 'name: Lint\non: push\njobs:\n  lint:\n    runs-on: ubuntu-latest\n', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.ci_support, 'should include ci_support');
  assert.equal(result.ci_support.has_workflows, true);
  assert.equal(result.ci_support.workflow_count, 2);
  assert.ok(result.ci_support.workflow_types.includes('test'), 'should detect test workflow');
  assert.ok(result.ci_support.workflow_types.includes('lint'), 'should detect lint workflow');
});

test('discoverWorkspace includes mode recommendation for simple specs', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-simple-spec-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# Simple Feature\n\nAdd a button to the page.\n\n- [ ] Add button\n', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.mode_recommendation, 'should include mode_recommendation');
  assert.equal(result.mode_recommendation.recommended_mode, 'loop');
  assert.ok(result.mode_recommendation.reasoning.length > 0, 'should have reasoning');
});

test('discoverWorkspace recommends orchestrate mode for complex multi-workstream specs', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-complex-spec-'));
  const complexSpec = `# Large Project

## Frontend
Build React SPA with authentication and dashboard.

## Backend
Build Node.js API with user management, billing, and notifications.

## Database
Set up PostgreSQL with migrations for users, billing, and analytics.

## Infrastructure
Deploy to AWS with Kubernetes, CI/CD pipeline, and monitoring.

## Mobile
Build React Native app for iOS and Android.

### Parallel Development
All workstreams can proceed in parallel with concurrent development teams.
Independent modules should be developed simultaneously.

## Acceptance Criteria
- [ ] Users can register and login
- [ ] Dashboard shows real-time data
- [ ] API handles 1000 req/s
- [ ] Mobile app works offline
- [ ] Billing integration complete
- [ ] Notifications delivered reliably
- [ ] CI/CD deploys automatically
- [ ] Monitoring alerts configured
- [ ] Load tests pass
- [ ] Security audit complete
- [ ] Documentation updated
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), complexSpec, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.mode_recommendation, 'should include mode_recommendation');
  assert.equal(result.mode_recommendation.recommended_mode, 'orchestrate');
  assert.ok(result.mode_recommendation.reasoning.length > 0, 'should have reasoning');
});

test('discoverWorkspace mode recommendation includes CI boost for orchestrate', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-ci-boost-'));
  const workflowsDir = path.join(tempRoot, '.github', 'workflows');
  await mkdir(workflowsDir, { recursive: true });
  // Multi-workstream spec that's borderline for orchestrate
  const spec = `# Project

## Frontend
React UI for the application.

## Backend
REST API for data management.

## Infrastructure
Cloud deployment setup.
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), spec, 'utf8');
  await writeFile(path.join(workflowsDir, 'test.yml'), 'name: Test\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n', 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.ci_support.has_workflows, 'should detect CI workflows');
  assert.ok(result.mode_recommendation.reasoning.some(r => r.includes('CI')), 'reasoning should mention CI support');
});

// Gate 2 regression tests: recommendation correctness edge cases

test('workstream synonyms count once — Auth and Authentication in same spec', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-synonym-dedup-'));
  const spec = `# Project

## Auth
Login and registration flow.

## Authentication
OAuth2 and token refresh.
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), spec, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  // "auth" and "authentication" map to the same category — should count as 1 workstream, not 2
  assert.equal(result.spec_complexity.workstream_count, 1,
    `synonyms "Auth" and "Authentication" should deduplicate to 1 workstream, got ${result.spec_complexity.workstream_count}`);
});

test('workstream synonyms count once — Infrastructure and Infra in same spec', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-infra-dedup-'));
  const spec = `# Project

## Infrastructure
Cloud deployment setup.

## Infra
Monitoring and alerting.
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), spec, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  // "infrastructure" and "infra" map to the same category — should count as 1 workstream
  assert.equal(result.spec_complexity.workstream_count, 1,
    `synonyms "Infrastructure" and "Infra" should deduplicate to 1 workstream, got ${result.spec_complexity.workstream_count}`);
});

test('workstream synonyms count once — Database and DB in same spec', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-db-dedup-'));
  const spec = `# Project

## Database
Schema design and migrations.

## DB
Query optimization and indexing.
`;
  await writeFile(path.join(tempRoot, 'SPEC.md'), spec, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.equal(result.spec_complexity.workstream_count, 1,
    `synonyms "Database" and "DB" should deduplicate to 1 workstream, got ${result.spec_complexity.workstream_count}`);
});

test('CI workflow with actions/checkout only must not classify as test', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-checkout-false-'));
  const workflowsDir = path.join(tempRoot, '.github', 'workflows');
  await mkdir(workflowsDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  // Workflow with only checkout step — no actual test job
  const checkoutOnly = `name: Build
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "building"
`;
  await writeFile(path.join(workflowsDir, 'build.yml'), checkoutOnly, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(!result.ci_support.workflow_types.includes('test'),
    `actions/checkout alone should not classify workflow as test, got types: ${JSON.stringify(result.ci_support.workflow_types)}`);
  assert.ok(result.ci_support.workflow_types.includes('build'),
    'should still detect build type from echo "building"');
});

test('recommendation stays loop for simple spec with non-test workflow', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-simple-no-test-'));
  const workflowsDir = path.join(tempRoot, '.github', 'workflows');
  await mkdir(workflowsDir, { recursive: true });
  // Simple spec with single workstream
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# Simple Feature\n\nAdd a button.\n\n- [ ] Add button\n', 'utf8');
  // Workflow with only checkout + build, no test
  const buildOnly = `name: Build
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build
`;
  await writeFile(path.join(workflowsDir, 'build.yml'), buildOnly, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.equal(result.mode_recommendation.recommended_mode, 'loop',
    `simple spec + non-test workflow should recommend loop, got ${result.mode_recommendation.recommended_mode}`);
  // Also verify the CI test type is not falsely detected
  assert.ok(!result.ci_support.workflow_types.includes('test'),
    `build-only workflow should not include test type, got: ${JSON.stringify(result.ci_support.workflow_types)}`);
});

test('CI workflow with explicit check job name does classify as test', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-check-job-'));
  const workflowsDir = path.join(tempRoot, '.github', 'workflows');
  await mkdir(workflowsDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  // Workflow with an actual "check" job (not checkout)
  const checkJob = `name: CI
on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
  await writeFile(path.join(workflowsDir, 'ci.yml'), checkJob, 'utf8');

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: tempRoot });

  assert.ok(result.ci_support.workflow_types.includes('test'),
    `workflow with "check:" job should classify as test, got types: ${JSON.stringify(result.ci_support.workflow_types)}`);
});

// --- opencode.json ZDR generation tests ---

async function setupScaffoldFixture(prefix: string) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `aloop-${prefix}-`));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(tempRoot, 'templates');
  await mkdir(homeRoot, { recursive: true });
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }), 'utf8');
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  for (const tmpl of ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_review.md', 'PROMPT_steer.md', 'PROMPT_proof.md', 'PROMPT_qa.md']) {
    await writeFile(path.join(templatesDir, tmpl), `template ${tmpl}`, 'utf8');
  }
  return { tempRoot, homeRoot, templatesDir };
}

test('scaffoldWorkspace generates opencode.json with ZDR when private and opencode enabled', async () => {
  const { tempRoot, homeRoot, templatesDir } = await setupScaffoldFixture('zdr-create');
  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    dataPrivacy: 'private',
    enabledProviders: ['opencode'],
    provider: 'opencode',
  });

  const opencodeJsonPath = path.join(tempRoot, 'opencode.json');
  assert.ok(existsSync(opencodeJsonPath), 'opencode.json should be created');
  const content = JSON.parse(await readFile(opencodeJsonPath, 'utf8'));
  assert.deepStrictEqual(content.provider, { zdr: true });
});

test('scaffoldWorkspace does not generate opencode.json when data privacy is public', async () => {
  const { tempRoot, homeRoot, templatesDir } = await setupScaffoldFixture('zdr-public');
  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    dataPrivacy: 'public',
    enabledProviders: ['opencode'],
    provider: 'opencode',
  });

  const opencodeJsonPath = path.join(tempRoot, 'opencode.json');
  assert.ok(!existsSync(opencodeJsonPath), 'opencode.json should not be created when public');
});

test('scaffoldWorkspace does not generate opencode.json when opencode not in providers', async () => {
  const { tempRoot, homeRoot, templatesDir } = await setupScaffoldFixture('zdr-no-opencode');
  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    dataPrivacy: 'private',
    enabledProviders: ['claude'],
    provider: 'claude',
  });

  const opencodeJsonPath = path.join(tempRoot, 'opencode.json');
  assert.ok(!existsSync(opencodeJsonPath), 'opencode.json should not be created when opencode not enabled');
});

test('scaffoldWorkspace preserves existing opencode.json settings during merge', async () => {
  const { tempRoot, homeRoot, templatesDir } = await setupScaffoldFixture('zdr-merge');
  const opencodeJsonPath = path.join(tempRoot, 'opencode.json');
  await writeFile(opencodeJsonPath, JSON.stringify({
    theme: 'dark',
    provider: { model: 'custom-model', timeout: 30 },
    experimental: true,
  }, null, 2), 'utf8');

  await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    dataPrivacy: 'private',
    enabledProviders: ['opencode'],
    provider: 'opencode',
  });

  const content = JSON.parse(await readFile(opencodeJsonPath, 'utf8'));
  assert.strictEqual(content.theme, 'dark', 'existing top-level settings should be preserved');
  assert.strictEqual(content.experimental, true, 'existing top-level settings should be preserved');
  assert.strictEqual(content.provider.model, 'custom-model', 'existing provider settings should be preserved');
  assert.strictEqual(content.provider.timeout, 30, 'existing provider settings should be preserved');
  assert.strictEqual(content.provider.zdr, true, 'zdr flag should be merged in');
});
