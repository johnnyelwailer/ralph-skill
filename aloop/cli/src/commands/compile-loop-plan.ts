import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

type ProviderName = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode';
type LoopMode = 'plan' | 'build' | 'review' | 'plan-build' | 'plan-build-review';

interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
}

interface CompileLoopPlanOptions {
  mode: LoopMode;
  provider: string;
  promptsDir: string;
  sessionDir: string;
  enabledProviders: string[];
  roundRobinOrder: string[];
  models: Record<string, string>;
}

interface CompileLoopPlanDeps {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  existsSync: (path: string) => boolean;
}

const defaultCompileDeps: CompileLoopPlanDeps = {
  readFile,
  writeFile,
  existsSync,
};

const AGENT_FOR_PROMPT: Record<string, string> = {
  plan: 'plan',
  build: 'build',
  proof: 'proof',
  review: 'review',
  steer: 'steer',
};

const DEFAULT_REASONING: Record<string, string> = {
  plan: 'high',
  build: 'medium',
  proof: 'medium',
  review: 'high',
  steer: 'medium',
};

function buildCycleForMode(mode: LoopMode): string[] {
  switch (mode) {
    case 'plan':
      return ['PROMPT_plan.md'];
    case 'build':
      return ['PROMPT_build.md'];
    case 'review':
      return ['PROMPT_review.md'];
    case 'plan-build':
      return ['PROMPT_plan.md', 'PROMPT_build.md'];
    case 'plan-build-review':
      return [
        'PROMPT_plan.md',
        'PROMPT_build.md',
        'PROMPT_build.md',
        'PROMPT_build.md',
        'PROMPT_proof.md',
        'PROMPT_review.md',
      ];
  }
}

function buildRoundRobinCycle(
  mode: LoopMode,
  roundRobinOrder: string[],
  promptsDir: string,
  deps: CompileLoopPlanDeps,
): string[] {
  if (mode !== 'plan-build-review' && mode !== 'plan-build') {
    return buildCycleForMode(mode);
  }

  const providers = roundRobinOrder.length > 0 ? roundRobinOrder : ['claude'];

  if (mode === 'plan-build') {
    // 2 × providers.length cycle: plan then one build per provider
    const cycle: string[] = ['PROMPT_plan.md'];
    for (const provider of providers) {
      const filename = `PROMPT_build_${provider}.md`;
      cycle.push(filename);
    }
    return cycle;
  }

  // plan-build-review: plan + N builds (one per provider) + proof + review
  const cycle: string[] = ['PROMPT_plan.md'];
  for (const provider of providers) {
    const filename = `PROMPT_build_${provider}.md`;
    cycle.push(filename);
  }
  cycle.push('PROMPT_proof.md', 'PROMPT_review.md');
  return cycle;
}

function extractAgentFromFilename(filename: string): string {
  // PROMPT_build_claude.md -> build
  // PROMPT_plan.md -> plan
  const match = filename.match(/^PROMPT_([a-z]+)(?:_[a-z]+)?\.md$/);
  return match ? match[1] : 'build';
}

function extractProviderSuffixFromFilename(filename: string): string | null {
  // PROMPT_build_claude.md -> claude
  // PROMPT_plan.md -> null
  const match = filename.match(/^PROMPT_[a-z]+_([a-z]+)\.md$/);
  return match ? match[1] : null;
}

function buildFrontmatter(
  agent: string,
  provider: string,
  model: string,
  reasoning: string,
): string {
  const lines = ['---'];
  lines.push(`agent: ${agent}`);
  lines.push(`provider: ${provider}`);
  if (model) {
    lines.push(`model: ${model}`);
  }
  lines.push(`reasoning: ${reasoning}`);
  lines.push('---');
  return lines.join('\n');
}

function prependFrontmatter(content: string, frontmatter: string): string {
  // If content already has frontmatter, replace it
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const endIndex = content.indexOf('\n---', 3);
    if (endIndex !== -1) {
      const afterFrontmatter = content.slice(endIndex + 4).replace(/^\r?\n/, '');
      return `${frontmatter}\n\n${afterFrontmatter}`;
    }
  }
  return `${frontmatter}\n\n${content}`;
}

export async function compileLoopPlan(
  options: CompileLoopPlanOptions,
  deps: CompileLoopPlanDeps = defaultCompileDeps,
): Promise<LoopPlan> {
  const { mode, provider, promptsDir, sessionDir, enabledProviders, roundRobinOrder, models } = options;

  const isRoundRobin = provider === 'round-robin';

  // Build the cycle array
  let cycle: string[];
  if (isRoundRobin) {
    cycle = buildRoundRobinCycle(mode, roundRobinOrder, promptsDir, deps);
  } else {
    cycle = buildCycleForMode(mode);
  }

  // Add frontmatter to each prompt file
  const processed = new Set<string>();
  for (const filename of cycle) {
    if (processed.has(filename)) continue;
    processed.add(filename);

    const agent = extractAgentFromFilename(filename);
    const providerSuffix = extractProviderSuffixFromFilename(filename);

    let promptProvider: string;
    let promptModel: string;

    if (providerSuffix) {
      // Provider-specific build prompt (round-robin)
      promptProvider = providerSuffix;
      promptModel = models[providerSuffix] ?? '';
    } else {
      // Standard prompt — use the configured provider
      promptProvider = isRoundRobin ? (roundRobinOrder[0] ?? 'claude') : provider;
      promptModel = models[promptProvider] ?? '';
    }

    const reasoning = DEFAULT_REASONING[agent] ?? 'medium';
    const frontmatter = buildFrontmatter(agent, promptProvider, promptModel, reasoning);

    const filePath = path.join(promptsDir, filename);
    if (providerSuffix) {
      // Create provider-specific prompt from base template
      const baseFilename = `PROMPT_${agent}.md`;
      const basePath = path.join(promptsDir, baseFilename);
      if (deps.existsSync(basePath)) {
        const baseContent = await deps.readFile(basePath, 'utf8');
        await deps.writeFile(filePath, prependFrontmatter(baseContent, frontmatter), 'utf8');
      }
    } else if (deps.existsSync(filePath)) {
      // Add frontmatter to existing prompt file
      const content = await deps.readFile(filePath, 'utf8');
      await deps.writeFile(filePath, prependFrontmatter(content, frontmatter), 'utf8');
    }
  }

  // Write loop-plan.json
  const plan: LoopPlan = {
    cycle,
    cyclePosition: 0,
    iteration: 1,
    version: 1,
  };

  const planPath = path.join(sessionDir, 'loop-plan.json');
  await deps.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  return plan;
}
