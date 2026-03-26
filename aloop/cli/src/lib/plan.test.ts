import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import os from 'node:os';
import { readLoopPlan, writeLoopPlan, mutateLoopPlan, writeQueueOverride, resolveQueuePriority, QUEUE_PRIORITY_TIERS, readQueueManifest, writeQueueManifest } from './plan.js';

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

test('mutateLoopPlan updates cycle and optional flags', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-options-'));
  const initialPlan = {
    cycle: ['plan.md', 'build.md'],
    cyclePosition: 0,
    iteration: 1,
    version: 1,
    allTasksMarkedDone: true
  };
  await writeLoopPlan(tmpDir, initialPlan);

  const mutated = await mutateLoopPlan(tmpDir, {
    cycle: ['review.md', 'proof.md'],
    allTasksMarkedDone: false
  });

  assert.deepEqual(mutated.cycle, ['review.md', 'proof.md']);
  assert.equal(mutated.allTasksMarkedDone, false);
  assert.equal(mutated.version, 2);

  const read = await readLoopPlan(tmpDir);
  assert.deepEqual(read, mutated);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('mutateLoopPlan leaves flags unchanged when options omit them', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-plan-flags-'));
  const initialPlan = {
    cycle: ['plan.md', 'build.md', 'review.md'],
    cyclePosition: 1,
    iteration: 5,
    version: 3,
    allTasksMarkedDone: true
  };
  await writeLoopPlan(tmpDir, initialPlan);

  const mutated = await mutateLoopPlan(tmpDir, { iteration: 6 });
  assert.equal(mutated.iteration, 6);
  assert.equal(mutated.version, 4);
  assert.equal(mutated.allTasksMarkedDone, true);

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

test('resolveQueuePriority — explicit priority field overrides inference', () => {
  // Named tiers
  assert.equal(resolveQueuePriority({ priority: 'steering' }), 0);
  assert.equal(resolveQueuePriority({ priority: 'review' }), 1);
  assert.equal(resolveQueuePriority({ priority: 'sub_decompose' }), 2);
  assert.equal(resolveQueuePriority({ priority: 'plan' }), 3);
  assert.equal(resolveQueuePriority({ priority: 'build' }), 4);
  assert.equal(resolveQueuePriority({ priority: 'default' }), 5);

  // Numeric values
  assert.equal(resolveQueuePriority({ priority: '0' }), 0);
  assert.equal(resolveQueuePriority({ priority: '3' }), 3);
  assert.equal(resolveQueuePriority({ priority: '5' }), 5);

  // Numeric clamping
  assert.equal(resolveQueuePriority({ priority: '99' }), 5);
  assert.equal(resolveQueuePriority({ priority: '-1' }), 0);
});

test('resolveQueuePriority — falls back to inference when no priority field', () => {
  assert.equal(resolveQueuePriority({ type: 'steering_override' }), QUEUE_PRIORITY_TIERS.STEERING);
  assert.equal(resolveQueuePriority({ agent: 'review' }), QUEUE_PRIORITY_TIERS.REVIEW);
  assert.equal(resolveQueuePriority({ agent: 'plan', reason: 'epic_decompose' }), QUEUE_PRIORITY_TIERS.SUB_DECOMPOSE);
  assert.equal(resolveQueuePriority({ agent: 'plan' }), QUEUE_PRIORITY_TIERS.PLAN);
  assert.equal(resolveQueuePriority({ agent: 'build' }), QUEUE_PRIORITY_TIERS.BUILD);
  assert.equal(resolveQueuePriority({ agent: 'qa' }), QUEUE_PRIORITY_TIERS.DEFAULT);
  assert.equal(resolveQueuePriority({}), QUEUE_PRIORITY_TIERS.DEFAULT);
});

test('resolveQueuePriority — explicit field takes precedence over inference', () => {
  // Steering override type but explicit plan priority
  assert.equal(resolveQueuePriority({ type: 'steering_override', priority: 'plan' }), QUEUE_PRIORITY_TIERS.PLAN);
  // Build agent but explicit review priority
  assert.equal(resolveQueuePriority({ agent: 'build', priority: 'review' }), QUEUE_PRIORITY_TIERS.REVIEW);
});

test('writeQueueOverride — filename includes priority prefix', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-queue-priority-'));

  // Steering priority → prefix 0
  const steerPath = await writeQueueOverride(tmpDir, 'steer', 'steer content', { agent: 'steer', type: 'steering_override' });
  assert.ok(path.basename(steerPath).startsWith('0-'), `Expected filename to start with '0-', got: ${path.basename(steerPath)}`);

  // Build priority → prefix 4
  const buildPath = await writeQueueOverride(tmpDir, 'build', 'build content', { agent: 'build' });
  assert.ok(path.basename(buildPath).startsWith('4-'), `Expected filename to start with '4-', got: ${path.basename(buildPath)}`);

  // Default (no frontmatter) → prefix 5
  const defaultPath = await writeQueueOverride(tmpDir, 'plain', 'plain content');
  assert.ok(path.basename(defaultPath).startsWith('5-'), `Expected filename to start with '5-', got: ${path.basename(defaultPath)}`);

  // Files sort in priority order
  const basenames = [steerPath, buildPath, defaultPath].map((p) => path.basename(p)).sort();
  assert.equal(basenames[0], path.basename(steerPath));
  assert.equal(basenames[1], path.basename(buildPath));
  assert.equal(basenames[2], path.basename(defaultPath));

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readQueueManifest returns null for missing manifest', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-missing-'));
  const manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest, null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readQueueManifest returns null for invalid JSON', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-invalid-'));
  await fs.mkdir(path.join(tmpDir, 'queue'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'queue', 'queue-order.json'), '{bad json', 'utf8');
  const manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest, null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readQueueManifest returns null for missing order array', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-bad-schema-'));
  await fs.mkdir(path.join(tmpDir, 'queue'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'queue', 'queue-order.json'), '{"wrong": true}', 'utf8');
  const manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest, null);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueManifest and readQueueManifest round-trip', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-roundtrip-'));
  const expected = { order: ['0-1-steer.md', '3-2-plan.md', '5-3-build.md'] };
  await writeQueueManifest(tmpDir, expected);
  const read = await readQueueManifest(tmpDir);
  assert.deepEqual(read, expected);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueOverride creates and updates queue-order.json', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-override-'));

  // First write — steering (tier 0)
  await writeQueueOverride(tmpDir, 'steer', 'steer content', { agent: 'steer', type: 'steering_override' });
  let manifest = await readQueueManifest(tmpDir);
  assert.ok(manifest, 'manifest should exist after first write');
  assert.equal(manifest!.order.length, 1);
  assert.ok(manifest!.order[0].startsWith('0-'), 'steering item should have tier 0 prefix');

  // Second write — build (tier 4) — should go after steer
  await writeQueueOverride(tmpDir, 'build', 'build content', { agent: 'build' });
  manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest!.order.length, 2);
  assert.ok(manifest!.order[0].startsWith('0-'), 'steer should still be first');
  assert.ok(manifest!.order[1].startsWith('4-'), 'build should be second');

  // Third write — review (tier 1) — should go between steer and build
  await writeQueueOverride(tmpDir, 'review', 'review content', { agent: 'review' });
  manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest!.order.length, 3);
  assert.ok(manifest!.order[0].startsWith('0-'), 'steer first');
  assert.ok(manifest!.order[1].startsWith('1-'), 'review second');
  assert.ok(manifest!.order[2].startsWith('4-'), 'build third');

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueOverride FIFO within same tier', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-fifo-'));

  // Write two items with the same tier (plan = 3)
  await writeQueueOverride(tmpDir, 'plan-a', 'first plan', { agent: 'plan' });
  await writeQueueOverride(tmpDir, 'plan-b', 'second plan', { agent: 'plan' });
  // Write a build item (tier 4)
  await writeQueueOverride(tmpDir, 'build', 'build content', { agent: 'build' });

  const manifest = await readQueueManifest(tmpDir);
  assert.equal(manifest!.order.length, 3);
  // Both plan items should be before build
  assert.ok(manifest!.order[0].includes('plan-a'), 'first plan should come first');
  assert.ok(manifest!.order[1].includes('plan-b'), 'second plan should come second');
  assert.ok(manifest!.order[2].startsWith('4-'), 'build should be last');

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('writeQueueOverride skips stale manifest entries', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-manifest-stale-'));
  await fs.mkdir(path.join(tmpDir, 'queue'), { recursive: true });

  // Write a manifest with a stale entry (file doesn't exist)
  await writeQueueManifest(tmpDir, { order: ['0-999-stale.md', '5-888-also-stale.md'] });

  // Write a real item
  await writeQueueOverride(tmpDir, 'build', 'build content', { agent: 'build' });

  const manifest = await readQueueManifest(tmpDir);
  // Stale entries remain in manifest (loop.sh skips them on read)
  // New item should be inserted correctly
  assert.ok(manifest!.order.some(f => f.startsWith('4-')), 'new build item should be in manifest');

  await fs.rm(tmpDir, { recursive: true, force: true });
});
