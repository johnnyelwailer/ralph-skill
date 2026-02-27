import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readYamlFile } from './config.mjs';

function normalizeAbsolutePath(value) {
  return path.resolve(value).replace(/[\\/]+$/, '');
}

export function resolveHomeDir(explicitHomeDir) {
  return normalizeAbsolutePath(explicitHomeDir ?? os.homedir());
}

export function resolveProjectRoot(explicitProjectRoot) {
  const startDir = normalizeAbsolutePath(explicitProjectRoot ?? process.cwd());
  const gitResult = spawnSync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });

  if (gitResult.status === 0) {
    const resolved = (gitResult.stdout || '').trim();
    if (resolved) {
      return normalizeAbsolutePath(resolved);
    }
  }

  return startDir;
}

export function getProjectHash(projectRoot) {
  const normalized = normalizeAbsolutePath(projectRoot).toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

export async function getDefaultProvider(homeDir) {
  const configPath = path.join(homeDir, '.aloop', 'config.yml');
  const config = await readYamlFile(configPath);
  const configured = typeof config?.default_provider === 'string' ? config.default_provider.trim() : '';
  return configured || 'claude';
}

export async function resolveWorkspace(options = {}) {
  const homeDir = resolveHomeDir(options.homeDir);
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const projectHash = getProjectHash(projectRoot);
  const projectDir = path.join(homeDir, '.aloop', 'projects', projectHash);

  const provider = await getDefaultProvider(homeDir);
  const configPath = path.join(projectDir, 'config.yml');

  return {
    project: {
      root: projectRoot,
      name: path.basename(projectRoot),
      hash: projectHash,
    },
    setup: {
      project_dir: projectDir,
      config_path: configPath,
      config_exists: existsSync(configPath),
      templates_dir: path.join(homeDir, '.aloop', 'templates'),
      default_provider: provider,
    },
  };
}
