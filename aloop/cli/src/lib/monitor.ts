import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { mutateLoopPlan, queueSteeringPrompt, readLoopPlan, writeQueueOverride } from './plan.js';

export interface MonitorOptions {
  sessionDir: string;
  workdir: string;
  promptsDir: string;
}

/**
 * Reads TODO.md task counts.
 */
async function getTodoTaskCounts(workdir: string): Promise<{ incomplete: number; completed: number } | null> {
  const planPath = path.join(workdir, 'TODO.md');
  if (!existsSync(planPath)) return null;
  try {
    const content = await fs.readFile(planPath, 'utf8');
    const lines = content.split('\n');

    let incomplete = 0;
    let completed = 0;

    for (const line of lines) {
      if (/^\s*- \[ \]/.test(line)) {
        incomplete++;
      } else if (/^\s*- \[x\]/.test(line)) {
        completed++;
      }
    }

    return { incomplete, completed };
  } catch {
    return null;
  }
}

/**
 * Reads the review verdict for the given iteration.
 */
async function getReviewVerdict(sessionDir: string, iteration: number): Promise<string | null> {
  const verdictPath = path.join(sessionDir, 'review-verdict.json');
  if (!existsSync(verdictPath)) return null;
  try {
    const content = await fs.readFile(verdictPath, 'utf8');
    const data = JSON.parse(content);
    if (data.iteration === iteration && (data.verdict === 'PASS' || data.verdict === 'FAIL')) {
      return data.verdict;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Best-effort detection of whether a build succeeded after the last plan in log.jsonl.
 * Returns true when no reliable evidence is available.
 */
async function hasBuildSinceLastPlan(sessionDir: string): Promise<boolean> {
  const logPath = path.join(sessionDir, 'log.jsonl');
  if (!existsSync(logPath)) return true;
  try {
    const content = await fs.readFile(logPath, 'utf8');
    let sawPlan = false;
    let buildSeenSincePlan = true;
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry?.event !== 'iteration_complete' || typeof entry.mode !== 'string') continue;
      if (entry.mode === 'plan') {
        sawPlan = true;
        buildSeenSincePlan = false;
      } else if (entry.mode === 'build') {
        buildSeenSincePlan = true;
      }
    }
    return sawPlan ? buildSeenSincePlan : true;
  } catch {
    return true;
  }
}

/**
 * Monitors the session for state transitions that should trigger new prompts.
 */
export async function monitorSessionState(options: MonitorOptions): Promise<void> {
  const statusPath = path.join(options.sessionDir, 'status.json');
  if (!existsSync(statusPath)) return;

  let status: any;
  try {
    const content = await fs.readFile(statusPath, 'utf8');
    status = JSON.parse(content);
  } catch {
    return;
  }

  // Only act if we are in a running or starting state (not exited/stopped)
  if (status.state !== 'running' && status.state !== 'starting') return;

  const plan = await readLoopPlan(options.sessionDir);
  if (!plan) return;

  const queueDir = path.join(options.sessionDir, 'queue');

  // Case 0: Runtime-driven steering detection.
  // If a live steering doc appears, queue steer first, then plan.
  const steeringPath = path.join(options.workdir, 'STEERING.md');
  if (existsSync(steeringPath)) {
    const queueEntries = await fs.readdir(queueDir).catch(() => []);
    const steerAlreadyQueued = queueEntries.some(
      e => e.includes('PROMPT_steer') || e.includes('-steering.')
    );
    const planAlreadyQueued = queueEntries.some(e => e.includes('PROMPT_plan'));

    if (!steerAlreadyQueued) {
      const steerTemplatePath = path.join(options.promptsDir, 'PROMPT_steer.md');
      const planTemplatePath = path.join(options.promptsDir, 'PROMPT_plan.md');

      if (existsSync(steerTemplatePath)) {
        const steeringInstruction = await fs.readFile(steeringPath, 'utf8');
        await queueSteeringPrompt(
          options.sessionDir,
          options.promptsDir,
          steeringInstruction,
          '001-PROMPT_steer',
          {
            agent: 'steer',
            reason: 'steering_detected',
            type: 'steering_override'
          }
        );
        console.log('[monitor] STEERING.md detected; queued steer.');

        if (!planAlreadyQueued && existsSync(planTemplatePath)) {
          const planContent = await fs.readFile(planTemplatePath, 'utf8');
          await writeQueueOverride(options.sessionDir, '002-PROMPT_plan', planContent, {
            agent: 'plan',
            reason: 'post_steer_replan',
            type: 'steering_override'
          });
          console.log('[monitor] Steering follow-up queued plan.');
        }

        await mutateLoopPlan(options.sessionDir, {
          cyclePosition: 0,
          allTasksMarkedDone: false
        });
      } else {
        console.warn(
          `[monitor] STEERING.md found but PROMPT_steer.md is missing in ${options.promptsDir} — steering skipped.`
        );
      }
    }
  }

  const taskCounts = await getTodoTaskCounts(options.workdir);
  const allTasksDone = taskCounts !== null && taskCounts.incomplete === 0 && taskCounts.completed > 0;

  // Runtime-owned prerequisite: if build is reached with no tasks at all, queue plan.
  if (status.phase === 'build' && taskCounts !== null && taskCounts.incomplete === 0 && taskCounts.completed === 0) {
    const queueEntries = await fs.readdir(queueDir).catch(() => []);
    const alreadyQueued = queueEntries.some(e => e.includes('PROMPT_plan'));
    if (!alreadyQueued) {
      const planTemplatePath = path.join(options.promptsDir, 'PROMPT_plan.md');
      if (existsSync(planTemplatePath)) {
        const content = await fs.readFile(planTemplatePath, 'utf8');
        await writeQueueOverride(options.sessionDir, 'PROMPT_plan', content, {
          agent: 'plan',
          reason: 'build_prerequisite_no_tasks'
        });
        console.log(`[monitor] Build phase reached with no TODO tasks; queued plan.`);
      }
    }
  }

  // Case 1: All tasks done during/after build -> queue proof
  if (status.phase === 'build' && allTasksDone) {
    const queueEntries = await fs.readdir(queueDir).catch(() => []);
    const alreadyQueued = queueEntries.some(e => e.includes('PROMPT_proof') || e.includes('PROMPT_review'));
    
    if (!alreadyQueued) {
      const proofTemplatePath = path.join(options.promptsDir, 'PROMPT_proof.md');
      if (existsSync(proofTemplatePath)) {
        const content = await fs.readFile(proofTemplatePath, 'utf8');
        await writeQueueOverride(options.sessionDir, 'PROMPT_proof', content, {
          agent: 'proof',
          reason: 'all_tasks_done'
        });
        console.log(`[monitor] All tasks done in build phase; queued proof.`);
      }
    }
  }

  // Case 2: Proof successful + all tasks done -> queue review
  if (status.phase === 'proof' && allTasksDone) {
    const queueEntries = await fs.readdir(queueDir).catch(() => []);
    const alreadyQueued = queueEntries.some(e => e.includes('PROMPT_review'));

    if (!alreadyQueued) {
      const reviewTemplatePath = path.join(options.promptsDir, 'PROMPT_review.md');
      if (existsSync(reviewTemplatePath)) {
        const content = await fs.readFile(reviewTemplatePath, 'utf8');
        await writeQueueOverride(options.sessionDir, 'PROMPT_review', content, {
          agent: 'review',
          reason: 'proof_complete'
        });
        console.log(`[monitor] All tasks done in proof phase; queued review.`);
      }
    }
  }

  // Case 3: Review complete -> handle PASS/FAIL
  if (status.phase === 'review') {
    const buildReadyForReview = await hasBuildSinceLastPlan(options.sessionDir);
    if (!buildReadyForReview) {
      const queueEntries = await fs.readdir(queueDir).catch(() => []);
      const alreadyQueued = queueEntries.some(e => e.includes('PROMPT_build'));
      if (!alreadyQueued) {
        const buildTemplatePath = path.join(options.promptsDir, 'PROMPT_build.md');
        if (existsSync(buildTemplatePath)) {
          const content = await fs.readFile(buildTemplatePath, 'utf8');
          await writeQueueOverride(options.sessionDir, 'PROMPT_build', content, {
            agent: 'build',
            reason: 'review_prerequisite_no_builds'
          });
          console.log(`[monitor] Review phase reached without build since plan; queued build.`);
        }
      }
      return;
    }

    const verdict = await getReviewVerdict(options.sessionDir, status.iteration);
    if (verdict === 'PASS' && allTasksDone) {
      // Approve and stop session
      console.log(`[monitor] Review PASS and all tasks done. Stopping session.`);
      const nextStatus = { ...status, state: 'exited', updated_at: new Date().toISOString() };
      await fs.writeFile(statusPath, JSON.stringify(nextStatus, null, 2));
      
      // Also stop the loop process if we can find the PID
      const metaPath = path.join(options.sessionDir, 'meta.json');
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        if (meta.pid) {
          process.kill(meta.pid, 'SIGTERM');
        }
      } catch { /* ignore */ }
    } else if (verdict === 'FAIL') {
      // Reject and queue plan
      const queueEntries = await fs.readdir(queueDir).catch(() => []);
      const alreadyQueued = queueEntries.some(e => e.includes('PROMPT_plan'));

      if (!alreadyQueued) {
        const planTemplatePath = path.join(options.promptsDir, 'PROMPT_plan.md');
        if (existsSync(planTemplatePath)) {
          const content = await fs.readFile(planTemplatePath, 'utf8');
          await writeQueueOverride(options.sessionDir, 'PROMPT_plan', content, {
            agent: 'plan',
            reason: 'review_failed'
          });
          console.log(`[monitor] Review FAILED; queued plan.`);
        }
      }
    }
  }
}
