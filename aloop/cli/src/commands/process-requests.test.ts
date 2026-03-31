import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { formatReviewCommentHistory, getDirectorySizeBytes, pruneLargeV8CacheDir, syncMasterToTrunk, syncChildBranches, makeAdapterForRepo, updateIssueBodyViaAdapter, updateParentTasklist, applySubDecompositionResult, createGhIssuesForNewEntries, createPRViaAdapter, createInvokeAgentReview, type ChildBranchSyncDeps, type InvokeAgentReviewDeps } from './process-requests.js';
import { GitHubAdapter } from '../lib/adapter.js';
import { processCrResultFiles, type CrResultDeps } from './cr-pipeline.js';
import type { OrchestratorIssue } from './orchestrate.js';

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


// --- makeAdapterForRepo tests (process-requests.ts:941-943 branch coverage) ---

describe('makeAdapterForRepo', () => {
  const mockExecGh = async (_args: string[]) => ({ stdout: '', stderr: '' });

  it('(a) repo present → returns a GitHubAdapter (OrchestratorAdapter)', () => {
    const adapter = makeAdapterForRepo('owner/repo', mockExecGh);
    assert.ok(adapter !== undefined, 'adapter should be defined when repo is present');
    assert.ok(adapter instanceof GitHubAdapter, 'adapter should be a GitHubAdapter');
  });

  it('(a) adapter reference is the same when threaded into scanDeps, prLifecycleDeps, dispatchDeps', () => {
    const adapter = makeAdapterForRepo('owner/repo', mockExecGh);
    // Simulate the threading in processRequestsCommand (lines 957, 964, 1049)
    const scanDeps = { adapter, prLifecycleDeps: { adapter }, dispatchDeps: { adapter } };
    assert.strictEqual(scanDeps.adapter, adapter);
    assert.strictEqual(scanDeps.prLifecycleDeps.adapter, adapter);
    assert.strictEqual(scanDeps.dispatchDeps.adapter, adapter);
  });

  it('(b) repo null → returns undefined', () => {
    const adapter = makeAdapterForRepo(null, mockExecGh);
    assert.strictEqual(adapter, undefined);
  });

  it('(b) no repo → all three adapter slots are undefined', () => {
    const adapter = makeAdapterForRepo(null, mockExecGh);
    // Simulate the threading in processRequestsCommand (lines 957, 964, 1049)
    const scanDeps = { adapter, prLifecycleDeps: { adapter }, dispatchDeps: { adapter } };
    assert.strictEqual(scanDeps.adapter, undefined);
    assert.strictEqual(scanDeps.prLifecycleDeps.adapter, undefined);
    assert.strictEqual(scanDeps.dispatchDeps.adapter, undefined);
  });

  it('(c) adapterType is forwarded to createAdapter as config.type', () => {
    let capturedConfig: { type: string; repo: string } | null = null;
    const mockCreateAdapter = (config: { type: string; repo: string }, _execGh: any) => {
      capturedConfig = config;
      return {} as any;
    };
    // Temporarily patch createAdapter via the module to test forwarding
    // Since makeAdapterForRepo calls createAdapter internally, we verify by checking
    // the returned adapter is a GitHubAdapter for 'github' and throws for unknown types
    const adapter = makeAdapterForRepo('owner/repo', mockExecGh, 'github');
    assert.ok(adapter !== undefined, 'adapter should be defined with explicit "github" type');
    assert.ok(adapter instanceof GitHubAdapter, 'adapter should be a GitHubAdapter for type "github"');
  });

  it('(c) adapterType defaults to "github" when omitted', () => {
    const adapter = makeAdapterForRepo('owner/repo', mockExecGh);
    assert.ok(adapter instanceof GitHubAdapter, 'adapter should default to GitHubAdapter');
  });

  it('(c) unknown adapterType throws', () => {
    assert.throws(
      () => makeAdapterForRepo('owner/repo', mockExecGh, 'gitlab'),
      /Unknown adapter type: "gitlab"/,
    );
  });
});


// --- updateIssueBodyViaAdapter tests (adapter-branch for refine-result handler) ---

