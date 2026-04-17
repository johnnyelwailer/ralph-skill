import { test, mock } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import * as child_process from 'node:child_process';
import { processAgentRequests, validateRequest, type RequestProcessorOptions } from './requests.js';

async function setupTestEnv() {
  const tmpBase = path.join(os.tmpdir(), `aloop-test-${Date.now()}`);
  await fs.mkdir(tmpBase, { recursive: true });
  
  const workdir = path.join(tmpBase, 'workdir');
  await fs.mkdir(workdir, { recursive: true });
  
  const aloopDir = path.join(workdir, '.aloop');
  await fs.mkdir(aloopDir, { recursive: true });
  
  const sessionId = 'test-session';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(path.join(sessionDir, 'queue'), { recursive: true });

  // Requests live in sessionDir/requests (spec: <session>/requests/)
  const requestsDir = path.join(sessionDir, 'requests');
  await fs.mkdir(requestsDir, { recursive: true });
  
  const logPath = path.join(sessionDir, 'log.jsonl');
  
  return {
    tmpBase,
    workdir,
    aloopDir,
    requestsDir,
    sessionId,
    sessionDir,
    logPath,
    cleanup: async () => {
      await fs.rm(tmpBase, { recursive: true, force: true });
    }
  };
}

test('validateRequest - accepts valid payloads for all request types', () => {
  const validRequests = [
    {
      id: 'v-create-issues',
      type: 'create_issues',
      payload: { issues: [{ title: 'Issue 1', body_file: 'body.md' }] },
    },
    {
      id: 'v-update-issue',
      type: 'update_issue',
      payload: { number: 1 },
    },
    {
      id: 'v-close-issue',
      type: 'close_issue',
      payload: { number: 2, reason: 'done' },
    },
    {
      id: 'v-create-pr',
      type: 'create_pr',
      payload: { head: 'feat/x', base: 'main', title: 'PR', body_file: 'pr.md', issue_number: 3 },
    },
    {
      id: 'v-merge-pr',
      type: 'merge_pr',
      payload: { number: 4, strategy: 'squash' },
    },
    {
      id: 'v-dispatch-child',
      type: 'dispatch_child',
      payload: { issue_number: 5, branch: 'child/5', pipeline: 'plan-build', sub_spec_file: 'SPEC.md' },
    },
    {
      id: 'v-steer-child',
      type: 'steer_child',
      payload: { issue_number: 6, prompt_file: 'STEERING.md' },
    },
    {
      id: 'v-stop-child',
      type: 'stop_child',
      payload: { issue_number: 7, reason: 'human stop' },
    },
    {
      id: 'v-post-comment',
      type: 'post_comment',
      payload: { issue_number: 8, body_file: 'comment.md' },
    },
    {
      id: 'v-query-issues',
      type: 'query_issues',
      payload: {},
    },
    {
      id: 'v-spec-backfill',
      type: 'spec_backfill',
      payload: { file: 'SPEC.md', section: '## Objective', content_file: 'content.md' },
    },
  ];

  for (const request of validRequests) {
    const result = validateRequest(request);
    assert.strictEqual(result.valid, true);
  }
});

test('validateRequest - rejects top-level malformed request objects', () => {
  const invalidRequests: Array<{ input: unknown; match: RegExp }> = [
    { input: null, match: /JSON object/ },
    { input: 'bad', match: /JSON object/ },
    { input: { id: '', type: 'close_issue', payload: {} }, match: /id/ },
    { input: { id: 'x', type: 'unknown_type', payload: {} }, match: /Invalid or missing request type/ },
    { input: { id: 'x', type: 'close_issue', payload: null }, match: /payload/ },
  ];

  for (const { input, match } of invalidRequests) {
    const result = validateRequest(input);
    assert.strictEqual(result.valid, false);
    assert.ok(!result.valid && match.test(result.error), `Expected "${result.error}" to match ${match}`);
  }
});

