import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

function runCli(args) {
  const repoRoot = process.cwd();
  const cliRoot = path.resolve(repoRoot, 'aloop', 'cli');
  const entrypoint = path.join(cliRoot, 'aloop.mjs');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: cliRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('aloop.mjs resolve prints project and setup JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(path.join(homeRoot, '.aloop', 'config.yml'), "default_provider: codex\n", 'utf8');

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.project.root, tempRoot);
  assert.equal(parsed.setup.default_provider, 'codex');
  assert.equal(typeof parsed.project.hash, 'string');
  assert.equal(parsed.project.hash.length, 8);
});

test('aloop.mjs resolve text mode is human-readable', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-resolve-text-'));
  const result = await runCli(['resolve', '--project-root', tempRoot, '--output', 'text']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Project:/);
  assert.match(result.stdout, /Project config:/);
});

test('aloop.mjs resolve JSON includes config_exists=false when project not configured', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-unconfigured-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  // No project-specific config.yml written under ~/.aloop/projects/<hash>/

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.setup.config_exists, false);
  assert.equal(typeof parsed.setup.config_path, 'string');
  assert.ok(parsed.setup.config_path.length > 0);
});

test('aloop.mjs resolve text mode shows "(not found)" when project not configured', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-unconfigured-text-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });

  const result = await runCli(['resolve', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'text']);
  assert.equal(result.code, 0);

  assert.match(result.stdout, /Project config:/);
  assert.match(result.stdout, /\(not found\)/);
});

test('aloop.mjs rejects unknown commands', async () => {
  const result = await runCli(['nope']);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Unknown command/);
});

test('aloop.mjs discover runs natively and prints discovery JSON', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-discover-'));
  const homeRoot = path.join(tempRoot, 'home');
  await mkdir(path.join(homeRoot, '.aloop'), { recursive: true });
  await writeFile(path.join(homeRoot, '.aloop', 'config.yml'), "default_provider: codex\n", 'utf8');
  await writeFile(path.join(tempRoot, 'README.md'), '# test\n', 'utf8');

  const result = await runCli(['discover', '--project-root', tempRoot, '--home-dir', homeRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.project.root, tempRoot);
  assert.equal(parsed.providers.default_provider, 'codex');
  assert.ok(Array.isArray(parsed.context.spec_candidates));
});

test('aloop.mjs scaffold runs natively and writes config/prompts', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-cli-scaffold-'));
  const homeRoot = path.join(tempRoot, 'home');
  const templatesDir = path.join(homeRoot, '.aloop', 'templates');
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec\n', 'utf8');

  for (const name of ['plan', 'build', 'review', 'steer']) {
    await writeFile(path.join(templatesDir, `PROMPT_${name}.md`), 'Spec: {{SPEC_FILES}}\nRules:\n{{SAFETY_RULES}}\n', 'utf8');
  }

  const result = await runCli([
    'scaffold',
    '--project-root',
    tempRoot,
    '--home-dir',
    homeRoot,
    '--templates-dir',
    templatesDir,
    '--provider',
    'codex',
    '--output',
    'json',
  ]);

  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  const configRaw = await readFile(parsed.config_path, 'utf8');
  assert.match(configRaw, /provider:\s+'codex'/);
  const promptRaw = await readFile(path.join(parsed.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  assert.match(promptRaw, /Spec: SPEC\.md/);
});
