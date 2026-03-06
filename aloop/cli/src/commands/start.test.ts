import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { startCommandWithDeps, type StartCommandOptions } from './start.js';
import type { DiscoveryResult } from './project.js';

interface SpawnRecord {
  command: string;
  args: string[];
}

async function setupWorkspace(prefix: string): Promise<{ root: string; homeDir: string; projectRoot: string; discovery: DiscoveryResult }> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, 'home');
  const projectRoot = path.join(root, 'repo');
  const projectHash = 'abc12345';
  const projectDir = path.join(homeDir, '.aloop', 'projects', projectHash);
  const promptsDir = path.join(projectDir, 'prompts');

  await mkdir(projectRoot, { recursive: true });
  await mkdir(promptsDir, { recursive: true });
  await mkdir(path.join(homeDir, '.aloop', 'bin'), { recursive: true });
  await writeFile(path.join(homeDir, '.aloop', 'bin', 'loop.sh'), '#!/bin/sh\nexit 0\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_plan.md'), '# plan\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_build.md'), '# build\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_review.md'), '# review\n', 'utf8');
  await writeFile(path.join(promptsDir, 'PROMPT_steer.md'), '# steer\n', 'utf8');

  const discovery: DiscoveryResult = {
    project: {
      root: projectRoot,
      name: 'Demo Project',
      hash: projectHash,
      is_git_repo: true,
      git_branch: 'main',
    },
    setup: {
      project_dir: projectDir,
      config_path: path.join(projectDir, 'config.yml'),
      config_exists: true,
      templates_dir: path.join(homeDir, '.aloop', 'templates'),
    },
    context: {
      detected_language: 'node-typescript',
      language_confidence: 'high',
      language_signals: ['package.json'],
      validation_presets: {
        tests_only: ['npm test'],
        tests_and_types: ['npm run typecheck', 'npm test'],
        full: ['npm run typecheck', 'npm test'],
      },
      spec_candidates: ['SPEC.md'],
      reference_candidates: ['README.md'],
      context_files: {
        'TODO.md': true,
        'RESEARCH.md': false,
        'REVIEW_LOG.md': false,
        'STEERING.md': false,
      },
    },
    providers: {
      installed: ['claude', 'codex'],
      missing: ['gemini', 'copilot'],
      default_provider: 'claude',
      default_models: {
        claude: 'opus',
        codex: 'gpt-5.3-codex',
        gemini: 'gemini-3.1-pro-preview',
        copilot: 'gpt-5.3-codex',
      },
      round_robin_default: ['claude', 'codex', 'gemini', 'copilot'],
    },
    discovered_at: new Date().toISOString(),
  };

  return { root, homeDir, projectRoot, discovery };
}

test('startCommandWithDeps errors when project config is missing', async () => {
  const fixture = await setupWorkspace('aloop-start-missing-config-');
  fixture.discovery.setup.config_exists = false;

  const options: StartCommandOptions = { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot };
  await assert.rejects(
    () =>
      startCommandWithDeps(options, {
        discoverWorkspace: async () => fixture.discovery,
        readFile,
        writeFile,
        mkdir,
        cp: async () => undefined,
        existsSync,
        spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
        spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
        platform: 'linux',
        env: process.env,
        now: () => new Date('2026-03-01T12:34:56.000Z'),
      }),
    /No Aloop configuration found/i,
  );
});

test('startCommandWithDeps bootstraps in-place session and registers active map', async () => {
  const fixture = await setupWorkspace('aloop-start-in-place-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'codex'",
      "mode: 'plan-build'",
      'max_iterations: 77',
      'max_stuck: 9',
      'enabled_providers:',
      "  - 'codex'",
      "  - 'claude'",
      'round_robin_order:',
      "  - 'codex'",
      "  - 'claude'",
      'models:',
      "  codex: 'gpt-5.3-codex'",
      "  claude: 'opus'",
      '',
    ].join('\n'),
    'utf8',
  );

  const launchCalls: SpawnRecord[] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
        const content = await readFile(path.join(src, 'PROMPT_plan.md'), 'utf8');
        await writeFile(path.join(dest, 'PROMPT_plan.md'), content, 'utf8');
      },
      existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 4242, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.session_id, 'demo-project-20260301-123456');
  assert.equal(result.worktree, false);
  assert.equal(result.work_dir, fixture.projectRoot);
  assert.equal(result.provider, 'codex');
  assert.equal(result.mode, 'plan-build');
  assert.equal(result.max_iterations, 77);
  assert.equal(result.max_stuck, 9);
  assert.equal(result.pid, 4242);
  assert.equal(launchCalls.length, 1);
  assert.equal(launchCalls[0].command, path.join(fixture.homeDir, '.aloop', 'bin', 'loop.sh'));
  assert.equal(launchCalls[0].args.includes('--provider'), true);
  assert.equal(launchCalls[0].args.includes('codex'), true);
  assert.equal(launchCalls[0].args.includes('--max-iterations'), true);
  assert.equal(launchCalls[0].args.includes('77'), true);

  const meta = JSON.parse(await readFile(path.join(result.session_dir, 'meta.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(meta.provider, 'codex');
  assert.equal(meta.worktree, false);
  assert.equal(meta.pid, 4242);

  const status = JSON.parse(await readFile(path.join(result.session_dir, 'status.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(status.state, 'starting');

  const active = JSON.parse(await readFile(path.join(fixture.homeDir, '.aloop', 'active.json'), 'utf8')) as Record<string, any>;
  assert.ok(active[result.session_id]);
  assert.equal(active[result.session_id].pid, 4242);
  assert.equal(active[result.session_id].work_dir, fixture.projectRoot);
});

test('startCommandWithDeps falls back to in-place when git worktree add fails', async () => {
  const fixture = await setupWorkspace('aloop-start-worktree-fallback-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan-build-review'",
      'worktree_default: true',
      'enabled_providers:',
      "  - 'claude'",
      '',
    ].join('\n'),
    'utf8',
  );

  const gitCalls: string[][] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
        const content = await readFile(path.join(src, 'PROMPT_plan.md'), 'utf8');
        await writeFile(path.join(dest, 'PROMPT_plan.md'), content, 'utf8');
      },
      existsSync,
      spawn: (() => ({ pid: 2222, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        if (command === 'git') {
          gitCalls.push([...args]);
          return { status: 1, stdout: '', stderr: 'branch already exists' } as any;
        }
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'linux',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(gitCalls.length, 1);
  assert.equal(result.worktree, false);
  assert.equal(result.worktree_path, null);
  assert.equal(result.work_dir, fixture.projectRoot);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /falling back to in-place/i);
});

test('startCommandWithDeps rejects conflicting mode flags', async () => {
  const fixture = await setupWorkspace('aloop-start-flag-conflict-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, plan: true, build: true },
        {
          discoverWorkspace: async () => fixture.discovery,
          readFile,
          writeFile,
          mkdir,
          cp: async () => undefined,
          existsSync,
          spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
          platform: 'linux',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
        },
      ),
    /at most one of --plan, --build, or --review/i,
  );
});
