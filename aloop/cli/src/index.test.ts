import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

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

test('index CLI returns non-zero for unknown command', async () => {
  const result = await runCli(['unknown-command']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unknown command/i);
});
