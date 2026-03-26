import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import {
  formatReviewCommentHistory,
  getDirectorySizeBytes,
  pruneLargeV8CacheDir,
  syncMasterToTrunk,
  syncChildBranches,
  buildAndPostProofComment,
  type ChildBranchSyncDeps,
} from './process-requests.js';
import { processCrResultFiles, type CrResultDeps } from './cr-pipeline.js';
import type { OrchestratorIssue } from './orchestrate.js';
import {
  readLatestProofManifest,
  buildProofArtifactsSection,
  buildPrProofBody,
  type ProofArtifactsDeps,
} from './proof-artifacts.js';

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

function makeProofDeps(overrides: Partial<ProofArtifactsDeps> = {}): ProofArtifactsDeps {
  return {
    existsSync: () => false,
    readFile: async () => { throw new Error('not found'); },
    readdir: async () => { throw new Error('not found'); },
    ...overrides,
  };
}

describe('readLatestProofManifest', () => {
  it('returns manifest with artifacts from most recent iteration', async () => {
    const childDir = '/sessions/child-1';
    const manifest = {
      iteration: 2,
      summary: 'All tests pass',
      artifacts: [
        { type: 'screenshot', path: 'screenshot-1.png', description: 'Home page' },
      ],
    };
    const files = new Map<string, string>([
      [`${childDir}/artifacts/iter-2/proof-manifest.json`, JSON.stringify(manifest)],
    ]);
    const dirs = new Map<string, string[]>([
      [`${childDir}/artifacts`, ['iter-1', 'iter-2']],
      [`${childDir}/artifacts/iter-2`, ['proof-manifest.json', 'screenshot-1.png']],
    ]);
    const testDeps = makeProofDeps({
      existsSync: (p: string) => files.has(p) || dirs.has(p),
      readFile: async (p: string) => {
        const c = files.get(p);
        if (c === undefined) throw new Error(`ENOENT: ${p}`);
        return c;
      },
      readdir: async (p: string) => {
        const d = dirs.get(p);
        if (d === undefined) throw new Error(`ENOENT: ${p}`);
        return d;
      },
    });

    const result = await readLatestProofManifest(childDir, testDeps);
    assert.ok(result);
    assert.equal(result!.manifest.artifacts.length, 1);
    assert.equal(result!.manifest.artifacts[0].type, 'screenshot');
    assert.equal(result!.manifest.summary, 'All tests pass');
  });

  it('returns null when no artifacts directory exists', async () => {
    const deps = makeProofDeps();
    const result = await readLatestProofManifest('/missing', deps);
    assert.equal(result, null);
  });

  it('returns null when artifacts directory has no iter-N subdirs', async () => {
    const childDir = '/sessions/child-2';
    const dirs = new Map<string, string[]>([
      [`${childDir}/artifacts`, ['some-file.txt']],
    ]);
    const testDeps = makeProofDeps({
      existsSync: (p: string) => dirs.has(p),
      readdir: async (p: string) => {
        const d = dirs.get(p);
        if (d === undefined) throw new Error(`ENOENT: ${p}`);
        return d;
      },
    });

    const result = await readLatestProofManifest(childDir, testDeps);
    assert.equal(result, null);
  });
});

describe('buildProofArtifactsSection', () => {
  it('returns empty string when result is null', () => {
    assert.equal(buildProofArtifactsSection(null), '');
  });

  it('builds section with artifacts from manifest', () => {
    const result = {
      manifest: {
        iteration: 1,
        summary: 'QA passed',
        artifacts: [
          { type: 'screenshot', path: 'screen.png', description: 'Login page' },
          { type: 'cli_output', path: 'output.txt', description: 'Build output' },
        ],
      },
      iterDir: '/sessions/child/artifacts/iter-1',
      childDir: '/sessions/child',
    };
    const section = buildProofArtifactsSection(result);
    assert.ok(section.includes('## Proof Artifacts'));
    assert.ok(section.includes('QA passed'));
    assert.ok(section.includes('**screenshot**'));
    assert.ok(section.includes('Login page'));
    assert.ok(section.includes('**cli_output**'));
  });

  it('shows skip reason when artifacts array is empty', () => {
    const result = {
      manifest: {
        iteration: 1,
        skipped: [{ task: 'screenshots', reason: 'No UI changes' }],
        artifacts: [],
      },
      iterDir: '/sessions/child/artifacts/iter-1',
      childDir: '/sessions/child',
    };
    const section = buildProofArtifactsSection(result);
    assert.ok(section.includes('Proof skipped'));
    assert.ok(section.includes('No UI changes'));
  });
});

