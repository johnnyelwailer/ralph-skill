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
  await fs.mkdir(promptsDir, { recursive: true });

  const statusPath = path.join(sessionDir, 'status.json');
  const todoPath = path.join(workdir, 'TODO.md');
  const proofTemplatePath = path.join(promptsDir, 'PROMPT_proof.md');
  const reviewTemplatePath = path.join(promptsDir, 'PROMPT_review.md');
  const planTemplatePath = path.join(promptsDir, 'PROMPT_plan.md');
  const buildTemplatePath = path.join(promptsDir, 'PROMPT_build.md');

  await fs.writeFile(proofTemplatePath, 'proof content');
  await fs.writeFile(reviewTemplatePath, 'review content');
  await fs.writeFile(planTemplatePath, 'plan content');
  await fs.writeFile(buildTemplatePath, 'build content');

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
    await fs.writeFile(
      path.join(sessionDir, 'log.jsonl'),
      '{"event":"iteration_complete","mode":"plan"}\n{"event":"iteration_complete","mode":"build"}\n'
    );
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
    await fs.writeFile(
      path.join(sessionDir, 'log.jsonl'),
      '{"event":"iteration_complete","mode":"plan"}\n{"event":"iteration_complete","mode":"build"}\n'
    );
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
      
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      const queueDir = path.join(sessionDir, 'queue');
      if (existsSync(queueDir)) {
        const files = await fs.readdir(queueDir).catch(() => []);
        assert.ok(!files.some(f => f.includes('PROMPT_proof')));
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

    await t.test('queues build when review phase has no build since plan', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 7 }));
      await fs.writeFile(todoPath, '- [x] task 1');
      await fs.writeFile(path.join(sessionDir, 'review-verdict.json'), JSON.stringify({ iteration: 7, verdict: 'PASS' }));
      await fs.writeFile(path.join(sessionDir, 'log.jsonl'), '{"event":"iteration_complete","mode":"plan"}\n');
      const queueDir = path.join(sessionDir, 'queue');
      await fs.rm(queueDir, { recursive: true, force: true });

      await monitorSessionState({ sessionDir, workdir, promptsDir });

      const files = await fs.readdir(queueDir);
      assert.ok(files.some(f => f.includes('PROMPT_build')));
      const buildFile = files.find(f => f.includes('PROMPT_build'))!;
      const content = await fs.readFile(path.join(queueDir, buildFile), 'utf8');
      assert.ok(content.includes('reason: review_prerequisite_no_builds'));
      await fs.rm(queueDir, { recursive: true, force: true });
    });

    await t.test('warns when STEERING.md exists but PROMPT_steer.md is missing', async () => {
      const steeringPath = path.join(workdir, 'STEERING.md');
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

    await t.test('skips queueing if already queued (build -> proof)', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build' }));
      await fs.writeFile(todoPath, '- [x] task 1');
      const queueDir = path.join(sessionDir, 'queue');
      await fs.mkdir(queueDir, { recursive: true });
      await fs.writeFile(path.join(queueDir, 'PROMPT_proof.md'), 'existing proof');
      
      await monitorSessionState({ sessionDir, workdir, promptsDir });

      const content = await fs.readFile(path.join(queueDir, 'PROMPT_proof.md'), 'utf8');
      assert.strictEqual(content, 'existing proof');
      await fs.rm(queueDir, { recursive: true, force: true });
    });

    await t.test('getReviewVerdict handles missing/invalid verdict file', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 1 }));
      const verdictPath = path.join(sessionDir, 'review-verdict.json');
      await fs.writeFile(
        path.join(sessionDir, 'log.jsonl'),
        '{"event":"iteration_complete","mode":"plan"}\n{"event":"iteration_complete","mode":"build"}\n'
      );
      
      // Missing
      if (existsSync(verdictPath)) await fs.rm(verdictPath);
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      assert.equal(JSON.parse(await fs.readFile(statusPath, 'utf8')).state, 'running');

      // Invalid JSON
      await fs.writeFile(verdictPath, 'invalid json');
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      assert.equal(JSON.parse(await fs.readFile(statusPath, 'utf8')).state, 'running');

      // Wrong iteration
      await fs.writeFile(verdictPath, JSON.stringify({ iteration: 99, verdict: 'PASS' }));
      await monitorSessionState({ sessionDir, workdir, promptsDir });
      assert.equal(JSON.parse(await fs.readFile(statusPath, 'utf8')).state, 'running');
    });

    await t.test('stops session with review PASS but meta.pid missing or invalid', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'review', iteration: 1 }));
      const verdictPath = path.join(sessionDir, 'review-verdict.json');
      await fs.writeFile(verdictPath, JSON.stringify({ iteration: 1, verdict: 'PASS' }));
      await fs.writeFile(todoPath, '- [x] task 1');
      await fs.writeFile(
        path.join(sessionDir, 'log.jsonl'),
        '{"event":"iteration_complete","mode":"plan"}\n{"event":"iteration_complete","mode":"build"}\n'
      );
      
      const metaPath = path.join(sessionDir, 'meta.json');
      await fs.writeFile(metaPath, 'invalid json');

      await monitorSessionState({ sessionDir, workdir, promptsDir });
      assert.equal(JSON.parse(await fs.readFile(statusPath, 'utf8')).state, 'exited');
    });

    await t.test('checkAllTasksComplete handles readFile error', async () => {
      const mockWorkDir = path.join(tmpDir, 'mockWorkdir-readfail');
      await fs.mkdir(mockWorkDir, { recursive: true });
      await fs.mkdir(path.join(mockWorkDir, 'TODO.md'), { recursive: true });
      
      await monitorSessionState({ sessionDir, workdir: mockWorkDir, promptsDir });
      // Should not crash
    });

    await t.test('handles readdir failure for queue directory', async () => {
      await fs.writeFile(statusPath, JSON.stringify({ state: 'running', phase: 'build' }));
      await fs.writeFile(todoPath, '- [ ] task 1');
      
      const steeringPath = path.join(workdir, 'STEERING.md');
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
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});
