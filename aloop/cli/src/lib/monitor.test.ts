import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
  await fs.mkdir(path.join(workdir, '.aloop'), { recursive: true });
  await fs.mkdir(promptsDir, { recursive: true });

  const statusPath = path.join(sessionDir, 'status.json');
  const todoPath = path.join(workdir, '.aloop', 'TODO.md');
  const specReviewTemplatePath = path.join(promptsDir, 'PROMPT_spec-review.md');
  const finalReviewTemplatePath = path.join(promptsDir, 'PROMPT_final-review.md');
  const finalQaTemplatePath = path.join(promptsDir, 'PROMPT_final-qa.md');
  const proofTemplatePath = path.join(promptsDir, 'PROMPT_proof.md');
  const planTemplatePath = path.join(promptsDir, 'PROMPT_plan.md');
  const buildTemplatePath = path.join(promptsDir, 'PROMPT_build.md');

  await fs.writeFile(specReviewTemplatePath, '---\nagent: spec-review\ntrigger: all_tasks_done\n---\nspec review content');
  await fs.writeFile(finalReviewTemplatePath, '---\nagent: final-review\ntrigger: spec-review\n---\nfinal review content');
  await fs.writeFile(finalQaTemplatePath, '---\nagent: final-qa\ntrigger: final-review\n---\nfinal qa content');
  await fs.writeFile(proofTemplatePath, '---\nagent: proof\ntrigger: final-qa\n---\nproof content');
  await fs.writeFile(planTemplatePath, 'plan content');
  await fs.writeFile(buildTemplatePath, 'build content');

  await t.test('queues trigger-matched prompt when all tasks are done in build and sets allTasksMarkedDone', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 1 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 1, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_spec-review')));

    const specReviewFile = files.find(f => f.includes('PROMPT_spec-review'))!;
    const content = await fs.readFile(path.join(queueDir, specReviewFile), 'utf8');
    assert.ok(content.includes('spec review content'));
    assert.ok(content.includes('reason: triggered_by_all_tasks_done'));
    assert.ok(content.includes('trigger: all_tasks_done'));

    // Verify allTasksMarkedDone was set in loop plan
    const loopPlan = JSON.parse(await fs.readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
    assert.equal(loopPlan.allTasksMarkedDone, true);

    // Cleanup queue for next subtest
    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('queues trigger-matched prompt when current phase event matches trigger', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'spec-review', iteration: 2 }));
    await fs.writeFile(todoPath, '# TODO\n- [x] task 1\n');
    await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 2, version: 1 });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const queueDir = path.join(sessionDir, 'queue');
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_final-review')));

    const finalReviewFile = files.find(f => f.includes('PROMPT_final-review'))!;
    const content = await fs.readFile(path.join(queueDir, finalReviewFile), 'utf8');
    assert.ok(content.includes('final review content'));
    assert.ok(content.includes('reason: triggered_by_spec-review'));
    assert.ok(content.includes('trigger: spec-review'));

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('queues steer then plan when STEERING.md is detected', async () => {
    const steeringFile = path.join(workdir, '.aloop', 'STEERING.md');
    try {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 3 }));
      await fs.writeFile(todoPath, '# TODO\n- [ ] task 1\n');
      await fs.writeFile(steeringFile, '# Steering\n\nAdjust scope.', 'utf8');
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
    } finally {
      const queueDir = path.join(sessionDir, 'queue');
      await fs.rm(queueDir, { recursive: true, force: true });
      await fs.rm(steeringFile, { force: true });
    }
  });

  await t.test('rattail chain completion: proof phase with no next triggers sets state=completed', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'proof', iteration: 10 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 10, version: 1,
      allTasksMarkedDone: true
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const statusContent = JSON.parse(await fs.readFile(statusPath, 'utf8'));
    assert.equal(statusContent.state, 'completed');
    assert.ok(statusContent.updated_at, 'should have updated_at timestamp');
  });

  await t.test('rattail chain completion handles missing/invalid meta.json gracefully', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'proof', iteration: 11 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 11, version: 1,
      allTasksMarkedDone: true
    });
    const metaPath = path.join(sessionDir, 'meta.json');
    await fs.writeFile(metaPath, 'invalid json');
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const statusContent = JSON.parse(await fs.readFile(statusPath, 'utf8'));
    assert.equal(statusContent.state, 'completed');
  });

  await t.test('rattail chain continues through intermediate phases (final-review → final-qa)', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'final-review', iteration: 12 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 12, version: 1,
      allTasksMarkedDone: true
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_final-qa')), 'should queue final-qa after final-review');

    const qaFile = files.find(f => f.includes('PROMPT_final-qa'))!;
    const content = await fs.readFile(path.join(queueDir, qaFile), 'utf8');
    assert.ok(content.includes('final qa content'));
    assert.ok(content.includes('trigger: final-review'));

    // State should remain running (chain not complete)
    const statusContent = JSON.parse(await fs.readFile(statusPath, 'utf8'));
    assert.equal(statusContent.state, 'running');

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('rattail chain continues through final-qa → proof', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'final-qa', iteration: 13 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 13, version: 1,
      allTasksMarkedDone: true
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_proof')), 'should queue proof after final-qa');

    const proofFile = files.find(f => f.includes('PROMPT_proof'))!;
    const content = await fs.readFile(path.join(queueDir, proofFile), 'utf8');
    assert.ok(content.includes('proof content'));
    assert.ok(content.includes('trigger: final-qa'));

    const statusContent = JSON.parse(await fs.readFile(statusPath, 'utf8'));
    assert.equal(statusContent.state, 'running');

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('re-entry: new incomplete tasks during rattail resets cycle and queues plan', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'final-review', iteration: 14 }));
    await fs.writeFile(todoPath, '- [ ] new review task\n- [x] done task');
    await writeLoopPlan(sessionDir, {
      cycle: ['PROMPT_plan.md', 'PROMPT_build.md'],
      cyclePosition: 3,
      iteration: 14,
      version: 1,
      allTasksMarkedDone: true
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    // Loop plan should be reset
    const loopPlan = JSON.parse(await fs.readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
    assert.equal(loopPlan.cyclePosition, 0);
    assert.equal(loopPlan.allTasksMarkedDone, false);

    // Plan should be queued for re-entry
    const files = await fs.readdir(queueDir);
    assert.ok(files.some(f => f.includes('PROMPT_plan')));

    const planFile = files.find(f => f.includes('PROMPT_plan'))!;
    const content = await fs.readFile(path.join(queueDir, planFile), 'utf8');
    assert.ok(content.includes('plan content'));
    assert.ok(content.includes('reason: rattail_reentry_new_tasks'));

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('re-entry: skips plan queue if plan already queued', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'spec-review', iteration: 15 }));
    await fs.writeFile(todoPath, '- [ ] new task\n- [x] done task');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 2, iteration: 15, version: 1,
      allTasksMarkedDone: true
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.mkdir(queueDir, { recursive: true });
    await fs.writeFile(path.join(queueDir, 'existing-PROMPT_plan.md'), 'plan already queued');

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    // Plan should not be duplicated
    const files = await fs.readdir(queueDir);
    const planFiles = files.filter(f => f.includes('PROMPT_plan'));
    assert.strictEqual(planFiles.length, 1, 'Should not duplicate plan queue entry');

    // allTasksMarkedDone should still be reset
    const loopPlan = JSON.parse(await fs.readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
    assert.equal(loopPlan.allTasksMarkedDone, false);

    await fs.rm(queueDir, { recursive: true, force: true });
  });

  await t.test('no re-entry when allTasksMarkedDone is false (normal cycle phase with incomplete tasks)', async () => {
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 16 }));
    await fs.writeFile(todoPath, '- [ ] task 1\n- [x] task 2');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 1, iteration: 16, version: 1,
      allTasksMarkedDone: false
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    // No plan should be queued for re-entry (this is normal build, not rattail)
    if (existsSync(queueDir)) {
      const files = await fs.readdir(queueDir);
      assert.ok(!files.some(f => f.includes('PROMPT_plan')));
    }
  });

  await t.test('chain completion does not fire when allTasksMarkedDone is false', async () => {
    // Non-build phase with all tasks done but not in rattail
    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 17 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 17, version: 1,
      allTasksMarkedDone: false
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    // State should remain running — not in rattail chain
    const statusContent = JSON.parse(await fs.readFile(statusPath, 'utf8'));
    assert.equal(statusContent.state, 'running');
  });

  await t.test('allTasksMarkedDone not set when no templates match all_tasks_done', async () => {
    // Remove spec-review template to simulate no matches
    const backupPath = specReviewTemplatePath + '.bak';
    await fs.rename(specReviewTemplatePath, backupPath);

    await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 18 }));
    await fs.writeFile(todoPath, '- [x] task 1');
    await writeLoopPlan(sessionDir, {
      cycle: [], cyclePosition: 0, iteration: 18, version: 1,
      allTasksMarkedDone: false
    });
    const queueDir = path.join(sessionDir, 'queue');
    await fs.rm(queueDir, { recursive: true, force: true });

    await monitorSessionState({ sessionDir, workdir, promptsDir });

    const loopPlan = JSON.parse(await fs.readFile(path.join(sessionDir, 'loop-plan.json'), 'utf8'));
    assert.equal(loopPlan.allTasksMarkedDone, false, 'Should not set allTasksMarkedDone when no templates queued');

    await fs.rename(backupPath, specReviewTemplatePath);
  });

  await t.test('coverage gaps', async (t) => {
    await t.test('returns early if status.json is missing', async () => {
      const sPath = path.join(sessionDir, 'status-missing.json');
      await monitorSessionState({ sessionDir, workdir, promptsDir: promptsDir });
      // Should not crash
    });

    await t.test('returns early if status.json is invalid JSON', async () => {
      const sPath = path.join(sessionDir, 'status.json');
      await fs.writeFile(sPath, 'invalid json');
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      // Should not crash
    });

    await t.test('returns early if status.state is not running/starting', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'exited' }));
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      // No-op expected
    });

    await t.test('returns early if loop-plan.json is missing', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running' }));
      const pPath = path.join(sessionDir, 'loop-plan.json');
      if (existsSync(pPath)) await fs.rm(pPath);
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      // No-op expected
    });

    await t.test('checkAllTasksComplete handles missing TODO.md', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build' }));
      await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 1, version: 1 });
      if (existsSync(todoPath)) await fs.rm(todoPath);
      const queueDir = path.join(sessionDir, 'queue');
      await fs.rm(queueDir, { recursive: true, force: true });

      await monitorSessionState({ sessionDir, workdir, promptsDir });
      if (existsSync(queueDir)) {
        const files = await fs.readdir(queueDir).catch(() => []);
        assert.ok(!files.some(f => f.includes('PROMPT_spec-review')));
      }
    });

    await t.test('queues plan when build phase has no TODO tasks', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 1 }));
      await fs.writeFile(todoPath, '');
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      const queueDir = path.join(sessionDir, 'queue');
      if (existsSync(queueDir)) {
        const files = await fs.readdir(queueDir).catch(() => []);
        assert.ok(files.some(f => f.includes('PROMPT_plan')));
        await fs.rm(queueDir, { recursive: true, force: true });
      }
    });

    await t.test('warns when STEERING.md exists but PROMPT_steer.md is missing', async () => {
      const steeringPath = path.join(workdir, '.aloop', 'STEERING.md');
      await fs.writeFile(steeringPath, 'steering content');
      const steerTemplatePath = path.join(promptsDir, 'PROMPT_steer.md');
      const backupPath = steerTemplatePath + '.bak';
      if (existsSync(steerTemplatePath)) await fs.rename(steerTemplatePath, backupPath);

      // Mock console.warn
      const originalWarn = console.warn;
      let warned = false;
      console.warn = (msg) => {
        if (typeof msg === 'string' && msg.includes('PROMPT_steer.md is missing')) warned = true;
      };

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      console.warn = originalWarn;
      if (existsSync(backupPath)) await fs.rename(backupPath, steerTemplatePath);
      assert.ok(warned, 'Should have warned about missing steering template');
      await fs.rm(steeringPath, { force: true });
    });

    await t.test('skips queueing if already queued (build -> trigger target)', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build' }));
      await fs.writeFile(todoPath, '- [x] task 1');
      const queueDir = path.join(sessionDir, 'queue');
      await fs.mkdir(queueDir, { recursive: true });
      await fs.writeFile(path.join(queueDir, 'PROMPT_spec-review.md'), 'existing spec review');

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      const content = await fs.readFile(path.join(queueDir, 'PROMPT_spec-review.md'), 'utf8');
      assert.strictEqual(content, 'existing spec review');
      await fs.rm(queueDir, { recursive: true, force: true });
    });

    await t.test('skips steer queue when steer already queued', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 30 }));
      await fs.writeFile(todoPath, '- [ ] task 1');
      await fs.writeFile(path.join(workdir, '.aloop', 'STEERING.md'), 'steer me');
      const queueDir = path.join(sessionDir, 'queue');
      await fs.mkdir(queueDir, { recursive: true });
      await fs.writeFile(path.join(queueDir, 'existing-PROMPT_steer.md'), 'already queued');

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      const content = await fs.readFile(path.join(queueDir, 'existing-PROMPT_steer.md'), 'utf8');
      assert.strictEqual(content, 'already queued');
      await fs.rm(queueDir, { recursive: true, force: true });
      await fs.rm(path.join(workdir, '.aloop', 'STEERING.md'), { force: true });
    });

    await t.test('steering skips plan queue when plan already queued', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 31 }));
      await fs.writeFile(todoPath, '- [ ] task 1');
      await fs.writeFile(path.join(workdir, '.aloop', 'STEERING.md'), 'steer me');
      await fs.writeFile(path.join(promptsDir, 'PROMPT_steer.md'), 'steer template');
      const queueDir = path.join(sessionDir, 'queue');
      await fs.mkdir(queueDir, { recursive: true });
      // Plan already queued but steer is not
      await fs.writeFile(path.join(queueDir, 'existing-PROMPT_plan.md'), 'plan already queued');

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      // Steer should be queued, but plan should NOT be duplicated
      const files = await fs.readdir(queueDir);
      const planFiles = files.filter(f => f.includes('PROMPT_plan'));
      assert.strictEqual(planFiles.length, 1, 'Should not duplicate plan queue entry');
      assert.ok(files.some(f => f.includes('PROMPT_steer')));
      await fs.rm(queueDir, { recursive: true, force: true });
      await fs.rm(path.join(workdir, '.aloop', 'STEERING.md'), { force: true });
    });

    await t.test('monitors in starting state', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'starting', phase: 'build', iteration: 1 }));
      await fs.writeFile(todoPath, '- [x] task 1');
      await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 1, version: 1 });
      const queueDir = path.join(sessionDir, 'queue');
      await fs.rm(queueDir, { recursive: true, force: true });

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      const files = await fs.readdir(queueDir);
      assert.ok(files.some(f => f.includes('PROMPT_spec-review')));
      await fs.rm(queueDir, { recursive: true, force: true });
    });

    await t.test('build phase with incomplete tasks does not queue trigger-dispatched prompt', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build', iteration: 42 }));
      await fs.writeFile(todoPath, '- [ ] task 1\n- [x] task 2');
      await writeLoopPlan(sessionDir, { cycle: [], cyclePosition: 0, iteration: 42, version: 1 });
      const queueDir = path.join(sessionDir, 'queue');
      await fs.rm(queueDir, { recursive: true, force: true });

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      if (existsSync(queueDir)) {
        const files = await fs.readdir(queueDir);
        assert.ok(!files.some(f => f.includes('PROMPT_spec-review')));
      }
    });

    await t.test('handles readdir failure for queue directory', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build' }));
      await fs.writeFile(todoPath, '- [ ] task 1');

      const steeringPath = path.join(workdir, '.aloop', 'STEERING.md');
      await fs.writeFile(steeringPath, 'steering content');

      // Make prompts directory empty for this test to avoid queueing anything
      const emptyPromptsDir = path.join(tmpDir, 'emptyPrompts');
      await fs.mkdir(emptyPromptsDir, { recursive: true });

      const qDir = path.join(sessionDir, 'queue');
      if (existsSync(qDir)) await fs.rm(qDir, { recursive: true, force: true });
      await fs.writeFile(qDir, 'not a directory');

      await monitorSessionState({ sessionDir, workdir, promptsDir: emptyPromptsDir });
      // Should not crash, case 0 calls readdir and catches failure

      await fs.rm(steeringPath, { force: true });
    });

    await t.test('checkAllTasksComplete handles readFile error', async () => {
      const mockWorkDir = path.join(tmpDir, 'mockWorkdir-readfail');
      await fs.mkdir(mockWorkDir, { recursive: true });
      await fs.mkdir(path.join(mockWorkDir, '.aloop', 'TODO.md'), { recursive: true });

      await monitorSessionState({ sessionDir, workdir: mockWorkDir, promptsDir });
      // Should not crash
    });
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});
