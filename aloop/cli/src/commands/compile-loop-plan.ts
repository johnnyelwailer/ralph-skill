import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../lib/yaml.js';

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
  projectRoot?: string;
}

interface CompileLoopPlanDeps {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  existsSync: (path: string) => boolean;
}

interface CycleEntry {
  filename: string;
  agent: string;
}

const defaultCompileDeps: CompileLoopPlanDeps = {
  readFile,
  writeFile,
  existsSync,
};

const DEFAULT_AGENT_PROMPT: Record<string, string> = {
  plan: 'PROMPT_plan.md',
  build: 'PROMPT_build.md',
  proof: 'PROMPT_proof.md',
  qa: 'PROMPT_qa.md',
  review: 'PROMPT_review.md',
  steer: 'PROMPT_steer.md',
};

const DEFAULT_REASONING: Record<string, string> = {
  plan: 'high',
  build: 'medium',
  proof: 'medium',
  qa: 'medium',
  review: 'high',
  steer: 'medium',
};

interface AgentConfig {
  prompt: string;
  reasoning: string;
  timeout?: string;
  max_retries?: string;
  retry_backoff?: string;
}

async function getAgentConfig(
  agentName: string,
  projectRoot: string | undefined,
  deps: CompileLoopPlanDeps,
): Promise<AgentConfig> {
  const config: AgentConfig = {
    prompt: DEFAULT_AGENT_PROMPT[agentName] ?? `PROMPT_${agentName}.md`,
    reasoning: DEFAULT_REASONING[agentName] ?? 'medium',
  };

  if (projectRoot) {
    const agentYamlPath = path.join(projectRoot, '.aloop', 'agents', `${agentName}.yml`);
    if (deps.existsSync(agentYamlPath)) {
      try {
        const content = await deps.readFile(agentYamlPath, 'utf8');
        const parsed = parseYaml(content);
        if (parsed.prompt) {
          config.prompt = parsed.prompt;
        }
        if (parsed.reasoning) {
          if (typeof parsed.reasoning === 'string') {
            config.reasoning = parsed.reasoning;
          } else if (typeof parsed.reasoning === 'object' && parsed.reasoning.effort) {
            config.reasoning = parsed.reasoning.effort;
          }
        }
        if (parsed.timeout != null) {
          config.timeout = String(parsed.timeout);
        }
        if (parsed.max_retries != null) {
          config.max_retries = String(parsed.max_retries);
        }
        if (parsed.retry_backoff != null) {
          config.retry_backoff = String(parsed.retry_backoff);
        }
      } catch (err) {
        // Fallback to defaults on error
        console.error(`Error parsing agent config for ${agentName}:`, err);
      }
    }
  }

  return config;
}

async function buildCycleFromPipeline(
  projectRoot: string,
  deps: CompileLoopPlanDeps,
): Promise<CycleEntry[] | null> {
  const pipelineYamlPath = path.join(projectRoot, '.aloop', 'pipeline.yml');
  if (!deps.existsSync(pipelineYamlPath)) {
    return null;
  }

  try {
    const content = await deps.readFile(pipelineYamlPath, 'utf8');
    const parsed = parseYaml(content);
    if (!parsed.pipeline || !Array.isArray(parsed.pipeline)) {
      return null;
    }

    const cycle: CycleEntry[] = [];
    for (const step of parsed.pipeline) {
      const agentName = step.agent;
      if (!agentName) continue;

      const agentConfig = await getAgentConfig(agentName, projectRoot, deps);
      const repeat = typeof step.repeat === 'number' ? step.repeat : 1;
      for (let i = 0; i < repeat; i++) {
        cycle.push({ filename: agentConfig.prompt, agent: agentName });
      }
    }
    return cycle.length > 0 ? cycle : null;
  } catch (err) {
    console.error('Error parsing pipeline.yml:', err);
    return null;
  }
}

async function buildCycleForMode(
  mode: LoopMode,
  projectRoot: string | undefined,
  deps: CompileLoopPlanDeps,
): Promise<CycleEntry[]> {
  const getEntry = async (name: string) => ({
    filename: (await getAgentConfig(name, projectRoot, deps)).prompt,
    agent: name,
  });

  switch (mode) {
    case 'plan':
      return [await getEntry('plan')];
    case 'build':
      return [await getEntry('build')];
    case 'review':
      return [await getEntry('review')];
    case 'plan-build':
      return [await getEntry('plan'), await getEntry('build')];
    case 'plan-build-review':
      return [
        await getEntry('plan'),
        await getEntry('build'),
        await getEntry('build'),
        await getEntry('build'),
        await getEntry('build'),
        await getEntry('build'),
        await getEntry('qa'),
        await getEntry('review'),
      ];
  }
}

