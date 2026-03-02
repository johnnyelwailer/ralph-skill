import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import {
  resolveHomeDir,
  resolveProjectRoot,
  getProjectHash,
  getDefaultProvider,
  resolveWorkspace,
} from './project.mjs';

test('resolveHomeDir: returns os.homedir() when no argument given', () => {
  const result = resolveHomeDir();
  assert.equal(result, path.resolve(os.homedir()).replace(/[\\/]+$/, ''));
});

test('resolveHomeDir: returns normalized explicit path', () => {
  const result = resolveHomeDir('/tmp/mydir');
  assert.equal(result, path.resolve('/tmp/mydir').replace(/[\\/]+$/, ''));
});

test('resolveHomeDir: strips trailing slash', () => {
  const result = resolveHomeDir(os.tmpdir() + path.sep);
  assert.ok(!result.endsWith(path.sep));
});

test('resolveProjectRoot: returns explicit path when git is not available in it', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proj-test-'));
  const expected = path.resolve(dir).replace(/[\\/]+$/, '');
  const result = resolveProjectRoot(dir);
  assert.equal(result, expected);
});

test('getProjectHash: returns 8-char hex string', () => {
  const hash = getProjectHash('/some/project/path');
  assert.match(hash, /^[0-9a-f]{8}$/);
});

test('getProjectHash: is case-insensitive (same hash for different case)', () => {
  const h1 = getProjectHash('/Some/Project');
  const h2 = getProjectHash('/some/project');
  assert.equal(h1, h2);
});

test('getProjectHash: different paths produce different hashes', () => {
  const h1 = getProjectHash('/project/a');
  const h2 = getProjectHash('/project/b');
  assert.notEqual(h1, h2);
});

test('getDefaultProvider: returns "claude" when no config file exists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proj-home-'));
  const provider = await getDefaultProvider(dir);
  assert.equal(provider, 'claude');
});

test('getDefaultProvider: returns configured provider from config.yml', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proj-home-'));
  await mkdir(path.join(dir, '.aloop'), { recursive: true });
  await writeFile(path.join(dir, '.aloop', 'config.yml'), 'default_provider: gemini\n', 'utf8');
  const provider = await getDefaultProvider(dir);
  assert.equal(provider, 'gemini');
});

test('getDefaultProvider: returns "claude" when default_provider is empty string', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proj-home-'));
  await mkdir(path.join(dir, '.aloop'), { recursive: true });
  await writeFile(path.join(dir, '.aloop', 'config.yml'), 'default_provider: \n', 'utf8');
  const provider = await getDefaultProvider(dir);
  assert.equal(provider, 'claude');
});

test('resolveWorkspace: returns expected shape with config_exists=false', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'ws-test-'));
  const homeDir = path.join(tmpRoot, 'home');
  await mkdir(path.join(homeDir, '.aloop'), { recursive: true });
  const projectRoot = path.join(tmpRoot, 'project');
  await mkdir(projectRoot, { recursive: true });

  const result = await resolveWorkspace({ homeDir, projectRoot });

  assert.ok(result.project);
  assert.ok(result.setup);
  assert.equal(typeof result.project.hash, 'string');
  assert.equal(result.project.hash.length, 8);
  assert.equal(result.setup.config_exists, false);
  assert.equal(result.setup.default_provider, 'claude');
});

test('resolveWorkspace: config_exists=true when config.yml is present', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'ws-test-'));
  const homeDir = path.join(tmpRoot, 'home');
  const projectRoot = path.join(tmpRoot, 'project');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(path.join(homeDir, '.aloop'), { recursive: true });

  const hash = getProjectHash(projectRoot);
  const projectDir = path.join(homeDir, '.aloop', 'projects', hash);
  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, 'config.yml'), 'max_iterations: 10\n', 'utf8');

  const result = await resolveWorkspace({ homeDir, projectRoot });
  assert.equal(result.setup.config_exists, true);
});
