import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import os from 'node:os';
import { readLoopPlan, writeLoopPlan, mutateLoopPlan, writeQueueOverride } from './plan.js';

test('plan mutation and queue overrides', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-test-'));

  await t.test('read and write loop plan', async () => {
    const plan = {
      cycle: ['a.md', 'b.md'],
      cyclePosition: 0,
      iteration: 1,
      version: 1
    };
    await writeLoopPlan(tmpDir, plan);
    
    const read = await readLoopPlan(tmpDir);
    assert.deepEqual(read, plan);
  });

  await t.test('mutate loop plan', async () => {
    const mutated = await mutateLoopPlan(tmpDir, { cyclePosition: 5, iteration: 10 });
    assert.equal(mutated.cyclePosition, 5);
    assert.equal(mutated.iteration, 10);
    assert.equal(mutated.version, 2);

    const read = await readLoopPlan(tmpDir);
    assert.equal(read?.cyclePosition, 5);
    assert.equal(read?.version, 2);
  });

  await t.test('write queue override', async () => {
    const queuePath = await writeQueueOverride(tmpDir, 'test-override', 'Hello world', { agent: 'test' });
    assert.ok(queuePath.includes('test-override.md'));
    assert.ok(queuePath.includes('queue'));

    const content = await fs.readFile(queuePath, 'utf8');
    assert.ok(content.includes('agent: test'));
    assert.ok(content.includes('Hello world'));
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readLoopPlan returns null for missing file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-missing-'));
  const plan = await readLoopPlan(tmpDir);
  assert.equal(plan, null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readLoopPlan returns null for invalid JSON', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-invalid-'));
  await fs.writeFile(path.join(tmpDir, 'loop-plan.json'), '{not valid json', 'utf8');
  const plan = await readLoopPlan(tmpDir);
  assert.equal(plan, null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('mutateLoopPlan throws when loop-plan.json is missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-mutate-missing-'));
  await assert.rejects(
    mutateLoopPlan(tmpDir, { iteration: 2 }),
    /loop-plan\.json not found/
  );
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('mutateLoopPlan updates cycle and optional one-shot flags', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-options-'));
  const initialPlan = {
    cycle: ['plan.md', 'build.md'],
    cyclePosition: 0,
    iteration: 1,
    version: 1,
    allTasksMarkedDone: true,
    forceReviewNext: false,
    forceProofNext: false,
    forcePlanNext: true
  };
  await writeLoopPlan(tmpDir, initialPlan);

  const mutated = await mutateLoopPlan(tmpDir, {
    cycle: ['review.md', 'proof.md'],
    allTasksMarkedDone: false,
    forceReviewNext: true,
    forceProofNext: true,
    forcePlanNext: false
  });

  assert.deepEqual(mutated.cycle, ['review.md', 'proof.md']);
  assert.equal(mutated.allTasksMarkedDone, false);
  assert.equal(mutated.forceReviewNext, true);
  assert.equal(mutated.forceProofNext, true);
  assert.equal(mutated.forcePlanNext, false);
  assert.equal(mutated.version, 2);

  const read = await readLoopPlan(tmpDir);
  assert.deepEqual(read, mutated);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueOverride writes raw content when no frontmatter provided', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-queue-raw-'));
  const queuePath = await writeQueueOverride(tmpDir, 'plain', 'just content');
  const written = await fs.readFile(queuePath, 'utf8');
  assert.equal(written, 'just content');
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueOverride handles empty content with frontmatter', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-queue-empty-'));
  const queuePath = await writeQueueOverride(tmpDir, 'empty', '', { agent: 'test' });
  const written = await fs.readFile(queuePath, 'utf8');
  assert.equal(written, '---\nagent: test\n---\n\n');
  await fs.rm(tmpDir, { recursive: true, force: true });
});
