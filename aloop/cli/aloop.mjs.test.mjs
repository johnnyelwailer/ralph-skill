import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
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

test('aloop.mjs rejects unknown commands', async () => {
  const result = await runCli(['nope']);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Unknown command/);
});
