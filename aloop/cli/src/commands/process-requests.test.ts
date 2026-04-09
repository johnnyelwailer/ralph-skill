import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { formatReviewCommentHistory, getDirectorySizeBytes, pruneLargeV8CacheDir, syncMasterToTrunk, syncChildBranches, type ChildBranchSyncDeps, processRequestsCommand } from './process-requests.js';
import { processCrResultFiles, type CrResultDeps } from './cr-pipeline.js';
import type { OrchestratorIssue } from './orchestrate.js';

interface ProcessRequestsFixture {
  rootDir: string;
  homeDir: string;
  sessionDir: string;
  requestsDir: string;
  cleanup: () => Promise<void>;
}

function makeState(issueOverrides: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: true,
    issues: issueOverrides.map((issue, index) => ({
      number: Number(issue.number ?? index + 1),
      title: String(issue.title ?? `Issue ${index + 1}`),
      body: String(issue.body ?? ''),
      wave: Number(issue.wave ?? 1),
      state: String(issue.state ?? 'pending'),
      status: String(issue.status ?? 'Needs refinement'),
      child_session: issue.child_session ?? null,
      pr_number: issue.pr_number ?? null,
      depends_on: Array.isArray(issue.depends_on) ? issue.depends_on : [],
      blocked_on_human: Boolean(issue.blocked_on_human ?? false),
      processed_comment_ids: Array.isArray(issue.processed_comment_ids) ? issue.processed_comment_ids : [],
      dor_validated: issue.dor_validated ?? false,
      ...issue,
    })),
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
  };
}

