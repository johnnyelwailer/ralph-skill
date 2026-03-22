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

function mockExecGh(responses: Array<{ stdout: string; stderr?: string }>): {
  execGh: GhExecFn;
  calls: string[][];
} {
  const calls: string[][] = [];
  let callIndex = 0;
  const execGh: GhExecFn = async (args: string[]) => {
    calls.push(args);
    const response = responses[callIndex++];
    if (!response) throw new Error(`Unexpected call #${callIndex}: ${args.join(' ')}`);
    return { stdout: response.stdout, stderr: response.stderr ?? '' };
  };
  return { execGh, calls };
}

function makeAdapter(execGh: GhExecFn): GitHubAdapter {
  return new GitHubAdapter({ type: 'github', repo: 'owner/repo' }, execGh);
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

// --- createReview tests ---

describe('GitHubAdapter.createReview', () => {
  it('POSTs to the correct endpoint with event and body', async () => {
    const { execGh, calls } = mockExecGh([
      { stdout: JSON.stringify({ id: 42 }) },
    ]);
    const adapter = makeAdapter(execGh);

    const result = await adapter.createReview(7, {
      body: 'Looks good overall',
      event: 'COMMENT',
      comments: [],
    });

    assert.equal(result.review_id, 42);
    assert.equal(calls.length, 1);
    const args = calls[0];
    assert.ok(args.includes('api'));
    assert.ok(args.includes('repos/owner/repo/pulls/7/reviews'));
    assert.ok(args.includes('--method'));
    assert.ok(args.includes('POST'));
    // Check event and body fields
    assert.ok(args.includes('event=COMMENT'));
    assert.ok(args.includes('body=Looks good overall'));
  });

  it('formats inline comments without suggestions', async () => {
    const { execGh, calls } = mockExecGh([
      { stdout: JSON.stringify({ id: 100 }) },
    ]);
    const adapter = makeAdapter(execGh);

    await adapter.createReview(3, {
      body: 'Changes requested',
      event: 'REQUEST_CHANGES',
      comments: [
        { path: 'src/index.ts', line: 10, body: 'This needs a null check' },
      ],
    });

    const args = calls[0];
    // Find the --raw-field argument for comments
    const rawFieldIdx = args.indexOf('--raw-field');
    assert.ok(rawFieldIdx >= 0, 'should use --raw-field for comments');
    const commentsArg = args[rawFieldIdx + 1];
    assert.ok(commentsArg.startsWith('comments='));
    const commentsJson = JSON.parse(commentsArg.slice('comments='.length));
    assert.equal(commentsJson.length, 1);
    assert.equal(commentsJson[0].path, 'src/index.ts');
    assert.equal(commentsJson[0].line, 10);
    assert.equal(commentsJson[0].body, 'This needs a null check');
  });

  it('wraps suggestion in code fence syntax', async () => {
    const { execGh, calls } = mockExecGh([
      { stdout: JSON.stringify({ id: 101 }) },
    ]);
    const adapter = makeAdapter(execGh);

    await adapter.createReview(5, {
      body: 'Suggestion',
      event: 'REQUEST_CHANGES',
      comments: [
        {
          path: 'src/example.ts',
          line: 20,
          body: 'Consider this instead',
          suggestion: 'const x = 42;',
        },
      ],
    });

    const args = calls[0];
    const rawFieldIdx = args.indexOf('--raw-field');
    const commentsJson = JSON.parse(args[rawFieldIdx + 1].slice('comments='.length));
    const expectedBody = 'Consider this instead\n\n```suggestion\nconst x = 42;\n```';
    assert.equal(commentsJson[0].body, expectedBody);
  });

  it('sends empty comments array when no inline comments', async () => {
    const { execGh, calls } = mockExecGh([
      { stdout: JSON.stringify({ id: 200 }) },
    ]);
    const adapter = makeAdapter(execGh);

    await adapter.createReview(1, {
      body: 'LGTM',
      event: 'APPROVE',
      comments: [],
    });

    const args = calls[0];
    const rawFieldIdx = args.indexOf('--raw-field');
    const commentsJson = JSON.parse(args[rawFieldIdx + 1].slice('comments='.length));
    assert.deepEqual(commentsJson, []);
  });

  it('throws on malformed API response', async () => {
    const { execGh } = mockExecGh([
      { stdout: 'not json' },
    ]);
    const adapter = makeAdapter(execGh);

    await assert.rejects(
      () => adapter.createReview(1, { body: 'x', event: 'COMMENT', comments: [] }),
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

// --- resolveThread tests ---

describe('GitHubAdapter.resolveThread', () => {
  it('fetches node_id then calls GraphQL minimizeComment', async () => {
    const { execGh, calls } = mockExecGh([
      { stdout: 'MDI0OlB1bGxSZXF1ZXN0UmV2aWV3Q29tbWVudDE=' },
      { stdout: JSON.stringify({ data: { minimizeComment: { minimizedComment: { isMinimized: true } } } }) },
    ]);
    const adapter = makeAdapter(execGh);

    await adapter.resolveThread(7, 1234);

    assert.equal(calls.length, 2);
    // First call: fetch node_id
    assert.ok(calls[0].includes('repos/owner/repo/pulls/comments/1234'));
    assert.ok(calls[0].includes('--jq'));
    assert.ok(calls[0].includes('.node_id'));
    // Second call: GraphQL mutation
    assert.ok(calls[1].includes('graphql'));
    const queryArg = calls[1].find((a) => a.startsWith('query='));
    assert.ok(queryArg);
    assert.ok(queryArg.includes('minimizeComment'));
    assert.ok(queryArg.includes('MDI0OlB1bGxSZXF1ZXN0UmV2aWV3Q29tbWVudDE='));
    assert.ok(queryArg.includes('RESOLVED'));
  });

  it('throws when node_id is empty', async () => {
    const { execGh } = mockExecGh([
      { stdout: '  \n' },
    ]);
    const adapter = makeAdapter(execGh);

    await assert.rejects(
      () => adapter.resolveThread(7, 999),
      (err: Error) => {
        assert.ok(err.message.includes('Could not get node_id for comment 999'));
        return true;
      },
    );
  });

  it('propagates API errors from node_id fetch', async () => {
    const execGh: GhExecFn = async () => {
      throw new Error('API rate limit exceeded');
    };
    const adapter = makeAdapter(execGh);

    await assert.rejects(
      () => adapter.resolveThread(7, 1234),
      (err: Error) => {
        assert.ok(err.message.includes('API rate limit exceeded'));
        return true;
      },
    );
  });
});
