import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export interface UpdateCommandOptions {
  repoRoot?: string;
  homeDir?: string;
  output?: 'json' | 'text';
}

export interface UpdateResult {
  success: boolean;
  repoRoot: string;
  aloopDir: string;
  commit: string;
  installedAt: string;
  updated: string[];
  errors: string[];
}

interface UpdateDeps {
  homeDir: () => string;
  existsSync: (p: string) => boolean;
  readdir: typeof fsp.readdir;
  mkdir: typeof fsp.mkdir;
  copyFile: typeof fsp.copyFile;
  writeFile: typeof fsp.writeFile;
  chmod: typeof fsp.chmod;
  spawnSync: (cmd: string, args: string[], opts: { encoding: string }) => { status: number | null; stdout: string; stderr: string };
}

const defaultDeps: UpdateDeps = {
  homeDir: () => os.homedir(),
  existsSync: fs.existsSync,
  readdir: fsp.readdir,
  mkdir: fsp.mkdir,
  copyFile: fsp.copyFile,
  writeFile: fsp.writeFile,
  chmod: fsp.chmod,
  spawnSync: spawnSync as unknown as UpdateDeps['spawnSync'],
};

/**
 * Recursively copy a directory tree, creating directories as needed.
 * Returns list of destination paths written.
 */
async function copyTree(src: string, dest: string, deps: UpdateDeps): Promise<string[]> {
  const written: string[] = [];
  if (!deps.existsSync(src)) return written;

  const stat = fs.statSync(src);
  if (!stat.isDirectory()) {
    await deps.mkdir(path.dirname(dest), { recursive: true });
    await deps.copyFile(src, dest);
    written.push(dest);
    return written;
  }

  const entries = await deps.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const sub = await copyTree(srcPath, destPath, deps);
      written.push(...sub);
    } else {
      await deps.mkdir(path.dirname(destPath), { recursive: true });
      await deps.copyFile(srcPath, destPath);
      written.push(destPath);
    }
  }
  return written;
}

/**
 * Find repo root by walking up from startDir looking for install.ps1 + aloop/ dir.
 */