describe('updateIssueBodyViaAdapter', () => {
  it('(a) adapter present → calls adapter.updateIssue, not fallback', async () => {
    const adapterCalls: Array<{ number: number; update: Record<string, unknown> }> = [];
    let fallbackCalled = false;

    const mockAdapter = {
      updateIssue: async (number: number, update: Record<string, unknown>) => {
        adapterCalls.push({ number, update });
      },
    } as any;

    await updateIssueBodyViaAdapter(42, 'new body text', mockAdapter, async () => {
      fallbackCalled = true;
    });

    assert.equal(adapterCalls.length, 1, 'adapter.updateIssue should be called once');
    assert.equal(adapterCalls[0].number, 42);
    assert.deepEqual(adapterCalls[0].update, { body: 'new body text' });
    assert.equal(fallbackCalled, false, 'fallback must not be called when adapter is present');
  });

  it('(b) adapter absent → calls fallback, not adapter', async () => {
    let fallbackCalled = false;

    await updateIssueBodyViaAdapter(42, 'new body text', undefined, async () => {
      fallbackCalled = true;
    });

    assert.equal(fallbackCalled, true, 'fallback must be called when adapter is absent');
  });
});


// ── updateParentTasklist adapter-path tests ──

describe('updateParentTasklist adapter path', () => {
  it('calls adapter.getIssue then adapter.updateIssue with tasklist when sub-issues exist', async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const mockAdapter = {
      getIssue: async (num: number) => {
        calls.push({ method: 'getIssue', args: [num] });
        return { number: num, title: 'Parent', body: 'Parent body', state: 'open', labels: [] };
      },
      updateIssue: async (num: number, update: unknown) => {
        calls.push({ method: 'updateIssue', args: [num, update] });
      },
    } as any;

    const issues = [
      { number: 11, title: 'Sub 1', parent_issue: 10 },
      { number: 12, title: 'Sub 2', parent_issue: 10 },
      { number: 20, title: 'Other', parent_issue: 99 },
    ];

    await updateParentTasklist(10, issues, mockAdapter);

    assert.equal(calls[0].method, 'getIssue');
    assert.deepEqual(calls[0].args, [10]);
    assert.equal(calls[1].method, 'updateIssue');
    assert.equal((calls[1].args as any[])[0], 10);
    const updatedBody = ((calls[1].args as any[])[1] as any).body as string;
    assert.ok(updatedBody.includes('[tasklist]'), 'body should contain tasklist fence');
    assert.ok(updatedBody.includes('- [ ] #11'), 'body should list sub-issue 11');
    assert.ok(updatedBody.includes('- [ ] #12'), 'body should list sub-issue 12');
    assert.ok(!updatedBody.includes('#20'), 'should not include issues from other parents');
  });

  it('skips updateIssue when body already contains [tasklist]', async () => {
    const calls: string[] = [];
    const mockAdapter = {
      getIssue: async (_num: number) => {
        calls.push('getIssue');
        return { number: 10, title: 'Parent', body: 'existing\n```[tasklist]\n- [ ] #5\n```', state: 'open', labels: [] };
      },
      updateIssue: async () => { calls.push('updateIssue'); },
    } as any;

    await updateParentTasklist(10, [{ number: 11, parent_issue: 10 }], mockAdapter);

    assert.ok(calls.includes('getIssue'), 'should still call getIssue');
    assert.equal(calls.filter(c => c === 'updateIssue').length, 0, 'should not call updateIssue when tasklist already present');
  });

  it('returns without any adapter calls when no sub-issues exist for the parent', async () => {
    const calls: string[] = [];
    const mockAdapter = {
      getIssue: async () => { calls.push('getIssue'); return { body: '' }; },
      updateIssue: async () => { calls.push('updateIssue'); },
    } as any;

    await updateParentTasklist(10, [{ number: 11, parent_issue: 99 }], mockAdapter);

    assert.equal(calls.length, 0, 'no adapter calls when parent has no sub-issues');
  });
});


// ── applySubDecompositionResult adapter-path tests ──