async function buildRoundRobinCycle(
  mode: LoopMode,
  roundRobinOrder: string[],
  promptsDir: string,
  projectRoot: string | undefined,
  deps: CompileLoopPlanDeps,
): Promise<CycleEntry[]> {
  if (mode !== 'plan-build-review' && mode !== 'plan-build') {
    return buildCycleForMode(mode, projectRoot, deps);
  }

  const providers = roundRobinOrder.length > 0 ? roundRobinOrder : ['claude'];

  if (mode === 'plan-build') {
    const planEntry = await (async () => {
      const config = await getAgentConfig('plan', projectRoot, deps);
      return { filename: config.prompt, agent: 'plan' };
    })();
    
    const buildConfig = await getAgentConfig('build', projectRoot, deps);
    const agentPrefix = buildConfig.prompt.replace(/\.md$/, '');

    const cycle: CycleEntry[] = [planEntry];
    for (const provider of providers) {
      const filename = `${agentPrefix}_${provider}.md`;
      cycle.push({ filename, agent: 'build' });
    }
    return cycle;
  }

  // If pipeline.yml exists, we use it as a template for round-robin
  if (projectRoot && mode === 'plan-build-review') {
    const pipelineYamlPath = path.join(projectRoot, '.aloop', 'pipeline.yml');
    if (deps.existsSync(pipelineYamlPath)) {
      const content = await deps.readFile(pipelineYamlPath, 'utf8');
      const parsed = parseYaml(content);
      if (parsed.pipeline && Array.isArray(parsed.pipeline)) {
        const cycle: CycleEntry[] = [];
        for (const step of parsed.pipeline) {
          const agentName = step.agent;
          if (!agentName) continue;

          const agentConfig = await getAgentConfig(agentName, projectRoot, deps);
          const promptBase = agentConfig.prompt;

          if (agentName === 'build') {
            const agentPrefix = promptBase.replace(/\.md$/, '');
            for (const provider of providers) {
              cycle.push({ filename: `${agentPrefix}_${provider}.md`, agent: 'build' });
            }
          } else {
            cycle.push({ filename: promptBase, agent: agentName });
          }
        }
        return cycle;
      }
    }
  }

  // Fallback to hardcoded round-robin
  const cycle: CycleEntry[] = [{ filename: 'PROMPT_plan.md', agent: 'plan' }];
  for (const provider of providers) {
    const filename = `PROMPT_build_${provider}.md`;
    cycle.push({ filename, agent: 'build' });
  }
  cycle.push(
    { filename: 'PROMPT_qa.md', agent: 'qa' },
    { filename: 'PROMPT_review.md', agent: 'review' }
  );
  return cycle;
}

function extractProviderSuffixFromFilename(filename: string, roundRobinOrder: string[]): string | null {
  // PROMPT_build_claude.md -> claude
  const match = filename.match(/^PROMPT_[a-z]+_([a-z]+)\.md$/);
  if (match && roundRobinOrder.includes(match[1])) return match[1];
  
  // Also check for custom prefixes if they followed the same pattern
  const customMatch = filename.match(/_([a-z]+)\.md$/);
  if (customMatch && roundRobinOrder.includes(customMatch[1])) return customMatch[1];
  
  return null;
}

function buildFrontmatter(
  agent: string,
  provider: string,
  model: string,
  reasoning: string,
  opts?: { timeout?: string; max_retries?: string; retry_backoff?: string },
): string {
  const lines = ['---'];
  lines.push(`agent: ${agent}`);
  lines.push(`provider: ${provider}`);
  if (model) {
    lines.push(`model: ${model}`);
  }
  lines.push(`reasoning: ${reasoning}`);
  if (opts?.timeout) {
    lines.push(`timeout: ${opts.timeout}`);
  }
  if (opts?.max_retries) {
    lines.push(`max_retries: ${opts.max_retries}`);
  }
  if (opts?.retry_backoff) {
    lines.push(`retry_backoff: ${opts.retry_backoff}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function prependFrontmatter(content: string, frontmatter: string): string {
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
  const { mode, provider, promptsDir, sessionDir, enabledProviders, roundRobinOrder, models, projectRoot } = options;

  const isRoundRobin = provider === 'round-robin';

  let cycleEntries: CycleEntry[];
  if (isRoundRobin) {
    cycleEntries = await buildRoundRobinCycle(mode, roundRobinOrder, promptsDir, projectRoot, deps);
  } else if (mode === 'plan-build-review' && projectRoot) {
    cycleEntries = (await buildCycleFromPipeline(projectRoot, deps)) ?? await buildCycleForMode(mode, projectRoot, deps);
  } else {
    cycleEntries = await buildCycleForMode(mode, projectRoot, deps);
  }

  const cycle = cycleEntries.map(e => e.filename);

  const processed = new Set<string>();
  for (const entry of cycleEntries) {
    const { filename, agent } = entry;
    if (processed.has(filename)) continue;
    processed.add(filename);

    const providerSuffix = extractProviderSuffixFromFilename(filename, roundRobinOrder);

    let promptProvider: string;
    let promptModel: string;

    if (providerSuffix) {
      promptProvider = providerSuffix;
      promptModel = models[providerSuffix] ?? '';
    } else {
      promptProvider = isRoundRobin ? (roundRobinOrder[0] ?? 'claude') : provider;
      promptModel = models[promptProvider] ?? '';
    }

    const agentConfig = await getAgentConfig(agent, projectRoot, deps);
    const reasoning = agentConfig.reasoning;
    const frontmatter = buildFrontmatter(agent, promptProvider, promptModel, reasoning, {
      timeout: agentConfig.timeout,
      max_retries: agentConfig.max_retries,
      retry_backoff: agentConfig.retry_backoff,
    });

    const filePath = path.join(promptsDir, filename);
    if (providerSuffix) {
      const baseFilename = agentConfig.prompt;
      const basePath = path.join(promptsDir, baseFilename);
      if (deps.existsSync(basePath)) {
        const baseContent = await deps.readFile(basePath, 'utf8');
        await deps.writeFile(filePath, prependFrontmatter(baseContent, frontmatter), 'utf8');
      }
    } else if (deps.existsSync(filePath)) {
      const content = await deps.readFile(filePath, 'utf8');
      await deps.writeFile(filePath, prependFrontmatter(content, frontmatter), 'utf8');
    }
  }

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
