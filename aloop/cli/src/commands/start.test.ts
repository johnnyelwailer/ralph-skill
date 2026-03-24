import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { startCommandWithDeps, normalizeGitBashPathForWindows, resolveStartDeps, type StartCommandOptions } from './start.js';
import type { DiscoveryResult } from './project.js';

interface SpawnRecord {
  command: string;
  args: string[];
  cwd?: string;
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
    devcontainer: {
      enabled: false,
      config_path: null,
    },
    spec_complexity: { workstream_count: 1, parallelism_score: 0, estimated_issue_count: 1, analyzed_files: 1 },
    ci_support: { has_workflows: false, workflow_count: 0, workflow_types: [] },
    mode_recommendation: { recommended_mode: 'loop', reasoning: ['Recommendation: loop mode'] },
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
        nodePath: '/usr/bin/node',
        aloopPath: '/usr/local/bin/aloop',
        env: process.env,
        now: () => new Date('2026-03-01T12:34:56.000Z'),
      }),
    /No Aloop configuration found/i,
  );
});

test('startCommandWithDeps succeeds when only global config exists (no project config)', async () => {
  const fixture = await setupWorkspace('aloop-start-global-config-');
  fixture.discovery.setup.config_exists = false;

  // Write global config instead of project config
  const globalConfigPath = path.join(fixture.homeDir, '.aloop', 'config.yml');
  await writeFile(
    globalConfigPath,
    [
      "default_provider: 'claude'",
      "default_mode: 'plan-build-review'",
      'enabled_providers:',
      "  - 'claude'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

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
        return { pid: 4242, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.ok(result.session_id, 'should bootstrap session with global config only');
  assert.strictEqual(result.provider, 'claude', 'should pick provider from global config');
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
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
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
  assert.equal(result.monitor_mode, 'none');
  assert.equal(result.monitor_auto_open, false);
  assert.equal(result.dashboard_url, null);
  assert.equal(result.monitor_pid, null);
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

test('startCommandWithDeps rejects --max-iterations 0 instead of silently defaulting', async () => {
  const fixture = await setupWorkspace('aloop-start-max-iterations-zero-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'codex'",
      "mode: 'plan-build'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true, maxIterations: '0' },
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
          spawn: (() => ({ pid: 4242, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
          platform: 'linux',
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
        },
      ),
    /Invalid --max-iterations value: 0/i,
  );
});

test('startCommandWithDeps accepts opencode provider with OpenRouter model path', async () => {
  const fixture = await setupWorkspace('aloop-start-opencode-openrouter-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'opencode'",
      "mode: 'build'",
      'enabled_providers:',
      "  - 'opencode'",
      'models:',
      "  opencode: 'openrouter/anthropic/claude-sonnet-4.6'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
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
        await writeFile(path.join(dest, 'PROMPT_build.md'), await readFile(path.join(src, 'PROMPT_build.md'), 'utf8'), 'utf8');
      },
      existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 4245, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.provider, 'opencode');
  assert.equal(launchCalls.length, 1);
  assert.equal(launchCalls[0].args.includes('--provider'), true);
  assert.equal(launchCalls[0].args.includes('opencode'), true);

  const prompt = await readFile(path.join(result.prompts_dir, 'PROMPT_build.md'), 'utf8');
  assert.match(prompt, /provider:\s+opencode/);
  assert.match(prompt, /model:\s+openrouter\/anthropic\/claude-sonnet-4\.6/);
});

test('startCommandWithDeps rejects invalid OpenRouter model path', async () => {
  const fixture = await setupWorkspace('aloop-start-opencode-openrouter-invalid-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'opencode'",
      "mode: 'build'",
      'enabled_providers:',
      "  - 'opencode'",
      'models:',
      "  opencode: 'openrouter/anthropic/claude/sonnet'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
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
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
        },
      ),
    /Invalid OpenRouter model path/i,
  );
});

test('startCommandWithDeps accepts legacy config mode loop as plan-build-review', async () => {
  const fixture = await setupWorkspace('aloop-start-legacy-loop-mode-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'loop'",
      'enabled_providers:',
      "  - 'claude'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

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
      spawn: (() => ({ pid: 3141, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.mode, 'plan-build-review');
});

test('startCommandWithDeps accepts --mode loop as plan-build-review', async () => {
  const fixture = await setupWorkspace('aloop-start-cli-loop-mode-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan'",
      'enabled_providers:',
      "  - 'claude'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true, mode: 'loop' },
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
      spawn: (() => ({ pid: 4243, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.mode, 'plan-build-review');
});

test('startCommandWithDeps accepts --mode single', async () => {
  const fixture = await setupWorkspace('aloop-start-cli-single-mode-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan'",
      'enabled_providers:',
      "  - 'claude'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  const launchCalls: SpawnRecord[] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true, mode: 'single' },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
        const planContent = await readFile(path.join(src, 'PROMPT_plan.md'), 'utf8');
        await writeFile(path.join(dest, 'PROMPT_plan.md'), planContent, 'utf8');
        await writeFile(path.join(dest, 'PROMPT_single.md'), '# Single Mode\n', 'utf8');
      },
      existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 4244, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.mode, 'single');
  assert.equal(launchCalls.length, 1);
  const modeIndex = launchCalls[0].args.indexOf('--mode');
  assert.ok(modeIndex > -1, 'Expected --mode arg');
  assert.equal(launchCalls[0].args[modeIndex + 1], 'single');

  const loopPlan = JSON.parse(await readFile(path.join(result.session_dir, 'loop-plan.json'), 'utf8')) as { cycle: string[] };
  assert.ok(loopPlan.cycle.includes('PROMPT_single.md'));
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
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
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
  assert.equal(result.monitor_mode, 'none');
  assert.equal(result.dashboard_url, null);
  assert.equal(result.monitor_pid, null);
});

test('startCommandWithDeps normalizes Git Bash work paths before launching loop.ps1 on Windows', async () => {
  const fixture = await setupWorkspace('aloop-start-win32-path-normalization-');
  await writeFile(path.join(fixture.homeDir, '.aloop', 'bin', 'loop.ps1'), '# noop\n', 'utf8');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan-build-review'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  fixture.discovery.project.root = '/c/Users/pj/demo-repo';

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
      spawn: ((command: string, args?: readonly string[], options?: { cwd?: string }) => {
        launchCalls.push({ command, args: [...(args ?? [])], cwd: options?.cwd });
        return { pid: 6161, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'win32',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.work_dir, '/c/Users/pj/demo-repo');
  assert.equal(launchCalls.length, 1);
  assert.equal(launchCalls[0].command, 'pwsh');
  const workDirArgIndex = launchCalls[0].args.indexOf('-WorkDir');
  assert.equal(workDirArgIndex > -1, true);
  assert.equal(launchCalls[0].args[workDirArgIndex + 1], 'C:\\Users\\pj\\demo-repo');
  assert.equal(launchCalls[0].cwd, 'C:\\Users\\pj\\demo-repo');
});

test('startCommandWithDeps launches dashboard monitor and opens browser when on_start.dashboard is enabled', async () => {
  const fixture = await setupWorkspace('aloop-start-dashboard-monitor-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan-build-review'",
      'on_start:',
      "  monitor: 'dashboard'",
      '  auto_open: true',
      '',
    ].join('\n'),
    'utf8',
  );

  const spawnCalls: SpawnRecord[] = [];
  const syncCalls: SpawnRecord[] = [];
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
        const call = { command, args: [...(args ?? [])] };
        spawnCalls.push(call);
        const isDashboard = call.args.includes('dashboard');
        return { pid: isDashboard ? 3131 : 2121, unref() {} } as any;
      }) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.monitor_mode, 'dashboard');
  assert.equal(result.monitor_auto_open, true);
  assert.equal(result.monitor_pid, 3131);
  assert.match(result.dashboard_url ?? '', /^http:\/\/localhost:\d+$/);
  assert.equal(result.warnings.length, 0);
  assert.equal(spawnCalls.length, 2);
  assert.equal(spawnCalls[1].command, '/usr/bin/node');
  assert.equal(spawnCalls[1].args[0], '/usr/local/bin/aloop');
  assert.equal(spawnCalls[1].args[1], 'dashboard');
  const portIndex = spawnCalls[1].args.indexOf('--port');
  assert.equal(portIndex > -1, true);
  assert.equal(result.dashboard_url, `http://localhost:${spawnCalls[1].args[portIndex + 1]}`);
  assert.equal(syncCalls.some((call) => call.command === 'xdg-open'), true);
});

test('startCommandWithDeps launches terminal monitor when on_start.terminal is enabled', async () => {
  const fixture = await setupWorkspace('aloop-start-terminal-monitor-');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'claude'",
      "mode: 'plan-build-review'",
      'on_start:',
      "  monitor: 'terminal'",
      '  auto_open: true',
      '',
    ].join('\n'),
    'utf8',
  );

  const syncCalls: SpawnRecord[] = [];
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
      spawn: (() => ({ pid: 5151, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.monitor_mode, 'terminal');
  assert.equal(result.monitor_auto_open, true);
  assert.equal(result.monitor_pid, null);
  assert.equal(result.dashboard_url, null);
  assert.equal(result.warnings.length, 0);
  assert.equal(syncCalls.some((call) => call.command === 'x-terminal-emulator'), true);
});

test('normalizeGitBashPathForWindows passes through non-POSIX Windows paths unchanged', () => {
  assert.equal(normalizeGitBashPathForWindows('C:\\repo\\work'), 'C:\\repo\\work');
  assert.equal(normalizeGitBashPathForWindows('D:\\Users\\pj\\project'), 'D:\\Users\\pj\\project');
  assert.equal(normalizeGitBashPathForWindows('relative/path'), 'relative/path');
  assert.equal(normalizeGitBashPathForWindows(''), '');
  assert.equal(normalizeGitBashPathForWindows('\\\\server\\share'), '\\\\server\\share');
});

test('normalizeGitBashPathForWindows converts drive-root paths', () => {
  assert.equal(normalizeGitBashPathForWindows('/c'), 'C:\\');
  assert.equal(normalizeGitBashPathForWindows('/c/'), 'C:\\');
  assert.equal(normalizeGitBashPathForWindows('/D'), 'D:\\');
  assert.equal(normalizeGitBashPathForWindows('/d/'), 'D:\\');
  assert.equal(normalizeGitBashPathForWindows('/c/Users/pj/repo'), 'C:\\Users\\pj\\repo');
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
          },      ),
    /at most one of --plan, --build, or --review/i,
  );
});

test('startCommandWithDeps warns when installed runtime commit differs from repo HEAD', async () => {
  const fixture = await setupWorkspace('aloop-start-staleness-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\non_start:\n  monitor: 'none'\n", 'utf8');

  // Make it an aloop repo
  await writeFile(path.join(fixture.projectRoot, 'install.ps1'), 'install', 'utf8');
  await mkdir(path.join(fixture.projectRoot, 'aloop', 'bin'), { recursive: true });

  // Write version.json with an old commit
  await writeFile(
    path.join(fixture.homeDir, '.aloop', 'version.json'),
    JSON.stringify({ commit: 'old1234', installed_at: '2026-01-01T00:00:00Z' }),
    'utf8',
  );

  const spawnSyncCalls: Array<{ command: string; args: string[] }> = [];
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
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: ((command: string, args?: readonly string[]) => {
        spawnSyncCalls.push({ command, args: [...(args ?? [])] });
        // Return a different commit than what's in version.json
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'new5678\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.ok(result.warnings.some((w: string) => w.includes('stale') && w.includes('old1234')),
    `Expected a staleness warning mentioning 'old1234', got: ${result.warnings.join('; ')}`);
});

test('startCommandWithDeps does not warn when installed commit matches repo HEAD', async () => {
  const fixture = await setupWorkspace('aloop-start-no-stale-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\non_start:\n  monitor: 'none'\n", 'utf8');

  // Make it an aloop repo
  await writeFile(path.join(fixture.projectRoot, 'install.ps1'), 'install', 'utf8');
  await mkdir(path.join(fixture.projectRoot, 'aloop', 'bin'), { recursive: true });

  // Write version.json with the same commit as HEAD
  await writeFile(
    path.join(fixture.homeDir, '.aloop', 'version.json'),
    JSON.stringify({ commit: 'same123', installed_at: '2026-03-01T00:00:00Z' }),
    'utf8',
  );

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
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: ((command: string, args?: readonly string[]) => {
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'same123\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.ok(!result.warnings.some((w: string) => w.includes('stale')),
    `Expected no staleness warning, got: ${result.warnings.join('; ')}`);
});

test('startCommandWithDeps does NOT warn when versions differ but NOT in an aloop repo', async () => {
  const fixture = await setupWorkspace('aloop-start-no-warn-non-aloop-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\non_start:\n  monitor: 'none'\n", 'utf8');

  // This IS a git repo (from setupWorkspace) but NOT an aloop repo (no install.ps1/bin)

  // Write version.json with an old commit
  await writeFile(
    path.join(fixture.homeDir, '.aloop', 'version.json'),
    JSON.stringify({ commit: 'old1234', installed_at: '2026-01-01T00:00:00Z' }),
    'utf8',
  );

  const spawnSyncCalls: Array<{ command: string; args: string[] }> = [];
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
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: ((command: string, args?: readonly string[]) => {
        spawnSyncCalls.push({ command, args: [...(args ?? [])] });
        // Return a different commit than what's in version.json
        if (args && args.includes('rev-parse')) {
          return { status: 0, stdout: 'new5678\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop', // Walking up from here won't find it either
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.ok(!result.warnings.some((w: string) => w.includes('stale')),
    `Expected no staleness warning in non-aloop repo, got: ${result.warnings.join('; ')}`);
});

test('startCommandWithDeps warns when versions differ and findAloopRepoRoot resolves via aloopPath', async () => {
  const fixture = await setupWorkspace('aloop-start-stale-via-path-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\non_start:\n  monitor: 'none'\n", 'utf8');

  // The projectRoot is NOT an aloop repo
  
  // But we make another directory that IS an aloop repo and use it as aloopPath
  const sourceRepo = path.join(fixture.root, 'source-repo');
  const sourceRepoCli = path.join(sourceRepo, 'aloop', 'cli');
  await mkdir(sourceRepoCli, { recursive: true });
  await mkdir(path.join(sourceRepo, 'aloop', 'bin'), { recursive: true });
  await writeFile(path.join(sourceRepo, 'install.ps1'), 'install', 'utf8');
  
  const aloopPath = path.join(sourceRepoCli, 'aloop.mjs');

  // Write version.json with an old commit
  await writeFile(
    path.join(fixture.homeDir, '.aloop', 'version.json'),
    JSON.stringify({ commit: 'old1234', installed_at: '2026-01-01T00:00:00Z' }),
    'utf8',
  );

  const spawnSyncCalls: Array<{ command: string; args: string[] }> = [];
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
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: ((command: string, args?: readonly string[]) => {
        spawnSyncCalls.push({ command, args: [...(args ?? [])] });
        // Return a different commit than what's in version.json
        if (args && args.includes('rev-parse')) {
          // Verify that it uses sourceRepo for -C
          const cIndex = args.indexOf('-C');
          if (cIndex !== -1 && args[cIndex + 1] === sourceRepo) {
            return { status: 0, stdout: 'new5678\n', stderr: '' };
          }
        }
        return { status: 0, stdout: '', stderr: '' };
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: aloopPath,
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.ok(result.warnings.some((w: string) => w.includes('stale') && w.includes('old1234')),
    `Expected staleness warning resolving via aloopPath, got: ${result.warnings.join('; ')}`);
});

test('startCommandWithDeps defaults launch_mode to start and passes --launch-mode to loop script', async () => {
  const fixture = await setupWorkspace('aloop-start-launch-default-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
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
        return { pid: 7070, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.launch_mode, 'start');
  assert.equal(launchCalls.length, 1);
  const launchModeIdx = launchCalls[0].args.indexOf('--launch-mode');
  assert.ok(launchModeIdx > -1, 'Expected --launch-mode arg');
  assert.equal(launchCalls[0].args[launchModeIdx + 1], 'start');

  const meta = JSON.parse(await readFile(path.join(result.session_dir, 'meta.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(meta.launch_mode, 'start');
});

test('startCommandWithDeps passes resume launch mode to loop script', async () => {
  const fixture = await setupWorkspace('aloop-start-launch-resume-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const launchCalls: SpawnRecord[] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true, launch: 'resume' },
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
        return { pid: 8080, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.launch_mode, 'resume');
  assert.equal(launchCalls.length, 1);
  const launchModeIdx = launchCalls[0].args.indexOf('--launch-mode');
  assert.ok(launchModeIdx > -1, 'Expected --launch-mode arg');
  assert.equal(launchCalls[0].args[launchModeIdx + 1], 'resume');
});

test('startCommandWithDeps passes -LaunchMode to loop.ps1 on Windows', async () => {
  const fixture = await setupWorkspace('aloop-start-launch-win32-');
  await writeFile(path.join(fixture.homeDir, '.aloop', 'bin', 'loop.ps1'), '# noop\n', 'utf8');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  fixture.discovery.project.root = '/c/Users/pj/demo-repo';

  const launchCalls: SpawnRecord[] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true, launch: 'restart' },
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
        return { pid: 9090, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'win32',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.launch_mode, 'restart');
  const launchModeIdx = launchCalls[0].args.indexOf('-LaunchMode');
  assert.ok(launchModeIdx > -1, 'Expected -LaunchMode arg');
  assert.equal(launchCalls[0].args[launchModeIdx + 1], 'restart');
});

test('startCommandWithDeps rejects invalid launch mode', async () => {
  const fixture = await setupWorkspace('aloop-start-launch-invalid-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'invalid' },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
          },      ),
    /Invalid launch mode/i,
  );
});

test('startCommandWithDeps resume reuses existing session worktree and branch', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-worktree-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  // Create an existing session with meta.json
  const existingSessionId = 'demo-project-20260301-100000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingWorktreePath = path.join(existingSessionDir, 'worktree');
  const existingBranch = `aloop/${existingSessionId}`;
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingWorktreePath, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });
  await writeFile(path.join(existingPromptsDir, 'PROMPT_plan.md'), '# plan\n', 'utf8');

  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: true,
    worktree_path: existingWorktreePath,
    work_dir: existingWorktreePath,
    branch: existingBranch,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'plan-build-review',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 50,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  const launchCalls: SpawnRecord[] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
      },
      existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 1234, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.session_id, existingSessionId);
  assert.equal(result.work_dir, existingWorktreePath);
  assert.equal(result.worktree, true);
  assert.equal(result.worktree_path, existingWorktreePath);
  assert.equal(result.branch, existingBranch);
  assert.equal(result.launch_mode, 'resume');
  assert.equal(launchCalls.length, 1);
  const launchModeIdx = launchCalls[0].args.indexOf('--launch-mode');
  assert.ok(launchModeIdx > -1, 'Expected --launch-mode arg');
  assert.equal(launchCalls[0].args[launchModeIdx + 1], 'resume');
});

test('startCommandWithDeps resume recreates worktree on same branch when worktree was removed', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-recreate-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const existingSessionId = 'demo-project-20260301-110000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingWorktreePath = path.join(existingSessionDir, 'worktree');
  const existingBranch = `aloop/${existingSessionId}`;
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });
  await writeFile(path.join(existingPromptsDir, 'PROMPT_plan.md'), '# plan\n', 'utf8');
  // NOTE: worktree directory does NOT exist — simulating removal

  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: true,
    worktree_path: existingWorktreePath,
    work_dir: existingWorktreePath,
    branch: existingBranch,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'plan-build-review',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 50,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  const gitCalls: string[][] = [];
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
      },
      existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        return { pid: 5678, unref() {} } as any;
      }) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        if (command === 'git' && args.includes('worktree')) {
          gitCalls.push([...args]);
          // Simulate successful worktree recreation
          return { status: 0, stdout: '', stderr: '' } as any;
        }
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.session_id, existingSessionId);
  assert.equal(result.branch, existingBranch);
  assert.equal(result.worktree, true);
  // Verify git worktree add was called with the existing branch (no -b flag)
  assert.ok(gitCalls.length >= 1, 'Expected at least one git worktree call');
  const worktreeCall = gitCalls.find(c => c.includes('worktree'));
  assert.ok(worktreeCall, 'Expected a worktree add call');
  assert.ok(!worktreeCall.includes('-b'), 'Resume must NOT create a new branch (-b flag should be absent)');
  assert.ok(worktreeCall.includes(existingBranch), 'Should checkout existing branch');
});

test('startCommandWithDeps resume errors when session does not exist', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-missing-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: 'nonexistent-session' },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
          },      ),
    /Session not found.*nonexistent-session/i,
  );
});

