import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
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
    
    await processAgentRequests({ ...env, ghCommandRunner: async () => ({ exitCode: 0, output: '' }) });
    
    const updatedSpec = await fs.readFile(specPath, 'utf8');
    assert.ok(updatedSpec.includes('New Content'));
  } finally {
    await env.cleanup();
  }
});
