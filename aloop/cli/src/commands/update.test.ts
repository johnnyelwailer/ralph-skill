import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { executeUpdate } from './update.js';

async function setupFakeRepo(prefix: string) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  const repoRoot = path.join(tempRoot, 'repo');
  const homeDir = path.join(tempRoot, 'home');

  // Create fake repo structure
  await mkdir(path.join(repoRoot, 'aloop', 'bin'), { recursive: true });
  await mkdir(path.join(repoRoot, 'aloop', 'cli', 'dist'), { recursive: true });
  await mkdir(path.join(repoRoot, 'aloop', 'cli', 'lib'), { recursive: true });
  await mkdir(path.join(repoRoot, 'aloop', 'templates'), { recursive: true });

  await writeFile(path.join(repoRoot, 'install.ps1'), '# fake installer', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'bin', 'loop.ps1'), '# loop ps1', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'bin', 'loop.sh'), '# loop sh', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'config.yml'), 'mode: plan-build-review', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'cli', 'aloop.mjs'), '#!/usr/bin/env node', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'cli', 'dist', 'index.js'), '// dist', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'cli', 'lib', 'session.mjs'), '// lib', 'utf8');
  await writeFile(path.join(repoRoot, 'aloop', 'templates', 'PROMPT_plan.md'), '# plan', 'utf8');

  // Create home dir
  await mkdir(homeDir, { recursive: true });

  return { tempRoot, repoRoot, homeDir };
}

test('executeUpdate copies runtime assets to ~/.aloop', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-basic-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: (await import('node:fs/promises')).copyFile,
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.repoRoot, repoRoot);
  assert.equal(result.commit, 'abc1234');
  assert.ok(result.updated.length > 0);
  assert.equal(result.errors.length, 0);

  // Verify files were copied
  const aloopDir = path.join(homeDir, '.aloop');
  assert.ok(existsSync(path.join(aloopDir, 'bin', 'loop.ps1')));
  assert.ok(existsSync(path.join(aloopDir, 'bin', 'loop.sh')));
  assert.ok(existsSync(path.join(aloopDir, 'config.yml')));
  assert.ok(existsSync(path.join(aloopDir, 'cli', 'aloop.mjs')));
  assert.ok(existsSync(path.join(aloopDir, 'cli', 'dist', 'index.js')));
  assert.ok(existsSync(path.join(aloopDir, 'cli', 'lib', 'session.mjs')));
  assert.ok(existsSync(path.join(aloopDir, 'templates', 'PROMPT_plan.md')));

  // Verify shims
  assert.ok(existsSync(path.join(aloopDir, 'bin', 'aloop.cmd')));
  assert.ok(existsSync(path.join(aloopDir, 'bin', 'aloop')));

  // Verify permissions on Unix-like systems
  if (os.platform() !== 'win32') {
    const loopShStat = statSync(path.join(aloopDir, 'bin', 'loop.sh'));
    assert.equal(loopShStat.mode & 0o777, 0o755, 'loop.sh should be 755');
    
    const shimStat = statSync(path.join(aloopDir, 'bin', 'aloop'));
    assert.equal(shimStat.mode & 0o777, 0o755, 'aloop shim should be 755');
  }

  // Verify version.json
  const versionRaw = await readFile(path.join(aloopDir, 'version.json'), 'utf8');
  const version = JSON.parse(versionRaw);
  assert.equal(version.commit, 'abc1234');
  assert.ok(version.installed_at);

  // Verify runtime dirs created
  assert.ok(existsSync(path.join(aloopDir, 'sessions')));
  assert.ok(existsSync(path.join(aloopDir, 'projects')));
});

test('executeUpdate fails when repo root not found', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-update-norepo-'));
  const homeDir = path.join(tempRoot, 'home');
  await mkdir(homeDir, { recursive: true });

  // Save and restore cwd
  const origCwd = process.cwd();
  process.chdir(tempRoot);
  try {
    const result = await executeUpdate(
      { homeDir },
      {
        homeDir: () => homeDir,
        existsSync,
        readdir,
        mkdir,
        copyFile: (await import('node:fs/promises')).copyFile,
        writeFile,
        chmod,
        spawnSync: () => ({ status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null }),
      },
    );
    assert.equal(result.success, false);
    assert.ok(result.errors[0].includes('Could not find'));
  } finally {
    process.chdir(origCwd);
  }
});

test('executeUpdate fails when repo structure is incomplete', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-update-incomplete-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const homeDir = path.join(tempRoot, 'home');

  // Create partial structure (missing templates)
  await mkdir(path.join(repoRoot, 'aloop', 'bin'), { recursive: true });
  await mkdir(path.join(repoRoot, 'aloop', 'cli'), { recursive: true });
  await writeFile(path.join(repoRoot, 'install.ps1'), '# fake', 'utf8');
  await mkdir(homeDir, { recursive: true });

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: (await import('node:fs/promises')).copyFile,
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors[0].includes('Missing expected directories'));
});

test('executeUpdate works with empty git commit (no git)', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-nogit-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: (await import('node:fs/promises')).copyFile,
      writeFile,
      chmod,
      spawnSync: () => ({ status: 1, stdout: '', stderr: 'not a git repo', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.commit, '');

  const versionRaw = await readFile(path.join(homeDir, '.aloop', 'version.json'), 'utf8');
  const version = JSON.parse(versionRaw);
  assert.equal(version.commit, '');
});

test('executeUpdate json output includes all fields', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-json-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: (await import('node:fs/promises')).copyFile,
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'def5678\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.repoRoot, 'string');
  assert.equal(typeof result.aloopDir, 'string');
  assert.equal(typeof result.commit, 'string');
  assert.equal(typeof result.installedAt, 'string');
  assert.ok(Array.isArray(result.updated));
  assert.ok(Array.isArray(result.errors));
});