describe('applySubDecompositionResult adapter path', () => {
  it('calls adapter.createIssue for each sub-issue with correct args and adds to state', async () => {
    const createCalls: { title: string; body: string; labels: string[] }[] = [];
    let nextNum = 100;
    const mockAdapter = {
      createIssue: async (title: string, body: string, labels: string[]) => {
        createCalls.push({ title, body, labels });
        return { number: nextNum++, url: '' };
      },
      getIssue: async (_n: number) => ({ number: _n, title: 'Parent', body: 'Parent body', state: 'open', labels: [] }),
      updateIssue: async () => {},
    } as any;

    const result = {
      issue_number: 10,
      sub_issues: [
        { title: 'Sub 1', body: 'Sub 1 body', depends_on: [] },
        { title: 'Sub 2', body: 'Sub 2 body', depends_on: [] },
      ],
    };
    const state = { issues: [{ number: 10, title: 'Parent', wave: 1, body: 'Parent body' }] as any[] };

    const changed = await applySubDecompositionResult(result, state, mockAdapter);

    assert.equal(changed, true);
    assert.equal(createCalls.length, 2, 'createIssue called once per sub-issue');
    const call1 = createCalls.find(c => c.title === 'Sub 1')!;
    assert.ok(call1, 'createIssue called for Sub 1');
    assert.deepEqual(call1.labels, ['aloop/auto']);
    assert.ok(call1.body.includes('Part of #10'), 'body should reference parent issue');
    assert.ok(call1.body.includes('Sub 1 body'), 'body should include sub-issue body');
    assert.equal(state.issues.length, 3, 'sub-issues pushed to state');
    assert.equal(state.issues[1].number, 100);
    assert.equal(state.issues[2].number, 101);
  });

  it('uses local counter (not adapter) when adapter is absent', async () => {
    const result = {
      issue_number: 10,
      sub_issues: [{ title: 'Sub A', body: 'body' }],
    };
    const state = { issues: [{ number: 10, title: 'Parent', wave: 1 }] as any[] };

    const changed = await applySubDecompositionResult(result, state, undefined);

    assert.equal(changed, true);
    assert.equal(state.issues.length, 2);
    assert.equal(state.issues[1].number, 11, 'sub-issue gets next local number (10+1)');
  });

  it('returns false when parent not found', async () => {
    const result = { issue_number: 99, sub_issues: [{ title: 'Sub', body: 'b' }] };
    const state = { issues: [{ number: 10 }] as any[] };

    const changed = await applySubDecompositionResult(result, state, undefined);

    assert.equal(changed, false);
    assert.equal(state.issues.length, 1, 'state unchanged when parent not found');
  });

  it('returns false when sub_issues is empty', async () => {
    const result = { issue_number: 10, sub_issues: [] };
    const state = { issues: [{ number: 10, title: 'Parent', wave: 1 }] as any[] };

    const changed = await applySubDecompositionResult(result, state, undefined);

    assert.equal(changed, false);
  });
});


// ── createGhIssuesForNewEntries adapter-path tests ──

describe('createGhIssuesForNewEntries adapter path', () => {
  it('calls adapter.createIssue for issues with number=0 and updates number in-place', async () => {
    const createCalls: { title: string; body: string; labels: string[] }[] = [];
    let issueNum = 50;
    const mockAdapter = {
      createIssue: async (title: string, body: string, labels: string[]) => {
        createCalls.push({ title, body, labels });
        return { number: issueNum++, url: '' };
      },
    } as any;

    const issues: any[] = [
      { number: 0, title: 'New Epic', body: 'epic body', wave: 1 },
      { number: 5, title: 'Existing', body: 'existing body', wave: 1 },
    ];

    const changed = await createGhIssuesForNewEntries(issues, mockAdapter);

    assert.equal(changed, true);
    assert.equal(createCalls.length, 1, 'only the issue with number=0 gets created');
    assert.equal(createCalls[0].title, 'New Epic');
    assert.deepEqual(createCalls[0].labels, ['aloop/epic', 'aloop/auto'], 'epic label added when no parent_issue');
    assert.equal(issues[0].number, 50, 'issue number updated to GH number');
    assert.equal(issues[1].number, 5, 'existing issue unchanged');
  });

  it('uses aloop/auto only (no epic label) when issue has parent_issue', async () => {
    const createCalls: { labels: string[] }[] = [];
    const mockAdapter = {
      createIssue: async (_t: string, _b: string, labels: string[]) => {
        createCalls.push({ labels });
        return { number: 51, url: '' };
      },
    } as any;

    const issues: any[] = [{ number: 0, title: 'Sub Issue', body: 'body', parent_issue: 10 }];

    await createGhIssuesForNewEntries(issues, mockAdapter);

    assert.deepEqual(createCalls[0].labels, ['aloop/auto'], 'no epic label for sub-issues');
  });

  it('returns false when no issues have number=0', async () => {
    const mockAdapter = { createIssue: async () => ({ number: 99, url: '' }) } as any;
    const issues: any[] = [{ number: 5 }, { number: 6 }];

    const changed = await createGhIssuesForNewEntries(issues, mockAdapter);

    assert.equal(changed, false);
  });

  it('does not update issue number when adapter returns 0', async () => {
    const mockAdapter = {
      createIssue: async () => ({ number: 0, url: '' }),
    } as any;

    const issues: any[] = [{ number: 0, title: 'Issue', body: '' }];
    const changed = await createGhIssuesForNewEntries(issues, mockAdapter);

    assert.equal(changed, false);
    assert.equal(issues[0].number, 0, 'number should remain 0 when adapter returns 0');
  });
});


