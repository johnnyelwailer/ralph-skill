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
  rebase_attempts?: number;
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

export interface SpawnSyncResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface ChildProcess {
  pid?: number;
  unref: () => void;
}

export interface DispatchDeps {
  existsSync: (path: string) => boolean;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  cp: (src: string, dest: string, options?: { recursive?: boolean }) => Promise<void>;
  now: () => Date;
  spawnSync: (command: string, args: string[], options?: Record<string, unknown>) => SpawnSyncResult;
  spawn: (command: string, args: string[], options?: Record<string, unknown>) => ChildProcess;
  platform: string;
  env: Record<string, string | undefined>;
}

export interface ChildLaunchResult {
  issue_number: number;
  session_id: string;
  session_dir: string;
  branch: string;
  worktree_path: string;
  pid: number;
}

export interface DispatchResult {
  launched: ChildLaunchResult[];
  skipped: number[];
  state: OrchestratorState;
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

// --- Child-loop dispatch engine ---

/**
 * Returns issues from the current wave that are eligible for dispatch.
 * An issue is dispatchable when:
 *   - It belongs to the current wave
 *   - Its state is 'pending'
 *   - All its dependencies are in 'merged' state
 */
export function getDispatchableIssues(state: OrchestratorState): OrchestratorIssue[] {
  if (state.current_wave === 0 || state.issues.length === 0) {
    return [];
  }

  const issueByNumber = new Map<number, OrchestratorIssue>();
  for (const issue of state.issues) {
    issueByNumber.set(issue.number, issue);
  }

  return state.issues.filter((issue) => {
    if (issue.wave !== state.current_wave) return false;
    if (issue.state !== 'pending') return false;
    // All dependencies must be merged
    for (const depNumber of issue.depends_on) {
      const dep = issueByNumber.get(depNumber);
      if (!dep || dep.state !== 'merged') return false;
    }
    return true;
  });
}

/**
 * Counts the number of currently in-progress child loops.
 */
export function countActiveChildren(state: OrchestratorState): number {
  return state.issues.filter((i) => i.state === 'in_progress').length;
}

/**
 * Returns the number of child loops that can be launched without exceeding the concurrency cap.
 */
export function availableSlots(state: OrchestratorState): number {
  return Math.max(0, state.concurrency_cap - countActiveChildren(state));
}

function formatChildSessionId(projectName: string, issueNumber: number, now: Date): string {
  const timestamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${sanitized}-issue-${issueNumber}-${timestamp}`;
}

/**
 * Launches a single child loop for the given issue.
 * Creates branch, worktree, seeds TODO.md, launches loop process.
 */
export async function launchChildLoop(
  issue: OrchestratorIssue,
  orchestratorSessionDir: string,
  projectRoot: string,
  projectName: string,
  promptsSourceDir: string,
  aloopRoot: string,
  deps: DispatchDeps,
): Promise<ChildLaunchResult> {
  const now = deps.now();
  const sessionId = formatChildSessionId(projectName, issue.number, now);
  const sessionsRoot = path.join(aloopRoot, 'sessions');
  const sessionDir = path.join(sessionsRoot, sessionId);
  const branchName = `aloop/issue-${issue.number}`;
  const worktreePath = path.join(sessionDir, 'worktree');
  const promptsDir = path.join(sessionDir, 'prompts');

  // Create session directory
  await deps.mkdir(sessionDir, { recursive: true });

  // Copy prompts
  await deps.cp(promptsSourceDir, promptsDir, { recursive: true });

  // Create git worktree with branch
  const worktreeResult = deps.spawnSync('git', ['-C', projectRoot, 'worktree', 'add', worktreePath, '-b', branchName], { encoding: 'utf8' });
  if (worktreeResult.status !== 0) {
    throw new Error(`Failed to create worktree for issue #${issue.number}: ${worktreeResult.stderr || worktreeResult.stdout}`);
  }

  // Seed TODO.md in worktree from issue body
  const todoContent = `# Issue #${issue.number}: ${issue.title}\n\n## Tasks\n\n- [ ] Implement as described in the issue\n`;
  await deps.writeFile(path.join(worktreePath, 'TODO.md'), todoContent, 'utf8');

  // Write child session config.json for policy enforcement
  const configJson = {
    repo: null, // Will be set by orchestrator if repo is known
    assignedIssueNumber: issue.number,
    childCreatedPrNumbers: [],
    role: 'child-loop',
    orchestrator_session: path.basename(orchestratorSessionDir),
  };
  await deps.writeFile(path.join(sessionDir, 'config.json'), `${JSON.stringify(configJson, null, 2)}\n`, 'utf8');