test('startCommandWithDeps resume reuses in-place session without worktree', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-inplace-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const existingSessionId = 'demo-project-20260301-120000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });
  await writeFile(path.join(existingPromptsDir, 'PROMPT_plan.md'), '# plan\n', 'utf8');

  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: false,
    worktree_path: null,
    work_dir: fixture.projectRoot,
    branch: null,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'plan-build-review',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 50,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
      },
      existsSync,
      spawn: (() => ({ pid: 9999, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      },
    );

  assert.equal(result.session_id, existingSessionId);
  assert.equal(result.worktree, false);
  assert.equal(result.worktree_path, null);
  assert.equal(result.work_dir, fixture.projectRoot);
  assert.equal(result.branch, null);
  assert.equal(result.launch_mode, 'resume');
});

test('startCommandWithDeps removes session from active.json if subsequent step fails', async () => {
  const fixture = await setupWorkspace('aloop-start-cleanup-failure-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nmode: 'plan'\non_start:\n  monitor: 'dashboard'\n",
    'utf8',
  );

  const activePath = path.join(fixture.homeDir, '.aloop', 'active.json');

  let metaWriteCount = 0;
  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
        {
          discoverWorkspace: async () => fixture.discovery,
          readFile,
          writeFile: (async (p: string, data: string, enc: BufferEncoding) => {
            if (p.endsWith('meta.json')) {
              metaWriteCount++;
              if (metaWriteCount === 3) { // Third meta.json write is at the end
                throw new Error('Injected failure at end of startCommandWithDeps');
              }
            }
            return writeFile(p, data, enc);
          }) as any,
          mkdir,
          cp: (async () => undefined) as any,
          existsSync,
          spawn: (() => ({ pid: 5555, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
          platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
        },
      ),
    /Injected failure/i,
  );

  const active = JSON.parse(await readFile(activePath, 'utf8'));
  assert.deepEqual(active, {}, 'Session should have been removed from active.json on failure');
});

// --- Auto-monitoring failure/fallback tests ---

test('startCommandWithDeps warns with manual command when dashboard spawn fails', async () => {
  const fixture = await setupWorkspace('aloop-start-dashboard-spawn-fail-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'dashboard'\n  auto_open: true\n",
    'utf8',
  );

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
        const argsList = [...(args ?? [])];
        // Dashboard spawn throws; loop spawn succeeds
        if (argsList.includes('dashboard')) {
          throw new Error('spawn ENOENT');
        }
        return { pid: 2121, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.monitor_mode, 'dashboard');
  assert.equal(result.monitor_pid, null);
  assert.ok(
    result.warnings.some((w: string) => w.includes('aloop dashboard')),
    `Expected warning with manual command, got: ${result.warnings.join('; ')}`,
  );
});

test('startCommandWithDeps falls back to terminal when browser open fails', async () => {
  const fixture = await setupWorkspace('aloop-start-browser-fallback-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'dashboard'\n  auto_open: true\n",
    'utf8',
  );

  const syncCalls: SpawnRecord[] = [];
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
      spawn: (() => ({ pid: 3131, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        // xdg-open (browser) fails; x-terminal-emulator (fallback) succeeds
        if (command === 'xdg-open') {
          return { status: 1, stdout: '', stderr: '' } as any;
        }
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.monitor_mode, 'dashboard');
  assert.equal(result.monitor_pid, 3131);
  assert.ok(
    result.warnings.some((w: string) => w.includes('trying terminal monitor')),
    `Expected browser-fallback warning, got: ${result.warnings.join('; ')}`,
  );
  assert.ok(
    syncCalls.some((call) => call.command === 'x-terminal-emulator'),
    'Expected terminal fallback to have been attempted',
  );
});

test('startCommandWithDeps warns with manual command when both browser and terminal fail', async () => {
  const fixture = await setupWorkspace('aloop-start-both-fail-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'dashboard'\n  auto_open: true\n",
    'utf8',
  );

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
      spawn: (() => ({ pid: 3131, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 1, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.ok(
    result.warnings.some((w: string) => w.includes('aloop dashboard') || w.includes('aloop status --watch')),
    `Expected warning with manual fallback command, got: ${result.warnings.join('; ')}`,
  );
});

test('startCommandWithDeps warns with manual command when terminal monitor fails', async () => {
  const fixture = await setupWorkspace('aloop-start-terminal-fail-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'terminal'\n  auto_open: true\n",
    'utf8',
  );

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
      spawn: (() => ({ pid: 5151, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 1, stdout: '', stderr: 'not found' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.monitor_mode, 'terminal');
  assert.ok(
    result.warnings.some((w: string) => w.includes('aloop status --watch')),
    `Expected warning with manual status command, got: ${result.warnings.join('; ')}`,
  );
});

test('startCommandWithDeps uses open command on macOS for dashboard auto-open', async () => {
  const fixture = await setupWorkspace('aloop-start-macos-browser-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'dashboard'\n  auto_open: true\n",
    'utf8',
  );

  const syncCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
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
      spawn: (() => ({ pid: 3131, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'darwin',
      nodePath: '/usr/local/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.ok(
    syncCalls.some((call) => call.command === 'open' && call.args[0]?.startsWith('http://localhost:')),
    `Expected macOS 'open' command, got: ${syncCalls.map((c) => c.command).join(', ')}`,
  );
});

test('startCommandWithDeps uses osascript for terminal monitor on macOS', async () => {
  const fixture = await setupWorkspace('aloop-start-macos-terminal-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'terminal'\n  auto_open: true\n",
    'utf8',
  );

  const syncCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
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
      spawn: (() => ({ pid: 5151, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'darwin',
      nodePath: '/usr/local/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.ok(
    syncCalls.some((call) => call.command === 'osascript'),
    `Expected macOS 'osascript' command, got: ${syncCalls.map((c) => c.command).join(', ')}`,
  );
});

test('startCommandWithDeps uses Start-Process for browser on Windows', async () => {
  const fixture = await setupWorkspace('aloop-start-win-browser-');
  await writeFile(path.join(fixture.homeDir, '.aloop', 'bin', 'loop.ps1'), '# noop\n', 'utf8');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'dashboard'\n  auto_open: true\n",
    'utf8',
  );

  const syncCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
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
      spawn: (() => ({ pid: 3131, unref() {} }) as any) as any,
      spawnSync: ((command: string, args: readonly string[]) => {
        syncCalls.push({ command, args: [...args] });
        return { status: 0, stdout: '', stderr: '' } as any;
      }) as any,
      platform: 'win32',
      nodePath: 'C:\\Program Files\\node\\node.exe',
      aloopPath: 'C:\\Program Files\\aloop\\aloop.cmd',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.ok(
    syncCalls.some((call) => call.args.some((a: string) => a.includes('Start-Process'))),
    `Expected Windows Start-Process for browser, got: ${JSON.stringify(syncCalls)}`,
  );
});

// --- Additional Coverage Tests ---

import { startCommand } from './start.js';

test('Branch Coverage: parseYamlScalar numbers and quotes', async () => {
  const fixture = await setupWorkspace('aloop-branch-parse-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "max_iterations: '50'\nbackup_enabled: \"true\"\nmodels:\n  claude: \"'opus'\"\n",
    'utf8'
  );
  
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.equal(result.max_iterations, 50);
});

test('Branch Coverage: config parsing with null retry models and empty string round robin', async () => {
  const fixture = await setupWorkspace('aloop-branch-config-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nretry_models:\n  codex: null\n  claude: ''\nround_robin_order:\n  - 'claude'\n  - ''\n",
    'utf8'
  );
  
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(result.provider === 'claude');
});

test('startCommandWithDeps parses cost_routing and openrouter_models for opencode', async () => {
  const fixture = await setupWorkspace('aloop-start-cost-routing-opencode-');
  fixture.discovery.providers.installed = ['opencode', 'claude'];
  fixture.discovery.providers.default_provider = 'opencode';
  await writeFile(path.join(fixture.homeDir, '.aloop', 'config.yml'), "openrouter_models:\n  - 'xiaomi/mimo-v2-pro'\n  - 'anthropic/claude-opus-4.6'\n", 'utf8');
  await writeFile(
    fixture.discovery.setup.config_path,
    [
      "provider: 'opencode'",
      "mode: 'plan-build-review'",
      'enabled_providers:',
      "  - 'opencode'",
      'models:',
      "  opencode: 'opencode-default'",
      'cost_routing:',
      "  plan: 'prefer_cheap'",
      "  build: 'prefer_capable'",
      'on_start:',
      "  monitor: 'none'",
      '  auto_open: false',
      '',
    ].join('\n'),
    'utf8',
  );

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async (src, dest) => {
        await mkdir(dest, { recursive: true });
        const copyIfExists = async (name: string) => {
          const srcPath = path.join(src, name);
          if (existsSync(srcPath)) {
            await writeFile(path.join(dest, name), await readFile(srcPath, 'utf8'), 'utf8');
          }
        };
        await copyIfExists('PROMPT_plan.md');
        await copyIfExists('PROMPT_build.md');
        await copyIfExists('PROMPT_review.md');
      },
      existsSync,
      spawn: (() => ({ pid: 4242, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  assert.equal(result.provider, 'opencode');
  const planPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_plan.md'), 'utf8');
  const buildPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_build.md'), 'utf8');
  const reviewPrompt = await readFile(path.join(result.prompts_dir, 'PROMPT_review.md'), 'utf8');
  assert.match(planPrompt, /model:\s+openrouter\/xiaomi\/mimo-v2-pro/);
  assert.match(buildPrompt, /model:\s+openrouter\/anthropic\/claude-opus-4\.6/);
  // default review routing is prefer_capable
  assert.match(reviewPrompt, /model:\s+openrouter\/anthropic\/claude-opus-4\.6/);
});

test('Branch Coverage: orchestrate mode dispatches through orchestrator launch with mapped limits', async () => {
  const fixture = await setupWorkspace('aloop-branch-orchestrate-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\nmode: 'plan'\n", 'utf8');

  let capturedConcurrency: unknown;
  let capturedMaxScans: unknown;
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, mode: 'orchestrate', max: 88, concurrency: 5 },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      orchestrateCommandWithDeps: async (options) => {
        capturedConcurrency = options.concurrency;
        return {
          session_dir: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456'),
          prompts_dir: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456', 'prompts'),
          queue_dir: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456', 'queue'),
          requests_dir: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456', 'requests'),
          loop_plan_file: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456', 'loop-plan.json'),
          state_file: path.join(fixture.homeDir, '.aloop', 'sessions', 'orchestrator-20260301-123456', 'orchestrator.json'),
          state: {
            spec_file: 'SPEC.md',
            trunk_branch: 'agent/trunk',
            concurrency_cap: 3,
            current_wave: 0,
            plan_only: false,
            issues: [],
            completed_waves: [],
            filter_issues: null,
            filter_label: null,
            filter_repo: null,
            budget_cap: null,
            created_at: new Date('2026-03-01T12:34:56.000Z').toISOString(),
            updated_at: new Date('2026-03-01T12:34:56.000Z').toISOString(),
          },
          aloopRoot: path.join(fixture.homeDir, '.aloop'),
          projectRoot: fixture.projectRoot,
        };
      },
      launchOrchestrator: async (options) => {
        capturedMaxScans = options.maxScans;
        return {
          pid: 6789,
          work_dir: fixture.projectRoot,
          worktree: false,
          worktree_path: null,
          started_at: '2026-03-01T12:34:56.000Z',
          warnings: [],
        };
      },
    },
  );

  assert.equal(result.mode, 'orchestrate');
  assert.equal(result.session_id, 'orchestrator-20260301-123456');
  assert.equal(result.pid, 6789);
  assert.equal(capturedConcurrency, '5');
  assert.equal(capturedMaxScans, 88);
});

test('Branch Coverage: resolvePowerShellBinary fails if no powershell', async () => {
  const fixture = await setupWorkspace('aloop-branch-nopwsh-');
  await writeFile(path.join(fixture.homeDir, '.aloop', 'bin', 'loop.ps1'), '# noop\n', 'utf8');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
        {
          discoverWorkspace: async () => fixture.discovery,
          readFile,
          writeFile,
          mkdir,
          cp: async () => undefined,
          existsSync,
          spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 1, stdout: '', stderr: '' }) as any) as any, // pwsh fails
          platform: 'win32',
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date(),
        }
      ),
    /neither pwsh nor powershell was found/
  );
});

test('Branch Coverage: normalizeGitBashPathForWindows invalid path', () => {
  assert.equal(normalizeGitBashPathForWindows('not/absolute/path'), 'not/absolute/path');
});

test('Branch Coverage: readSessionMeta throws invalid JSON', async () => {
  const fixture = await setupWorkspace('aloop-branch-meta-invalid-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');
  
  const existingSessionId = 'demo-project-invalid-meta';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  await mkdir(existingSessionDir, { recursive: true });
  await writeFile(path.join(existingSessionDir, 'meta.json'), '{ invalid json', 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
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
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date(),
        }
      ),
    /Session meta.json not found or invalid/
  );
});

test('Branch Coverage: resume session meta not found', async () => {
  const fixture = await setupWorkspace('aloop-branch-meta-missing-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');
  
  const existingSessionId = 'demo-project-missing-meta';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  await mkdir(existingSessionDir, { recursive: true });
  // Intentionally do NOT write meta.json

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
        {
          discoverWorkspace: async () => fixture.discovery,
          readFile,
          writeFile,
          mkdir,
          cp: async () => undefined,
          existsSync, // uses real fs, so it will see dir exists but meta doesn't
          spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
          platform: 'linux',
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date(),
        }
      ),
    /Session meta.json not found or invalid/
  );
});

test('Branch Coverage: worktree requested but not a git repo', async () => {
  const fixture = await setupWorkspace('aloop-branch-not-git-');
  fixture.discovery.project.is_git_repo = false;
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nworktree_default: true\n",
    'utf8'
  );

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: false },
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
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );

  assert.equal(result.worktree, false);
  assert.ok(result.warnings.some(w => w.includes('not a git repository')));
});