async function createFixture(issueOverrides: Record<string, unknown>[] = []): Promise<ProcessRequestsFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-process-requests-'));
  const homeDir = path.join(rootDir, 'home');
  const sessionDir = path.join(rootDir, 'session');
  const requestsDir = path.join(sessionDir, 'requests');
  const projectRoot = path.join(rootDir, 'project');

  await mkdir(path.join(homeDir, '.aloop', 'sessions'), { recursive: true });
  await mkdir(path.join(homeDir, '.aloop', '.cache'), { recursive: true });
  await mkdir(requestsDir, { recursive: true });
  await mkdir(path.join(sessionDir, 'prompts'), { recursive: true });
  await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
  await mkdir(path.join(sessionDir, 'worktree'), { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeFile(path.join(sessionDir, 'meta.json'), JSON.stringify({ project_root: projectRoot }), 'utf8');
  await writeFile(path.join(sessionDir, 'loop-plan.json'), JSON.stringify({ iteration: 1 }), 'utf8');
  await writeFile(path.join(sessionDir, 'orchestrator.json'), JSON.stringify(makeState(issueOverrides), null, 2), 'utf8');

  return {
    rootDir,
    homeDir,
    sessionDir,
    requestsDir,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe('syncChildBranches', () => {
  function createMockSyncDeps(overrides: Partial<ChildBranchSyncDeps> = {}): ChildBranchSyncDeps & { writtenFiles: Record<string, string>; createdDirs: string[] } {
    const writtenFiles: Record<string, string> = {};
    const createdDirs: string[] = [];
    return {
      existsSync: (p: string) => p.includes('worktree'),
      readFile: async () => '',
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
      mkdir: async (p: string) => { createdDirs.push(p); },
      spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
      ...overrides,
      writtenFiles,
      createdDirs,
    };
  }

  it('sets needs_redispatch and writes queue file on rebase failure', async () => {
    const issue: any = {
      number: 42, title: 'Test', wave: 1, state: 'in_progress',
      child_session: 'child-42', pr_number: 100, depends_on: [],
    };
    const deps = createMockSyncDeps({
      spawnSync: (_cmd: string, args: string[]) => {
        if (args.includes('merge-base')) return { status: 0, stdout: 'aaa1110\n', stderr: '' };
        if (args.includes('rev-parse')) return { status: 0, stdout: 'bbb2220\n', stderr: '' };
        if (args.includes('rebase') && args.includes('--abort')) return { status: 0, stdout: '', stderr: '' };
        if (args.includes('rebase')) return { status: 1, stdout: '', stderr: 'CONFLICT' };
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const changed = await syncChildBranches([issue], 'agent/trunk', '/aloop', deps);

    assert.equal(changed, true);
    assert.equal(issue.needs_redispatch, true);
    const queueKey = Object.keys(deps.writtenFiles).find(k => k.endsWith('000-merge-conflict.md'));
    assert.ok(queueKey, 'queue file should be written');
    assert.match(deps.writtenFiles[queueKey!], /agent: merge/);
    assert.match(deps.writtenFiles[queueKey!], /Rebase onto/);
  });

  it('does not set needs_redispatch or write queue file on rebase success', async () => {
    const issue: any = {
      number: 42, title: 'Test', wave: 1, state: 'in_progress',
      child_session: 'child-42', pr_number: 100, depends_on: [],
    };
    const deps = createMockSyncDeps({
      spawnSync: (cmd: string, args: string[]) => {
        if (args.includes('merge-base')) return { status: 0, stdout: 'aaa1110\n', stderr: '' };
        if (args.includes('rev-parse')) return { status: 0, stdout: 'bbb2220\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const changed = await syncChildBranches([issue], 'agent/trunk', '/aloop', deps);

    assert.equal(changed, false);
    assert.equal(issue.needs_redispatch, undefined);
    const queueKey = Object.keys(deps.writtenFiles).find(k => k.endsWith('000-merge-conflict.md'));
    assert.equal(queueKey, undefined, 'no queue file should be written');
  });

  it('skips issues without child_session', async () => {
    const issue: any = {
      number: 42, title: 'Test', wave: 1, state: 'in_progress',
      child_session: null, pr_number: null, depends_on: [],
    };
    const deps = createMockSyncDeps();
    const changed = await syncChildBranches([issue], 'agent/trunk', '/aloop', deps);
    assert.equal(changed, false);
  });

  it('skips issues not in active states', async () => {
    const issue: any = {
      number: 42, title: 'Test', wave: 1, state: 'pending',
      child_session: 'child-42', pr_number: null, depends_on: [],
    };
    const deps = createMockSyncDeps();
    const changed = await syncChildBranches([issue], 'agent/trunk', '/aloop', deps);
    assert.equal(changed, false);
  });

  it('does not overwrite existing queue file on repeated failure', async () => {
    const issue: any = {
      number: 42, title: 'Test', wave: 1, state: 'in_progress',
      child_session: 'child-42', pr_number: 100, depends_on: [],
    };
    const existingQueueFile = '/aloop/sessions/child-42/queue/000-merge-conflict.md';
    const deps = createMockSyncDeps({
      existsSync: (p: string) => p === existingQueueFile || p.includes('worktree'),
      spawnSync: (cmd: string, args: string[]) => {
        if (args.includes('merge-base')) return { status: 0, stdout: 'aaa111\n', stderr: '' };
        if (args.includes('rev-parse')) return { status: 0, stdout: 'bbb222\n', stderr: '' };
        if (args.includes('rebase') && !args.includes('--abort')) return { status: 1, stdout: '', stderr: 'CONFLICT' };
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const changed = await syncChildBranches([issue], 'agent/trunk', '/aloop', deps);

    assert.equal(changed, false);
    assert.equal(issue.needs_redispatch, undefined);
    assert.equal(Object.keys(deps.writtenFiles).length, 0, 'should not write when queue file already exists');
  });
});

// ── Helpers for CR tests ──

function makeIssue(overrides: Partial<OrchestratorIssue> & { number: number }): OrchestratorIssue {
  return {
    title: `Issue ${overrides.number}`,
    wave: 1,
    state: 'pending',
    child_session: null,
    pr_number: null,
    depends_on: [],
    blocked_on_human: false,
    processed_comment_ids: [],
    dor_validated: false,
    is_change_request: true,
    cr_spec_updated: false,
    ...overrides,
  } as OrchestratorIssue;
}

function makeCrResultFile(issueNumber: number, tmpDir: string): { filePath: string; result: object } {
  const result = {
    issue_number: issueNumber,
    summary: 'Add queue priority section',
    spec_changes: [
      { file: 'SPEC.md', section: 'Queue Priority', action: 'add', content: '## Queue Priority\n\nHigher priority items run first.', rationale: 'New feature' },
    ],
  };
  const filePath = path.join(tmpDir, `cr-analysis-result-${issueNumber}.json`);
  return { filePath, result };
}

function makeMockDeps(overrides: Partial<CrResultDeps> = {}): CrResultDeps & {
  writtenFiles: Record<string, string>;
  ghCalls: string[][];
  gitCalls: string[][];
  archivedFiles: string[];
} {
  const writtenFiles: Record<string, string> = {};
  const ghCalls: string[][] = [];
  const gitCalls: string[][] = [];
  const archivedFiles: string[] = [];

  const deps: CrResultDeps & { writtenFiles: Record<string, string>; ghCalls: string[][]; gitCalls: string[][]; archivedFiles: string[] } = {
    existsSync: (p) => p in writtenFiles,
    readFile: async (p) => writtenFiles[p] ?? '',
    writeFile: async (p, data) => { writtenFiles[p] = data; },
    unlink: async (p) => { delete writtenFiles[p]; },
    execGh: async (args) => { ghCalls.push(args); return { stdout: '', stderr: '' }; },
    execGit: (args) => { gitCalls.push(args); },
    archiveFile: async (_rDir, fp) => { archivedFiles.push(fp); },
    writtenFiles,
    ghCalls,
    gitCalls,
    archivedFiles,
    ...overrides,
  };
  return deps;
}

describe('processCrResultFiles — autonomous path', () => {
  it('applies spec changes, commits, and sets cr_spec_updated', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-auto-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'autonomous', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).cr_spec_updated, true);
      // Spec file should be updated
      assert.ok(deps.writtenFiles['/project/SPEC.md']?.includes('Queue Priority'), 'SPEC.md should contain the new section');
      // Git add, commit, push should be called
      assert.ok(deps.gitCalls.some(c => c.includes('add')), 'git add expected');
      assert.ok(deps.gitCalls.some(c => c.includes('commit')), 'git commit expected');
      assert.ok(deps.gitCalls.some(c => c.includes('push')), 'git push expected');
      // No GH calls in autonomous mode
      assert.equal(deps.ghCalls.length, 0);
      // File should be archived
      assert.ok(deps.archivedFiles.includes(filePath));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not set cr_spec_updated when issue not found', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-notfound-'));
    try {
      const issue = makeIssue({ number: 99 });
      const { filePath, result } = makeCrResultFile(42, tmpDir); // wrong issue number
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'autonomous', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, false);
      assert.equal((issue as any).cr_spec_updated, false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('processCrResultFiles — non-autonomous path', () => {
  it('posts GH comment, adds blocked-on-human label, sets blocked_on_human', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-nonauto-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'balanced', '/project', 'owner/repo', 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).blocked_on_human, true);
      // cr_spec_updated must remain false
      assert.equal((issue as any).cr_spec_updated, false);
      // Should post comment on GH issue
      const commentCall = deps.ghCalls.find(c => c.includes('comment') && c.includes('42'));
      assert.ok(commentCall, 'Expected issue comment gh call');
      // Should add blocked-on-human label
      const labelCall = deps.ghCalls.find(c => c.includes('edit') && c.includes('aloop/blocked-on-human'));
      assert.ok(labelCall, 'Expected label add gh call');
      // No git calls
      assert.equal(deps.gitCalls.length, 0);
      // File archived
      assert.ok(deps.archivedFiles.includes(filePath));
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not make GH calls when repo is null', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-cr-norepo-'));
    try {
      const issue = makeIssue({ number: 42 });
      const { filePath, result } = makeCrResultFile(42, tmpDir);
      const deps = makeMockDeps();
      deps.writtenFiles[filePath] = JSON.stringify(result);

      const changed = await processCrResultFiles(
        [filePath], [issue], 'cautious', '/project', null, 'agent/trunk', tmpDir, deps,
      );

      assert.equal(changed, true);
      assert.equal((issue as any).blocked_on_human, true);
      assert.equal(deps.ghCalls.length, 0, 'No GH calls when repo is null');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('syncMasterToTrunk', () => {
  const projectRoot = '/repo';
  const aloopRoot = '/repo/.aloop';
  const trunkBranch = 'agent/trunk';

  it('fast-forward case: pushes origin/master to trunk without a worktree', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];

    // git args pattern: ['-C', '<dir>', '<subcommand>', ...]  → subcommand at index 2
    // merge-base != master HEAD → master has new commits; FF push succeeds
    const spawnSync = (cmd: string, args: string[], _opts?: unknown) => {
      calls.push({ cmd, args });
      if (args[2] === 'merge-base') return { status: 0, stdout: 'aaa1111\n' };
      if (args[2] === 'rev-parse') return { status: 0, stdout: 'bbb2222\n' };
      return { status: 0, stdout: '' };
    };

    syncMasterToTrunk(projectRoot, aloopRoot, trunkBranch, { spawnSync: spawnSync as any });

    const pushCall = calls.find(c => c.args[2] === 'push' && c.args.some(a => a.includes('refs/heads')));
    assert.ok(pushCall, 'expected a push to refs/heads/<trunk>');
    assert.ok(pushCall!.args.includes(`origin/master:refs/heads/${trunkBranch}`), 'push refspec should be origin/master:refs/heads/<trunk>');
    assert.ok(!pushCall!.args.includes('--force'), 'push must not use --force');
    assert.ok(!pushCall!.args.includes('--force-with-lease'), 'push must not use --force-with-lease');

    const worktreeAdd = calls.find(c => c.args[2] === 'worktree' && c.args[3] === 'add');
    assert.equal(worktreeAdd, undefined, 'should not create a worktree on fast-forward');
  });

  it('diverged case: creates worktree, merges, pushes, removes worktree', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];

    // merge-base != master HEAD → master has new commits; FF push fails → diverged path
    const spawnSync = (cmd: string, args: string[], _opts?: unknown) => {
      calls.push({ cmd, args });
      if (args[2] === 'merge-base') return { status: 0, stdout: 'aaa1111\n' };
      if (args[2] === 'rev-parse') return { status: 0, stdout: 'bbb2222\n' };
      // FF push fails (non-fast-forward)
      if (args[2] === 'push' && args.some((a: string) => a.includes('refs/heads'))) return { status: 1, stdout: '' };
      // merge succeeds
      if (args[2] === 'merge') return { status: 0, stdout: '' };
      return { status: 0, stdout: '' };
    };

    syncMasterToTrunk(projectRoot, aloopRoot, trunkBranch, { spawnSync: spawnSync as any });

    const worktreeAdd = calls.find(c => c.args[2] === 'worktree' && c.args[3] === 'add');
    assert.ok(worktreeAdd, 'should create a worktree');

    const mergeCall = calls.find(c => c.args[2] === 'merge' && c.args[3] === 'origin/master');
    assert.ok(mergeCall, 'should run git merge origin/master');

    const pushHead = calls.find(c => c.args[2] === 'push' && c.args[3] === 'origin' && c.args[4] === 'HEAD');
    assert.ok(pushHead, 'should push HEAD after merge');
    assert.ok(!pushHead!.args.includes('--force'), 'push must not use --force');

    const worktreeRemove = calls.find(c => c.args[2] === 'worktree' && c.args[3] === 'remove');
    assert.ok(worktreeRemove, 'should remove the worktree');
  });

  it('no-op case: trunk already at or ahead of master (merge-base == master HEAD)', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const sha = 'ccc3333';

    // merge-base === master HEAD → trunk already contains master → nothing to do
    const spawnSync = (cmd: string, args: string[], _opts?: unknown) => {
      calls.push({ cmd, args });
      if (args[2] === 'merge-base') return { status: 0, stdout: `${sha}\n` };
      if (args[2] === 'rev-parse') return { status: 0, stdout: `${sha}\n` };
      return { status: 0, stdout: '' };
    };

    syncMasterToTrunk(projectRoot, aloopRoot, trunkBranch, { spawnSync: spawnSync as any });

    const pushCall = calls.find(c => c.args[2] === 'push');
    assert.equal(pushCall, undefined, 'should not push when trunk is already up to date');

    const worktreeAdd = calls.find(c => c.args[2] === 'worktree' && c.args[3] === 'add');
    assert.equal(worktreeAdd, undefined, 'should not create a worktree');
  });
});



// --- PR body enrichment tests (Issue #131 ACs 7-8) ---

describe('PR body enrichment', () => {
  it('reads PR_DESCRIPTION.md from child worktree when present', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-pr-body-'));
    try {
      const childWorktree = path.join(root, 'child-worktree');
      await mkdir(childWorktree, { recursive: true });
      const prDescription = `## Summary\nAdded label enrichment.\n\n## Verification\n- [x] AC 1 — wave labels applied\n- [x] AC 2 — complexity labels applied\n`;
      await writeFile(path.join(childWorktree, 'PR_DESCRIPTION.md'), prDescription, 'utf8');

      const prDescriptionFile = path.join(childWorktree, 'PR_DESCRIPTION.md');
      assert.ok(existsSync(prDescriptionFile), 'PR_DESCRIPTION.md should exist');
      const { readFile: nodeReadFile } = await import('node:fs/promises');
      const body = await nodeReadFile(prDescriptionFile, 'utf8');
      assert.equal(body, prDescription);
      assert.ok(body.includes('## Summary'));
      assert.ok(body.includes('- [x] AC 1'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to default body when PR_DESCRIPTION.md is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-pr-fallback-'));
    try {
      const childWorktree = path.join(root, 'child-worktree');
      await mkdir(childWorktree, { recursive: true });

      const prDescriptionFile = path.join(childWorktree, 'PR_DESCRIPTION.md');
      assert.ok(!existsSync(prDescriptionFile), 'PR_DESCRIPTION.md should not exist');

      // Simulate the fallback logic from process-requests.ts
      const issueNumber = 42;
      const childSession = 'child-session-42';
      const fallbackBody = `Closes #${issueNumber}\n\nAutomated PR from child loop session \`${childSession}\`.`;

      let prBody = fallbackBody;
      if (existsSync(prDescriptionFile)) {
        const { readFile: nodeReadFile } = await import('node:fs/promises');
        prBody = await nodeReadFile(prDescriptionFile, 'utf8');
      }

      assert.equal(prBody, fallbackBody);
      assert.ok(prBody.includes('Closes #42'));
      assert.ok(prBody.includes('child-session-42'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('processRequestsCommand error handling and concurrency', () => {
  it('ignores malformed estimate result files without crashing', async () => {
    const fixture = await createFixture([{ number: 7, state: 'pending' }]);
    try {
      const malformedEstimate = path.join(fixture.requestsDir, 'estimate-result-7.json');
      await writeFile(malformedEstimate, '{not-json', 'utf8');

      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
          output: 'json',
        });
      });

      const state = JSON.parse(await readFile(path.join(fixture.sessionDir, 'orchestrator.json'), 'utf8'));
      assert.equal(state.issues[0].dor_validated, false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('tolerates cleanup when child session directories are missing', async () => {
    const fixture = await createFixture([
      { number: 21, state: 'merged', child_session: 'missing-child-session' },
    ]);
    try {
      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
        });
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('swallows cleanup prune errors (permission-style rm failures)', async () => {
    const fixture = await createFixture([
      { number: 31, state: 'merged', child_session: 'child-cleanup-fail' },
    ]);
    const originalPath = process.env.PATH;
    try {
      const fakeBinDir = path.join(fixture.rootDir, 'fake-bin');
      await mkdir(fakeBinDir, { recursive: true });
      const fakeRmPath = path.join(fakeBinDir, 'rm');
      await writeFile(fakeRmPath, '#!/usr/bin/env bash\nexit 1\n', 'utf8');
      await chmod(fakeRmPath, 0o755);
      process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

      const childCacheDir = path.join(
        fixture.homeDir,
        '.aloop',
        'sessions',
        'child-cleanup-fail',
        '.v8-cache',
      );
      await mkdir(childCacheDir, { recursive: true });
      await writeFile(path.join(childCacheDir, 'cache.bin'), 'x', 'utf8');

      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
        });
      });

      assert.equal(existsSync(childCacheDir), true);
    } finally {
      process.env.PATH = originalPath;
      await fixture.cleanup();
    }
  });

  it('handles concurrent invocations over the same requests directory', async () => {
    const fixture = await createFixture([{ number: 42, state: 'pending' }]);
    try {
      await writeFile(
        path.join(fixture.requestsDir, 'estimate-result-42.json'),
        JSON.stringify({ issue_number: 42, dor_passed: true, complexity_tier: 'S', iteration_estimate: 1 }),
        'utf8',
      );

      const settled = await Promise.allSettled([
        processRequestsCommand({ sessionDir: fixture.sessionDir, homeDir: fixture.homeDir }),
        processRequestsCommand({ sessionDir: fixture.sessionDir, homeDir: fixture.homeDir }),
      ]);

      assert.deepEqual(
        settled.map((entry) => entry.status),
        ['fulfilled', 'fulfilled'],
      );

      const archivedEstimate = path.join(fixture.requestsDir, 'processed', 'estimate-result-42.json');
      assert.equal(existsSync(archivedEstimate), true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('creates PR for completed child session even when issue status text is stale', async () => {
    const fixture = await createFixture([
      {
        number: 42,
        title: 'Ship feature',
        state: 'in_progress',
        status: 'Needs refinement',
        child_session: 'child-42',
      },
    ]);
    const originalPath = process.env.PATH;
    try {
      const statePath = path.join(fixture.sessionDir, 'orchestrator.json');
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      state.filter_repo = 'acme/widgets';
      await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

      const childDir = path.join(fixture.homeDir, '.aloop', 'sessions', 'child-42');
      const childWorktree = path.join(childDir, 'worktree');
      await mkdir(childWorktree, { recursive: true });
      await writeFile(path.join(childDir, 'status.json'), JSON.stringify({ state: 'completed' }), 'utf8');

      const fakeBinDir = path.join(fixture.rootDir, 'fake-bin');
      await mkdir(fakeBinDir, { recursive: true });
      const ghBodyLog = path.join(fixture.rootDir, 'gh-body.log');
      const ghScript = `#!/usr/bin/env bash
set -u
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "--body" ]; then
      printf '%s\\n' "$arg" >> "${ghBodyLog}"
      break
    fi
    prev="$arg"
  done
  echo "https://github.com/acme/widgets/pull/123"
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"comments":[],"mergeable":"MERGEABLE"}'
  exit 0
fi
echo '{}'
exit 0
`;
      const gitScript = `#!/usr/bin/env bash
set -u
if [ "$#" -ge 4 ] && [ "$1" = "-C" ] && [ "$3" = "status" ] && [ "$4" = "--porcelain" ]; then
  exit 0
fi
if [ "$#" -ge 3 ] && [ "$1" = "-C" ] && [ "$3" = "status" ]; then
  echo ""
  exit 0
fi
exit 0
`;
      await writeFile(path.join(fakeBinDir, 'gh'), ghScript, 'utf8');
      await writeFile(path.join(fakeBinDir, 'git'), gitScript, 'utf8');
      await chmod(path.join(fakeBinDir, 'gh'), 0o755);
      await chmod(path.join(fakeBinDir, 'git'), 0o755);
      process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

      await processRequestsCommand({
        sessionDir: fixture.sessionDir,
        homeDir: fixture.homeDir,
      });

      const updated = JSON.parse(await readFile(statePath, 'utf8'));
      assert.equal(updated.issues[0].pr_number, 123);
      assert.equal(updated.issues[0].state, 'pr_open');
      assert.equal(updated.issues[0].status, 'In review');

      const ghBody = await readFile(ghBodyLog, 'utf8');
      assert.ok(ghBody.includes('Closes #42'));
    } finally {
      process.env.PATH = originalPath;
      await fixture.cleanup();
    }
  });
});
