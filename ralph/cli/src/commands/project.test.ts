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
  assert.deepEqual(result.context.validation_presets.tests_only, ['npx vitest run']);
  assert.deepEqual(result.context.validation_presets.tests_and_types, ['npx tsc --noEmit', 'npx vitest run']);
  assert.deepEqual(result.context.validation_presets.full, ['npx tsc --noEmit', 'npx eslint .', 'npx vitest run']);
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

  const result = await scaffoldWorkspace({
    projectRoot: tempRoot,
    homeDir: homeRoot,
    templatesDir,
    provider: 'unknown-provider',
  });

  const reviewPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_review.md'), 'utf8');
  assert.equal(reviewPrompt, 'Review');
});