test('Branch Coverage: win32 loop.ps1 missing', async () => {
  const fixture = await setupWorkspace('aloop-branch-noloop-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
        {
          discoverWorkspace: async () => fixture.discovery,
          readFile,
          writeFile,
          mkdir,
          cp: async () => undefined,
          existsSync: (p) => p.endsWith('loop.ps1') ? false : fs.existsSync(p),
          spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
          spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
          platform: 'win32',
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date(),
        }
      ),
    /Loop script not found/
  );
});

import * as fs from 'node:fs';
test('Branch Coverage: startCommand json and text outputs', async () => {
  const fixture = await setupWorkspace('aloop-branch-startcommand-');
  // Write to global config so real discoverWorkspace doesn't need to match project hash
  await writeFile(path.join(fixture.homeDir, '.aloop', 'config.yml'), "provider: 'claude'\ndefault_mode: 'plan-build-review'\non_start:\n  monitor: 'none'\n", 'utf8');
  
  // Make sure loop.sh is executable or at least exists for real fs checks
  const loopShPath = path.join(fixture.homeDir, '.aloop', 'bin', 'loop.sh');
  await writeFile(loopShPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const originalConsoleLog = console.log;
  let loggedOutput = '';
  console.log = (msg) => { loggedOutput += msg + '\n'; };

  try {
    const deps: any = {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: fs.promises.cp,
      existsSync: fs.existsSync,
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    };
    await startCommand('test-session-123', {
      homeDir: fixture.homeDir,
      projectRoot: fixture.projectRoot,
      inPlace: true,
      output: 'json'
    }, deps);
    assert.ok(loggedOutput.includes('"session_id": "'), 'json output missing');
    loggedOutput = '';
    await startCommand(undefined, {
      homeDir: fixture.homeDir,
      projectRoot: fixture.projectRoot,
      inPlace: true,
      output: 'text'
    }, deps);
    assert.ok(loggedOutput.includes('Aloop loop started!'), 'text output missing');
    assert.ok(loggedOutput.includes('PID:'), 'PID missing from text output');
  } finally {
    console.log = originalConsoleLog;
  }
});

test('Branch Coverage: Linux backup enabled', async () => {
  const fixture = await setupWorkspace('aloop-branch-backup-linux-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nbackup_enabled: true\n",
    'utf8'
  );

  const launchCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 1, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(launchCalls[0].args.includes('--backup'));
});

test('Branch Coverage: toBoolean and retry_models and comments', async () => {
  const fixture = await setupWorkspace('aloop-branch-toboolean-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude' # comment\nbackup_enabled: \"false\"\nworktree_default: \"true\"\nretry_models:\n  codex: \"gpt-4\"\n  claude: null\n",
    'utf8'
  );

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(result.provider === 'claude');
});

test('Branch Coverage: copilot with retry model', async () => {
  const fixture = await setupWorkspace('aloop-branch-copilot-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'copilot'\nretry_models:\n  copilot: 'claude-sonnet-4.6'\n",
    'utf8'
  );

  const launchCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 1, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(launchCalls[0].args.includes('copilot'));
});

test('Branch Coverage: round robin fallback', async () => {
  const fixture = await setupWorkspace('aloop-branch-roundrobin-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'round-robin'\nenabled_providers:\n  - 'claude'\nround_robin_order: []\n",
    'utf8'
  );

  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(result.provider === 'round-robin');
});

test('Branch Coverage: missing package versions no op', async () => {
  const fixture = await setupWorkspace('aloop-branch-versions-');
  await writeFile(fixture.discovery.setup.config_path, "provider: 'claude'\n", 'utf8');
  await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile: async (p, enc) => {
        if (p.endsWith('version.json')) throw new Error('missing');
        return readFile(p, enc);
      },
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: (() => ({ pid: 1, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
});

test('Branch Coverage: Windows backup enabled', async () => {
  const fixture = await setupWorkspace('aloop-branch-backup-win-');
  await writeFile(path.join(fixture.homeDir, '.aloop', 'bin', 'loop.ps1'), '# noop\n', 'utf8');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nbackup_enabled: true\n",
    'utf8'
  );

  const launchCalls: SpawnRecord[] = [];
  await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, inPlace: true },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync: fs.existsSync,
      spawn: ((command: string, args?: readonly string[]) => {
        launchCalls.push({ command, args: [...(args ?? [])] });
        return { pid: 1, unref() {} } as any;
      }) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'win32',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date(),
    }
  );
  assert.ok(launchCalls[0].args.includes('-BackupEnabled'));
});

