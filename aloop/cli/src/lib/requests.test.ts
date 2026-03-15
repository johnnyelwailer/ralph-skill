import { test, mock } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import * as child_process from 'node:child_process';
import { processAgentRequests, type RequestProcessorOptions } from './requests.js';

async function setupTestEnv() {
  const tmpBase = path.join(os.tmpdir(), `aloop-test-${Date.now()}`);
  await fs.mkdir(tmpBase, { recursive: true });
  
  const workdir = path.join(tmpBase, 'workdir');
  await fs.mkdir(workdir, { recursive: true });
  
  const aloopDir = path.join(workdir, '.aloop');
  await fs.mkdir(aloopDir, { recursive: true });
  
  const requestsDir = path.join(aloopDir, 'requests');
  await fs.mkdir(requestsDir, { recursive: true });
  
  const sessionId = 'test-session';
  const sessionDir = path.join(aloopDir, 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(path.join(sessionDir, 'queue'), { recursive: true });
  
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
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    
    assert.strictEqual(ghOp, 'issue-create');
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    assert.strictEqual(queueFiles.length, 1);
    
    const content = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(content.includes('status": "success"'));
    assert.ok(content.includes('"number": 101'));
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
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    
    const failedFiles = await fs.readdir(path.join(env.requestsDir, 'failed'));
    assert.ok(failedFiles.includes('req-fail-create.json'));
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
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    assert.strictEqual(ghOp, 'issue-close');
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
    const ghRunner = async (op: string) => {
      ghOp = op;
      return { exitCode: 0, output: 'posted' };
    };
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    assert.strictEqual(ghOp, 'issue-comment');
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
    const ghRunner = async (op: string, sid: string, path: string) => {
      ghOp = op;
      ghPayload = JSON.parse(await fs.readFile(path, 'utf8'));
      return { exitCode: 0, output: JSON.stringify({ number: 202, url: 'http://gh/pr/202' }) };
    };
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    
    assert.strictEqual(ghOp, 'pr-create');
    assert.strictEqual(ghPayload.title, 'New PR');
    assert.strictEqual(ghPayload.body, 'PR body');
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
    const ghRunner = async (op: string) => {
      ghOp = op;
      return { exitCode: 0, output: 'merged' };
    };
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    assert.strictEqual(ghOp, 'pr-merge');
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
    
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });
    
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
