import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../lib/yaml.js';

type ProviderName = 'claude' | 'codex' | 'gemini' | 'copilot' | 'opencode';
type LoopMode = 'plan' | 'build' | 'review' | 'plan-build' | 'plan-build-review' | 'single';

interface LoopSettings {
  max_iterations?: number;
  max_stuck?: number;
  inter_iteration_sleep?: number;
  phase_retries_multiplier?: number;
  cooldown_ladder?: number[];
  concurrent_cap_cooldown?: number;
  request_timeout?: number;
  request_poll_interval?: number;
  unavailable_sleep?: number;
  provider_timeout?: number;
  health_lock_retry_delays_ms?: number[];
  triage_interval?: number;
  scan_pass_throttle_ms?: number;
  rate_limit_backoff?: 'exponential' | 'linear' | 'fixed';
}

interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
  finalizer: string[];
  finalizerPosition: number;
  loopSettings?: LoopSettings;
}

interface CompileLoopPlanOptions {
  mode: LoopMode;
  provider: string;
  promptsDir: string;
  sessionDir: string;
  enabledProviders: string[];
  roundRobinOrder: string[];
  models: Record<string, string>;
  openRouterModels?: string[];
  costRouting?: Record<string, string>;
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

type CostRoutingPreference = 'prefer_cheap' | 'prefer_capable';

const DEFAULT_COST_ROUTING: Record<string, CostRoutingPreference> = {
  plan: 'prefer_capable',
  build: 'prefer_cheap',
  review: 'prefer_capable',
};

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
    case 'single':
      return [await getEntry('single')];
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

async function readLoopSettingsFromPipeline(
  projectRoot: string | undefined,
  deps: CompileLoopPlanDeps,
): Promise<LoopSettings | undefined> {
  if (!projectRoot) return undefined;
  const pipelineYamlPath = path.join(projectRoot, '.aloop', 'pipeline.yml');
  if (!deps.existsSync(pipelineYamlPath)) return undefined;

  try {
    const content = await deps.readFile(pipelineYamlPath, 'utf8');
    const parsed = parseYaml(content);
    const loop = parsed.loop;
    if (!loop || typeof loop !== 'object' || Array.isArray(loop)) return undefined;

    const settings: LoopSettings = {};
    const numFields: Array<{key: keyof LoopSettings; set: (s: LoopSettings, v: number) => void}> = [
      { key: 'max_iterations', set: (s, v) => { s.max_iterations = v; } },
      { key: 'max_stuck', set: (s, v) => { s.max_stuck = v; } },
      { key: 'inter_iteration_sleep', set: (s, v) => { s.inter_iteration_sleep = v; } },
      { key: 'phase_retries_multiplier', set: (s, v) => { s.phase_retries_multiplier = v; } },
      { key: 'concurrent_cap_cooldown', set: (s, v) => { s.concurrent_cap_cooldown = v; } },
      { key: 'request_timeout', set: (s, v) => { s.request_timeout = v; } },
      { key: 'request_poll_interval', set: (s, v) => { s.request_poll_interval = v; } },
      { key: 'unavailable_sleep', set: (s, v) => { s.unavailable_sleep = v; } },
      { key: 'provider_timeout', set: (s, v) => { s.provider_timeout = v; } },
      { key: 'triage_interval', set: (s, v) => { s.triage_interval = v; } },
      { key: 'scan_pass_throttle_ms', set: (s, v) => { s.scan_pass_throttle_ms = v; } },
    ];
    for (const { key, set } of numFields) {
      if (typeof loop[key] === 'number') {
        set(settings, loop[key]);
      } else if (typeof loop[key] === 'string') {
        const n = Number(loop[key]);
        if (!Number.isNaN(n)) set(settings, n);
      }
    }
    // Handle inline arrays [0, 60, 120, 300] — YAML parser doesn't support them
    const parseInlineArray = (raw: unknown): number[] | null => {
      if (typeof raw !== 'string' || !raw.startsWith('[') || !raw.endsWith(']')) return null;
      const inner = raw.slice(1, -1).trim();
      if (!inner) return [];
      const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
      const nums = parts.map(Number);
      if (nums.some(Number.isNaN)) return null;
      return nums;
    };
    if (Array.isArray(loop.cooldown_ladder) && loop.cooldown_ladder.every((v: unknown) => typeof v === 'number')) {
      settings.cooldown_ladder = loop.cooldown_ladder;
    } else {
      const parsed = parseInlineArray(loop.cooldown_ladder);
      if (parsed) settings.cooldown_ladder = parsed;
    }
    if (Array.isArray(loop.health_lock_retry_delays_ms) && loop.health_lock_retry_delays_ms.every((v: unknown) => typeof v === 'number')) {
      settings.health_lock_retry_delays_ms = loop.health_lock_retry_delays_ms;
    } else {
      const parsed = parseInlineArray(loop.health_lock_retry_delays_ms);
      if (parsed) settings.health_lock_retry_delays_ms = parsed;
    }
    if (typeof loop.rate_limit_backoff === 'string' && ['exponential', 'linear', 'fixed'].includes(loop.rate_limit_backoff)) {
      settings.rate_limit_backoff = loop.rate_limit_backoff;
    }
    return Object.keys(settings).length > 0 ? settings : undefined;
  } catch {
    return undefined;
  }
}

async function readFinalizerFromPipeline(
  projectRoot: string | undefined,
  deps: CompileLoopPlanDeps,
): Promise<string[]> {
  if (!projectRoot) return [];
  const pipelineYamlPath = path.join(projectRoot, '.aloop', 'pipeline.yml');
  if (!deps.existsSync(pipelineYamlPath)) return [];

  try {
    const content = await deps.readFile(pipelineYamlPath, 'utf8');
    const parsed = parseYaml(content);
    if (!parsed.finalizer || !Array.isArray(parsed.finalizer)) return [];
    return parsed.finalizer.filter((e: unknown) => typeof e === 'string' && e.trim());
  } catch {
    return [];
  }
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

function isCostRoutingPreference(value: string): value is CostRoutingPreference {
  return value === 'prefer_cheap' || value === 'prefer_capable';
}

function resolveCostRoutingPreference(agent: string, costRouting: Record<string, string>): CostRoutingPreference {
  const configured = costRouting[agent];
  if (configured && isCostRoutingPreference(configured)) {
    return configured;
  }
  return DEFAULT_COST_ROUTING[agent] ?? 'prefer_capable';
}

function toOpenRouterModelPath(model: string): string {
  return model.startsWith('openrouter/') ? model : `openrouter/${model}`;
}

function selectOpencodeModelForPhase(
  agent: string,
  fallbackModel: string,
  openRouterModels: string[],
  costRouting: Record<string, string>,
): string {
  if (openRouterModels.length === 0) {
    return fallbackModel;
  }

  const preference = resolveCostRoutingPreference(agent, costRouting);
  const selected = preference === 'prefer_cheap'
    ? openRouterModels[0]
    : openRouterModels[openRouterModels.length - 1];

  return toOpenRouterModelPath(selected);
}

export async function compileLoopPlan(
  options: CompileLoopPlanOptions,
  deps: CompileLoopPlanDeps = defaultCompileDeps,
): Promise<LoopPlan> {
  const {
    mode,
    provider,
    promptsDir,
    sessionDir,
    enabledProviders,
    roundRobinOrder,
    models,
    openRouterModels = [],
    costRouting = {},
    projectRoot,
  } = options;

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

    if (promptProvider === 'opencode') {
      promptModel = selectOpencodeModelForPhase(agent, promptModel, openRouterModels, costRouting);
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

  const finalizer = await readFinalizerFromPipeline(projectRoot, deps);
  const loopSettings = await readLoopSettingsFromPipeline(projectRoot, deps);

  const plan: LoopPlan = {
    cycle,
    cyclePosition: 0,
    iteration: 1,
    version: 1,
    finalizer,
    finalizerPosition: 0,
  };
  if (loopSettings) {
    plan.loopSettings = loopSettings;
  }

  const planPath = path.join(sessionDir, 'loop-plan.json');
  await deps.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  return plan;
}
