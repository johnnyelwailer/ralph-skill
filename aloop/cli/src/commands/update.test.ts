import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import { existsSync, statSync, type PathLike } from 'node:fs';
import { executeUpdate } from './update.js';

const realCopyFile = (await import('node:fs/promises')).copyFile;
const realWriteFile = (await import('node:fs/promises')).writeFile;

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
        existsSync: (targetPath: string) => {
          // Keep this test deterministic even when TMPDIR is inside this repository.
          if (targetPath.endsWith(path.join('install.ps1'))) return false;
          if (targetPath.endsWith(path.join('aloop', 'bin'))) return false;
          return existsSync(targetPath);
        },
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

test('executeUpdate uses homeDir from deps when options.homeDir not provided', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-homedir-');

  const result = await executeUpdate(
    { repoRoot },
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
  assert.ok(existsSync(path.join(homeDir, '.aloop', 'version.json')));
});

test('executeUpdate reports config copy failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-configfail-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: async (src: PathLike, _dest: PathLike) => {
        if (String(src).includes('config.yml')) throw new Error('disk full');
        return realCopyFile(src, _dest);
      },
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('config') && e.includes('disk full')));
});

test('executeUpdate reports templates copy failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-tmplfail-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: async (src: PathLike, _dest: PathLike) => {
        if (String(src).includes('templates')) throw new Error('permission denied');
        return realCopyFile(src, _dest);
      },
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('templates') && e.includes('permission denied')));
});

test('executeUpdate reports cli/dist copy failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-distfail-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: async (src: PathLike, _dest: PathLike) => {
        if (String(src).includes('cli' + path.sep + 'dist')) throw new Error('ENOENT');
        return realCopyFile(src, _dest);
      },
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('cli/dist') && e.includes('ENOENT')));
});

test('executeUpdate reports cli/lib copy failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-libfail-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: async (src: PathLike, _dest: PathLike) => {
        if (String(src).includes('cli' + path.sep + 'lib')) throw new Error('lib error');
        return realCopyFile(src, _dest);
      },
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('cli/lib') && e.includes('lib error')));
});

test('executeUpdate reports aloop.mjs copy failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-mjsfail-');

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: async (src: PathLike, _dest: PathLike) => {
        if (String(src).endsWith('aloop.mjs')) throw new Error('mjs error');
        return realCopyFile(src, _dest);
      },
      writeFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('cli/aloop.mjs') && e.includes('mjs error')));
});

test('executeUpdate reports shims write failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-shimfail-');

  const mockWriteFile: typeof writeFile = async (p, _content, _enc) => {
    if (String(p).includes('aloop.cmd') || String(p).endsWith(path.sep + 'aloop')) throw new Error('shim write failed');
    return realWriteFile(p, _content as string, _enc as BufferEncoding);
  };

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: realCopyFile,
      writeFile: mockWriteFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('shims') && e.includes('shim write failed')));
});

test('executeUpdate reports version.json write failure', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-verfail-');

  const mockWriteFile: typeof writeFile = async (p, _content, _enc) => {
    if (String(p).includes('version.json')) throw new Error('version write failed');
    return realWriteFile(p, _content as string, _enc as BufferEncoding);
  };

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: realCopyFile,
      writeFile: mockWriteFile,
      chmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('version.json') && e.includes('version write failed')));
});

test('executeUpdate handles chmod failure gracefully', async () => {
  const { repoRoot, homeDir } = await setupFakeRepo('aloop-update-chmodfail-');

  const mockChmod: typeof chmod = async (_p, _mode) => { throw new Error('chmod denied'); };

  const result = await executeUpdate(
    { repoRoot, homeDir },
    {
      homeDir: () => homeDir,
      existsSync,
      readdir,
      mkdir,
      copyFile: realCopyFile,
      writeFile: realWriteFile,
      chmod: mockChmod,
      spawnSync: () => ({ status: 0, stdout: 'abc1234\n', stderr: '', pid: 0, output: [], signal: null }),
    },
  );

  assert.equal(result.success, false);
  assert.ok(result.errors.some((e) => e.includes('bin:') && e.includes('chmod denied')));
});
