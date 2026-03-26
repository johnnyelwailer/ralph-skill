import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Priority tiers for queue items. Lower number = higher priority.
 * Each entry: [tier, label]
 */
export const QUEUE_PRIORITY_TIERS = {
  STEERING: 0,
  REVIEW: 1,
  SUB_DECOMPOSE: 2,
  PLAN: 3,
  BUILD: 4,
  DEFAULT: 5,
} as const;

export type QueuePriorityTier = (typeof QUEUE_PRIORITY_TIERS)[keyof typeof QUEUE_PRIORITY_TIERS];

const NAMED_PRIORITY_TIERS: Record<string, QueuePriorityTier> = {
  steering: 0,
  review: 1,
  sub_decompose: 2,
  plan: 3,
  build: 4,
  default: 5,
};

/**
 * Resolves the priority tier for a queue item.
 * Accepts either an explicit `priority` field (numeric or named tier) or
 * falls back to inferring from `type`, `agent`, and `reason`.
 * Returns a tier number 0–5 (lower = higher priority).
 */
export function resolveQueuePriority(frontmatter: Record<string, string>): QueuePriorityTier {
  // Explicit priority field — agent-driven or runtime-overridable
  if (frontmatter.priority) {
    const raw = frontmatter.priority.trim();
    // Named tier lookup
    if (raw in NAMED_PRIORITY_TIERS) {
      return NAMED_PRIORITY_TIERS[raw];
    }
    // Numeric value — clamp to 0–5
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      return (Math.max(0, Math.min(5, num)) as QueuePriorityTier);
    }
  }

  // Fallback: infer from frontmatter fields
  const { type, agent, reason } = frontmatter;

  if (type === 'steering_override' || type === 'triage_steering_override') {
    return QUEUE_PRIORITY_TIERS.STEERING;
  }
  if (agent === 'review') {
    return QUEUE_PRIORITY_TIERS.REVIEW;
  }
  if (agent === 'plan' && reason && reason.includes('decompose')) {
    return QUEUE_PRIORITY_TIERS.SUB_DECOMPOSE;
  }
  if (agent === 'plan') {
    return QUEUE_PRIORITY_TIERS.PLAN;
  }
  if (agent === 'build') {
    return QUEUE_PRIORITY_TIERS.BUILD;
  }
  return QUEUE_PRIORITY_TIERS.DEFAULT;
}

export interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
  allTasksMarkedDone?: boolean;
  finalizer?: string[];
  finalizerPosition?: number;
}

export interface MutateLoopPlanOptions {
  cycle?: string[];
  cyclePosition?: number;
  iteration?: number;
  allTasksMarkedDone?: boolean;
  finalizer?: string[];
  finalizerPosition?: number;
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
  if (options.finalizer !== undefined) plan.finalizer = options.finalizer;
  if (options.finalizerPosition !== undefined) plan.finalizerPosition = options.finalizerPosition;

  plan.version = (plan.version || 1) + 1;

  await writeLoopPlan(sessionDir, plan);
  return plan;
}

/**
 * Writes a one-shot override prompt to the queue/ directory.
 * If frontmatter contains a `priority` field (or can be inferred from agent/type),
 * the filename is prefixed with `{priority}-{timestamp}-{name}.md` so that
 * lexicographic sort in the loop scripts naturally consumes higher-priority items first.
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
  const priority = frontmatter ? resolveQueuePriority(frontmatter) : QUEUE_PRIORITY_TIERS.DEFAULT;
  const fileName = `${priority}-${timestamp}-${name}.md`;
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