test('validateRequest - rejects request-specific edge cases', () => {
  const invalidRequests: Array<{ input: unknown; match: RegExp }> = [
    {
      input: { id: 'bad-create-empty', type: 'create_issues', payload: { issues: [] } },
      match: /payload\.issues must be a non-empty array/,
    },
    {
      input: { id: 'bad-create-title', type: 'create_issues', payload: { issues: [{ title: '', body_file: 'body.md' }] } },
      match: /issues\[0\]\.title must be a non-empty string/,
    },
    {
      input: { id: 'bad-create-body', type: 'create_issues', payload: { issues: [{ title: 'ok', body_file: '' }] } },
      match: /issues\[0\]\.body_file must be a non-empty string/,
    },
    {
      input: { id: 'bad-update-number', type: 'update_issue', payload: { number: -1 } },
      match: /payload\.number must be a positive integer/,
    },
    {
      input: { id: 'bad-close-reason', type: 'close_issue', payload: { number: 1, reason: '' } },
      match: /payload\.reason must be a non-empty string/,
    },
    {
      input: { id: 'bad-create-pr-head', type: 'create_pr', payload: { head: '', base: 'main', title: 't', body_file: 'b.md', issue_number: 1 } },
      match: /payload\.head must be a non-empty string/,
    },
    {
      input: { id: 'bad-create-pr-issue-number', type: 'create_pr', payload: { head: 'h', base: 'main', title: 't', body_file: 'b.md', issue_number: 0 } },
      match: /payload\.issue_number must be a positive integer/,
    },
    {
      input: { id: 'bad-merge-strategy', type: 'merge_pr', payload: { number: 1, strategy: 'fast-forward' } },
      match: /payload\.strategy must be one of/,
    },
    {
      input: { id: 'bad-dispatch-branch', type: 'dispatch_child', payload: { issue_number: 1, branch: '', pipeline: 'p', sub_spec_file: 's.md' } },
      match: /payload\.branch must be a non-empty string/,
    },
    {
      input: { id: 'bad-steer-prompt', type: 'steer_child', payload: { issue_number: 1, prompt_file: '' } },
      match: /payload\.prompt_file must be a non-empty string/,
    },
    {
      input: { id: 'bad-stop-reason', type: 'stop_child', payload: { issue_number: 1, reason: '' } },
      match: /payload\.reason must be a non-empty string/,
    },
    {
      input: { id: 'bad-post-comment-number', type: 'post_comment', payload: { issue_number: -2, body_file: 'x.md' } },
      match: /payload\.issue_number must be a positive integer/,
    },
    {
      input: { id: 'bad-post-comment-body', type: 'post_comment', payload: { issue_number: 2, body_file: '' } },
      match: /payload\.body_file must be a non-empty string/,
    },
    {
      input: { id: 'bad-spec-file', type: 'spec_backfill', payload: { file: '', section: 'sec', content_file: 'c.md' } },
      match: /payload\.file must be a non-empty string/,
    },
    {
      input: { id: 'bad-spec-section', type: 'spec_backfill', payload: { file: 'SPEC.md', section: '', content_file: 'c.md' } },
      match: /payload\.section must be a non-empty string/,
    },
    {
      input: { id: 'bad-spec-content-file', type: 'spec_backfill', payload: { file: 'SPEC.md', section: 'sec', content_file: '' } },
      match: /payload\.content_file must be a non-empty string/,
    },
    {
      input: { id: 'bad-query-payload', type: 'query_issues', payload: null },
      match: /payload/,
    },
  ];

  for (const { input, match } of invalidRequests) {
    const result = validateRequest(input);
    assert.strictEqual(result.valid, false);
    assert.ok(!result.valid && match.test(result.error), `Expected "${result.error}" to match ${match}`);
  }
});

