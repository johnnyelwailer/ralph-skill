import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { readLoopPlan, writeQueueOverride } from './plan.js';

export interface MonitorOptions {
  sessionDir: string;
  workdir: string;
  promptsDir: string;
}

/**
 * Checks if all tasks in TODO.md are complete.
 * Matches logic in loop.sh check_all_tasks_complete.
 */
async function checkAllTasksComplete(workdir: string): Promise<boolean> {
  const planPath = path.join(workdir, 'TODO.md');
  if (!existsSync(planPath)) return false;
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
    
    return incomplete === 0 && completed > 0;
  } catch {
    return false;
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

  const allTasksDone = await checkAllTasksComplete(options.workdir);

  // Case 1: All tasks done during/after build -> queue proof
  if (status.phase === 'build' && allTasksDone) {
    const queueDir = path.join(options.sessionDir, 'queue');
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
    const queueDir = path.join(options.sessionDir, 'queue');
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
      const queueDir = path.join(options.sessionDir, 'queue');
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
