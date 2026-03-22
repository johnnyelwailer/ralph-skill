import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Isolate tests from the repository's git root to ensure pure temporary-fixture discovery
process.env.GIT_CEILING_DIRECTORIES = os.tmpdir();

type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

function runCli(args: string[], cwd?: string): Promise<CliResult> {
  const entrypoint = path.resolve(process.cwd(), 'src/index.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', entrypoint, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
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
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('index CLI registers expected commands in help output', async () => {
  const result = await runCli(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /\bresolve\b/);
  assert.match(result.stdout, /\bdiscover\b/);
  assert.match(result.stdout, /\bscaffold\b/);
  assert.match(result.stdout, /\bstart\b/);
  assert.match(result.stdout, /\bdashboard\b/);
});

test('index CLI parses discover command and runs action', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-discover-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await runCli(['discover', '--project-root', tempRoot, '--output', 'json']);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.project.root, tempRoot);
});

test('index CLI accepts setup --provider alias in non-interactive mode', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-setup-provider-'));
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-home-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await runCli([
    'setup',
    '--non-interactive',
    '--project-root',
    tempRoot,
    '--home-dir',
    tempHome,
    '--provider',
    'claude',
  ]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Setup complete\./);
});

test('index CLI setup prints helpful error when interactive mode runs without a TTY', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-setup-notty-'));
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-home-notty-'));

  const result = await runCli([
    'setup',
    '--project-root',
    tempRoot,
    '--home-dir',
    tempHome,
  ]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Interactive setup requires a TTY/);
  assert.match(result.stderr, /--non-interactive/);
});

test('index CLI setup emits JSON-formatted errors when --output json is requested', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-setup-json-notty-'));
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-setup-json-home-'));

  const result = await runCli([
    'setup',
    '--project-root',
    tempRoot,
    '--home-dir',
    tempHome,
    '--output',
    'json',
  ]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stderr.trim());
  assert.equal(payload.error, 'Interactive setup requires a TTY. Re-run with --non-interactive to use defaults.');
});

test('index CLI returns non-zero for unknown command', async () => {
  const result = await runCli(['unknown-command']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unknown command/i);
});

test('index CLI catches errors and prints clean messages without stack traces', async () => {
  // Run in a temp directory with a mock SPEC.md so the orchestrate command
  // passes spec-file validation and reaches the autonomy-level check.
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-error-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await runCli(['orchestrate', '--autonomy-level', 'invalid'], tempRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /^Error: Invalid autonomy level: invalid/);
  assert.ok(!result.stderr.includes('at '));
  assert.ok(!result.stderr.includes('node:internal'));
});

test('index CLI emits JSON-formatted errors when --output json is requested', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-json-error-'));
  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');

  const result = await runCli(['orchestrate', '--autonomy-level', 'invalid', '--output', 'json'], tempRoot);
  assert.equal(result.code, 1);

  const payload = JSON.parse(result.stderr.trim());
  assert.equal(payload.error, 'Invalid autonomy level: invalid');
});

test('index CLI keeps orchestrate warnings JSON-safe when --output json is requested', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-json-warning-'));
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'aloop-index-json-warning-home-'));

  await writeFile(path.join(tempRoot, 'SPEC.md'), '# spec', 'utf8');
  await mkdir(path.join(tempRoot, '.git'));
  await mkdir(path.join(tempHome, '.aloop', 'bin'), { recursive: true });
  await writeFile(path.join(tempHome, '.aloop', 'bin', 'loop.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  await chmod(path.join(tempHome, '.aloop', 'bin', 'loop.sh'), 0o755);

  const result = await runCli(
    ['orchestrate', '--output', 'json', '--home-dir', tempHome, '--project-root', tempRoot],
    tempRoot,
  );
  assert.equal(result.code, 0);
  const stderr = result.stderr.trim();
  if (stderr.length > 0) {
    const lines = stderr.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.equal(typeof parsed, 'object');
      assert.ok(parsed !== null);
      assert.ok('warning' in parsed || 'error' in parsed);
    }
  }
});
