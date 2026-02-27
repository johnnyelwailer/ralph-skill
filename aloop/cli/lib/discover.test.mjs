import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { discoverWorkspace } from './discover.mjs';

async function makeProject(files = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'discover-unit-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tempRoot, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return { projectRoot: tempRoot, homeDir: homeRoot };
}

test('discover: .sln file triggers dotnet language detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'MySolution.sln': 'Microsoft Visual Studio Solution\n',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'dotnet');
  assert.ok(result.context.language_signals.includes('*.sln'));
});

test('discover: recursive .csproj triggers dotnet language detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'src/MyApp/MyApp.csproj': '<Project Sdk="Microsoft.NET.Sdk" />\n',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'dotnet');
  assert.ok(result.context.language_signals.includes('*.csproj'));
});

test('discover: package.json triggers node-typescript detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'package.json': JSON.stringify({ name: 'test', scripts: { test: 'vitest run', lint: 'eslint .', build: 'tsc' } }),
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.ok(result.context.language_signals.includes('package.json'));
  assert.ok(result.context.validation_presets.tests_only.some((c) => c === 'npm test'));
  assert.ok(result.context.validation_presets.full.includes('npm run lint'));
  assert.ok(result.context.validation_presets.full.includes('npm run build'));
});

test('discover: package.json with tsconfig triggers typecheck preset', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'package.json': JSON.stringify({ name: 'test', scripts: { typecheck: 'tsc --noEmit' } }),
    'tsconfig.json': '{}',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.ok(result.context.validation_presets.tests_and_types.some((c) => c === 'npm run typecheck'));
});

test('discover: tsconfig only (no package.json) falls back to npx tsc typecheck', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'tsconfig.json': '{}',
    // no package.json so getPackageScripts returns {}
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'node-typescript');
  assert.ok(result.context.validation_presets.tests_and_types.includes('npx tsc --noEmit'));
});

test('discover: pyproject.toml triggers python detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'pyproject.toml': '[project]\nname = "myapp"\n',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'python');
  assert.ok(result.context.validation_presets.tests_only.includes('pytest'));
  assert.ok(result.context.validation_presets.full.includes('ruff check .'));
});

test('discover: go.mod triggers go detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'go.mod': 'module example.com/myapp\n\ngo 1.21\n',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'go');
  assert.ok(result.context.validation_presets.tests_only.includes('go test ./...'));
  assert.ok(result.context.validation_presets.full.includes('golangci-lint run'));
});

test('discover: Cargo.toml triggers rust detection', async () => {
  const { projectRoot, homeDir } = await makeProject({
    'Cargo.toml': '[package]\nname = "myapp"\nversion = "0.1.0"\n',
  });
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'rust');
  assert.ok(result.context.validation_presets.tests_only.includes('cargo test'));
  assert.ok(result.context.validation_presets.full.includes('cargo build --release'));
});

test('discover: unknown language returns empty validation presets', async () => {
  const { projectRoot, homeDir } = await makeProject({});
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.equal(result.context.detected_language, 'other');
  assert.deepEqual(result.context.validation_presets.tests_only, []);
});

test('discover: docs directory candidates are deduped and limited', async () => {
  const files = {};
  // 12 uniquely named guide files — none match pre-ordered patterns
  for (let i = 0; i < 12; i++) {
    files[`docs/guide-${String(i).padStart(2, '0')}.md`] = `# guide ${i}\n`;
  }
  const { projectRoot, homeDir } = await makeProject(files);
  const result = await discoverWorkspace({ projectRoot, homeDir });
  // Dynamic docs are sliced at 8 before dedup; pre-ordered only 'docs' dir matches here
  const docsMdFiles = result.context.spec_candidates.filter((c) => c.startsWith('docs/') && c.endsWith('.md'));
  assert.ok(docsMdFiles.length <= 8, `Expected ≤8 dynamic docs/*.md candidates, got ${docsMdFiles.length}`);
  // dedup: each candidate appears exactly once
  const unique = new Set(result.context.spec_candidates);
  assert.equal(unique.size, result.context.spec_candidates.length, 'spec_candidates should have no duplicates');
});

test('discover: global config models section overrides defaults', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'discover-models-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(
    path.join(homeRoot, '.aloop', 'config.yml'),
    [
      'default_provider: codex',
      'models:',
      '  claude: claude-3-opus',
      '  codex: gpt-5-turbo',
      'other_key: value',
    ].join('\n'),
    'utf8',
  );

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: homeRoot });
  assert.equal(result.providers.default_models.claude, 'claude-3-opus');
  assert.equal(result.providers.default_models.codex, 'gpt-5-turbo');
});

test('discover: global config round_robin_order is parsed', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'discover-rr-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(
    path.join(homeRoot, '.aloop', 'config.yml'),
    [
      'default_provider: claude',
      'round_robin_order:',
      '  - claude',
      '  - gemini',
      'other_key: value',
    ].join('\n'),
    'utf8',
  );

  const result = await discoverWorkspace({ projectRoot: tempRoot, homeDir: homeRoot });
  assert.deepEqual(result.providers.round_robin_default, ['claude', 'gemini']);
});

test('discover: no global config uses default round_robin_order', async () => {
  const { projectRoot, homeDir } = await makeProject({});
  const result = await discoverWorkspace({ projectRoot, homeDir });
  assert.deepEqual(result.providers.round_robin_default, ['claude', 'codex', 'gemini', 'copilot']);
});