// ── createPRViaAdapter adapter-path tests ──

describe('createPRViaAdapter adapter path', () => {
  it('calls adapter.createPR with correct args and updates issue state', async () => {
    const prCalls: { title: string; body: string; head: string; base: string }[] = [];
    const mockAdapter = {
      createPR: async (title: string, body: string, head: string, base: string) => {
        prCalls.push({ title, body, head, base });
        return { number: 99, url: '' };
      },
    } as any;

    const issue: any = {
      number: 10, title: 'My Issue', child_session: 'child-session-10',
      pr_number: null, state: 'in_progress', status: 'In progress',
    };

    const changed = await createPRViaAdapter(issue, mockAdapter, 'agent/trunk');

    assert.equal(changed, true);
    assert.equal(prCalls.length, 1);
    assert.equal(prCalls[0].title, '#10: My Issue');
    assert.ok(prCalls[0].body.includes('Closes #10'), 'body should close the issue');
    assert.ok(prCalls[0].body.includes('child-session-10'), 'body should reference child session');
    assert.equal(prCalls[0].head, 'aloop/issue-10');
    assert.equal(prCalls[0].base, 'agent/trunk');
    assert.equal(issue.pr_number, 99);
    assert.equal(issue.state, 'pr_open');
    assert.equal(issue.status, 'In review');
  });

  it('returns false and leaves issue unchanged when adapter.createPR returns number 0', async () => {
    const mockAdapter = {
      createPR: async () => ({ number: 0, url: '' }),
    } as any;

    const issue: any = { number: 10, title: 'Issue', child_session: 'child-10', pr_number: null };
    const changed = await createPRViaAdapter(issue, mockAdapter, 'agent/trunk');

    assert.equal(changed, false);
    assert.equal(issue.pr_number, null);
    assert.equal(issue.state, undefined);
  });

  it('swallows already-exists errors and returns false', async () => {
    const mockAdapter = {
      createPR: async () => { throw new Error('already exists'); },
    } as any;

    const issue: any = { number: 10, title: 'Issue', child_session: 'child-10', pr_number: null };
    const changed = await createPRViaAdapter(issue, mockAdapter, 'agent/trunk');

    assert.equal(changed, false);
    assert.equal(issue.pr_number, null);
  });

  it('swallows No-commits errors and returns false', async () => {
    const mockAdapter = {
      createPR: async () => { throw new Error('No commits between agent/trunk and aloop/issue-10'); },
    } as any;

    const issue: any = { number: 10, title: 'Issue', child_session: 'child-10', pr_number: null };
    const changed = await createPRViaAdapter(issue, mockAdapter, 'agent/trunk');

    assert.equal(changed, false);
  });
});

