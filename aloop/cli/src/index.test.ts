import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
    const tsxPath = path.resolve(process.cwd(), 'node_modules/tsx/dist/esm/index.cjs');
    const child = spawn(process.execPath, ['--import', tsxPath, entrypoint, ...args], {
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