test('processAgentRequests - create_issues', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'body1.md'), 'Body 1');
    const req = {
      id: 'req-1',
      type: 'create_issues',
      payload: {
        issues: [{ title: 'Issue 1', body_file: 'body1.md', labels: ['l1'] }]
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-1.json'), JSON.stringify(req));
    
    let ghOp = '';
    const ghRunner = async (op: string) => {
      ghOp = op;
      return { exitCode: 0, output: JSON.stringify({ number: 101, url: 'http://gh/101' }) };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { status: 0, stdout: '[]', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    
    assert.strictEqual(ghOp, 'issue-create');
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('status": "success"'));
    assert.ok(content.includes('"number": 101'));
    assert.ok(content.includes('"skipped_titles": []'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - create_issues dedups existing orchestrator state titles', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'body-existing.md'), 'Existing body');
    await fs.writeFile(path.join(env.workdir, 'body-new.md'), 'New body');
    await fs.writeFile(path.join(env.sessionDir, 'orchestrator.json'), JSON.stringify({
      issues: [{ number: 1, title: 'Existing Issue' }]
    }));

    const req = {
      id: 'req-create-dedup',
      type: 'create_issues',
      payload: {
        issues: [
          { title: '  Existing Issue  ', body_file: 'body-existing.md' },
          { title: 'Brand New Issue', body_file: 'body-new.md' }
        ]
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-create-dedup.json'), JSON.stringify(req));

    const createdTitles: string[] = [];
    const ghRunner = async (_op: string, _sid: string, requestPath: string) => {
      const payload = JSON.parse(await fs.readFile(requestPath, 'utf8'));
      createdTitles.push(payload.title);
      return { exitCode: 0, output: JSON.stringify({ number: 102, url: 'http://gh/102' }) };
    };

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });

    assert.deepStrictEqual(createdTitles, ['Brand New Issue']);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('"skipped_titles": ['));
    assert.ok(queueContent.includes('"  Existing Issue  "'));

    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_skipped_existing_issue_title'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - create_issues failure', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'body1.md'), 'Body 1');
    const req = {
      id: 'req-fail-create',
      type: 'create_issues',
      payload: {
        issues: [{ title: 'Issue 1', body_file: 'body1.md' }]
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-fail-create.json'), JSON.stringify(req));
    
    const ghRunner = async () => {
      return { exitCode: 1, output: 'create failed' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { status: 0, stdout: '[]', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    
    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-fail-create.json'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - create_issues idempotent skip on duplicate title', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'body1.md'), 'Body 1');
    const req = {
      id: 'req-dup-title',
      type: 'create_issues',
      payload: {
        issues: [{ title: 'Issue 1', body_file: 'body1.md', labels: ['l1'] }]
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-dup-title.json'), JSON.stringify(req));

    let createCalls = 0;
    const ghRunner = async (_op: string) => {
      createCalls += 1;
      return { exitCode: 0, output: JSON.stringify({ number: 101, url: 'http://gh/101' }) };
    };

    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([{ number: 42, title: 'Issue 1', state: 'open', url: 'http://gh/42' }]),
          stderr: ''
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(createCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"number": 42'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - close_issue', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-2',
      type: 'close_issue',
      payload: { number: 101, reason: 'done' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-2.json'), JSON.stringify(req));
    
    let ghOp = '';
    const ghRunner = async (op: string) => {
      ghOp = op;
      return { exitCode: 0, output: 'closed' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ number: 101, state: 'OPEN' }), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    assert.strictEqual(ghOp, 'issue-close');
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - close_issue idempotent skip when already closed', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-2-closed',
      type: 'close_issue',
      payload: { number: 101, reason: 'done' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-2-closed.json'), JSON.stringify(req));

    let closeCalls = 0;
    const ghRunner = async () => {
      closeCalls += 1;
      return { exitCode: 0, output: 'closed' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({ number: 101, state: 'CLOSED', title: 'Done', url: 'http://gh/101' }),
          stderr: ''
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(closeCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"reason": "already_closed"'));

    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_skipped_already_closed'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - post_comment', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'comment.md'), 'Nice work');
    const req = {
      id: 'req-3',
      type: 'post_comment',
      payload: { issue_number: 101, body_file: 'comment.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-3.json'), JSON.stringify(req));
    
    let ghOp = '';
    let sentBody = '';
    const ghRunner = async (op: string, _sid: string, requestPath: string) => {
      ghOp = op;
      const requestPayload = JSON.parse(await fs.readFile(requestPath, 'utf8')) as { body?: unknown };
      sentBody = typeof requestPayload.body === 'string' ? requestPayload.body : '';
      return { exitCode: 0, output: 'posted' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'api') {
        return { status: 0, stdout: '[]', stderr: '' };
      }
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ comments: [] }), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as unknown as typeof child_process.spawnSync;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    assert.strictEqual(ghOp, 'issue-comment');
    assert.ok(sentBody.includes('Nice work'));
    assert.ok(sentBody.includes('<!-- aloop-request-id: req-3 -->'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - post_comment skips when request marker already exists', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'comment.md'), 'Nice work');
    const req = {
      id: 'req-3-dedup',
      type: 'post_comment',
      payload: { issue_number: 101, body_file: 'comment.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-3-dedup.json'), JSON.stringify(req));

    let ghRunnerCalls = 0;
    const ghRunner = async () => {
      ghRunnerCalls += 1;
      return { exitCode: 0, output: 'posted' };
    };
    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 0,
      stdout: JSON.stringify([{ body: 'prior\n\n<!-- aloop-request-id: req-3-dedup -->' }]),
      stderr: '',
    })) as unknown as typeof child_process.spawnSync;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(ghRunnerCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('"status": "skipped"'));
    assert.ok(queueContent.includes('"reason": "duplicate_comment_marker"'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - post_comment idempotent skip on duplicate body', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'comment-dup.md'), 'Nice work');
    const req = {
      id: 'req-3-dup',
      type: 'post_comment',
      payload: { issue_number: 101, body_file: 'comment-dup.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-3-dup.json'), JSON.stringify(req));

    let postCalls = 0;
    const ghRunner = async () => {
      postCalls += 1;
      return { exitCode: 0, output: 'posted' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({ comments: [{ body: 'Nice work' }] }),
          stderr: ''
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(postCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"reason": "duplicate_comment_body"'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - spec_backfill', async () => {
  const env = await setupTestEnv();
  try {
    const specPath = path.join(env.workdir, 'SPEC.md');
    await fs.writeFile(specPath, '# Spec\n\n## Section A\nExisting');
    await fs.writeFile(path.join(env.workdir, 'new.md'), 'New Content');
    
    const req = {
      id: 'req-4',
      type: 'spec_backfill',
      payload: { file: 'SPEC.md', section: 'Section A', content_file: 'new.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-4.json'), JSON.stringify(req));
    
    const spawnSync = ((_cmd: string, _args: string[]) => ({ status: 0 })) as any;
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    const updatedSpec = await fs.readFile(specPath, 'utf8');
    assert.ok(updatedSpec.includes('New Content'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child', async () => {
  const env = await setupTestEnv();
  try {
    const childSessionId = 'child-session';
    const childDir = path.join(env.aloopDir, 'sessions', childSessionId);
    await fs.mkdir(childDir, { recursive: true });
    
    // Create meta.json in child session
    await fs.writeFile(path.join(childDir, 'meta.json'), JSON.stringify({ issue_number: 101 }));
    
    // Add to active.json
    const activePath = path.join(env.aloopDir, 'active.json');
    await fs.writeFile(activePath, JSON.stringify({ [childSessionId]: { session_id: childSessionId } }));
    
    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer me');
    const req = {
      id: 'req-5',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-5.json'), JSON.stringify(req));
    
    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    const childQueueDir = path.join(childDir, 'queue');
    const queueFiles = await fs.readdir(childQueueDir);
    assert.strictEqual(queueFiles.length, 1);
    
    const content = await fs.readFile(path.join(childQueueDir, queueFiles[0]), 'utf8');
    assert.ok(content.includes('agent: steer'));
    assert.ok(content.includes('Steer me'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - update_issue (body)', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'update.md'), 'Updated body');
    const req = {
      id: 'req-update-1',
      type: 'update_issue',
      payload: { number: 101, body_file: 'update.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-update-1.json'), JSON.stringify(req));
    
    let calledArgs: string[] = [];
    const spawnSync = ((_cmd: string, args: string[]) => {
      calledArgs = args;
      return { status: 0 };
    }) as any;
    
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    assert.ok(calledArgs.includes('issue'));
    assert.ok(calledArgs.includes('edit'));
    assert.ok(calledArgs.includes('101'));
    assert.ok(calledArgs.includes('--body-file'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - update_issue (labels and state)', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-update-2',
      type: 'update_issue',
      payload: { 
        number: 101, 
        state: 'closed',
        labels_add: ['fixed'],
        labels_remove: ['bug']
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-update-2.json'), JSON.stringify(req));
    
    let calledArgs: string[] = [];
    const spawnSync = ((_cmd: string, args: string[]) => {
      calledArgs = args;
      return { status: 0 };
    }) as any;
    
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    assert.ok(calledArgs.includes('--state'));
    assert.ok(calledArgs.includes('closed'));
    assert.ok(calledArgs.includes('--add-label'));
    assert.ok(calledArgs.includes('fixed'));
    assert.ok(calledArgs.includes('--remove-label'));
    assert.ok(calledArgs.includes('bug'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - create_pr', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'pr.md'), 'PR body');
    const req = {
      id: 'req-pr-1',
      type: 'create_pr',
      payload: { 
        head: 'feat/x', 
        base: 'main', 
        title: 'New PR', 
        body_file: 'pr.md',
        issue_number: 101
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-pr-1.json'), JSON.stringify(req));
    
    let ghOp = '';
    let ghPayload: any = null;
    let spawnCalled = false;
    const spawnSync = ((_cmd: string, args: string[]) => {
      spawnCalled = true;
      if (args[0] === 'pr' && args[1] === 'list') {
        return { status: 0, stdout: '[]', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;
    const ghRunner = async (op: string, sid: string, path: string) => {
      ghOp = op;
      ghPayload = JSON.parse(await fs.readFile(path, 'utf8'));
      return { exitCode: 0, output: JSON.stringify({ number: 202, url: 'http://gh/pr/202' }) };
    };
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    
    assert.strictEqual(ghOp, 'pr-create');
    assert.strictEqual(spawnCalled, true);
    assert.strictEqual(ghPayload.title, 'New PR');
    assert.strictEqual(ghPayload.body, 'PR body');
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - create_pr idempotent skip on duplicate head', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'pr.md'), 'PR body');
    const req = {
      id: 'req-pr-dup-head',
      type: 'create_pr',
      payload: {
        head: 'feat/x',
        base: 'main',
        title: 'New PR',
        body_file: 'pr.md',
        issue_number: 101
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-pr-dup-head.json'), JSON.stringify(req));

    let createCalls = 0;
    const ghRunner = async () => {
      createCalls += 1;
      return { exitCode: 0, output: JSON.stringify({ number: 202, url: 'http://gh/pr/202' }) };
    };

    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([{
            number: 88,
            url: 'http://gh/pr/88',
            title: 'Existing PR',
            state: 'OPEN',
            headRefName: 'feat/x',
            baseRefName: 'main'
          }]),
          stderr: ''
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(createCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"number": 88'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - merge_pr', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-merge-1',
      type: 'merge_pr',
      payload: { number: 202, strategy: 'squash' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-merge-1.json'), JSON.stringify(req));

    let ghOp = '';
    let tempFileContents = '';
    const ghRunner = async (op: string, _sid: string, reqPath: string) => {
      ghOp = op;
      tempFileContents = await fs.readFile(reqPath, 'utf8');
      return { exitCode: 0, output: 'merged' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ number: 202, state: 'OPEN', mergedAt: null }), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    assert.strictEqual(ghOp, 'pr-merge');
    const parsed = JSON.parse(tempFileContents);
    assert.strictEqual(parsed.strategy, 'squash', 'strategy must be passed through to temp request file');
    assert.strictEqual(parsed.pr_number, 202);
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - merge_pr skips already merged', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-merge-already',
      type: 'merge_pr',
      payload: { number: 303, strategy: 'squash' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-merge-already.json'), JSON.stringify(req));

    let ghCalled = false;
    const ghRunner = async () => {
      ghCalled = true;
      return { exitCode: 0, output: 'merged' };
    };
    // gh pr view returns MERGED state — should skip
    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 0,
      stdout: JSON.stringify({ state: 'MERGED' }),
      stderr: ''
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: ghRunner });

    assert.strictEqual(ghCalled, false, 'already-merged PR should skip pr-merge operation');
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('already_merged'));

    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_skipped_already_merged'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - merge_pr idempotent skip when already merged', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-merge-dup',
      type: 'merge_pr',
      payload: { number: 202, strategy: 'squash' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-merge-dup.json'), JSON.stringify(req));

    let mergeCalls = 0;
    const ghRunner = async () => {
      mergeCalls += 1;
      return { exitCode: 0, output: 'merged' };
    };
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            number: 202,
            state: 'MERGED',
            mergedAt: '2026-01-01T00:00:00Z',
            url: 'http://gh/pr/202',
            title: 'Already merged'
          }),
          stderr: ''
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    assert.strictEqual(mergeCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"reason": "already_merged"'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - dispatch_child', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-dispatch-1',
      type: 'dispatch_child',
      payload: { 
        issue_number: 101, 
        branch: 'feat/x', 
        pipeline: 'build', 
        sub_spec_file: 'sub.md' 
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-dispatch-1.json'), JSON.stringify(req));
    
    let calledCmd = '';
    let calledArgs: string[] = [];
    const spawnSync = ((cmd: string, args: string[]) => {
      calledCmd = cmd;
      calledArgs = args;
      return { 
        status: 0, 
        stdout: JSON.stringify({ session_id: 'child-1' }), 
        stderr: '' 
      };
    }) as any;
    
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    assert.strictEqual(calledCmd, 'aloop');
    assert.ok(calledArgs.includes('gh'));
    assert.ok(calledArgs.includes('start'));
    assert.ok(calledArgs.includes('--issue'));
    assert.ok(calledArgs.includes('101'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - dispatch_child idempotent skip when child already running', async () => {
  const env = await setupTestEnv();
  try {
    const childSessionId = 'child-running-1';
    const childDir = path.join(env.aloopDir, 'sessions', childSessionId);
    await fs.mkdir(childDir, { recursive: true });
    await fs.writeFile(path.join(childDir, 'meta.json'), JSON.stringify({ issue_number: 101 }));
    await fs.writeFile(path.join(env.aloopDir, 'active.json'), JSON.stringify({ [childSessionId]: { session_id: childSessionId } }));

    const req = {
      id: 'req-dispatch-dup',
      type: 'dispatch_child',
      payload: {
        issue_number: 101,
        branch: 'feat/x',
        pipeline: 'build',
        sub_spec_file: 'sub.md'
      }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-dispatch-dup.json'), JSON.stringify(req));

    let spawnCalls = 0;
    const spawnSync = ((_cmd: string, _args: string[]) => {
      spawnCalls += 1;
      return { status: 0, stdout: JSON.stringify({ session_id: 'unexpected' }), stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    assert.strictEqual(spawnCalls, 0);
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('"skipped": true'));
    assert.ok(content.includes('"idempotent": true'));
    assert.ok(content.includes('"reason": "child_session_already_running"'));

    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_skipped_child_already_running'));
    assert.ok(logContent.includes('"existing_session_id":'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - stop_child', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-stop-1',
      type: 'stop_child',
      payload: { issue_number: 101, reason: 'cancel' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-stop-1.json'), JSON.stringify(req));
    
    let calledArgs: string[] = [];
    const spawnSync = ((_cmd: string, args: string[]) => {
      calledArgs = args;
      return { status: 0, stdout: '{}', stderr: '' };
    }) as any;
    
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    assert.ok(calledArgs.includes('gh'));
    assert.ok(calledArgs.includes('stop'));
    assert.ok(calledArgs.includes('101'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - query_issues', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-query-1',
      type: 'query_issues',
      payload: { labels: ['aloop'], state: 'open' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-query-1.json'), JSON.stringify(req));
    
    let calledArgs: string[] = [];
    const spawnSync = ((_cmd: string, args: string[]) => {
      calledArgs = args;
      return { 
        status: 0, 
        stdout: JSON.stringify([{ number: 1, title: 'I1' }]), 
        stderr: '' 
      };
    }) as any;
    
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    assert.ok(calledArgs.includes('issue'));
    assert.ok(calledArgs.includes('list'));
    assert.ok(calledArgs.includes('--label'));
    assert.ok(calledArgs.includes('aloop'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - invalid JSON', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.requestsDir, 'bad.json'), 'not json');
    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('bad.json'));
    
    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_failed'));
    assert.ok(logContent.includes('Invalid JSON'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child no active.json', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer me');
    const req = {
      id: 'req-steer-noactive',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-steer-noactive.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-steer-noactive.json'));
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('No active sessions found'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child child not found anywhere', async () => {
  const env = await setupTestEnv();
  try {
    // Create active.json with no matching sessions
    await fs.writeFile(path.join(env.aloopDir, 'active.json'), JSON.stringify({ 'other-session': {} }));
    // Create a meta.json for 'other-session' with different issue
    const otherDir = path.join(env.aloopDir, 'sessions', 'other-session');
    await fs.mkdir(otherDir, { recursive: true });
    await fs.writeFile(path.join(otherDir, 'meta.json'), JSON.stringify({ issue_number: 999 }));

    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer me');
    const req = {
      id: 'req-steer-notfound',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-steer-notfound.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-steer-notfound.json'));
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('Could not find child session for issue #101'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child found in history.json', async () => {
  const env = await setupTestEnv();
  try {
    // active.json with no matching session (session without meta.json)
    await fs.writeFile(path.join(env.aloopDir, 'active.json'), JSON.stringify({ 'no-meta-session': {} }));

    // history.json with matching session
    await fs.writeFile(path.join(env.aloopDir, 'history.json'), JSON.stringify([
      { session_id: 'hist-session', issue_number: 101 }
    ]));

    // Create child session dir for the history match
    const childDir = path.join(env.aloopDir, 'sessions', 'hist-session');
    await fs.mkdir(childDir, { recursive: true });

    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer from history');
    const req = {
      id: 'req-steer-hist',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-steer-hist.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    // Should succeed - queue override written to child session
    const childQueueDir = path.join(childDir, 'queue');
    const queueFiles = await fs.readdir(childQueueDir);
    assert.strictEqual(queueFiles.length, 1);
    const content = await fs.readFile(path.join(childQueueDir, queueFiles[0]), 'utf8');
    assert.ok(content.includes('Steer from history'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child matches gh_issue_number', async () => {
  const env = await setupTestEnv();
  try {
    const childSessionId = 'child-gh-issue';
    const childDir = path.join(env.aloopDir, 'sessions', childSessionId);
    await fs.mkdir(childDir, { recursive: true });
    await fs.writeFile(path.join(childDir, 'meta.json'), JSON.stringify({ gh_issue_number: 101 }));
    await fs.writeFile(path.join(env.aloopDir, 'active.json'), JSON.stringify({ [childSessionId]: {} }));

    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer via gh_issue');
    const req = {
      id: 'req-steer-gh',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-steer-gh.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const childQueueDir = path.join(childDir, 'queue');
    const queueFiles = await fs.readdir(childQueueDir);
    assert.strictEqual(queueFiles.length, 1);
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - dispatch_child spawn failure', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-dispatch-fail',
      type: 'dispatch_child',
      payload: { issue_number: 101, branch: 'feat/x', pipeline: 'build', sub_spec_file: 'sub.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-dispatch-fail.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stdout: '',
      stderr: 'dispatch error'
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-dispatch-fail.json'));
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('Failed to dispatch child'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - dispatch_child spawn failure stderr fallback to stdout', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-dispatch-fail2',
      type: 'dispatch_child',
      payload: { issue_number: 101, branch: 'feat/x', pipeline: 'build', sub_spec_file: 'sub.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-dispatch-fail2.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stdout: 'stdout error info',
      stderr: ''
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('stdout error info'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - stop_child spawn failure', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-stop-fail',
      type: 'stop_child',
      payload: { issue_number: 101, reason: 'cancel' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-stop-fail.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stdout: '',
      stderr: 'stop error'
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-stop-fail.json'));
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('Failed to stop child'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - update_issue body_file spawn failure', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.workdir, 'body.md'), 'Body content');
    const req = {
      id: 'req-upd-fail-body',
      type: 'update_issue',
      payload: { number: 101, body_file: 'body.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-upd-fail-body.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stderr: 'gh edit failed'
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-upd-fail-body.json'));
    // Verify temp file was cleaned up (finally block)
    const reqFiles = await fs.readdir(env.requestsDir);
    const tmpFiles = reqFiles.filter(f => f.startsWith('_tmp_'));
    assert.strictEqual(tmpFiles.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - update_issue no body_file spawn failure', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-upd-fail-nobody',
      type: 'update_issue',
      payload: { number: 101, state: 'closed' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-upd-fail-nobody.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stderr: 'gh edit no body failed'
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-upd-fail-nobody.json'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - query_issues spawn failure', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-query-fail',
      type: 'query_issues',
      payload: { labels: ['aloop'], state: 'open' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-query-fail.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({
      status: 1,
      stderr: 'gh issue list failed'
    })) as any;

    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-query-fail.json'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - spec_backfill append new section', async () => {
  const env = await setupTestEnv();
  try {
    const specPath = path.join(env.workdir, 'SPEC.md');
    await fs.writeFile(specPath, '# Spec\n\n## Existing\nContent here');
    await fs.writeFile(path.join(env.workdir, 'new-section.md'), 'Brand new content');

    const req = {
      id: 'req-backfill-append',
      type: 'spec_backfill',
      payload: { file: 'SPEC.md', section: 'New Section', content_file: 'new-section.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-backfill-append.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({ status: 0 })) as any;
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const updatedSpec = await fs.readFile(specPath, 'utf8');
    assert.ok(updatedSpec.includes('## New Section'));
    assert.ok(updatedSpec.includes('Brand new content'));
    // Original content preserved
    assert.ok(updatedSpec.includes('## Existing'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - spec_backfill replace last section (no next header)', async () => {
  const env = await setupTestEnv();
  try {
    const specPath = path.join(env.workdir, 'SPEC.md');
    await fs.writeFile(specPath, '# Spec\n\n## Last Section\nOld content\nMore old');
    await fs.writeFile(path.join(env.workdir, 'replace.md'), 'Replaced content');

    const req = {
      id: 'req-backfill-last',
      type: 'spec_backfill',
      payload: { file: 'SPEC.md', section: 'Last Section', content_file: 'replace.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-backfill-last.json'), JSON.stringify(req));

    const spawnSync = ((_cmd: string, _args: string[]) => ({ status: 0 })) as any;
    await processAgentRequests({ ...env, spawnSync, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const updatedSpec = await fs.readFile(specPath, 'utf8');
    assert.ok(updatedSpec.includes('Replaced content'));
    assert.ok(!updatedSpec.includes('Old content'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - unsupported request type', async () => {
  const env = await setupTestEnv();
  try {
    const req = { id: 'req-bad-type', type: 'unknown_type', payload: {} };
    await fs.writeFile(path.join(env.requestsDir, 'req-bad-type.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-bad-type.json'));
    // Validation failures are logged but don't produce queue files
    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('Validation failed'));
    assert.ok(logContent.includes('Invalid or missing request type'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - duplicate archive path collision', async () => {
  const env = await setupTestEnv();
  try {
    // Create two requests that will both go to processed with the same name
    const req1 = { id: 'req-dup', type: 'close_issue', payload: { number: 1, reason: 'done' } };
    const req2 = { id: 'req-dup2', type: 'close_issue', payload: { number: 2, reason: 'done' } };
    // Use same filename via sequential processing — first gets archived, then second
    await fs.writeFile(path.join(env.requestsDir, 'dup.json'), JSON.stringify(req1));

    const ghRunner = async () => ({ exitCode: 0, output: 'closed' });
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN' }), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    // Now process another request — pre-seed processedDir with dup.json to force collision
    await fs.writeFile(path.join(env.requestsDir, 'dup.json'), JSON.stringify(req2));
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });

    const processedFiles = await fs.readdir(path.join(env.requestsDir, 'processed'));
    assert.ok(processedFiles.includes('dup.json'));
    assert.ok(processedFiles.includes('dup.dup1.json'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - request ID idempotency persists and skips duplicate IDs', async () => {
  const env = await setupTestEnv();
  try {
    let ghCalls = 0;
    const ghRunner = async () => {
      ghCalls += 1;
      return { exitCode: 0, output: 'closed' };
    };

    const firstReq = { id: 'req-idem-1', type: 'close_issue', payload: { number: 1, reason: 'done' } };
    await fs.writeFile(path.join(env.requestsDir, 'req-idem-first.json'), JSON.stringify(firstReq));
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });

    const processedIdsPath = path.join(env.requestsDir, 'processed-ids.json');
    const processedIds = JSON.parse(await fs.readFile(processedIdsPath, 'utf8'));
    assert.deepStrictEqual(processedIds, ['req-idem-1']);
    assert.strictEqual(ghCalls, 1);

    const duplicateReq = { id: 'req-idem-1', type: 'close_issue', payload: { number: 2, reason: 'done-again' } };
    await fs.writeFile(path.join(env.requestsDir, 'req-idem-second.json'), JSON.stringify(duplicateReq));
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });

    assert.strictEqual(ghCalls, 1, 'duplicate request ID should be skipped without calling handler');

    const processedFiles = await fs.readdir(path.join(env.requestsDir, 'processed'));
    assert.ok(processedFiles.includes('req-idem-first.json'));
    assert.ok(processedFiles.includes('req-idem-second.json'));

    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1, 'duplicate request should not produce a second queue success file');

    const logContent = await fs.readFile(env.logPath, 'utf8');
    assert.ok(logContent.includes('gh_request_skipped_duplicate'));
    assert.ok(logContent.includes('"id":"req-idem-1"'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - no requests directory', async () => {
  const env = await setupTestEnv();
  try {
    await fs.rm(env.requestsDir, { recursive: true });
    // Should return early without error
    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - empty requests directory', async () => {
  const env = await setupTestEnv();
  try {
    // requestsDir exists but empty — should return early
    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    // No processed/failed dirs created since we return early
    assert.ok(!existsSync(path.join(env.requestsDir, 'processed')));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - steer_child history.json not array', async () => {
  const env = await setupTestEnv();
  try {
    await fs.writeFile(path.join(env.aloopDir, 'active.json'), JSON.stringify({}));
    await fs.writeFile(path.join(env.aloopDir, 'history.json'), JSON.stringify({ not: 'array' }));

    await fs.writeFile(path.join(env.workdir, 'prompt.md'), 'Steer');
    const req = {
      id: 'req-steer-badhistory',
      type: 'steer_child',
      payload: { issue_number: 101, prompt_file: 'prompt.md' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'req-steer-badhistory.json'), JSON.stringify(req));

    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });

    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-steer-badhistory.json'));
  } finally {
    await env.cleanup();
  }
});

test('processAgentRequests - handler failure', async () => {
  const env = await setupTestEnv();
  try {
    const req = {
      id: 'req-fail',
      type: 'close_issue',
      payload: { number: 101, reason: 'fail' }
    };
    await fs.writeFile(path.join(env.requestsDir, 'fail.json'), JSON.stringify(req));
    
    const ghRunner = async () => {
      return { exitCode: 1, output: 'GH error' };
    };
    
    const spawnSync = ((_cmd: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ state: 'OPEN' }), stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }) as any;

    await processAgentRequests({ ...env, ghCommandRunner: ghRunner, spawnSync });
    
    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('fail.json'));
    
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('status": "error"'));
    assert.ok(queueContent.includes('GH error'));
  } finally {
    await env.cleanup();
  }
});

// ─── validateRequest unit tests ───────────────────────────────────────────────

test('validateRequest - null input', () => {
  const result = validateRequest(null);
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('JSON object'));
});

test('validateRequest - non-object input (string)', () => {
  const result = validateRequest('hello');
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('JSON object'));
});

test('validateRequest - non-object input (number)', () => {
  const result = validateRequest(42);
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('JSON object'));
});

test('validateRequest - missing id', () => {
  const result = validateRequest({ type: 'close_issue', payload: { number: 1, reason: 'done' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('id'));
});

test('validateRequest - empty id', () => {
  const result = validateRequest({ id: '', type: 'close_issue', payload: { number: 1, reason: 'done' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('id'));
});

test('validateRequest - missing payload', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue' });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('payload'));
});

test('validateRequest - null payload', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: null });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('payload'));
});

test('validateRequest - invalid type', () => {
  const result = validateRequest({ id: 'r1', type: 'invalid_type', payload: {} });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('Invalid or missing request type'));
});

test('validateRequest - missing type', () => {
  const result = validateRequest({ id: 'r1', payload: {} });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('Invalid or missing request type'));
});

test('validateRequest - create_issues with empty array', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('non-empty array'));
});

test('validateRequest - create_issues with non-array', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: 'nope' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('non-empty array'));
});

test('validateRequest - create_issues with null issue entry', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [null] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('issues[0]'));
});

test('validateRequest - create_issues missing title', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [{ body_file: 'a.md' }] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('title'));
});

test('validateRequest - create_issues missing body_file', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [{ title: 'T' }] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('body_file'));
});

test('validateRequest - create_issues invalid labels (non-string elements)', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [{ title: 'T', body_file: 'a.md', labels: [123] }] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('labels'));
});

test('validateRequest - create_issues invalid parent (negative)', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [{ title: 'T', body_file: 'a.md', parent: -1 }] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('parent'));
});

test('validateRequest - create_issues valid request', () => {
  const result = validateRequest({ id: 'r1', type: 'create_issues', payload: { issues: [{ title: 'T', body_file: 'a.md', labels: ['bug'], parent: 5 }] } });
  assert.strictEqual(result.valid, true);
});

test('validateRequest - merge_pr invalid strategy', () => {
  const result = validateRequest({ id: 'r1', type: 'merge_pr', payload: { number: 1, strategy: 'invalid' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('strategy'));
});

test('validateRequest - merge_pr missing number', () => {
  const result = validateRequest({ id: 'r1', type: 'merge_pr', payload: { strategy: 'squash' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('number'));
});

test('validateRequest - merge_pr valid', () => {
  const result = validateRequest({ id: 'r1', type: 'merge_pr', payload: { number: 1, strategy: 'squash' } });
  assert.strictEqual(result.valid, true);
});

test('validateRequest - dispatch_child missing sub_spec_file', () => {
  const result = validateRequest({ id: 'r1', type: 'dispatch_child', payload: { issue_number: 1, branch: 'b', pipeline: 'p' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('sub_spec_file'));
});

test('validateRequest - dispatch_child valid', () => {
  const result = validateRequest({ id: 'r1', type: 'dispatch_child', payload: { issue_number: 1, branch: 'b', pipeline: 'p', sub_spec_file: 's.md' } });
  assert.strictEqual(result.valid, true);
});

test('validateRequest - close_issue missing reason', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: { number: 1 } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('reason'));
});

test('validateRequest - close_issue valid', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: { number: 1, reason: 'done' } });
  assert.strictEqual(result.valid, true);
});

test('validateRequest - requirePositiveInt with negative value', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: { number: -5, reason: 'done' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('positive integer'));
});

test('validateRequest - requirePositiveInt with non-integer (float)', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: { number: 1.5, reason: 'done' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('positive integer'));
});

test('validateRequest - requirePositiveInt with zero', () => {
  const result = validateRequest({ id: 'r1', type: 'close_issue', payload: { number: 0, reason: 'done' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('positive integer'));
});

test('validateRequest - optionalStringArray with non-array', () => {
  const result = validateRequest({ id: 'r1', type: 'query_issues', payload: { labels: 'bug' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('labels'));
});

test('validateRequest - optionalStringArray with non-string elements', () => {
  const result = validateRequest({ id: 'r1', type: 'query_issues', payload: { labels: [1, 2] } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('labels'));
});

test('validateRequest - query_issues invalid state', () => {
  const result = validateRequest({ id: 'r1', type: 'query_issues', payload: { state: 'invalid' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('state'));
});

test('validateRequest - query_issues valid with no optional fields', () => {
  const result = validateRequest({ id: 'r1', type: 'query_issues', payload: {} });
  assert.strictEqual(result.valid, true);
});

test('validateRequest - update_issue missing number', () => {
  const result = validateRequest({ id: 'r1', type: 'update_issue', payload: {} });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('number'));
});

test('validateRequest - create_pr missing fields', () => {
  const result = validateRequest({ id: 'r1', type: 'create_pr', payload: { head: 'h' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('base'));
});

test('validateRequest - steer_child missing prompt_file', () => {
  const result = validateRequest({ id: 'r1', type: 'steer_child', payload: { issue_number: 1 } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('prompt_file'));
});

test('validateRequest - stop_child missing reason', () => {
  const result = validateRequest({ id: 'r1', type: 'stop_child', payload: { issue_number: 1 } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('reason'));
});

test('validateRequest - post_comment missing body_file', () => {
  const result = validateRequest({ id: 'r1', type: 'post_comment', payload: { issue_number: 1 } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('body_file'));
});

test('validateRequest - spec_backfill missing section', () => {
  const result = validateRequest({ id: 'r1', type: 'spec_backfill', payload: { file: 'f.md', content_file: 'c.md' } });
  assert.strictEqual(result.valid, false);
  assert.ok(!result.valid && result.error.includes('section'));
});
