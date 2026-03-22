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
    const queueFiles = await fs.readdir(path.join(env.sessionDir, 'queue'));
    const queueContent = await fs.readFile(path.join(env.sessionDir, 'queue', queueFiles[0]), 'utf8');
    assert.ok(queueContent.includes('Unsupported request type'));
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
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });

    // Now process another request — pre-seed processedDir with dup.json to force collision
    await fs.writeFile(path.join(env.requestsDir, 'dup.json'), JSON.stringify(req2));
    await processAgentRequests({ ...env, ghCommandRunner: ghRunner });

    const processedFiles = await fs.readdir(path.join(env.requestsDir, 'processed'));
    assert.ok(processedFiles.includes('dup.json'));
    assert.ok(processedFiles.includes('dup.dup1.json'));
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
