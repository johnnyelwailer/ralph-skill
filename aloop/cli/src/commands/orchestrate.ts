import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import type { OutputMode } from './status.js';

export interface OrchestrateCommandOptions {
  spec?: string;
  concurrency?: string;
  trunk?: string;
  issues?: string;
  label?: string;
  repo?: string;
  plan?: string;
  planOnly?: boolean;
  homeDir?: string;
  projectRoot?: string;
  output?: OutputMode;
}

export interface DecompositionPlanIssue {
  id: number;
  title: string;
  body: string;
  depends_on: number[];
  file_hints?: string[];
}

export interface DecompositionPlan {
  issues: DecompositionPlanIssue[];
}

export interface OrchestratorIssue {
  number: number;
  title: string;
  wave: number;
  state: 'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed';
  child_session: string | null;
  pr_number: number | null;
  depends_on: number[];
}

export interface OrchestratorState {
  spec_file: string;
  trunk_branch: string;
  concurrency_cap: number;
  current_wave: number;
  plan_only: boolean;
  issues: OrchestratorIssue[];
  completed_waves: number[];
  filter_issues: number[] | null;
  filter_label: string | null;
  filter_repo: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrchestrateDeps {
  existsSync: (path: string) => boolean;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  now: () => Date;
  execGhIssueCreate?: (repo: string, sessionId: string, title: string, body: string, labels: string[]) => Promise<number>;
}

const defaultDeps: OrchestrateDeps = {
  existsSync,
  readFile,
  writeFile,
  mkdir,
  now: () => new Date(),
};

function parseConcurrency(value: string | undefined): number {
  if (!value) return 3;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid concurrency value: ${value} (must be a positive integer)`);
  }
  return parsed;
}

function parseIssueNumbers(value: string | undefined): number[] | null {
  if (!value) return null;
  const numbers = value.split(',').map((s) => {
    const n = Number.parseInt(s.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`Invalid issue number: ${s.trim()}`);
    }
    return n;
  });
  return numbers;
}

export function validateDependencyGraph(issues: DecompositionPlanIssue[]): void {
  const ids = new Set(issues.map((i) => i.id));

  // Check for duplicate IDs
  if (ids.size !== issues.length) {
    const seen = new Set<number>();
    for (const issue of issues) {
      if (seen.has(issue.id)) {
        throw new Error(`Duplicate issue id: ${issue.id}`);
      }
      seen.add(issue.id);
    }
  }

  // Check for missing dependency references
  for (const issue of issues) {
    for (const dep of issue.depends_on) {
      if (!ids.has(dep)) {
        throw new Error(`Issue ${issue.id} depends on unknown issue ${dep}`);
      }
    }
    // Self-dependency
    if (issue.depends_on.includes(issue.id)) {
      throw new Error(`Issue ${issue.id} depends on itself`);
    }
  }

  // Cycle detection via topological sort (Kahn's algorithm)
  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();
  for (const issue of issues) {
    inDegree.set(issue.id, 0);
    adj.set(issue.id, []);
  }
  for (const issue of issues) {
    for (const dep of issue.depends_on) {
      adj.get(dep)!.push(issue.id);
      inDegree.set(issue.id, (inDegree.get(issue.id) ?? 0) + 1);
    }
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adj.get(current)!) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (processed !== issues.length) {
    throw new Error('Dependency graph contains a cycle');
  }
}

export function assignWaves(issues: DecompositionPlanIssue[]): Map<number, number> {
  const waveMap = new Map<number, number>();

  // Build adjacency for dependency lookup
  const depMap = new Map<number, number[]>();
  for (const issue of issues) {
    depMap.set(issue.id, issue.depends_on);
  }

  // Wave = 1 + max wave of all dependencies (BFS-style)
  // Issues with no dependencies get wave 1
  const computeWave = (id: number, visited: Set<number>): number => {
    if (waveMap.has(id)) return waveMap.get(id)!;
    if (visited.has(id)) throw new Error('Unexpected cycle during wave assignment');
    visited.add(id);

    const deps = depMap.get(id) ?? [];
    if (deps.length === 0) {
      waveMap.set(id, 1);
      return 1;
    }

    let maxDepWave = 0;
    for (const dep of deps) {
      maxDepWave = Math.max(maxDepWave, computeWave(dep, visited));
    }
    const wave = maxDepWave + 1;
    waveMap.set(id, wave);
    return wave;
  };

  for (const issue of issues) {
    if (!waveMap.has(issue.id)) {
      computeWave(issue.id, new Set());
    }
  }

  return waveMap;
}

export async function applyDecompositionPlan(
  plan: DecompositionPlan,
  state: OrchestratorState,
  sessionDir: string,
  repo: string | null,
  deps: OrchestrateDeps,
): Promise<OrchestratorState> {
  validateDependencyGraph(plan.issues);
  const waveMap = assignWaves(plan.issues);

  const maxWave = Math.max(0, ...Array.from(waveMap.values()));

  // Map local plan IDs to GH issue numbers (after creation)
  const idToGhNumber = new Map<number, number>();

  const updatedIssues: OrchestratorIssue[] = [];

  for (const planIssue of plan.issues) {
    const wave = waveMap.get(planIssue.id)!;
    const labels = ['aloop/auto', `aloop/wave-${wave}`];

    let ghNumber: number;
    if (deps.execGhIssueCreate && repo) {
      ghNumber = await deps.execGhIssueCreate(repo, path.basename(sessionDir), planIssue.title, planIssue.body, labels);
    } else {
      // When no GH executor is available (plan-only without repo, or no executor),
      // use the plan ID as a placeholder number
      ghNumber = planIssue.id;
    }

    idToGhNumber.set(planIssue.id, ghNumber);

    updatedIssues.push({
      number: ghNumber,
      title: planIssue.title,
      wave,
      state: 'pending',
      child_session: null,
      pr_number: null,
      depends_on: planIssue.depends_on.map((depId) => idToGhNumber.get(depId) ?? depId),
    });
  }

  const updatedState: OrchestratorState = {
    ...state,
    issues: updatedIssues,
    current_wave: maxWave > 0 ? 1 : 0,
    updated_at: deps.now().toISOString(),
  };

  return updatedState;
}

export interface OrchestrateCommandResult {
  session_dir: string;
  state_file: string;
  state: OrchestratorState;
}

export async function orchestrateCommandWithDeps(
  options: OrchestrateCommandOptions = {},
  deps: OrchestrateDeps = defaultDeps,
): Promise<OrchestrateCommandResult> {
  const homeDir = resolveHomeDir(options.homeDir);
  const aloopRoot = path.join(homeDir, '.aloop');
  const sessionsRoot = path.join(aloopRoot, 'sessions');

  const specFile = options.spec ?? 'SPEC.md';
  const trunkBranch = options.trunk ?? 'agent/trunk';
  const concurrencyCap = parseConcurrency(options.concurrency);
  const filterIssues = parseIssueNumbers(options.issues);
  const filterLabel = options.label ?? null;
  const filterRepo = options.repo ?? null;
  const planOnly = options.planOnly ?? false;

  const now = deps.now();
  const timestamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const sessionId = `orchestrator-${timestamp}`;
  const sessionDir = path.join(sessionsRoot, sessionId);

  await deps.mkdir(sessionDir, { recursive: true });

  let state: OrchestratorState = {
    spec_file: specFile,
    trunk_branch: trunkBranch,
    concurrency_cap: concurrencyCap,
    current_wave: 0,
    plan_only: planOnly,
    issues: [],
    completed_waves: [],
    filter_issues: filterIssues,
    filter_label: filterLabel,
    filter_repo: filterRepo,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  // If a decomposition plan is provided, apply it
  if (options.plan) {
    const planPath = path.resolve(options.plan);
    if (!deps.existsSync(planPath)) {
      throw new Error(`Plan file not found: ${planPath}`);
    }
    const planContent = await deps.readFile(planPath, 'utf8');
    let plan: DecompositionPlan;
    try {
      plan = JSON.parse(planContent) as DecompositionPlan;
    } catch {
      throw new Error(`Invalid JSON in plan file: ${planPath}`);
    }
    if (!Array.isArray(plan.issues) || plan.issues.length === 0) {
      throw new Error('Plan file must contain a non-empty "issues" array');
    }
    state = await applyDecompositionPlan(plan, state, sessionDir, filterRepo, deps);
  }

  const stateFile = path.join(sessionDir, 'orchestrator.json');
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return { session_dir: sessionDir, state_file: stateFile, state };
}

export async function orchestrateCommand(options: OrchestrateCommandOptions = {}, deps?: OrchestrateDeps) {
  const outputMode = options.output ?? 'text';
  const result = await orchestrateCommandWithDeps(options, deps);

  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Orchestrator session initialized.');
  console.log('');
  console.log(`  Session dir:  ${result.session_dir}`);
  console.log(`  State file:   ${result.state_file}`);
  console.log(`  Spec:         ${result.state.spec_file}`);
  console.log(`  Trunk:        ${result.state.trunk_branch}`);
  console.log(`  Concurrency:  ${result.state.concurrency_cap}`);
  console.log(`  Plan only:    ${result.state.plan_only}`);

  if (result.state.issues.length > 0) {
    const waves = new Set(result.state.issues.map((i) => i.wave));
    console.log(`  Issues:       ${result.state.issues.length} (${waves.size} wave${waves.size !== 1 ? 's' : ''})`);
  }
  if (result.state.filter_issues) {
    console.log(`  Filter:       ${result.state.filter_issues.join(', ')}`);
  }
  if (result.state.filter_label) {
    console.log(`  Label:        ${result.state.filter_label}`);
  }
  if (result.state.filter_repo) {
    console.log(`  Repo:         ${result.state.filter_repo}`);
  }
}