test('Branch Coverage: selectValue undefined', () => {
  assert.equal(startCommandWithDeps.name, 'startCommandWithDeps');
});

// --- resolveStartDeps tests ---

test('resolveStartDeps returns valid StartDeps when provided', () => {
  const validDeps = {
    discoverWorkspace: async () => ({} as DiscoveryResult),
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => undefined,
    cp: async () => {},
    existsSync: () => true,
    spawn: (() => {}) as any,
    spawnSync: (() => {}) as any,
    platform: 'linux' as NodeJS.Platform,
    env: {},
    now: () => new Date(),
    nodePath: '/usr/bin/node',
    aloopPath: '/usr/bin/aloop',
  };
  const result = resolveStartDeps(validDeps);
  assert.strictEqual(result, validDeps, 'should return the provided deps when they match StartDeps shape');
});

test('resolveStartDeps falls back to defaultDeps when given Commander Command object', () => {
  // Simulate a Commander Command object (has methods like opts(), parse(), etc.)
  const commanderCommand = {
    opts: () => ({}),
    parse: () => {},
    name: () => 'start',
    description: () => 'Start a session',
  };
  const result = resolveStartDeps(commanderCommand);
  assert.ok(typeof result.discoverWorkspace === 'function', 'should have discoverWorkspace function');
  assert.ok(typeof result.readFile === 'function', 'should have readFile function');
  assert.ok(typeof result.spawn === 'function', 'should have spawn function');
  assert.notStrictEqual(result, commanderCommand, 'should not return the Commander object');
});

