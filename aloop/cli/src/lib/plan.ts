import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
  allTasksMarkedDone?: boolean;
}

export interface MutateLoopPlanOptions {
  cycle?: string[];
  cyclePosition?: number;
  iteration?: number;
  allTasksMarkedDone?: boolean;
}

/**
 * Reads the loop-plan.json from the given session directory.
 */
export async function readLoopPlan(sessionDir: string): Promise<LoopPlan | null> {
  const planPath = path.join(sessionDir, 'loop-plan.json');
  if (!existsSync(planPath)) return null;
  try {
    const content = await fs.readFile(planPath, 'utf8');
    return JSON.parse(content) as LoopPlan;
  } catch (error) {
    console.error(`Failed to read loop-plan.json at ${planPath}:`, error);
    return null;
  }
}

/**
 * Writes the loop-plan.json to the given session directory.
 */
export async function writeLoopPlan(sessionDir: string, plan: LoopPlan): Promise<void> {
  const planPath = path.join(sessionDir, 'loop-plan.json');
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

/**
 * Mutates the loop-plan.json with the given options.
 */
export async function mutateLoopPlan(sessionDir: string, options: MutateLoopPlanOptions): Promise<LoopPlan> {
  const plan = await readLoopPlan(sessionDir);
  if (!plan) {
    throw new Error(`loop-plan.json not found in ${sessionDir}`);
  }

  if (options.cycle !== undefined) plan.cycle = options.cycle;
  if (options.cyclePosition !== undefined) plan.cyclePosition = options.cyclePosition;
  if (options.iteration !== undefined) plan.iteration = options.iteration;
  if (options.allTasksMarkedDone !== undefined) plan.allTasksMarkedDone = options.allTasksMarkedDone;

  plan.version = (plan.version || 1) + 1;

  await writeLoopPlan(sessionDir, plan);
  return plan;
}

/**
 * Writes a one-shot override prompt to the queue/ directory.
 */
export async function writeQueueOverride(
  sessionDir: string,
  name: string,
  content: string,
  frontmatter?: Record<string, string>
): Promise<string> {
  const queueDir = path.join(sessionDir, 'queue');
  await fs.mkdir(queueDir, { recursive: true });

  const timestamp = new Date().getTime();
  const fileName = `${timestamp}-${name}.md`;
  const queuePath = path.join(queueDir, fileName);

  let finalContent = content;
  if (frontmatter) {
    const fmLines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      fmLines.push(`${key}: ${value}`);
    }
    fmLines.push('---');
    finalContent = `${fmLines.join('\n')}\n\n${content}`;
  }

  await fs.writeFile(queuePath, finalContent, 'utf8');
  return queuePath;
}

/**
 * Queues a steering prompt by combining a template (if available) with the user instruction.
 */
export async function queueSteeringPrompt(
  sessionDir: string,
  promptsDir: string,
  steeringInstruction: string,
  name: string = 'steering',
  frontmatter: Record<string, string> = { agent: 'steer', type: 'steering_override' }
): Promise<string> {
  const steerTemplatePath = path.join(promptsDir, 'PROMPT_steer.md');
  let steerPromptContent = steeringInstruction;

  if (existsSync(steerTemplatePath)) {
    const templateContent = await fs.readFile(steerTemplatePath, 'utf8');
    steerPromptContent = templateContent + '\n\n' + steeringInstruction;
  }

  return await writeQueueOverride(sessionDir, name, steerPromptContent, frontmatter);
}