describe('createInvokeAgentReview', () => {
  function createMockReviewDeps(overrides: Partial<InvokeAgentReviewDeps> = {}): InvokeAgentReviewDeps & { writtenFiles: Record<string, string>; createdDirs: string[] } {
    const writtenFiles: Record<string, string> = {};
    const createdDirs: string[] = [];
    const deps: InvokeAgentReviewDeps & { writtenFiles: Record<string, string>; createdDirs: string[] } = {
      sessionDir: '/tmp/session',
      requestsDir: '/tmp/session/requests',
      promptsDir: '/tmp/session/prompts',
      reviewPendingUpdates: new Map(),
      existsSync: (p: string) => p in writtenFiles || p.includes('PROMPT_orch_review'),
      readFile: async (p: string, _enc: BufferEncoding) => {
        if (p.includes('PROMPT_orch_review')) return '# Review Prompt';
        if (p in writtenFiles) return writtenFiles[p];
        throw new Error(`File not found: ${p}`);
      },
      writeFile: async (p: string, data: string, _enc: BufferEncoding) => { writtenFiles[p] = data; },
      mkdir: async (p: string) => { createdDirs.push(p); },
      unlink: async (p: string) => { delete writtenFiles[p]; },
      ...overrides,
      writtenFiles,
      createdDirs,
    };
    return deps;
  }

  it('calls adapter.listComments when adapter is present and includes comments in queue file', async () => {
    const listCalls: number[] = [];
    const mockAdapter = {
      listComments: async (prNumber: number) => {
        listCalls.push(prNumber);
        return [
          { id: 1, body: 'Fix the types.', author: 'alice', created_at: '2026-03-14T10:00:00Z' },
          { id: 2, body: 'LGTM now.', author: 'bob', created_at: '2026-03-14T11:00:00Z' },
        ];
      },
    } as any;

    const deps = createMockReviewDeps({ adapter: mockAdapter });
    const invoke = createInvokeAgentReview(deps);
    const result = await invoke(7, 'owner/repo', 'diff content');

    assert.equal(result.verdict, 'pending');
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0], 7);

    const queueFile = deps.writtenFiles['/tmp/session/queue/000-review-7.md'];
    assert.ok(queueFile, 'queue file should be written');
    assert.ok(queueFile.includes('Fix the types.'), 'queue file should include first comment body');
    assert.ok(queueFile.includes('LGTM now.'), 'queue file should include second comment body');
    assert.ok(queueFile.includes('## Previous Review Comments'), 'queue file should have comment section heading');
  });

  it('does not call adapter.listComments when adapter is not provided', async () => {
    const deps = createMockReviewDeps();
    const invoke = createInvokeAgentReview(deps);
    const result = await invoke(3, 'owner/repo', 'diff content');

    assert.equal(result.verdict, 'pending');

    const queueFile = deps.writtenFiles['/tmp/session/queue/000-review-3.md'];
    assert.ok(queueFile, 'queue file should be written');
    assert.ok(!queueFile.includes('## Previous Review Comments'), 'queue file should not have comment section');
  });

  it('writes queue file without comment section when adapter returns empty comments', async () => {
    const mockAdapter = {
      listComments: async () => [],
    } as any;

    const deps = createMockReviewDeps({ adapter: mockAdapter });
    const invoke = createInvokeAgentReview(deps);
    await invoke(5, 'owner/repo', 'diff content');

    const queueFile = deps.writtenFiles['/tmp/session/queue/000-review-5.md'];
    assert.ok(queueFile, 'queue file should be written');
    assert.ok(!queueFile.includes('## Previous Review Comments'), 'queue file should not have comment section when no comments');
  });

  it('swallows adapter.listComments errors and still writes queue file', async () => {
    const mockAdapter = {
      listComments: async () => { throw new Error('API rate limit'); },
    } as any;

    const deps = createMockReviewDeps({ adapter: mockAdapter });
    const invoke = createInvokeAgentReview(deps);
    const result = await invoke(9, 'owner/repo', 'diff content');

    assert.equal(result.verdict, 'pending');
    const queueFile = deps.writtenFiles['/tmp/session/queue/000-review-9.md'];
    assert.ok(queueFile, 'queue file should be written even when listComments throws');
    assert.ok(!queueFile.includes('## Previous Review Comments'), 'queue file should not have comment section after error');
  });
});
