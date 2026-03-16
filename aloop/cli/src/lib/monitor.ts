import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { mutateLoopPlan, queueSteeringPrompt, readLoopPlan, writeQueueOverride } from './plan.js';
import { parseYaml } from './yaml.js';

export interface MonitorOptions {
  sessionDir: string;
  workdir: string;
  promptsDir: string;
}

interface TriggeredPromptTemplate {
  fileName: string;
  agent: string;
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


function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}

function normalizeTriggerValues(trigger: unknown): string[] {
  if (typeof trigger === 'string') {
    return trigger
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }
  if (Array.isArray(trigger)) {
    return trigger
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean);
  }
  return [];
}

async function findTriggeredTemplates(promptsDir: string, event: string): Promise<TriggeredPromptTemplate[]> {
  const entries = await fs.readdir(promptsDir).catch(() => []);
  const promptFiles = entries.filter(name => /^PROMPT_.*\.md$/i.test(name)).sort();
  const matches: TriggeredPromptTemplate[] = [];

  for (const fileName of promptFiles) {
    const templatePath = path.join(promptsDir, fileName);
    const templateContent = await fs.readFile(templatePath, 'utf8').catch(() => null);
    if (!templateContent) continue;

    const frontmatter = extractFrontmatter(templateContent);
    if (!frontmatter) continue;

    const parsed = parseYaml(frontmatter) as Record<string, unknown>;
    const triggers = normalizeTriggerValues(parsed.trigger);
    if (!triggers.includes(event)) continue;

    const stem = fileName.replace(/\.md$/i, '');
    const fallbackAgent = stem.replace(/^PROMPT_/i, '');
    const agent = typeof parsed.agent === 'string' && parsed.agent.trim().length > 0
      ? parsed.agent.trim()
      : fallbackAgent;

    matches.push({ fileName, agent });
  }

  return matches;
}

async function queueTemplatesForEvent(options: MonitorOptions, event: string): Promise<number> {
  const templates = await findTriggeredTemplates(options.promptsDir, event);
  if (templates.length === 0) return 0;

  const queueDir = path.join(options.sessionDir, 'queue');
  const queueEntries = await fs.readdir(queueDir).catch(() => []);
  let queued = 0;

  for (const template of templates) {
    const stem = template.fileName.replace(/\.md$/i, '');
    const alreadyQueued = queueEntries.some(entry => entry.includes(stem));
    if (alreadyQueued) continue;

    const templatePath = path.join(options.promptsDir, template.fileName);
    if (!existsSync(templatePath)) continue;
    const content = await fs.readFile(templatePath, 'utf8');
    await writeQueueOverride(options.sessionDir, stem, content, {
      agent: template.agent,
      reason: `triggered_by_${event}`,
      trigger: event,
      type: 'event_dispatch'
    });
    console.log(`[monitor] Event '${event}' queued ${template.fileName}.`);
    queued++;
  }

  return queued;
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

  // Event-driven dispatch from prompt catalog trigger frontmatter.
  if (allTasksDone && typeof status.phase === 'string') {
    if (status.phase === 'build') {
      const queued = await queueTemplatesForEvent(options, 'all_tasks_done');
      if (queued > 0) {
        await mutateLoopPlan(options.sessionDir, { allTasksMarkedDone: true });
      }
    } else {
      const queued = await queueTemplatesForEvent(options, status.phase);
      // Chain completion: no next phase queued while in rattail → session completed.
      if (queued === 0 && plan.allTasksMarkedDone) {
        console.log(`[monitor] Rattail chain complete (phase: ${status.phase}). Session completed.`);
        const nextStatus = { ...status, state: 'completed', updated_at: new Date().toISOString() };
        await fs.writeFile(statusPath, JSON.stringify(nextStatus, null, 2));

        const metaPath = path.join(options.sessionDir, 'meta.json');
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
          if (meta.pid) {
            process.kill(meta.pid, 'SIGTERM');
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Re-entry: rattail agent created new TODO items → back to build cycle.
  if (plan.allTasksMarkedDone && !allTasksDone && taskCounts !== null && taskCounts.incomplete > 0) {
    console.log(`[monitor] New incomplete tasks during rattail; re-entering build cycle.`);
    await mutateLoopPlan(options.sessionDir, {
      cyclePosition: 0,
      allTasksMarkedDone: false
    });

    const queueEntries = await fs.readdir(queueDir).catch(() => []);
    if (!queueEntries.some(e => e.includes('PROMPT_plan'))) {
      const planTemplatePath = path.join(options.promptsDir, 'PROMPT_plan.md');
      if (existsSync(planTemplatePath)) {
        const content = await fs.readFile(planTemplatePath, 'utf8');
        await writeQueueOverride(options.sessionDir, 'PROMPT_plan', content, {
          agent: 'plan',
          reason: 'rattail_reentry_new_tasks',
          type: 'event_dispatch'
        });
        console.log('[monitor] Queued plan for rattail re-entry.');
      }
    }
  }
}