test('resolveStartDeps falls back to defaultDeps for undefined', () => {
  const result = resolveStartDeps(undefined);
  assert.ok(typeof result.discoverWorkspace === 'function');
  assert.ok(typeof result.existsSync === 'function');
});

test('resolveStartDeps falls back to defaultDeps for null', () => {
  const result = resolveStartDeps(null);
  assert.ok(typeof result.discoverWorkspace === 'function');
});

test('resolveStartDeps falls back to defaultDeps for non-object', () => {
  const result = resolveStartDeps('not-an-object');
  assert.ok(typeof result.discoverWorkspace === 'function');
});

test('startCommandWithDeps writes engine field in meta.json for loop sessions', async () => {
  const fixture = await setupWorkspace('aloop-start-engine-loop-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\nmode: 'plan-build-review'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

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
      spawn: (() => ({ pid: 1001, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
    },
  );

  const meta = JSON.parse(await readFile(path.join(result.session_dir, 'meta.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(meta.engine, 'loop');
  assert.equal(meta.mode, 'plan-build-review');
});

test('startCommandWithDeps resume detects orchestrator session via mode field and delegates to orchestrator launch', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-orch-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const existingSessionId = 'orchestrator-20260301-100000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });

  // Write orchestrator state file (required for orchestrator resume)
  await writeFile(path.join(existingSessionDir, 'orchestrator.json'), JSON.stringify({
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: false,
    issues: [],
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  }), 'utf8');

  // Write meta with mode: 'orchestrate' (no engine field — legacy session)
  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: false,
    worktree_path: null,
    work_dir: fixture.projectRoot,
    branch: null,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'orchestrate',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 999999,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  let orchestratorLaunchCalled = false;
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync,
      spawn: (() => ({ pid: 7777, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      launchOrchestrator: async (options) => {
        orchestratorLaunchCalled = true;
        assert.equal(options.sessionDir, existingSessionDir);
        assert.equal(options.launchMode, 'resume');
        return {
          pid: 7777,
          work_dir: fixture.projectRoot,
          worktree: false,
          worktree_path: null,
          started_at: '2026-03-01T12:34:56.000Z',
          warnings: [],
        };
      },
    },
  );

  assert.equal(orchestratorLaunchCalled, true, 'orchestrator launch should be called for orchestrator session resume');
  assert.equal(result.mode, 'orchestrate');
  assert.equal(result.session_id, existingSessionId);
  assert.equal(result.pid, 7777);
  assert.equal(result.launch_mode, 'resume');
});

test('startCommandWithDeps resume detects orchestrator session via engine field', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-orch-engine-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const existingSessionId = 'orchestrator-20260301-110000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });

  await writeFile(path.join(existingSessionDir, 'orchestrator.json'), JSON.stringify({
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: false,
    issues: [],
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  }), 'utf8');

  // Write meta with engine: 'orchestrate' (new-style session)
  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: false,
    worktree_path: null,
    work_dir: fixture.projectRoot,
    branch: null,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'plan-build-review',
    engine: 'orchestrate',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 50,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  let orchestratorLaunchCalled = false;
  const result = await startCommandWithDeps(
    { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
    {
      discoverWorkspace: async () => fixture.discovery,
      readFile,
      writeFile,
      mkdir,
      cp: async () => undefined,
      existsSync,
      spawn: (() => ({ pid: 8888, unref() {} }) as any) as any,
      spawnSync: (() => ({ status: 0, stdout: '', stderr: '' }) as any) as any,
      platform: 'linux',
      nodePath: '/usr/bin/node',
      aloopPath: '/usr/local/bin/aloop',
      env: process.env,
      now: () => new Date('2026-03-01T12:34:56.000Z'),
      launchOrchestrator: async (options) => {
        orchestratorLaunchCalled = true;
        assert.equal(options.sessionDir, existingSessionDir);
        assert.equal(options.launchMode, 'resume');
        return {
          pid: 8888,
          work_dir: fixture.projectRoot,
          worktree: false,
          worktree_path: null,
          started_at: '2026-03-01T12:34:56.000Z',
          warnings: [],
        };
      },
    },
  );

  assert.equal(orchestratorLaunchCalled, true, 'orchestrator launch should be called when engine field says orchestrate');
  assert.equal(result.mode, 'orchestrate');
  assert.equal(result.pid, 8888);
});

test('startCommandWithDeps resume errors for orchestrator session without state file', async () => {
  const fixture = await setupWorkspace('aloop-start-resume-orch-nostate-');
  await writeFile(
    fixture.discovery.setup.config_path,
    "provider: 'claude'\non_start:\n  monitor: 'none'\n",
    'utf8',
  );

  const existingSessionId = 'orchestrator-20260301-120000';
  const sessionsRoot = path.join(fixture.homeDir, '.aloop', 'sessions');
  const existingSessionDir = path.join(sessionsRoot, existingSessionId);
  const existingPromptsDir = path.join(existingSessionDir, 'prompts');

  await mkdir(existingSessionDir, { recursive: true });
  await mkdir(existingPromptsDir, { recursive: true });

  // Write meta with mode: 'orchestrate' but NO orchestrator.json state file
  const meta = {
    session_id: existingSessionId,
    session_dir: existingSessionDir,
    project_root: fixture.projectRoot,
    worktree: false,
    worktree_path: null,
    work_dir: fixture.projectRoot,
    branch: null,
    prompts_dir: existingPromptsDir,
    provider: 'claude',
    mode: 'orchestrate',
    enabled_providers: ['claude'],
    round_robin_order: ['claude'],
    max_iterations: 50,
    max_stuck: 3,
  };
  await writeFile(path.join(existingSessionDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  await assert.rejects(
    () =>
      startCommandWithDeps(
        { homeDir: fixture.homeDir, projectRoot: fixture.projectRoot, launch: 'resume', sessionId: existingSessionId },
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
          nodePath: '/usr/bin/node',
          aloopPath: '/usr/local/bin/aloop',
          env: process.env,
          now: () => new Date('2026-03-01T12:34:56.000Z'),
        },
      ),
    /Orchestrator session state not found/,
  );
});