  // Write meta.json
  const startedAt = now.toISOString();
  const meta = {
    session_id: sessionId,
    project_name: projectName,
    project_root: projectRoot,
    provider: 'round-robin',
    mode: 'plan-build-review',
    launch_mode: 'start',
    worktree: true,
    worktree_path: worktreePath,
    work_dir: worktreePath,
    branch: branchName,
    prompts_dir: promptsDir,
    session_dir: sessionDir,
    issue_number: issue.number,
    orchestrator_session: path.basename(orchestratorSessionDir),
    created_at: startedAt,
  };
  await deps.writeFile(path.join(sessionDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  // Write initial status.json
  await deps.writeFile(
    path.join(sessionDir, 'status.json'),
    `${JSON.stringify({ state: 'starting', mode: 'plan-build-review', provider: 'round-robin', iteration: 0, updated_at: startedAt }, null, 2)}\n`,
    'utf8',
  );

  // Launch loop process
  const loopBinDir = path.join(aloopRoot, 'bin');
  let command: string;
  let args: string[];

  if (deps.platform === 'win32') {
    const loopScript = path.join(loopBinDir, 'loop.ps1');
    command = 'powershell';
    args = [
      '-NoProfile', '-File', loopScript,
      '-PromptsDir', promptsDir,
      '-SessionDir', sessionDir,
      '-WorkDir', worktreePath,
      '-Mode', 'plan-build-review',
      '-Provider', 'round-robin',
      '-MaxIterations', '20',
      '-MaxStuck', '3',
      '-LaunchMode', 'start',
    ];
  } else {
    const loopScript = path.join(loopBinDir, 'loop.sh');
    command = loopScript;
    args = [
      '--prompts-dir', promptsDir,
      '--session-dir', sessionDir,
      '--work-dir', worktreePath,
      '--mode', 'plan-build-review',
      '--provider', 'round-robin',
      '--max-iterations', '20',
      '--max-stuck', '3',
      '--launch-mode', 'start',
    ];
  }

  const child = deps.spawn(command, args, {
    cwd: worktreePath,
    detached: true,
    stdio: 'ignore',
    env: { ...deps.env },
    windowsHide: true,
  });
  child.unref();

  const pid = child.pid;
  if (!pid) {
    throw new Error(`Failed to launch loop process for issue #${issue.number}`);
  }

  // Update meta with PID
  (meta as Record<string, unknown>).pid = pid;
  (meta as Record<string, unknown>).started_at = startedAt;
  await deps.writeFile(path.join(sessionDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  // Register in active.json
  const activePath = path.join(aloopRoot, 'active.json');
  let active: Record<string, unknown> = {};
  try {
    if (deps.existsSync(activePath)) {
      active = JSON.parse(await deps.readFile(activePath, 'utf8'));
    }
  } catch {
    active = {};
  }
  active[sessionId] = {
    session_id: sessionId,
    session_dir: sessionDir,
    project_name: projectName,
    project_root: projectRoot,
    pid,
    work_dir: worktreePath,
    started_at: startedAt,
    provider: 'round-robin',
    mode: 'plan-build-review',
  };
  await deps.writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');

  return {
    issue_number: issue.number,
    session_id: sessionId,
    session_dir: sessionDir,
    branch: branchName,
    worktree_path: worktreePath,
    pid,
  };
}

/**
 * Dispatches child loops for eligible issues up to the concurrency cap.
 * Updates orchestrator state with child session references.
 */
export async function dispatchChildLoops(
  stateFile: string,
  orchestratorSessionDir: string,
  projectRoot: string,
  projectName: string,
  promptsSourceDir: string,
  aloopRoot: string,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const stateContent = await deps.readFile(stateFile, 'utf8');
  let state: OrchestratorState = JSON.parse(stateContent);

  const dispatchable = getDispatchableIssues(state);
  const slots = availableSlots(state);
  const toDispatch = dispatchable.slice(0, slots);
  const skipped = dispatchable.slice(slots).map((i) => i.number);

  const launched: ChildLaunchResult[] = [];

  for (const issue of toDispatch) {
    const result = await launchChildLoop(
      issue,
      orchestratorSessionDir,
      projectRoot,
      projectName,
      promptsSourceDir,
      aloopRoot,
      deps,
    );
    launched.push(result);

    // Update issue state in-place
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    if (stateIssue) {
      stateIssue.state = 'in_progress';
      stateIssue.child_session = result.session_id;
    }
  }

  // Persist updated state
  state = { ...state, updated_at: deps.now().toISOString() };
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return { launched, skipped, state };
}

// --- PR lifecycle gates ---

export type PrGateStatus = 'pass' | 'fail' | 'pending';

export interface PrGateResult {
  gate: string;
  status: PrGateStatus;
  detail: string;
}

export interface PrGatesResult {
  pr_number: number;
  all_passed: boolean;
  mergeable: boolean;
  gates: PrGateResult[];
}

export type AgentReviewVerdict = 'approve' | 'request-changes' | 'flag-for-human';

export interface AgentReviewResult {
  pr_number: number;
  verdict: AgentReviewVerdict;
  summary: string;
}

export interface PrMergeResult {
  pr_number: number;
  merged: boolean;
  error?: string;
}

export interface PrLifecycleDeps {
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  now: () => Date;
  appendLog: (sessionDir: string, entry: Record<string, unknown>) => void;
  /** Run an agent review against a PR diff. Returns the verdict and summary. */
  invokeAgentReview?: (prNumber: number, repo: string, diff: string) => Promise<AgentReviewResult>;
}

/**
 * Check PR gates: CI checks, mergeability (conflicts), and lint/type status.
 * Coverage and spec regression are checked via CI — we inspect the overall checks result.
 */
export async function checkPrGates(
  prNumber: number,
  repo: string,
  deps: PrLifecycleDeps,
): Promise<PrGatesResult> {
  const gates: PrGateResult[] = [];

  // Gate 1: Mergeability (conflict check)
  let mergeable = false;
  try {
    const viewResult = await deps.execGh([
      'pr', 'view', String(prNumber), '--repo', repo, '--json', 'mergeable,mergeStateStatus',
    ]);
    const prData = JSON.parse(viewResult.stdout);
    mergeable = prData.mergeable === 'MERGEABLE';
    const mergeState = prData.mergeStateStatus ?? 'UNKNOWN';
    gates.push({
      gate: 'merge_conflicts',
      status: mergeable ? 'pass' : 'fail',
      detail: mergeable ? 'No merge conflicts' : `Merge state: ${mergeState}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    gates.push({ gate: 'merge_conflicts', status: 'fail', detail: `Failed to check mergeability: ${msg}` });
  }

  // Gate 2: CI checks (covers CI pipeline, coverage, lint/type check)
  try {
    const checksResult = await deps.execGh([
      'pr', 'checks', String(prNumber), '--repo', repo, '--json', 'name,state,conclusion',
    ]);
    const checks: Array<{ name: string; state: string; conclusion: string }> = JSON.parse(checksResult.stdout);
    const allCompleted = checks.every((c) => c.state === 'COMPLETED' || c.state === 'completed');
    const allPassed = checks.every(
      (c) => (c.state === 'COMPLETED' || c.state === 'completed') &&
        (c.conclusion === 'SUCCESS' || c.conclusion === 'success' ||
         c.conclusion === 'NEUTRAL' || c.conclusion === 'neutral' ||
         c.conclusion === 'SKIPPED' || c.conclusion === 'skipped'),
    );
    const failedChecks = checks.filter(
      (c) => c.conclusion === 'FAILURE' || c.conclusion === 'failure' ||
        c.conclusion === 'CANCELLED' || c.conclusion === 'cancelled' ||
        c.conclusion === 'TIMED_OUT' || c.conclusion === 'timed_out',
    );

    if (!allCompleted) {
      gates.push({ gate: 'ci_checks', status: 'pending', detail: 'Some CI checks still running' });
    } else if (allPassed) {
      gates.push({ gate: 'ci_checks', status: 'pass', detail: `All ${checks.length} checks passed` });
    } else {
      const failNames = failedChecks.map((c) => c.name).join(', ');
      gates.push({ gate: 'ci_checks', status: 'fail', detail: `Failed checks: ${failNames}` });
    }
  } catch (e: unknown) {
    // No checks configured or gh error — treat as pass (not all repos have CI)
    const msg = e instanceof Error ? e.message : String(e);
    gates.push({ gate: 'ci_checks', status: 'pass', detail: `No CI checks found or error: ${msg}` });
  }

  const allPassed = gates.every((g) => g.status === 'pass');

  return { pr_number: prNumber, all_passed: allPassed, mergeable, gates };
}

/**
 * Run agent review on PR diff.
 * If no invokeAgentReview dep is provided, auto-approves (for headless/test scenarios).
 */
export async function reviewPrDiff(
  prNumber: number,
  repo: string,
  deps: PrLifecycleDeps,
): Promise<AgentReviewResult> {
  // Get the PR diff
  let diff: string;
  try {
    const diffResult = await deps.execGh(['pr', 'diff', String(prNumber), '--repo', repo]);
    diff = diffResult.stdout;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      pr_number: prNumber,
      verdict: 'flag-for-human',
      summary: `Failed to fetch PR diff: ${msg}`,
    };
  }

  if (deps.invokeAgentReview) {
    return deps.invokeAgentReview(prNumber, repo, diff);
  }

  // Default: auto-approve when no agent reviewer is configured
  return {
    pr_number: prNumber,
    verdict: 'approve',
    summary: 'Auto-approved (no agent reviewer configured)',
  };
}

/**
 * Squash-merge a PR into agent/trunk.
 */
export async function mergePr(
  prNumber: number,
  repo: string,
  deps: PrLifecycleDeps,
): Promise<PrMergeResult> {
  try {
    await deps.execGh([
      'pr', 'merge', String(prNumber), '--repo', repo, '--squash', '--delete-branch',
    ]);
    return { pr_number: prNumber, merged: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { pr_number: prNumber, merged: false, error: msg };
  }
}

/**
 * Request a child loop to rebase its branch against agent/trunk.
 * Posts a comment on the issue instructing the child to rebase.
 */
export async function requestRebase(
  issue: OrchestratorIssue,
  repo: string,
  trunkBranch: string,
  rebaseAttempt: number,
  deps: PrLifecycleDeps,
): Promise<void> {
  const body = `Merge conflict with \`${trunkBranch}\` — rebase needed (attempt ${rebaseAttempt}/2).\\n\\nPlease rebase your branch against \`${trunkBranch}\` and push.`;
  await deps.execGh([
    'issue', 'comment', String(issue.number), '--repo', repo, '--body', body,
  ]);
}

/**
 * Flag an issue for human resolution after rebase attempts exhausted.
 */
export async function flagForHuman(
  issue: OrchestratorIssue,
  repo: string,
  reason: string,
  deps: PrLifecycleDeps,
): Promise<void> {
  const body = `Flagged for human resolution: ${reason}`;
  try {
    await deps.execGh([
      'issue', 'comment', String(issue.number), '--repo', repo, '--body', body,
    ]);
    await deps.execGh([
      'issue', 'edit', String(issue.number), '--repo', repo, '--add-label', 'aloop/blocked-on-human',
    ]);
  } catch {
    // Best-effort labeling
  }
}

export interface PrLifecycleResult {
  pr_number: number;
  action: 'merged' | 'rebase_requested' | 'flagged_for_human' | 'rejected' | 'gates_pending' | 'gates_failed';
  detail: string;
  gates?: PrGatesResult;
  review?: AgentReviewResult;
}

/**
 * Process the full PR lifecycle for an orchestrator issue:
 * 1. Check PR gates (CI, mergeability)
 * 2. If gates fail due to conflicts → rebase (max 2 attempts) → flag for human
 * 3. If gates pending → return pending
 * 4. If gates pass → agent review
 * 5. If review approves → squash-merge
 * 6. If review rejects → reopen issue with feedback
 */
export async function processPrLifecycle(
  issue: OrchestratorIssue,
  state: OrchestratorState,
  stateFile: string,
  sessionDir: string,
  repo: string,
  deps: PrLifecycleDeps,
): Promise<PrLifecycleResult> {
  if (!issue.pr_number) {
    return { pr_number: 0, action: 'gates_failed', detail: 'No PR number on issue' };
  }
  const prNumber = issue.pr_number;

  // Step 1: Check gates
  const gatesResult = await checkPrGates(prNumber, repo, deps);
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'pr_gates_checked',
    pr_number: prNumber,
    issue_number: issue.number,
    all_passed: gatesResult.all_passed,
    gates: gatesResult.gates,
  });

  // Step 2: Handle pending CI
  if (gatesResult.gates.some((g) => g.status === 'pending')) {
    return { pr_number: prNumber, action: 'gates_pending', detail: 'CI checks still running', gates: gatesResult };
  }

  // Step 3: Handle merge conflicts
  if (!gatesResult.mergeable) {
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    const rebaseAttempts = stateIssue?.rebase_attempts ?? 0;

    if (rebaseAttempts >= 2) {
      // Max rebase attempts reached — flag for human
      await flagForHuman(issue, repo, `Merge conflicts persist after 2 rebase attempts on PR #${prNumber}`, deps);
      // Update issue state to failed
      if (stateIssue) stateIssue.state = 'failed';
      state.updated_at = deps.now().toISOString();
      await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'pr_flagged_for_human',
        pr_number: prNumber,
        issue_number: issue.number,
        reason: 'max_rebase_attempts',
        attempts: rebaseAttempts,
      });
      return { pr_number: prNumber, action: 'flagged_for_human', detail: `Conflicts persist after 2 rebase attempts`, gates: gatesResult };
    }

    // Request rebase
    const attempt = rebaseAttempts + 1;
    await requestRebase(issue, repo, state.trunk_branch, attempt, deps);
    if (stateIssue) stateIssue.rebase_attempts = attempt;
    state.updated_at = deps.now().toISOString();
    await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'pr_rebase_requested',
      pr_number: prNumber,
      issue_number: issue.number,
      attempt,
    });
    return { pr_number: prNumber, action: 'rebase_requested', detail: `Rebase requested (attempt ${attempt}/2)`, gates: gatesResult };
  }

  // Step 4: Handle other gate failures (CI failures, etc.)
  if (!gatesResult.all_passed) {
    // Reopen issue with gate failure details
    const failedGates = gatesResult.gates.filter((g) => g.status === 'fail');
    const failDetail = failedGates.map((g) => `${g.gate}: ${g.detail}`).join('; ');
    try {
      await deps.execGh([
        'issue', 'comment', String(issue.number), '--repo', repo,
        '--body', `PR #${prNumber} failed gates: ${failDetail}. Please address and update the PR.`,
      ]);
    } catch {
      // Best-effort comment
    }
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'pr_gates_failed',
      pr_number: prNumber,
      issue_number: issue.number,
      failed_gates: failedGates,
    });
    return { pr_number: prNumber, action: 'gates_failed', detail: failDetail, gates: gatesResult };
  }

  // Step 5: Agent review
  const reviewResult = await reviewPrDiff(prNumber, repo, deps);
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'pr_agent_review',
    pr_number: prNumber,
    issue_number: issue.number,
    verdict: reviewResult.verdict,
    summary: reviewResult.summary,
  });

  if (reviewResult.verdict === 'request-changes') {
    // Post review feedback on the issue
    try {
      await deps.execGh([
        'issue', 'comment', String(issue.number), '--repo', repo,
        '--body', `Agent review of PR #${prNumber} requested changes:\\n\\n${reviewResult.summary}`,
      ]);
    } catch {
      // Best-effort
    }
    return { pr_number: prNumber, action: 'rejected', detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }

  if (reviewResult.verdict === 'flag-for-human') {
    await flagForHuman(issue, repo, `Agent review flagged PR #${prNumber} for human: ${reviewResult.summary}`, deps);
    return { pr_number: prNumber, action: 'flagged_for_human', detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }

  // Step 6: Squash-merge
  const mergeResult = await mergePr(prNumber, repo, deps);

  if (mergeResult.merged) {
    // Update issue state to merged
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    if (stateIssue) stateIssue.state = 'merged';
    state.updated_at = deps.now().toISOString();
    await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'pr_merged',
      pr_number: prNumber,
      issue_number: issue.number,
      merge_method: 'squash',
    });

    // Close the issue
    try {
      await deps.execGh(['issue', 'close', String(issue.number), '--repo', repo]);
    } catch {
      // Best-effort close
    }

    return { pr_number: prNumber, action: 'merged', detail: 'Squash-merged successfully', gates: gatesResult, review: reviewResult };
  }

  // Merge failed — likely a race condition conflict
  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'pr_merge_failed',
    pr_number: prNumber,
    issue_number: issue.number,
    error: mergeResult.error,
  });
  return { pr_number: prNumber, action: 'gates_failed', detail: `Merge failed: ${mergeResult.error}`, gates: gatesResult, review: reviewResult };
}

/**
 * Check if a wave is complete (all issues in the wave are merged or failed).
 */
export function isWaveComplete(state: OrchestratorState, wave: number): boolean {
  const waveIssues = state.issues.filter((i) => i.wave === wave);
  return waveIssues.length > 0 && waveIssues.every((i) => i.state === 'merged' || i.state === 'failed');
}

/**
 * Advance to the next wave if the current wave is complete.
 * Returns true if a wave advancement occurred.
 */
export function advanceWave(state: OrchestratorState): boolean {
  if (state.current_wave === 0) return false;
  if (!isWaveComplete(state, state.current_wave)) return false;

  if (!state.completed_waves.includes(state.current_wave)) {
    state.completed_waves.push(state.current_wave);
  }

  // Find if there are higher waves
  const maxWave = Math.max(0, ...state.issues.map((i) => i.wave));
  if (state.current_wave < maxWave) {
    state.current_wave++;
    return true;
  }

  // All waves complete
  return false;
}
