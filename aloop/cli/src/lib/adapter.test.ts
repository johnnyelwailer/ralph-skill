import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubAdapter,
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
    it('creates an issue and returns the number and url', async () => {
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

  describe('closeIssue', () => {
    it('calls gh issue close', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.closeIssue(5);
      assert.deepEqual(calledArgs, ['issue', 'close', '5', '--repo', 'owner/repo']);
    });
  });

  describe('updateIssue', () => {
    it('body-only update passes --body arg in base edit call', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { body: 'New body' });
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes('--body'));
      assert.ok(calls[0].includes('New body'));
    });

    it('labels_add makes a separate --add-label call per label', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { labels_add: ['bug', 'p1'] });
      // 2 add-label calls only (no base edit call when body is absent)
      assert.equal(calls.length, 2);
      assert.ok(calls[0].includes('--add-label'));
      assert.ok(calls[0].includes('bug'));
      assert.ok(calls[1].includes('--add-label'));
      assert.ok(calls[1].includes('p1'));
    });

    it('labels_remove makes a separate --remove-label call per label', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { labels_remove: ['stale'] });
      // 1 remove-label call only (no base edit call when body is absent)
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes('--remove-label'));
      assert.ok(calls[0].includes('stale'));
    });

    it('label-only update makes no base edit call', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { labels_add: ['p0'], labels_remove: ['p1'] });
      // Only add-label and remove-label calls — no bare "issue edit" base call
      assert.ok(!calls.some((a) => a.join(' ').match(/issue edit \d+ --repo/) && !a.includes('--add-label') && !a.includes('--remove-label')));
      assert.ok(calls.some((a) => a.includes('--add-label') && a.includes('p0')));
      assert.ok(calls.some((a) => a.includes('--remove-label') && a.includes('p1')));
    });

    it('state "closed" calls gh issue close', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { state: 'closed' });
      const closeCall = calls.find((a) => a.includes('close'));
      assert.ok(closeCall, 'expected a gh issue close call');
      assert.ok(closeCall.includes('7'));
    });

    it('state "open" calls gh issue reopen', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { state: 'open' });
      const reopenCall = calls.find((a) => a.includes('reopen'));
      assert.ok(reopenCall, 'expected a gh issue reopen call');
      assert.ok(reopenCall.includes('7'));
    });

    it('combined update with body + labels_add + state makes all calls', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => { calls.push(args); return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.updateIssue(7, { body: 'Updated', labels_add: ['p0'], state: 'closed' });
      // base edit (with --body) + 1 add-label + 1 close = 3 calls
      assert.equal(calls.length, 3);
      assert.ok(calls[0].includes('--body'));
      assert.ok(calls[1].includes('--add-label'));
      assert.ok(calls[2].includes('close'));
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

  describe('createPR', () => {
    it('creates a PR and returns number + url', async () => {
      const execGh = mockGh({
        'pr create': { stdout: 'https://github.com/owner/repo/pull/15\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const pr = await adapter.createPR('PR', 'desc', 'feat', 'main');
      assert.equal(pr.number, 15);
      assert.ok(pr.url.includes('/pull/15'));
    });

    it('works with GHE PR URLs', async () => {
      const execGh = mockGh({
        'pr create': { stdout: 'https://git.corp.example.com/owner/repo/pull/7\n', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const pr = await adapter.createPR('PR', '', 'feat', 'main');
      assert.equal(pr.number, 7);
    });
  });

  describe('listPRs', () => {
    it('lists PRs with default filters', async () => {
      const execGh = mockGh({
        'pr list': {
          stdout: JSON.stringify([
            { number: 1, url: 'https://github.com/owner/repo/pull/1', title: 'PR 1', state: 'OPEN', headRefName: 'feat-a', baseRefName: 'main' },
            { number: 2, url: 'https://github.com/owner/repo/pull/2', title: 'PR 2', state: 'OPEN', headRefName: 'feat-b', baseRefName: 'main' },
          ]),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const prs = await adapter.listPRs({});
      assert.equal(prs.length, 2);
      assert.equal(prs[0].number, 1);
      assert.equal(prs[1].number, 2);
    });

    it('filters by head branch', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => {
        calledArgs = args;
        return { stdout: JSON.stringify([{ number: 5, url: 'https://github.com/owner/repo/pull/5', title: 'Dup PR', state: 'OPEN', headRefName: 'feat-x', baseRefName: 'main' }]), stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      const prs = await adapter.listPRs({ head: 'feat-x', state: 'all' });
      assert.ok(calledArgs.includes('--head'));
      assert.ok(calledArgs.includes('feat-x'));
      assert.equal(prs.length, 1);
      assert.equal(prs[0].number, 5);
    });

    it('passes state filter to gh', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '[]', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.listPRs({ state: 'closed' });
      assert.ok(calledArgs.includes('closed'));
    });

    it('returns empty array when no PRs found', async () => {
      const execGh = mockGh({
        'pr list': { stdout: '[]', stderr: '' },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const prs = await adapter.listPRs({});
      assert.equal(prs.length, 0);
    });
  });

  describe('mergePR', () => {
    it('merges with squash by default', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePR(15, 'squash');
      assert.ok(calledArgs.includes('--squash'));
      assert.ok(calledArgs.includes('--delete-branch'));
    });

    it('supports rebase method', async () => {
      let calledArgs: string[] = [];
      const execGh: GhExecFn = async (args) => { calledArgs = args; return { stdout: '', stderr: '' }; };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.mergePR(15, 'rebase');
      assert.ok(calledArgs.includes('--rebase'));
    });
  });

  describe('getPRStatus', () => {
    it('parses mergeable status with passing CI', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            mergeable: 'MERGEABLE',
            statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
            reviews: [{ state: 'APPROVED' }],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPRStatus(10);
      assert.equal(status.mergeable, true);
      assert.equal(status.ci_status, 'success');
      assert.deepEqual(status.reviews, [{ verdict: 'approved' }]);
    });

    it('detects non-mergeable', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({ mergeable: 'CONFLICTING', statusCheckRollup: [], reviews: [] }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPRStatus(10);
      assert.equal(status.mergeable, false);
    });

    it('detects pending CI', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            mergeable: 'MERGEABLE',
            statusCheckRollup: [{ status: 'IN_PROGRESS', conclusion: null }],
            reviews: [],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPRStatus(10);
      assert.equal(status.ci_status, 'pending');
    });

    it('detects failed CI', async () => {
      const execGh = mockGh({
        'pr view': {
          stdout: JSON.stringify({
            mergeable: 'MERGEABLE',
            statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
            reviews: [],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const status = await adapter.getPRStatus(10);
      assert.equal(status.ci_status, 'failure');
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

    it('since filter returns only comments after the given date', async () => {
      const execGh = mockGh({
        'issue view': {
          stdout: JSON.stringify({
            comments: [
              { id: 'IC_1', author: { login: 'alice' }, body: 'Old', createdAt: '2026-01-01T00:00:00Z' },
              { id: 'IC_2', author: { login: 'bob' }, body: 'New', createdAt: '2026-06-01T00:00:00Z' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const comments = await adapter.listComments(5, '2026-03-01T00:00:00Z');
      assert.equal(comments.length, 1);
      assert.equal(comments[0].body, 'New');
    });

    it('since filter returns empty array when all comments are older than since', async () => {
      const execGh = mockGh({
        'issue view': {
          stdout: JSON.stringify({
            comments: [
              { id: 'IC_1', author: { login: 'alice' }, body: 'Old', createdAt: '2025-01-01T00:00:00Z' },
              { id: 'IC_2', author: { login: 'bob' }, body: 'Also old', createdAt: '2025-06-01T00:00:00Z' },
            ],
          }),
          stderr: '',
        },
      });
      const adapter = new GitHubAdapter(config, execGh);
      const comments = await adapter.listComments(5, '2026-01-01T00:00:00Z');
      assert.equal(comments.length, 0);
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

  describe('setIssueStatus', () => {
    const graphqlResponse = {
      data: {
        repository: {
          issue: {
            projectItems: {
              nodes: [
                {
                  id: 'PVTI_abc',
                  project: { id: 'PVT_xyz' },
                  fieldValues: {
                    nodes: [
                      {
                        field: {
                          id: 'PVTSSF_123',
                          name: 'Status',
                          options: [
                            { id: 'OPT_ready', name: 'Ready' },
                            { id: 'OPT_done', name: 'Done' },
                            { id: 'OPT_inprogress', name: 'In progress' },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    };

    it('calls project item-edit with the correct option id', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => {
        calls.push(args);
        if (args.includes('graphql')) return { stdout: JSON.stringify(graphqlResponse), stderr: '' };
        return { stdout: '', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.setIssueStatus(7, 'Ready');
      const editCall = calls.find((a) => a.includes('item-edit'));
      assert.ok(editCall, 'expected a project item-edit call');
      assert.ok(editCall.includes('PVTI_abc'));
      assert.ok(editCall.includes('PVT_xyz'));
      assert.ok(editCall.includes('PVTSSF_123'));
      assert.ok(editCall.includes('OPT_ready'));
    });

    it('status matching is case-insensitive', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => {
        calls.push(args);
        if (args.includes('graphql')) return { stdout: JSON.stringify(graphqlResponse), stderr: '' };
        return { stdout: '', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.setIssueStatus(7, 'IN PROGRESS');
      const editCall = calls.find((a) => a.includes('item-edit'));
      assert.ok(editCall, 'expected a project item-edit call');
      assert.ok(editCall.includes('OPT_inprogress'));
    });

    it('does nothing when issue has no project', async () => {
      const emptyResponse = { data: { repository: { issue: { projectItems: { nodes: [] } } } } };
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => {
        calls.push(args);
        return { stdout: JSON.stringify(emptyResponse), stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.setIssueStatus(7, 'Ready');
      assert.ok(!calls.some((a) => a.includes('item-edit')));
    });

    it('does nothing when status option not found in project', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => {
        calls.push(args);
        if (args.includes('graphql')) return { stdout: JSON.stringify(graphqlResponse), stderr: '' };
        return { stdout: '', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.setIssueStatus(7, 'Nonexistent Status');
      assert.ok(!calls.some((a) => a.includes('item-edit')));
    });

    it('caches the project context to avoid repeat graphql calls', async () => {
      const calls: string[][] = [];
      const execGh: GhExecFn = async (args) => {
        calls.push(args);
        if (args.includes('graphql')) return { stdout: JSON.stringify(graphqlResponse), stderr: '' };
        return { stdout: '', stderr: '' };
      };
      const adapter = new GitHubAdapter(config, execGh);
      await adapter.setIssueStatus(7, 'Ready');
      await adapter.setIssueStatus(7, 'Done');
      const graphqlCalls = calls.filter((a) => a.includes('graphql'));
      assert.equal(graphqlCalls.length, 1, 'graphql should only be called once due to caching');
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