describe('buildAndPostProofComment', () => {
  it('returns empty string when no manifest exists', async () => {
    const deps = {
      execGh: async () => ({ stdout: '', stderr: '' }),
      proofDeps: makeProofDeps(),
    };
    const result = await buildAndPostProofComment(42, 'owner/repo', '/child', deps);
    assert.equal(result, '');
  });

  it('returns section without posting comment when no screenshots', async () => {
    const childDir = '/child-3';
    const manifest = {
      iteration: 1,
      summary: 'Tests pass',
      artifacts: [{ type: 'cli_output', path: 'out.txt', description: 'CLI output' }],
    };
    const files = new Map<string, string>([
      [`${childDir}/artifacts/iter-1/proof-manifest.json`, JSON.stringify(manifest)],
    ]);
    const dirs = new Map<string, string[]>([
      [`${childDir}/artifacts`, ['iter-1']],
      [`${childDir}/artifacts/iter-1`, ['proof-manifest.json', 'out.txt']],
    ]);
    let commentCalled = false;
    const deps = {
      execGh: async () => { commentCalled = true; return { stdout: '', stderr: '' }; },
      proofDeps: makeProofDeps({
        existsSync: (p: string) => files.has(p) || dirs.has(p),
        readFile: async (p: string) => {
          const c = files.get(p);
          if (c === undefined) throw new Error(`ENOENT: ${p}`);
          return c;
        },
        readdir: async (p: string) => {
          const d = dirs.get(p);
          if (d === undefined) throw new Error(`ENOENT: ${p}`);
          return d;
        },
      }),
    };

    const section = await buildAndPostProofComment(42, 'owner/repo', childDir, deps);
    assert.ok(section.includes('## Proof Artifacts'));
    assert.equal(commentCalled, false);
  });

  it('posts PR comment when manifest has screenshot artifacts', async () => {
    const childDir = '/child-4';
    const manifest = {
      iteration: 1,
      summary: 'UI verified',
      artifacts: [
        { type: 'screenshot', path: 'screen.png', description: 'Dashboard' },
      ],
    };
    const files = new Map<string, string>([
      [`${childDir}/artifacts/iter-1/proof-manifest.json`, JSON.stringify(manifest)],
    ]);
    const dirs = new Map<string, string[]>([
      [`${childDir}/artifacts`, ['iter-1']],
      [`${childDir}/artifacts/iter-1`, ['proof-manifest.json', 'screen.png']],
    ]);
    let commentArgs: string[] = [];
    const deps = {
      execGh: async (args: string[]) => { commentArgs = args; return { stdout: 'ok', stderr: '' }; },
      proofDeps: makeProofDeps({
        existsSync: (p: string) => files.has(p) || dirs.has(p),
        readFile: async (p: string) => {
          const c = files.get(p);
          if (c === undefined) throw new Error(`ENOENT: ${p}`);
          return c;
        },
        readdir: async (p: string) => {
          const d = dirs.get(p);
          if (d === undefined) throw new Error(`ENOENT: ${p}`);
          return d;
        },
      }),
    };

    const section = await buildAndPostProofComment(99, 'owner/repo', childDir, deps);
    assert.ok(section.includes('## Proof Artifacts'));
    assert.ok(section.includes('Dashboard'));
    const commentBody = commentArgs[commentArgs.indexOf('--body') + 1];
    assert.ok(commentBody.includes('![](.proof/screen.png)'), 'comment should embed screenshot image');
    assert.deepEqual(commentArgs.slice(0, 6), ['pr', 'comment', '99', '--repo', 'owner/repo', '--body']);
  });
});

describe('buildPrProofBody', () => {
  it('returns empty string when result is null', () => {
    assert.equal(buildPrProofBody(null), '');
  });

  it('embeds screenshots as images using .proof/ relative paths', () => {
    const result = {
      manifest: {
        iteration: 1,
        summary: 'UI verified',
        artifacts: [
          { type: 'screenshot', path: 'screen.png', description: 'Dashboard' },
        ],
      },
      iterDir: '/sessions/child/artifacts/iter-1',
      childDir: '/sessions/child',
    };
    const body = buildPrProofBody(result);
    assert.ok(body.includes('## Proof Artifacts'));
    assert.ok(body.includes('![](.proof/screen.png)'));
    assert.ok(body.includes('**screenshot**'));
  });

  it('lists non-screenshot artifacts without image syntax', () => {
    const result = {
      manifest: {
        iteration: 1,
        summary: 'Mixed proof',
        artifacts: [
          { type: 'screenshot', path: 'screen.png', description: 'UI' },
          { type: 'cli_output', path: 'output.txt', description: 'Build output' },
        ],
      },
      iterDir: '/sessions/child/artifacts/iter-1',
      childDir: '/sessions/child',
    };
    const body = buildPrProofBody(result);
    assert.ok(body.includes('![](.proof/screen.png)'), 'screenshot should have image');
    assert.ok(body.includes('**cli_output**'), 'cli_output type should be listed');
    assert.ok(!body.includes('![](.proof/output.txt)'), 'non-screenshot should not have image');
  });

  it('shows skip reason when artifacts array is empty', () => {
    const result = {
      manifest: {
        iteration: 1,
        skipped: [{ task: 'screenshots', reason: 'No UI changes' }],
        artifacts: [],
      },
      iterDir: '/sessions/child/artifacts/iter-1',
      childDir: '/sessions/child',
    };
    const body = buildPrProofBody(result);
    assert.ok(body.includes('Proof skipped'));
    assert.ok(body.includes('No UI changes'));
  });
});
