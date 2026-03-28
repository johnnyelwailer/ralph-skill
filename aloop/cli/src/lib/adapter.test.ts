import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubAdapter,
  createAdapter,
  type AdapterConfig,
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
    it('creates an issue and returns number and url', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'https://github.com/owner/repo/issues/42\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const result = await adapter.createIssue('Bug', 'Details', []);
      assert.equal(result.number, 42);
      assert.ok(result.url.includes('/issues/42'));
    });

    it('creates an issue with labels', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return { stdout: 'https://github.com/owner/repo/issues/1\n', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.createIssue('T', 'B', ['bug', 'p1']);
      assert.ok(calledArgs.includes('--label'));
      assert.ok(calledArgs.includes('bug'));
      assert.ok(calledArgs.includes('p1'));
    });

    it('works with GHE URLs', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'https://git.corp.example.com/owner/repo/issues/99\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const result = await adapter.createIssue('T', 'B', []);
      assert.equal(result.number, 99);
    });

    it('throws if issue number cannot be parsed', async () => {
      const execGh = mockGh({
        'issue create': { stdout: 'unexpected output\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      await assert.rejects(adapter.createIssue('T', 'B', []), /Failed to parse issue number/);
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

    it('calls addLabels when labelsAdd provided', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { labelsAdd: ['bug', 'p1'] });
      const addCalls = calls.filter((a) => a.includes('--add-label'));
      assert.equal(addCalls.length, 2);
      assert.ok(addCalls[0].includes('bug'));
      assert.ok(addCalls[1].includes('p1'));
    });

    it('calls removeLabels when labelsRemove provided', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { labelsRemove: ['wontfix'] });
      const removeCalls = calls.filter((a) => a.includes('--remove-label'));
      assert.equal(removeCalls.length, 1);
      assert.ok(removeCalls[0].includes('wontfix'));
    });
  });

  describe('closeIssue', () => {
    it('calls gh issue close', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closeIssue(5, '');
      assert.deepEqual(calledArgs, ['issue', 'close', '5', '--repo', 'owner/repo']);
    });

    it('passes reason as --comment when provided', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closeIssue(5, 'Closing: duplicate');
      assert.ok(calledArgs.includes('--comment'));
      assert.ok(calledArgs.includes('Closing: duplicate'));
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

  describe('listIssues', () => {
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
      const issues = await adapter.listIssues({ state: 'open', labels: ['bug'] });
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
    it('merges with squash strategy', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePr(15, 'squash');
      assert.ok(calledArgs.includes('--squash'));
      assert.ok(calledArgs.includes('--delete-branch'));
    });

    it('supports rebase strategy', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePr(15, 'rebase');
      assert.ok(calledArgs.includes('--rebase'));
    });

    it('supports merge strategy', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePr(15, 'merge');
      assert.ok(calledArgs.includes('--merge'));
    });
  });

  describe('getPrStatus', () => {
    it('returns state, mergeable, and checks', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            state: 'OPEN',
            mergeable: 'MERGEABLE',
            statusCheckRollup: [
              { name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPrStatus(10);
      assert.equal(status.state, 'OPEN');
      assert.equal(status.mergeable, true);
      assert.equal(status.checks.length, 1);
      assert.equal(status.checks[0].name, 'CI');
      assert.equal(status.checks[0].conclusion, 'SUCCESS');
    });

    it('detects non-mergeable', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({ state: 'OPEN', mergeable: 'CONFLICTING', statusCheckRollup: [] }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPrStatus(10);
      assert.equal(status.mergeable, false);
      assert.equal(status.checks.length, 0);
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

  describe('getIssueComments', () => {
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
      const comments = await adapter.getIssueComments(5);
      assert.equal(comments.length, 1);
      assert.equal(comments[0].author, 'alice');
      assert.equal(comments[0].body, 'Hi');
    });

    it('uses api endpoint when since is provided', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return {
          stdout: JSON.stringify([
            { id: 1, user: { login: 'bob' }, body: 'Later', created_at: '2026-02-01T00:00:00Z' },
          ]),
          stderr: '',
        };
      };
      const adapter = new GitHubAdapter(config, execGh);
      const comments = await adapter.getIssueComments(5, '2026-01-01T00:00:00Z');
      assert.ok(calledArgs.includes('api'));
      assert.equal(comments.length, 1);
      assert.equal(comments[0].author, 'bob');
    });
  });

  describe('getPrComments', () => {
    it('returns PR comments via api', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return {
          stdout: JSON.stringify([
            { id: 10, user: { login: 'carol' }, body: 'LGTM', created_at: '2026-03-01T00:00:00Z' },
          ]),
          stderr: '',
        };
      };
      const adapter = new GitHubAdapter(config, execGh);
      const comments = await adapter.getPrComments(15);
      assert.ok(calledArgs.includes('api'));
      assert.equal(comments.length, 1);
      assert.equal(comments[0].author, 'carol');
      assert.equal(comments[0].body, 'LGTM');
    });

    it('passes since filter when provided', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return { stdout: '[]', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.getPrComments(15, '2026-01-01T00:00:00Z');
      assert.ok(calledArgs.includes('-f'));
      assert.ok(calledArgs.some((a) => a.includes('since=')));
    });
  });

  describe('getPrReviews', () => {
    it('returns PR reviews via api', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return {
          stdout: JSON.stringify([
            { id: 100, user: { login: 'dave' }, state: 'APPROVED', body: 'Looks good' },
            { id: 101, user: { login: 'eve' }, state: 'CHANGES_REQUESTED', body: 'Fix this' },
          ]),
          stderr: '',
        };
      };
      const adapter = new GitHubAdapter(config, execGh);
      const reviews = await adapter.getPrReviews(15);
      assert.ok(calledArgs.includes('api'));
      assert.ok(calledArgs.some((a) => a.includes('pulls/15/reviews')));
      assert.equal(reviews.length, 2);
      assert.equal(reviews[0].author, 'dave');
      assert.equal(reviews[0].state, 'APPROVED');
      assert.equal(reviews[1].state, 'CHANGES_REQUESTED');
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

  describe('ensureLabelsExist', () => {
    it('creates each label with --force', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.ensureLabelsExist(['aloop/task', 'aloop/done']);
      assert.equal(calls.length, 2);
      assert.ok(calls[0].includes('label'));
      assert.ok(calls[0].includes('create'));
      assert.ok(calls[0].includes('--force'));
      assert.ok(calls[0].includes('aloop/task'));
      assert.ok(calls[1].includes('aloop/done'));
    });

    it('handles a single label in array', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.ensureLabelsExist(['bug']);
      assert.ok(calledArgs.includes('label'));
      assert.ok(calledArgs.includes('create'));
      assert.ok(calledArgs.includes('--force'));
      assert.ok(calledArgs.includes('bug'));
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

  describe('closePr', () => {
    it('closes a PR without comment', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closePr(8);
      assert.deepEqual(calledArgs, ['pr', 'close', '8', '--repo', 'owner/repo']);
    });

    it('closes a PR with a comment', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closePr(8, { comment: 'Closing: duplicate' });
      assert.ok(calledArgs.includes('--comment'));
      assert.ok(calledArgs.includes('Closing: duplicate'));
    });
  });

  describe('getPrDiff', () => {
    it('returns the diff output', async () => {
      const execGh = mockGh({
        'pr diff': { stdout: 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const diff = await adapter.getPrDiff(10);
      assert.ok(diff.includes('+const x = 1;'));
    });
  });

  describe('queryPrs', () => {
    it('lists PRs and returns number + url', async () => {
      const execGh = mockGh({
        'pr list': {
          stdout: JSON.stringify([
            { number: 3, url: 'https://github.com/owner/repo/pull/3' },
            { number: 4, url: 'https://github.com/owner/repo/pull/4' },
          ]),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const prs = await adapter.queryPrs();
      assert.equal(prs.length, 2);
      assert.equal(prs[0].number, 3);
      assert.ok(prs[0].url.includes('/pull/3'));
    });

    it('passes head/base/state filters', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return { stdout: '[]', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.queryPrs({ head: 'feat', base: 'main', state: 'open' });
      assert.ok(calledArgs.includes('--head'));
      assert.ok(calledArgs.includes('feat'));
      assert.ok(calledArgs.includes('--base'));
      assert.ok(calledArgs.includes('main'));
      assert.ok(calledArgs.includes('--state'));
      assert.ok(calledArgs.includes('open'));
    });
  });

  describe('checkBranchExists', () => {
    it('returns true when branch exists', async () => {
      const execGh = mockGh({
        'api repos': { stdout: 'feat-branch\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const exists = await adapter.checkBranchExists('feat-branch');
      assert.equal(exists, true);
    });

    it('returns false when branch does not exist', async () => {
      const execGh: GhExecFn = async () => { throw new Error('HTTP 404'); };
      const adapter = new GitHubAdapter(config, execGh);
      const exists = await adapter.checkBranchExists('no-such-branch');
      assert.equal(exists, false);
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
