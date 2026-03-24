import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  GitHubAdapter,
  LocalAdapter,
  createAdapter,
  type AdapterConfig,
  type OrchestratorAdapter,
} from './adapter.js';
import type { GhExecFn, GhExecResult } from './github-monitor.js';

function mockGh(responses: Record<string, GhExecResult>): GhExecFn {
  return async (args: string[]): Promise<GhExecResult> => {
    const key = args.join(' ');
    for (const [pattern, result] of Object.entries(responses)) {
      if (key.includes(pattern)) return result;
    }
    throw new Error(`Unexpected gh call: ${key}`);
  };
}

const config: AdapterConfig = { type: 'github', repo: 'owner/repo' };

describe('createAdapter', () => {
  it('returns GitHubAdapter for type "github"', () => {
    const adapter = createAdapter(config, async () => ({ stdout: '', stderr: '' }));
    assert.ok(adapter instanceof GitHubAdapter);
  });

  it('throws for unknown adapter type', () => {
    assert.throws(
      () => createAdapter({ type: 'gitlab', repo: 'x/y' }, async () => ({ stdout: '', stderr: '' })),
      /Unknown adapter type: "gitlab"/,
    );
  });
});

describe('GitHubAdapter', () => {
  describe('createIssue', () => {
    it('creates an issue and returns the number', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'https://github.com/owner/repo/issues/42\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const num = await adapter.createIssue({ title: 'Bug', body: 'Details' });
      assert.equal(num, 42);
    });

    it('creates an issue with labels', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return { stdout: 'https://github.com/owner/repo/issues/1\n', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.createIssue({ title: 'T', body: 'B', labels: ['bug', 'p1'] });
      assert.ok(calledArgs.includes('--label'));
      assert.ok(calledArgs.includes('bug'));
      assert.ok(calledArgs.includes('p1'));
    });

    it('works with GHE URLs', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'https://git.corp.example.com/owner/repo/issues/99\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const num = await adapter.createIssue({ title: 'T', body: 'B' });
      assert.equal(num, 99);
    });

    it('throws if issue number cannot be parsed', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'unexpected output\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      await assert.rejects(adapter.createIssue({ title: 'T', body: 'B' }), /Failed to parse issue number/);
    });
  });

  describe('updateIssue', () => {
    it('passes title and body via issue edit', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { title: 'New Title', body: 'New body' });
      const editCall = calls.find((a) => a.includes('edit'));
      assert.ok(editCall, 'expected an issue edit call');
      assert.ok(editCall.includes('--title'));
      assert.ok(editCall.includes('New Title'));
      assert.ok(editCall.includes('--body'));
      assert.ok(editCall.includes('New body'));
    });

    it('calls closeIssue when state is "closed"', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { state: 'closed' });
      const closeCall = calls.find((a) => a.includes('close'));
      assert.ok(closeCall, 'expected a close call');
      assert.ok(closeCall.includes('7'));
    });

    it('calls issue reopen when state is "open"', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { state: 'open' });
      const reopenCall = calls.find((a) => a.includes('reopen'));
      assert.ok(reopenCall, 'expected a reopen call');
      assert.ok(reopenCall.includes('7'));
    });
  });

  describe('closeIssue', () => {
    it('calls gh issue close', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closeIssue(5);
      assert.deepEqual(calledArgs, ['issue', 'close', '5', '--repo', 'owner/repo']);
    });
  });

  describe('getIssue', () => {
    it('returns parsed issue data', async () => {
      const execGh = mockGh({
        'issue view': {
          stdout: JSON.stringify({
            number: 10,
            title: 'Test Issue',
            state: 'OPEN',
            body: 'Body text',
            labels: [{ name: 'bug' }],
            assignees: [{ login: 'alice' }],
            url: 'https://github.com/owner/repo/issues/10',
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const issue = await adapter.getIssue(10);
      assert.equal(issue.number, 10);
      assert.equal(issue.title, 'Test Issue');
      assert.equal(issue.state, 'OPEN');
      assert.deepEqual(issue.labels, ['bug']);
      assert.deepEqual(issue.assignees, ['alice']);
    });
  });

  describe('queryIssues', () => {
    it('lists issues with filters', async () => {
      const execGh = mockGh({
        'issue list': {
          stdout: JSON.stringify([
            { number: 1, title: 'A', state: 'OPEN', labels: [{ name: 'bug' }], assignees: [] },
            { number: 2, title: 'B', state: 'OPEN', labels: [], assignees: [{ login: 'bob' }] },
          ]),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const issues = await adapter.queryIssues({ state: 'open', labels: ['bug'] });
      assert.equal(issues.length, 2);
      assert.equal(issues[0].number, 1);
    });
  });

  describe('createPr', () => {
    it('creates a PR and returns number + url', async () => {
      const execGh = mockGh({
        'pr create': { stdout: 'https://github.com/owner/repo/pull/15\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const pr = await adapter.createPr({ base: 'main', head: 'feat', title: 'PR', body: 'desc' });
      assert.equal(pr.number, 15);
      assert.ok(pr.url.includes('/pull/15'));
    });

    it('works with GHE PR URLs', async () => {
      const execGh = mockGh({
        'pr create': { stdout: 'https://git.corp.example.com/owner/repo/pull/7\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const pr = await adapter.createPr({ base: 'main', head: 'feat', title: 'PR', body: '' });
      assert.equal(pr.number, 7);
    });
  });

  describe('mergePr', () => {
    it('merges with squash by default', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePr(15);
      assert.ok(calledArgs.includes('--squash'));
      assert.ok(calledArgs.includes('--delete-branch'));
    });

    it('supports rebase method', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePr(15, { method: 'rebase' });
      assert.ok(calledArgs.includes('--rebase'));
    });
  });

  describe('getPrStatus', () => {
    it('parses mergeable status', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPrStatus(10);
      assert.equal(status.mergeable, true);
      assert.equal(status.mergeStateStatus, 'CLEAN');
    });

    it('detects non-mergeable', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPrStatus(10);
      assert.equal(status.mergeable, false);
    });
  });

  describe('getPrChecks', () => {
    it('reports passing checks', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            statusCheckRollup: [
              { name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' },
              { name: 'Lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const checks = await adapter.getPrChecks(10);
      assert.equal(checks.passed, true);
      assert.equal(checks.pending, false);
      assert.equal(checks.checks.length, 2);
    });

    it('detects pending checks', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            statusCheckRollup: [
              { name: 'CI', status: 'IN_PROGRESS', conclusion: null },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const checks = await adapter.getPrChecks(10);
      assert.equal(checks.passed, false);
      assert.equal(checks.pending, true);
    });

    it('detects failed checks', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            statusCheckRollup: [
              { name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const checks = await adapter.getPrChecks(10);
      assert.equal(checks.passed, false);
      assert.equal(checks.pending, false);
    });

    it('handles no checks', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({ statusCheckRollup: [] }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const checks = await adapter.getPrChecks(10);
      assert.equal(checks.passed, false);
      assert.equal(checks.pending, false);
    });
  });

  describe('postComment', () => {
    it('posts a comment on an issue', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.postComment(5, 'Hello');
      assert.deepEqual(calledArgs, ['issue', 'comment', '5', '--repo', 'owner/repo', '--body', 'Hello']);
    });
  });

  describe('listComments', () => {
    it('returns parsed comments', async () => {
      const execGh = mockGh({
        'issue view': {
          stdout: JSON.stringify({
            comments: [
              { id: 'IC_123', author: { login: 'alice' }, body: 'Hi', createdAt: '2026-01-01T00:00:00Z' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const comments = await adapter.listComments(5);
      assert.equal(comments.length, 1);
      assert.equal(comments[0].author, 'alice');
      assert.equal(comments[0].body, 'Hi');
    });
  });

  describe('addLabels', () => {
    it('adds each label via separate gh call', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.addLabels(5, ['bug', 'p1']);
      assert.equal(calls.length, 2);
      assert.ok(calls[0].includes('--add-label'));
      assert.ok(calls[0].includes('bug'));
      assert.ok(calls[1].includes('p1'));
    });
  });

  describe('removeLabels', () => {
    it('removes each label via separate gh call', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.removeLabels(5, ['bug']);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes('--remove-label'));
      assert.ok(calls[0].includes('bug'));
    });
  });

  describe('ensureLabelExists', () => {
    it('creates label with --force', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.ensureLabelExists('aloop/task', { color: 'FF0000' });
      assert.ok(calledArgs.includes('label'));
      assert.ok(calledArgs.includes('create'));
      assert.ok(calledArgs.includes('--force'));
      assert.ok(calledArgs.includes('--color'));
      assert.ok(calledArgs.includes('FF0000'));
    });
  });

  describe('repoSlug and baseUrl', () => {
    it('exposes repoSlug from config', () => {
      const adapter = new GitHubAdapter(config, async () => ({ stdout: '', stderr: '' }));
      assert.equal(adapter.repoSlug, 'owner/repo');
    });

    it('defaults baseUrl to https://github.com', () => {
      const adapter = new GitHubAdapter(config, async () => ({ stdout: '', stderr: '' }));
      assert.equal(adapter.baseUrl, 'https://github.com');
    });

    it('uses ghHost from config for baseUrl', () => {
      const gheConfig: AdapterConfig = { type: 'github', repo: 'owner/repo', ghHost: 'git.corp.example.com' };
      const adapter = new GitHubAdapter(gheConfig, async () => ({ stdout: '', stderr: '' }));
      assert.equal(adapter.baseUrl, 'https://git.corp.example.com');
    });
  });

  describe('fetchBulkIssueState', () => {
    it('delegates to fetchBulkIssueState from github-monitor', async () => {
      const graphqlResponse = {
        data: {
          repository: {
            issues: {
              nodes: [
                {
                  number: 1,
                  title: 'Issue 1',
                  state: 'OPEN',
                  updatedAt: '2026-01-01T00:00:00Z',
                  labels: { nodes: [{ name: 'bug' }] },
                  assignees: { nodes: [] },
                  comments: { nodes: [] },
                  projectItems: { nodes: [] },
                  timelineItems: { nodes: [] },
                },
              ],
            },
          },
        },
      };
      const execGh = mockGh({
        'api graphql': { stdout: JSON.stringify(graphqlResponse), stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const result = await adapter.fetchBulkIssueState({ states: ['OPEN'] });
      assert.equal(result.issues.length, 1);
      assert.equal(result.issues[0].number, 1);
    });
  });
});

// ----- LocalAdapter tests -----

describe('LocalAdapter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'adapter-test-'));
  });

  // Cleanup after each test (best-effort)
  const cleanup = async () => { await rm(tmpDir, { recursive: true, force: true }); };

  it('is returned by createAdapter for type "local"', async () => {
    const adapter = createAdapter({ type: 'local', repo: 'test', dir: tmpDir }, async () => ({ stdout: '', stderr: '' }));
    assert.ok(adapter instanceof LocalAdapter);
    await cleanup();
  });

  describe('createIssue / getIssue', () => {
    it('creates and retrieves an issue', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      const num = await adapter.createIssue({ title: 'Hello', body: 'World', labels: ['bug'] });
      assert.equal(num, 1);
      const issue = await adapter.getIssue(1);
      assert.equal(issue.number, 1);
      assert.equal(issue.title, 'Hello');
      assert.equal(issue.body, 'World');
      assert.equal(issue.state, 'OPEN');
      assert.deepEqual(issue.labels, ['bug']);
      await cleanup();
    });

    it('auto-increments issue numbers', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      const n1 = await adapter.createIssue({ title: 'A', body: '' });
      const n2 = await adapter.createIssue({ title: 'B', body: '' });
      assert.equal(n1, 1);
      assert.equal(n2, 2);
      await cleanup();
    });
  });

  describe('updateIssue', () => {
    it('updates title and body', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'Old', body: 'Old body' });
      await adapter.updateIssue(1, { title: 'New', body: 'New body' });
      const issue = await adapter.getIssue(1);
      assert.equal(issue.title, 'New');
      assert.equal(issue.body, 'New body');
      await cleanup();
    });

    it('closes issue via state update', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'T', body: '' });
      await adapter.updateIssue(1, { state: 'closed' });
      const issue = await adapter.getIssue(1);
      assert.equal(issue.state, 'CLOSED');
      await cleanup();
    });
  });

  describe('closeIssue', () => {
    it('sets state to CLOSED', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'T', body: '' });
      await adapter.closeIssue(1);
      const issue = await adapter.getIssue(1);
      assert.equal(issue.state, 'CLOSED');
      await cleanup();
    });
  });

  describe('queryIssues', () => {
    it('returns open issues by default', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'A', body: '' });
      await adapter.createIssue({ title: 'B', body: '' });
      await adapter.closeIssue(2);
      const issues = await adapter.queryIssues();
      assert.equal(issues.length, 1);
      assert.equal(issues[0].number, 1);
      await cleanup();
    });

    it('filters by label', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'A', body: '', labels: ['bug'] });
      await adapter.createIssue({ title: 'B', body: '', labels: ['enhancement'] });
      const issues = await adapter.queryIssues({ labels: ['bug'] });
      assert.equal(issues.length, 1);
      assert.equal(issues[0].title, 'A');
      await cleanup();
    });

    it('returns all issues when state is "all"', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'A', body: '' });
      await adapter.createIssue({ title: 'B', body: '' });
      await adapter.closeIssue(2);
      const issues = await adapter.queryIssues({ state: 'all' });
      assert.equal(issues.length, 2);
      await cleanup();
    });
  });

  describe('comments', () => {
    it('posts and lists comments', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'T', body: '' });
      await adapter.postComment(1, 'First comment');
      await adapter.postComment(1, 'Second comment');
      const comments = await adapter.listComments(1);
      assert.equal(comments.length, 2);
      assert.equal(comments[0].body, 'First comment');
      assert.equal(comments[1].body, 'Second comment');
      assert.equal(comments[0].id, 1);
      assert.equal(comments[1].id, 2);
      await cleanup();
    });
  });

  describe('labels', () => {
    it('adds labels without duplicates', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'T', body: '', labels: ['existing'] });
      await adapter.addLabels(1, ['new', 'existing']);
      const issue = await adapter.getIssue(1);
      assert.deepEqual(issue.labels, ['existing', 'new']);
      await cleanup();
    });

    it('removes labels', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'T', body: '', labels: ['bug', 'p1'] });
      await adapter.removeLabels(1, ['bug']);
      const issue = await adapter.getIssue(1);
      assert.deepEqual(issue.labels, ['p1']);
      await cleanup();
    });

    it('ensureLabelExists is a no-op', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await assert.doesNotReject(adapter.ensureLabelExists('any-label'));
      await cleanup();
    });
  });

  describe('createPr', () => {
    it('creates a PR file and returns number + url', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      const pr = await adapter.createPr({ base: 'main', head: 'feat/x', title: 'My PR', body: 'desc' });
      assert.equal(pr.number, 1);
      assert.ok(pr.url.includes('1.json'));
      await cleanup();
    });
  });

  describe('mergePr', () => {
    it('uses squash merge and deletes branch by default', async () => {
      const calls: string[][] = [];
      const execGit = async (args: string[]) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'My PR', body: '' });
      await adapter.mergePr(1);
      assert.ok(calls.some((a) => a.includes('--squash')), 'expected --squash call');
      assert.ok(calls.some((a) => a[0] === 'commit'), 'expected commit after squash');
      assert.ok(calls.some((a) => a.includes('-d') && a.includes('feat/x')), 'expected branch delete');
      await cleanup();
    });

    it('uses rebase when method is "rebase"', async () => {
      const calls: string[][] = [];
      const execGit = async (args: string[]) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'My PR', body: '' });
      await adapter.mergePr(1, { method: 'rebase' });
      assert.ok(calls.some((a) => a[0] === 'rebase' && a.includes('feat/x')), 'expected rebase call');
      await cleanup();
    });

    it('uses --no-ff merge when method is "merge"', async () => {
      const calls: string[][] = [];
      const execGit = async (args: string[]) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'My PR', body: '' });
      await adapter.mergePr(1, { method: 'merge' });
      assert.ok(calls.some((a) => a.includes('--no-ff')), 'expected --no-ff merge call');
      await cleanup();
    });

    it('skips branch delete when deleteBranch is false', async () => {
      const calls: string[][] = [];
      const execGit = async (args: string[]) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'My PR', body: '' });
      await adapter.mergePr(1, { deleteBranch: false });
      assert.ok(!calls.some((a) => a.includes('-d')), 'expected no branch delete call');
      await cleanup();
    });
  });

  describe('getPrStatus', () => {
    it('returns mergeable=true and CLEAN when branch exists', async () => {
      const execGit = async (_args: string[]) => ({ stdout: 'abc123', stderr: '' });
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'PR', body: '' });
      const status = await adapter.getPrStatus(1);
      assert.equal(status.mergeable, true);
      assert.equal(status.mergeStateStatus, 'CLEAN');
      await cleanup();
    });

    it('returns mergeable=false and UNKNOWN when rev-parse fails', async () => {
      const execGit = async (_args: string[]) => { throw new Error('branch not found'); };
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir }, execGit);
      await adapter.createPr({ base: 'main', head: 'feat/x', title: 'PR', body: '' });
      const status = await adapter.getPrStatus(1);
      assert.equal(status.mergeable, false);
      assert.equal(status.mergeStateStatus, 'UNKNOWN');
      await cleanup();
    });
  });

  describe('getPrChecks', () => {
    it('returns passed=true with no checks for local adapter', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createPr({ base: 'main', head: 'feat', title: 'PR', body: '' });
      const checks = await adapter.getPrChecks(1);
      assert.equal(checks.passed, true);
      assert.equal(checks.pending, false);
      assert.equal(checks.checks.length, 0);
      await cleanup();
    });
  });

  describe('fetchBulkIssueState', () => {
    it('returns issues matching state filter', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'A', body: '' });
      await adapter.createIssue({ title: 'B', body: '' });
      await adapter.closeIssue(2);
      const result = await adapter.fetchBulkIssueState({ states: ['OPEN'] });
      assert.equal(result.issues.length, 1);
      assert.equal(result.issues[0].number, 1);
      assert.equal(result.fromCache, false);
      await cleanup();
    });

    it('filters by issueNumbers', async () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      await adapter.createIssue({ title: 'A', body: '' });
      await adapter.createIssue({ title: 'B', body: '' });
      const result = await adapter.fetchBulkIssueState({ states: ['OPEN'], issueNumbers: [2] });
      assert.equal(result.issues.length, 1);
      assert.equal(result.issues[0].number, 2);
      await cleanup();
    });
  });

  describe('repoSlug and baseUrl', () => {
    it('exposes repoSlug from config', () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'my-project', dir: tmpDir });
      assert.equal(adapter.repoSlug, 'my-project');
    });

    it('baseUrl is a file:// path to issues dir', () => {
      const adapter = new LocalAdapter({ type: 'local', repo: 'test', dir: tmpDir });
      assert.ok(adapter.baseUrl.startsWith('file://'));
      assert.ok(adapter.baseUrl.includes('.aloop'));
    });
  });
});