function findRepoRoot(startDir: string, deps: UpdateDeps): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (
      deps.existsSync(path.join(dir, 'install.ps1')) &&
      deps.existsSync(path.join(dir, 'aloop', 'bin'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function executeUpdate(
  options: UpdateCommandOptions = {},
  deps: UpdateDeps = defaultDeps,
): Promise<UpdateResult> {
  const homeDir = options.homeDir || deps.homeDir();
  const aloopDir = path.join(homeDir, '.aloop');

  // Find repo root
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : findRepoRoot(process.cwd(), deps);

  if (!repoRoot) {
    return {
      success: false,
      repoRoot: '',
      aloopDir,
      commit: '',
      installedAt: '',
      updated: [],
      errors: ['Could not find aloop source repository. Run from within the repo or use --repo-root.'],
    };
  }

  // Verify repo structure
  const requiredPaths = ['aloop/bin', 'aloop/cli', 'aloop/templates'];
  const missing = requiredPaths.filter((p) => !deps.existsSync(path.join(repoRoot, p)));
  if (missing.length > 0) {
    return {
      success: false,
      repoRoot,
      aloopDir,
      commit: '',
      installedAt: '',
      updated: [],
      errors: [`Missing expected directories in repo: ${missing.join(', ')}`],
    };
  }

  const updated: string[] = [];
  const errors: string[] = [];

  // 1. Copy bin/ (loop.ps1, loop.sh)
  try {
    const binFiles = await copyTree(
      path.join(repoRoot, 'aloop', 'bin'),
      path.join(aloopDir, 'bin'),
      deps,
    );
    updated.push(...binFiles);

    // Set executable bit for .sh files or files without extension in bin/
    if (os.platform() !== 'win32') {
      for (const f of binFiles) {
        if (f.endsWith('.sh') || !path.basename(f).includes('.')) {
          await deps.chmod(f, 0o755);
        }
      }
    }
  } catch (e: any) {
    errors.push(`bin: ${e.message}`);
  }

  // 2. Copy config.yml
  try {
    const configSrc = path.join(repoRoot, 'aloop', 'config.yml');
    const configDest = path.join(aloopDir, 'config.yml');
    if (deps.existsSync(configSrc)) {
      await deps.mkdir(path.dirname(configDest), { recursive: true });
      await deps.copyFile(configSrc, configDest);
      updated.push(configDest);
    }
  } catch (e: any) {
    errors.push(`config: ${e.message}`);
  }

  // 3. Copy templates/
  try {
    const tmplFiles = await copyTree(
      path.join(repoRoot, 'aloop', 'templates'),
      path.join(aloopDir, 'templates'),
      deps,
    );
    updated.push(...tmplFiles);
  } catch (e: any) {
    errors.push(`templates: ${e.message}`);
  }

  // 4. Copy cli/dist/
  try {
    const distFiles = await copyTree(
      path.join(repoRoot, 'aloop', 'cli', 'dist'),
      path.join(aloopDir, 'cli', 'dist'),
      deps,
    );
    updated.push(...distFiles);
  } catch (e: any) {
    errors.push(`cli/dist: ${e.message}`);
  }

  // 5. Copy cli/lib/
  try {
    const libFiles = await copyTree(
      path.join(repoRoot, 'aloop', 'cli', 'lib'),
      path.join(aloopDir, 'cli', 'lib'),
      deps,
    );
    updated.push(...libFiles);
  } catch (e: any) {
    errors.push(`cli/lib: ${e.message}`);
  }

  // 6. Copy cli/aloop.mjs
  try {
    const entrySrc = path.join(repoRoot, 'aloop', 'cli', 'aloop.mjs');
    const entryDest = path.join(aloopDir, 'cli', 'aloop.mjs');
    if (deps.existsSync(entrySrc)) {
      await deps.mkdir(path.dirname(entryDest), { recursive: true });
      await deps.copyFile(entrySrc, entryDest);
      updated.push(entryDest);
    }
  } catch (e: any) {
    errors.push(`cli/aloop.mjs: ${e.message}`);
  }

  // 7. Create CLI shims
  try {
    const binDir = path.join(aloopDir, 'bin');
    await deps.mkdir(binDir, { recursive: true });

    const cmdShimPath = path.join(binDir, 'aloop.cmd');
    const cmdShimContent = '@echo off\nnode "%~dp0..\\cli\\aloop.mjs" %*\n';
    await deps.writeFile(cmdShimPath, cmdShimContent, 'utf8');
    updated.push(cmdShimPath);

    const shShimPath = path.join(binDir, 'aloop');
    const shShimContent = '#!/bin/sh\nexec node "$(dirname "$0")/../cli/aloop.mjs" "$@"\n';
    await deps.writeFile(shShimPath, shShimContent, 'utf8');
    updated.push(shShimPath);

    if (os.platform() !== 'win32') {
      await deps.chmod(shShimPath, 0o755);
    }
  } catch (e: any) {
    errors.push(`shims: ${e.message}`);
  }

  // 8. Create runtime directories
  for (const sub of ['projects', 'sessions']) {
    const dir = path.join(aloopDir, sub);
    try {
      await deps.mkdir(dir, { recursive: true });
    } catch {
      // ignore — already exists
    }
  }

  // 9. Version stamp
  let commit = '';
  const installedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    const gitResult = deps.spawnSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    });
    if (gitResult.status === 0) {
      commit = gitResult.stdout.trim();
    }
  } catch {
    // no git — commit stays empty
  }
  const versionJson = JSON.stringify({ commit, installed_at: installedAt });
  try {
    await deps.writeFile(path.join(aloopDir, 'version.json'), versionJson, 'utf8');
  } catch (e: any) {
    errors.push(`version.json: ${e.message}`);
  }

  return {
    success: errors.length === 0,
    repoRoot,
    aloopDir,
    commit,
    installedAt,
    updated,
    errors,
  };
}

export async function updateCommand(options: UpdateCommandOptions = {}): Promise<void> {
  const outputMode = options.output || 'text';
  const result = await executeUpdate(options);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exit(1);
    return;
  }

  if (!result.success) {
    for (const err of result.errors) {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }

  const versionLabel = result.commit
    ? `${result.commit} (${result.installedAt})`
    : result.installedAt;
  console.log(`Updated ~/.aloop from ${result.repoRoot}`);
  console.log(`Version: ${versionLabel}`);
  console.log(`Files updated: ${result.updated.length}`);
}
