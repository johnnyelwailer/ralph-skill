import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import os from 'node:os';
import { monitorSessionState } from './monitor.js';
import { writeLoopPlan } from './plan.js';

test('monitorSessionState transitions', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aloop-monitor-test-'));
  const sessionDir = path.join(tmpDir, 'session');
  const workdir = path.join(tmpDir, 'workdir');
  const promptsDir = path.join(tmpDir, 'prompts');

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(workdir, { recursive: true });
  await fs.mkdir(promptsDir, { recursive: true });

  const statusPath = path.join(sessionDir, 'status.json');
  const todoPath = path.join(workdir, 'TODO.md');
  const proofTemplatePath = path.join(promptsDir, 'PROMPT_proof.md');
  const reviewTemplatePath = path.join(promptsDir, 'PROMPT_review.md');
  const planTemplatePath = path.join(promptsDir, 'PROMPT_plan.md');

  await fs.writeFile(proofTemplatePath, 'proof content');
  await fs.writeFile(reviewTemplatePath, 'review content');
  await fs.writeFile(planTemplatePath, 'plan content');

  await t.test('queues proof when build finished and all tasks done', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 1 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 1, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_proof')));
    
    const proofFile = files.find(f => f.includes('PROMPT_proof'))!;
    const content = await fs.readFile(path.join(queueDir, proofFile), 'utf8');
    assert.ok(content.includes('proof content'));
    assert.ok(content.includes('reason: all_tasks_done'));

    // Cleanup queue for next subtest
    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('queues review when proof finished and all tasks done', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'proof', iteration: 2 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 2, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_review')));
    
    const reviewFile = files.find(f => f.includes('PROMPT_review'))!;
    const content = await fs.readFile(path.join(queueDir, reviewFile), 'utf8');
    assert.ok(content.includes('review content'));
    assert.ok(content.includes('reason: proof_complete'));

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('queues steer then plan when STEERING.md is detected', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 3 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await fs.writeFile(path.join(workdir, 'STEERING.md'), '# Steering\n\nAdjust scope.', 'utf8');
    await fs.writeFile(path.join(promptsDir, 'PROMPT_steer.md'), 'steer content');
    await writeLoopPlan(sessionDir, {
      cycle: ['PROMPT_plan.md', 'PROMPT_build.md'],
      cyclePosition: 1,
      iteration: 3,
      version: 1,
      allTasksMarkedDone: true
    });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = (await fs.readdir(queueDir)).sort();
    assert.ok(files.some(f => f.includes('PROMPT_steer')));
    assert.ok(files.some(f => f.includes('PROMPT_plan')));
    assert.ok(files.findIndex(f => f.includes('PROMPT_steer')) < files.findIndex(f => f.includes('PROMPT_plan')));

    const steerFile = files.find(f => f.includes('PROMPT_steer'))!;
    const steerContent = await fs.readFile(path.join(queueDir, steerFile), 'utf8');
    assert.ok(steerContent.includes('steer content'), 'should include template content');
    assert.ok(steerContent.includes('Adjust scope.'), 'should include user steering instruction from STEERING.md');
    assert.ok(steerContent.includes('reason: steering_detected'));

    const loopPlan = JSON.parse(await fs.readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
    assert.equal(loopPlan.cyclePosition, 0);
    assert.equal(loopPlan.allTasksMarkedDone, false);

    await fs.rm(queueDir, { recursive: true, force: true });
    await fs.rm(path.join(workdir, 'STEERING.md'), { force: true });
  });

  await t.test('stops session when review passes', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 3 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await fs.writeFile(path.join(sessionDir, 'review-verdict.json'), JSON.stringify({ iteration: 3, verdict: 'PASS' }));
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 3, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const statusContent = await fs.readFile(statusPath, 'utf8');
    const status = JSON.parse(statusContent);
    assert.equal(status.state, 'exited');
  });

  await t.test('queues plan when review fails', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 4 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await fs.writeFile(path.join(sessionDir, 'review-verdict.json'), JSON.stringify({ iteration: 4, verdict: 'FAIL' }));
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 4, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_plan')));
    
    const planFile = files.find(f => f.includes('PROMPT_plan'))!;
    const content = await fs.readFile(path.join(queueDir, planFile), 'utf8');
    assert.ok(content.includes('plan content'));
    assert.ok(content.includes('reason: review_failed'));
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});
