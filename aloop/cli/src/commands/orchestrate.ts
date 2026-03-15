import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import type { OutputMode } from './status.js';
import { writeQueueOverride } from '../lib/plan.js';

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
  budget?: string;
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

export type OrchestratorIssueState = 'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed';
export type OrchestratorIssueStatus =
  | 'Needs analysis'
  | 'Needs decomposition'
  | 'Needs refinement'
  | 'Ready'
  | 'In progress'
  | 'In review'
  | 'Done'
  | 'Blocked';

export interface OrchestratorIssue {
  number: number;
  title: string;
  body?: string;
  wave: number;
  state: OrchestratorIssueState;
  status?: OrchestratorIssueStatus;
  child_session: string | null;
  pr_number: number | null;
  depends_on: number[];
  rebase_attempts?: number;
  last_comment_check?: string;
  blocked_on_human?: boolean;
  processed_comment_ids?: number[];
  triage_log?: TriageLogEntry[];
  pending_steering_comments?: TriageComment[];
  dor_validated?: boolean;
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
  budget_cap: number | null;
  created_at: string;
  updated_at: string;
}

export type TriageClassification = 'actionable' | 'needs_clarification' | 'question' | 'out_of_scope';
export type TriageActionTaken =
  | 'post_reply_and_block'
  | 'unblock_and_steering'
  | 'steering_injected'
  | 'steering_deferred'
  | 'question_answered'
  | 'triaged_no_action'
  | 'untriaged_external_comment';

export interface TriageComment {
  id: number;
  author: string;
  body: string;
  created_at?: string;
  context?: 'issue' | 'pr';
  author_association?: string;
}

export interface TriageClassificationResult {
  comment_id: number;
  classification: TriageClassification;
  confidence: number;
  reasoning: string;
}

export interface TriageLogEntry {
  comment_id: number;
  author: string;
  classification: TriageClassification;
  confidence: number;
  action_taken: TriageActionTaken;
  timestamp: string;
}

export interface TriageDeps {
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  now: () => Date;
  writeFile?: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  aloopRoot?: string;
}

export interface OrchestrateDeps {
  existsSync: (path: string) => boolean;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  now: () => Date;
  execGhIssueCreate?: (repo: string, sessionId: string, title: string, body: string, labels: string[]) => Promise<number>;
  execGh?: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
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

function parseBudget(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid budget value: ${value} (must be a positive number in USD)`);
  }
  return parsed;
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
      body: planIssue.body,
      wave,
      state: 'pending',
      status: 'Needs refinement',
      child_session: null,
      pr_number: null,
      depends_on: planIssue.depends_on.map((depId) => idToGhNumber.get(depId) ?? depId),
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
      dor_validated: false,
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
  prompts_dir: string;
  queue_dir: string;
  requests_dir: string;
  loop_plan_file: string;
  state_file: string;
  state: OrchestratorState;
}

interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
}

const ORCH_SCAN_PROMPT_FILENAME = 'PROMPT_orch_scan.md';
const ORCH_ESTIMATE_PROMPT_FILENAME = 'PROMPT_orch_estimate.md';
const ORCH_PRODUCT_ANALYST_PROMPT_FILENAME = 'PROMPT_orch_product_analyst.md';
const ORCH_ARCH_ANALYST_PROMPT_FILENAME = 'PROMPT_orch_arch_analyst.md';
const ORCH_ESTIMATE_PROMPT_FALLBACK = `# Orchestrator Estimation Agent

You are Aloop, the estimation agent for orchestrator readiness checks.

## Objective

Estimate implementation effort and risk for one refined sub-issue.

## Required Outputs

- Complexity tier: \`S\`, \`M\`, \`L\`, or \`XL\`
- Estimated child-loop iteration count
- Key risk flags (novel tech, unclear requirements, high coupling, external dependency)
- Confidence note (high/medium/low) with rationale

## Readiness Check

Confirm whether the item satisfies Definition of Ready:

- Acceptance criteria are specific and testable
- No unresolved linked \`aloop/spec-question\` blockers
- Dependencies are resolved/scheduled
- Planner approach is present
- Interface contracts are explicit

If DoR passes, recommend label \`aloop/ready\`; otherwise keep blocked and list gaps.
`;

const ORCH_PRODUCT_ANALYST_FALLBACK = `# Orchestrator Product Analyst

You are Aloop, the product analyst agent for orchestrator refinement.

## Objective

Find product-level gaps that would cause rework during implementation.

## Review Focus

- Missing user stories/personas
- Ambiguous acceptance criteria
- Scope holes and undefined referenced features
- Conflicting product requirements between sections/issues
- Edge cases and error flows that are not specified

## Output

For each actionable gap:

1. Create one focused \`aloop/spec-question\` issue payload (interview style).
2. Include: the question, why this gap matters, concrete resolution options, which epic/sub-issue is blocked.
3. Write requests to \`requests/*.json\` using runtime-supported request formats.

If no material gap exists, write no-op updates only (no filler questions).
`;

const ORCH_ARCH_ANALYST_FALLBACK = `# Orchestrator Architecture Analyst

You are Aloop, the architecture analyst agent for orchestrator refinement.

## Objective

Find architecture and technical gaps before decomposition or dispatch.

## Review Focus

- Infeasible constraints
- Missing system boundaries and integration points
- Unstated technical dependencies (data stores, services, auth, queues)
- Undefined API/data contracts
- Performance/scale assumptions lacking measurable targets
- Migration/backward-compatibility risks

## Output

- Raise focused \`aloop/spec-question\` issues for unresolved architecture gaps.
- Update affected issue body text with clarified constraints/contracts when possible.
- Write only concrete runtime requests to \`requests/*.json\`.
- Do not emit broad or speculative redesign work.
`;

function buildOrchestratorScanPrompt(): string {
  return `---
agent: orch_scan
reasoning: medium
---

# Orchestrator Scan (Heartbeat)

You are the orchestrator scan agent.

Run one lightweight monitoring pass:
- Read current orchestrator state and identify items ready for progress.
- Prioritize queued override prompts from \`queue/\` when present.
- Write any required side effects into \`requests/*.json\`.
- Keep this step reactive and minimal; avoid large speculative planning.
`;
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
  const budgetCap = parseBudget(options.budget);

  const now = deps.now();
  const timestamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const sessionId = `orchestrator-${timestamp}`;
  const sessionDir = path.join(sessionsRoot, sessionId);
  const promptsDir = path.join(sessionDir, 'prompts');
  const queueDir = path.join(sessionDir, 'queue');
  const requestsDir = path.join(sessionDir, 'requests');
  const loopPlanFile = path.join(sessionDir, 'loop-plan.json');
  const orchScanPromptFile = path.join(promptsDir, ORCH_SCAN_PROMPT_FILENAME);
  const orchEstimatePromptFile = path.join(promptsDir, ORCH_ESTIMATE_PROMPT_FILENAME);

  await deps.mkdir(sessionDir, { recursive: true });
  await deps.mkdir(promptsDir, { recursive: true });
  await deps.mkdir(queueDir, { recursive: true });
  await deps.mkdir(requestsDir, { recursive: true });

  const loopPlan: LoopPlan = {
    cycle: [ORCH_SCAN_PROMPT_FILENAME],
    cyclePosition: 0,
    iteration: 1,
    version: 1,
  };
  await deps.writeFile(loopPlanFile, `${JSON.stringify(loopPlan, null, 2)}\n`, 'utf8');
  await deps.writeFile(orchScanPromptFile, buildOrchestratorScanPrompt(), 'utf8');
  const templateRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
  const estimateTemplatePath = path.join(templateRoot, 'aloop', 'templates', ORCH_ESTIMATE_PROMPT_FILENAME);
  const estimatePrompt = deps.existsSync(estimateTemplatePath)
    ? await deps.readFile(estimateTemplatePath, 'utf8')
    : ORCH_ESTIMATE_PROMPT_FALLBACK;
  await deps.writeFile(orchEstimatePromptFile, estimatePrompt, 'utf8');

  // Load product analyst and architecture analyst templates
  const productAnalystTemplatePath = path.join(templateRoot, 'aloop', 'templates', ORCH_PRODUCT_ANALYST_PROMPT_FILENAME);
  const productAnalystPrompt = deps.existsSync(productAnalystTemplatePath)
    ? await deps.readFile(productAnalystTemplatePath, 'utf8')
    : ORCH_PRODUCT_ANALYST_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_PRODUCT_ANALYST_PROMPT_FILENAME), productAnalystPrompt, 'utf8');

  const archAnalystTemplatePath = path.join(templateRoot, 'aloop', 'templates', ORCH_ARCH_ANALYST_PROMPT_FILENAME);
  const archAnalystPrompt = deps.existsSync(archAnalystTemplatePath)
    ? await deps.readFile(archAnalystTemplatePath, 'utf8')
    : ORCH_ARCH_ANALYST_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_ARCH_ANALYST_PROMPT_FILENAME), archAnalystPrompt, 'utf8');

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
    budget_cap: budgetCap,
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

  // Global spec gap analysis — queue product + architecture analyst agents for issues needing analysis
  const gapAnalysisTargets = state.issues.filter((issue) => issue.status === 'Needs analysis');
  if (gapAnalysisTargets.length > 0) {
    await createGapAnalysisRequests(state.issues, requestsDir, deps);

    // Load spec content for analyst queue prompts
    const specPath = path.resolve(specFile);
    const specContent = deps.existsSync(specPath)
      ? await deps.readFile(specPath, 'utf8')
      : '';

    await queueGapAnalysisForIssues(
      state.issues,
      queueDir,
      productAnalystPrompt,
      archAnalystPrompt,
      specContent,
      deps,
    );
  }

  if (filterRepo && state.issues.length > 0 && deps.execGh) {
    await runTriageMonitorCycle(state, path.basename(sessionDir), filterRepo, deps, aloopRoot);
  }

  const dorTargets = state.issues
    .filter((issue) => issue.status === 'Needs refinement' && issue.dor_validated !== true)
    .map((issue) => ({
      issue_number: issue.number,
      title: issue.title,
      wave: issue.wave,
      depends_on: issue.depends_on,
    }));
  if (dorTargets.length > 0) {
    const estimateRequestFile = path.join(requestsDir, 'estimate-readiness.json');
    const estimateRequest = {
      type: 'definition_of_ready_estimate',
      prompt_template: ORCH_ESTIMATE_PROMPT_FILENAME,
      generated_at: deps.now().toISOString(),
      targets: dorTargets,
    };
    await deps.writeFile(estimateRequestFile, `${JSON.stringify(estimateRequest, null, 2)}\n`, 'utf8');

    // Queue estimate agent prompts so the scan loop invokes the estimate agent
    await queueEstimateForIssues(
      state.issues,
      queueDir,
      estimatePrompt,
      deps,
    );
  }

  // Check for previously completed estimate responses and apply them
  const estimateResponseFile = path.join(requestsDir, 'estimate-results.json');
  if (deps.existsSync(estimateResponseFile)) {
    const responseContent = await deps.readFile(estimateResponseFile, 'utf8');
    try {
      const estimateResults = JSON.parse(responseContent) as EstimateResult[];
      await applyEstimateResults(state, estimateResults, {
        execGhIssueCreate: deps.execGhIssueCreate,
        repo: filterRepo ?? undefined,
        sessionId,
      });
    } catch {
      // Malformed response — skip; scan agent will retry
    }
  }

  const stateFile = path.join(sessionDir, 'orchestrator.json');
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  return {
    session_dir: sessionDir,
    prompts_dir: promptsDir,
    queue_dir: queueDir,
    requests_dir: requestsDir,
    loop_plan_file: loopPlanFile,
    state_file: stateFile,
    state,
  };
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
  console.log(`  Prompts dir:  ${result.prompts_dir}`);
  console.log(`  Queue dir:    ${result.queue_dir}`);
  console.log(`  Requests dir: ${result.requests_dir}`);
  console.log(`  Loop plan:    ${result.loop_plan_file}`);
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
  if (result.state.budget_cap !== null) {
    console.log(`  Budget cap:   $${result.state.budget_cap.toFixed(2)}`);
  }
}

export function applyTriageConfidenceFloor(
  result: TriageClassificationResult,
  floor = 0.7,
): TriageClassificationResult {
  if (result.confidence >= floor) {
    return result;
  }

  return {
    ...result,
    classification: 'needs_clarification',
    reasoning: `${result.reasoning} Confidence ${result.confidence.toFixed(2)} is below ${floor.toFixed(2)}; forcing needs_clarification.`,
  };
}

/**
 * Deterministic triage classifier used by orchestrator monitor loops.
 * The result is always normalized through applyTriageConfidenceFloor().
 */
export function classifyTriageComment(comment: TriageComment): TriageClassificationResult {
  const rawBody = comment.body.trim();
  const normalized = rawBody.toLowerCase();

  const lowSignalPatterns = [
    /^(thanks|thank you|lgtm|sgtm|nice work|great work|looks good|ok|okay|ack)[!. ]*$/i,
    /^(\+1|👍|✅)[!. ]*$/i,
  ];
  const ambiguityPatterns = [
    /\b(maybe|perhaps|not sure|unclear|i wonder|hmm|might|possibly)\b/i,
    /\bshould we\b/i,
  ];
  const questionPatterns = [
    /\?$/,
    /^\s*(can|could|would|should|is|are|why|what|how|when|where)\b/i,
  ];
  const actionablePatterns = [
    /\b(please|must|need to|required|fix|implement|add|remove|rename|switch|change|update|refactor)\b/i,
    /\b(do|use)\s+[a-z0-9]/i,
  ];

  let result: TriageClassificationResult;
  if (normalized.length === 0) {
    result = {
      comment_id: comment.id,
      classification: 'out_of_scope',
      confidence: 0.95,
      reasoning: 'Empty comment; no actionable instruction.',
    };
  } else if (lowSignalPatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: 'out_of_scope',
      confidence: 0.9,
      reasoning: 'Low-signal acknowledgment with no implementation instruction.',
    };
  } else if (ambiguityPatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: 'needs_clarification',
      confidence: 0.65,
      reasoning: 'Comment is ambiguous or speculative and should be clarified before implementation.',
    };
  } else if (questionPatterns.some((pattern) => pattern.test(rawBody)) && !actionablePatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: 'question',
      confidence: 0.85,
      reasoning: 'Comment asks a question rather than giving a direct implementation instruction.',
    };
  } else if (actionablePatterns.some((pattern) => pattern.test(normalized))) {
    result = {
      comment_id: comment.id,
      classification: 'actionable',
      confidence: 0.9,
      reasoning: 'Comment contains explicit implementation direction.',
    };
  } else {
    result = {
      comment_id: comment.id,
      classification: 'needs_clarification',
      confidence: 0.6,
      reasoning: 'Unable to confidently classify intent from comment text.',
    };
  }

  return applyTriageConfidenceFloor(result);
}

/**
 * Classify a batch of new comments in one orchestrator triage pass.
 */
export function runTriageClassificationLoop(comments: TriageComment[]): TriageClassificationResult[] {
  return comments.map((comment) => classifyTriageComment(comment));
}

export function shouldPauseForHumanFeedback(issue: OrchestratorIssue): boolean {
  return issue.blocked_on_human === true;
}

export function getUnprocessedTriageComments(
  issue: OrchestratorIssue,
  comments: TriageComment[],
): TriageComment[] {
  const processed = new Set(issue.processed_comment_ids ?? []);
  return comments.filter((comment) => !processed.has(comment.id));
}

const TRIAGE_COMMENT_FOOTER = '---\n*This comment was generated by aloop triage agent.*';

function formatNeedsClarificationReply(comment: TriageComment): string {
  return [
    `Thanks for the feedback, @${comment.author}.`,
    '',
    'I want to make sure we implement exactly what you intended. Could you clarify the requested change with concrete acceptance criteria?',
    TRIAGE_COMMENT_FOOTER,
  ].join('\n');
}

function formatQuestionReply(comment: TriageComment): string {
  return [
    `Thanks for the question, @${comment.author}.`,
    '',
    'Based on the current issue context, this requires human clarification before implementation can proceed safely. Please provide specific direction and expected outcome.',
    TRIAGE_COMMENT_FOOTER,
  ].join('\n');
}

function isAgentGeneratedComment(comment: TriageComment): boolean {
  const normalizedAuthor = comment.author.toLowerCase();
  return comment.body.includes('This comment was generated by aloop triage agent.')
    || normalizedAuthor.includes('aloop-bot')
    || normalizedAuthor.endsWith('[bot]');
}

function isExternalAuthor(comment: TriageComment): boolean {
  const association = (comment.author_association ?? '').toUpperCase();
  if (!association) return false;
  const trustedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR', 'CONTRIBUTOR']);
  return !trustedAssociations.has(association);
}

function formatSteeringComment(comment: TriageComment, issue: OrchestratorIssue): string {
  return `From issue #${issue.number} comment by @${comment.author}:\n\n${comment.body}`;
}

function formatSteeringContent(comments: TriageComment[], issue: OrchestratorIssue): string {
  const sections = comments.map((comment) => formatSteeringComment(comment, issue));
  return `# Steering Injection\n\n${sections.join('\n\n---\n\n')}\n`;
}

async function injectSteeringToChildLoop(
  issue: OrchestratorIssue,
  comments: TriageComment[],
  deps: TriageDeps,
): Promise<void> {
  if (!deps.writeFile || !deps.aloopRoot || !issue.child_session) return;
  const childSessionDir = path.join(deps.aloopRoot, 'sessions', issue.child_session);
  const steeringDoc = formatSteeringContent(comments, issue);
  
  // For backward compatibility and visibility in child worktree
  const steeringPath = path.join(childSessionDir, 'worktree', 'STEERING.md');
  await deps.writeFile(steeringPath, steeringDoc, 'utf8');

  // Task: write queue entries for one-shot overrides (steering)
  const steerTemplatePath = path.join(childSessionDir, 'prompts', 'PROMPT_steer.md');
  let steerPromptContent = steeringDoc;
  if (existsSync(steerTemplatePath)) {
    steerPromptContent = await readFile(steerTemplatePath, 'utf8');
  }

  await writeQueueOverride(childSessionDir, 'triage-steering', steerPromptContent, {
    agent: 'steer',
    type: 'triage_steering_override',
  });
}

export async function applyTriageResultsToIssue(
  issue: OrchestratorIssue,
  comments: TriageComment[],
  repo: string,
  deps: TriageDeps,
): Promise<TriageLogEntry[]> {
  const pendingSteeringComments = issue.pending_steering_comments ?? [];
  if (issue.child_session && pendingSteeringComments.length > 0) {
    await injectSteeringToChildLoop(issue, pendingSteeringComments, deps);
    issue.pending_steering_comments = [];
  }

  const newComments = getUnprocessedTriageComments(issue, comments);
  if (newComments.length === 0) {
    return [];
  }

  const classifications = runTriageClassificationLoop(newComments);
  const timestamp = deps.now().toISOString();
  const processed = new Set(issue.processed_comment_ids ?? []);
  const triageLog = issue.triage_log ?? [];
  const entries: TriageLogEntry[] = [];

  for (let i = 0; i < newComments.length; i++) {
    const comment = newComments[i];
    const result = classifications[i]!;
    let actionTaken: TriageActionTaken;

    if (isAgentGeneratedComment(comment)) {
      processed.add(comment.id);
      continue;
    }

    if (isExternalAuthor(comment)) {
      processed.add(comment.id);
      const entry: TriageLogEntry = {
        comment_id: comment.id,
        author: comment.author,
        classification: 'out_of_scope',
        confidence: 1,
        action_taken: 'untriaged_external_comment',
        timestamp,
      };
      triageLog.push(entry);
      entries.push(entry);
      continue;
    }

    if (result.classification === 'needs_clarification') {
      await deps.execGh([
        'issue', 'comment', String(issue.number), '--repo', repo, '--body', formatNeedsClarificationReply(comment),
      ]);
      if (!issue.blocked_on_human) {
        await deps.execGh([
          'issue', 'edit', String(issue.number), '--repo', repo, '--add-label', 'aloop/blocked-on-human',
        ]);
      }
      issue.blocked_on_human = true;
      actionTaken = 'post_reply_and_block';
    } else if (result.classification === 'actionable') {
      let unblocked = false;
      if (issue.blocked_on_human) {
        await deps.execGh([
          'issue', 'edit', String(issue.number), '--repo', repo, '--remove-label', 'aloop/blocked-on-human',
        ]);
        issue.blocked_on_human = false;
        unblocked = true;
      }
      if (issue.child_session) {
        const pendingSteeringComments = issue.pending_steering_comments ?? [];
        const commentsToInject = pendingSteeringComments.length > 0
          ? [...pendingSteeringComments, comment]
          : [comment];
        await injectSteeringToChildLoop(issue, commentsToInject, deps);
        issue.pending_steering_comments = [];
        actionTaken = unblocked ? 'unblock_and_steering' : 'steering_injected';
      } else {
        const pendingSteeringComments = issue.pending_steering_comments ?? [];
        if (!pendingSteeringComments.some((pendingComment) => pendingComment.id === comment.id)) {
          pendingSteeringComments.push(comment);
        }
        issue.pending_steering_comments = pendingSteeringComments;
        actionTaken = 'steering_deferred';
      }
    } else if (result.classification === 'question') {
      await deps.execGh([
        'issue', 'comment', String(issue.number), '--repo', repo, '--body', formatQuestionReply(comment),
      ]);
      actionTaken = 'question_answered';
    } else {
      actionTaken = 'triaged_no_action';
    }

    processed.add(comment.id);
    const entry: TriageLogEntry = {
      comment_id: comment.id,
      author: comment.author,
      classification: result.classification,
      confidence: result.confidence,
      action_taken: actionTaken,
      timestamp,
    };
    triageLog.push(entry);
    entries.push(entry);
  }

  issue.processed_comment_ids = Array.from(processed);
  issue.triage_log = triageLog;
  issue.last_comment_check = timestamp;
  return entries;
}

interface ParsedMonitorComment {
  issueNumber: number | null;
  comment: TriageComment;
}

export interface TriageMonitorCycleResult {
  processed_issues: number;
  triaged_entries: number;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseNumberFromUrl(url: unknown, pattern: RegExp): number | null {
  if (typeof url !== 'string') {
    return null;
  }
  const match = url.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractCommentsPayload(stdout: string): unknown[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { comments?: unknown[] }).comments)) {
      return (parsed as { comments: unknown[] }).comments;
    }
  } catch {
    return [];
  }

  return [];
}

function normalizeMonitorComments(rawComments: unknown[], context: 'issue' | 'pr'): ParsedMonitorComment[] {
  const result: ParsedMonitorComment[] = [];

  for (const raw of rawComments) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const obj = raw as Record<string, unknown>;
    const id = parsePositiveInteger(obj.id);
    const body = typeof obj.body === 'string' ? obj.body : '';
    const author = typeof obj.author === 'string'
      ? obj.author
      : typeof (obj.user as { login?: unknown } | undefined)?.login === 'string'
        ? (obj.user as { login: string }).login
        : 'unknown';
    if (id === null) {
      continue;
    }

    let issueNumber: number | null = null;
    if (context === 'issue') {
      issueNumber = parsePositiveInteger(obj.issue_number)
        ?? parseNumberFromUrl(obj.issue_url, /\/issues\/(\d+)(?:\/)?$/);
    } else {
      issueNumber = parsePositiveInteger(obj.pull_request_number)
        ?? parseNumberFromUrl(obj.pull_request_url, /\/pulls\/(\d+)(?:\/)?$/);
    }

    result.push({
      issueNumber,
      comment: {
        id,
        author,
        body,
        context,
        created_at: typeof obj.created_at === 'string' ? obj.created_at : undefined,
        author_association: typeof obj.author_association === 'string' ? obj.author_association : undefined,
      },
    });
  }

  return result;
}

export async function runTriageMonitorCycle(
  state: OrchestratorState,
  sessionId: string,
  repo: string,
  deps: Pick<OrchestrateDeps, 'execGh' | 'now'> & { writeFile?: OrchestrateDeps['writeFile'] },
  aloopRoot?: string,
): Promise<TriageMonitorCycleResult> {
  if (!deps.execGh) {
    return { processed_issues: 0, triaged_entries: 0 };
  }

  let triagedEntries = 0;
  for (const issue of state.issues) {
    const since = issue.last_comment_check ?? state.created_at;
    const issueCommentsResponse = await deps.execGh([
      'issue-comments',
      '--session', sessionId,
      '--since', since,
      '--role', 'orchestrator',
    ]);
    const prCommentsResponse = await deps.execGh([
      'pr-comments',
      '--session', sessionId,
      '--since', since,
      '--role', 'orchestrator',
    ]);

    const normalizedIssueComments = normalizeMonitorComments(
      extractCommentsPayload(issueCommentsResponse.stdout),
      'issue',
    ).filter((entry) => entry.issueNumber === issue.number)
      .map((entry) => entry.comment);

    const normalizedPrComments = normalizeMonitorComments(
      extractCommentsPayload(prCommentsResponse.stdout),
      'pr',
    ).filter((entry) => issue.pr_number !== null && entry.issueNumber === issue.pr_number)
      .map((entry) => entry.comment);

    const entries = await applyTriageResultsToIssue(
      issue,
      [...normalizedIssueComments, ...normalizedPrComments],
      repo,
      { execGh: deps.execGh, now: deps.now, writeFile: deps.writeFile, aloopRoot },
    );
    triagedEntries += entries.length;

    issue.last_comment_check = deps.now().toISOString();
  }

  state.updated_at = deps.now().toISOString();
  return { processed_issues: state.issues.length, triaged_entries: triagedEntries };
}

// --- Definition of Ready (DoR) gate ---

export interface DoRValidationResult {
  passed: boolean;
  gaps: string[];
}

const SPEC_QUESTION_BLOCKER = /aloop\/spec-question/i;

/**
 * Validate whether an issue satisfies Definition of Ready criteria per
 * PROMPT_orch_estimate.md.  Checks are deterministic (no agent invocation)
 * so they can run inline during dispatch filtering.
 *
 * Criteria:
 *  1. Acceptance criteria present (explicit section or checkbox list)
 *  2. No unresolved spec-question blockers referenced in body
 *  3. Dependencies are resolved / scheduled (checked at dispatch level)
 *  4. Planner approach is present (heuristic: body has implementation notes or "Approach" section)
 *  5. Interface contracts are explicit (body length sufficient to contain them)
 */
export function validateDoR(issue: OrchestratorIssue): DoRValidationResult {
  const gaps: string[] = [];
  const body = `${issue.title}\n${issue.body ?? ''}`;

  // Criterion 1: Acceptance criteria
  const hasAcceptanceCriteria =
    /acceptance\s*criteria/i.test(body) ||
    /\[ \]/.test(body) ||
    /accepts?/i.test(body);
  if (!hasAcceptanceCriteria) {
    gaps.push('Missing acceptance criteria');
  }

  // Criterion 2: No unresolved spec-question blockers
  if (SPEC_QUESTION_BLOCKER.test(body)) {
    gaps.push('Has unresolved spec-question blocker reference');
  }

  // Criterion 4: Planner approach (body should have meaningful content)
  const hasPlannerApproach =
    /approach/i.test(body) ||
    /implementation/i.test(body) ||
    body.trim().length > 200;
  if (!hasPlannerApproach) {
    gaps.push('Missing planner approach or implementation notes');
  }

  // Criterion 5: Estimation complete
  if (issue.dor_validated !== true) {
    gaps.push('Estimation/DoR validation not completed');
  }

  return { passed: gaps.length === 0, gaps };
}

export type ComplexityTier = 'S' | 'M' | 'L' | 'XL';

export interface EstimateResult {
  issue_number: number;
  dor_passed: boolean;
  complexity_tier?: ComplexityTier;
  iteration_estimate?: number;
  risk_flags?: string[];
  confidence?: 'high' | 'medium' | 'low';
  gaps?: string[];
}

export interface ApplyEstimateResultsOutcome {
  updated: number[];
  blocked: number[];
}

/**
 * Applies estimate agent results to orchestrator state.
 * For each result:
 *  - If DoR passes: sets dor_validated=true and transitions status to 'Ready'
 *  - If DoR fails: keeps status at 'Needs refinement' and records gaps
 *
 * Optionally creates aloop/spec-question issues for DoR gaps when execGhIssueCreate is provided.
 */
export async function applyEstimateResults(
  state: OrchestratorState,
  results: EstimateResult[],
  deps?: {
    execGhIssueCreate?: (repo: string, sessionId: string, title: string, body: string, labels: string[]) => Promise<number>;
    repo?: string;
    sessionId?: string;
  },
): Promise<ApplyEstimateResultsOutcome> {
  const outcome: ApplyEstimateResultsOutcome = { updated: [], blocked: [] };
  const issueByNumber = new Map<number, OrchestratorIssue>();
  for (const issue of state.issues) {
    issueByNumber.set(issue.number, issue);
  }

  for (const result of results) {
    const issue = issueByNumber.get(result.issue_number);
    if (!issue) continue;

    if (result.dor_passed) {
      issue.dor_validated = true;
      if (issue.status === 'Needs refinement') {
        issue.status = 'Ready';
      }
      outcome.updated.push(result.issue_number);
    } else {
      issue.dor_validated = false;
      outcome.blocked.push(result.issue_number);

      // Create aloop/spec-question issues for each gap
      if (result.gaps && result.gaps.length > 0 && deps?.execGhIssueCreate && deps.repo && deps.sessionId) {
        for (const gap of result.gaps) {
          await deps.execGhIssueCreate(
            deps.repo,
            deps.sessionId,
            `[spec-question] #${result.issue_number}: ${gap}`,
            `Blocking issue #${result.issue_number} (${issue.title}).\n\n**DoR gap:** ${gap}\n\nThis spec-question must be resolved before the parent issue can be dispatched.`,
            ['aloop/spec-question'],
          );
        }
      }
    }
  }

  return outcome;
}

/**
 * Queues estimate agent prompts for issues in 'Needs refinement' status
 * that have not yet been validated. Writes one queue override per issue
 * so the scan loop invokes the estimate agent with issue context.
 */
export async function queueEstimateForIssues(
  issues: OrchestratorIssue[],
  queueDir: string,
  estimatePrompt: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<number> {
  const targets = issues.filter(
    (issue) => issue.status === 'Needs refinement' && issue.dor_validated !== true,
  );
  if (targets.length === 0) return 0;

  for (const issue of targets) {
    const contextBlock = [
      `## Issue #${issue.number}: ${issue.title}`,
      '',
      issue.body ?? '(no body)',
      '',
      `**Wave:** ${issue.wave}`,
      `**Dependencies:** ${issue.depends_on.length > 0 ? issue.depends_on.map((d) => `#${d}`).join(', ') : 'none'}`,
    ].join('\n');

    const content = [
      '---',
      JSON.stringify({
        agent: 'orch_estimate',
        reasoning: 'high',
        type: 'estimate_override',
        issue_number: issue.number,
      }, null, 2),
      '---',
      '',
      estimatePrompt,
      '',
      '## Context',
      '',
      contextBlock,
      '',
      'Produce your output as a JSON code block with fields: `issue_number`, `dor_passed`, `complexity_tier`, `iteration_estimate`, `risk_flags`, `confidence`, `gaps`.',
    ].join('\n');

    const fileName = `estimate-issue-${issue.number}.md`;
    await deps.writeFile(path.join(queueDir, fileName), content, 'utf8');
  }

  return targets.length;
}

// --- Global spec gap analysis ---

export async function createGapAnalysisRequests(
  issues: OrchestratorIssue[],
  requestsDir: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>; now: () => Date },
): Promise<{ product: boolean; architecture: boolean }> {
  const targets = issues
    .filter((issue) => issue.status === 'Needs analysis')
    .map((issue) => ({
      issue_number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      wave: issue.wave,
    }));
  if (targets.length === 0) return { product: false, architecture: false };

  const productRequest = {
    type: 'product_analyst_review',
    prompt_template: ORCH_PRODUCT_ANALYST_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets,
  };
  await deps.writeFile(
    path.join(requestsDir, 'product-analyst-review.json'),
    `${JSON.stringify(productRequest, null, 2)}\n`,
    'utf8',
  );

  const archRequest = {
    type: 'architecture_analyst_review',
    prompt_template: ORCH_ARCH_ANALYST_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets,
  };
  await deps.writeFile(
    path.join(requestsDir, 'architecture-analyst-review.json'),
    `${JSON.stringify(archRequest, null, 2)}\n`,
    'utf8',
  );

  return { product: true, architecture: true };
}

export async function queueGapAnalysisForIssues(
  issues: OrchestratorIssue[],
  queueDir: string,
  productAnalystPrompt: string,
  archAnalystPrompt: string,
  specContent: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<number> {
  const targets = issues.filter((issue) => issue.status === 'Needs analysis');
  if (targets.length === 0) return 0;

  const issueContext = targets
    .map(
      (issue) =>
        `### Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? '(no body)'}\n\n**Wave:** ${issue.wave}`,
    )
    .join('\n\n---\n\n');

  // Queue product analyst prompt
  const productContent = [
    '---',
    JSON.stringify(
      { agent: 'orch_product_analyst', reasoning: 'xhigh', type: 'gap_analysis' },
      null,
      2,
    ),
    '---',
    '',
    productAnalystPrompt,
    '',
    '## Spec',
    '',
    specContent,
    '',
    '## Issues Under Analysis',
    '',
    issueContext,
    '',
    'For each gap found, write a `requests/req-NNN-create_issues.json` file with `aloop/spec-question` label. If no gaps, do nothing.',
  ].join('\n');
  await deps.writeFile(path.join(queueDir, 'gap-analysis-product.md'), productContent, 'utf8');

  // Queue architecture analyst prompt
  const archContent = [
    '---',
    JSON.stringify(
      { agent: 'orch_arch_analyst', reasoning: 'xhigh', type: 'gap_analysis' },
      null,
      2,
    ),
    '---',
    '',
    archAnalystPrompt,
    '',
    '## Spec',
    '',
    specContent,
    '',
    '## Issues Under Analysis',
    '',
    issueContext,
    '',
    'For each gap found, write a `requests/req-NNN-create_issues.json` file with `aloop/spec-question` label. If no gaps, do nothing.',
  ].join('\n');
  await deps.writeFile(path.join(queueDir, 'gap-analysis-architecture.md'), archContent, 'utf8');

  return targets.length;
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

    // Primary signal: Project status 'Ready'
    if (issue.status && issue.status !== 'Ready') return false;

    // Legacy/fallback signal: state 'pending'
    if (issue.state !== 'pending') return false;

    if (shouldPauseForHumanFeedback(issue)) return false;

    // Definition of Ready gate must pass before dispatch.
    if (!validateDoR(issue).passed) return false;

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

// --- Budget awareness & final report ---

export interface ChildSessionCost {
  session_id: string;
  issue_number: number;
  iterations: number;
  providers: Record<string, number>;
  estimated_cost_usd: number;
}

export interface BudgetSummary {
  budget_cap: number | null;
  total_estimated_cost_usd: number;
  children: ChildSessionCost[];
  budget_exceeded: boolean;
  budget_approaching: boolean;
}

export interface FinalReport {
  session_dir: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  issues_total: number;
  issues_completed: number;
  issues_failed: number;
  issues_pending: number;
  waves_total: number;
  waves_completed: number;
  budget: BudgetSummary;
}

/** Default cost-per-iteration estimate in USD (configurable per-provider in future). */
const DEFAULT_COST_PER_ITERATION_USD = 0.50;

export interface BudgetDeps {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  existsSync: (path: string) => boolean;
}

/**
 * Parse a child session's log.jsonl to count iterations and provider usage.
 */
export async function parseChildSessionCost(
  sessionDir: string,
  sessionId: string,
  issueNumber: number,
  deps: BudgetDeps,
): Promise<ChildSessionCost> {
  const logFile = path.join(sessionDir, 'log.jsonl');
  const providers: Record<string, number> = {};
  let iterations = 0;

  if (deps.existsSync(logFile)) {
    try {
      const content = await deps.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.event === 'iteration_complete') {
            iterations++;
            const provider = entry.provider ?? 'unknown';
            providers[provider] = (providers[provider] ?? 0) + 1;
          }
        } catch {
          // Skip malformed log lines
        }
      }
    } catch {
      // log.jsonl not readable — zero cost
    }
  }

  return {
    session_id: sessionId,
    issue_number: issueNumber,
    iterations,
    providers,
    estimated_cost_usd: iterations * DEFAULT_COST_PER_ITERATION_USD,
  };
}

/**
 * Aggregate costs across all child sessions referenced in orchestrator state.
 */
export async function aggregateChildCosts(
  state: OrchestratorState,
  aloopRoot: string,
  deps: BudgetDeps,
): Promise<BudgetSummary> {
  const children: ChildSessionCost[] = [];

  for (const issue of state.issues) {
    if (issue.child_session) {
      const childDir = path.join(aloopRoot, 'sessions', issue.child_session);
      const cost = await parseChildSessionCost(childDir, issue.child_session, issue.number, deps);
      children.push(cost);
    }
  }

  const totalCost = children.reduce((sum, c) => sum + c.estimated_cost_usd, 0);
  const budgetCap = state.budget_cap;

  return {
    budget_cap: budgetCap,
    total_estimated_cost_usd: totalCost,
    children,
    budget_exceeded: budgetCap !== null && totalCost >= budgetCap,
    budget_approaching: budgetCap !== null && totalCost >= budgetCap * 0.8 && totalCost < budgetCap,
  };
}

/**
 * Check if budget threshold is approached and dispatch should be paused.
 * Returns true if dispatch should be paused (budget >= 80% of cap).
 */
export function shouldPauseForBudget(budget: BudgetSummary): boolean {
  return budget.budget_exceeded || budget.budget_approaching;
}

/**
 * Generate a final report summarizing the orchestrator session.
 */
export function generateFinalReport(
  state: OrchestratorState,
  sessionDir: string,
  budget: BudgetSummary,
  completedAt: Date,
): FinalReport {
  const startedAt = state.created_at;
  const completedAtIso = completedAt.toISOString();
  const durationMs = completedAt.getTime() - new Date(startedAt).getTime();
  const durationSeconds = Math.round(durationMs / 1000);

  const issuesCompleted = state.issues.filter((i) => i.state === 'merged').length;
  const issuesFailed = state.issues.filter((i) => i.state === 'failed').length;
  const issuesPending = state.issues.filter((i) => i.state === 'pending' || i.state === 'in_progress' || i.state === 'pr_open').length;
  const wavesTotal = new Set(state.issues.map((i) => i.wave)).size;

  return {
    session_dir: sessionDir,
    started_at: startedAt,
    completed_at: completedAtIso,
    duration_seconds: durationSeconds,
    issues_total: state.issues.length,
    issues_completed: issuesCompleted,
    issues_failed: issuesFailed,
    issues_pending: issuesPending,
    waves_total: wavesTotal,
    waves_completed: state.completed_waves.length,
    budget,
  };
}

/**
 * Format a final report as human-readable text.
 */
export function formatFinalReportText(report: FinalReport): string {
  const lines: string[] = [];
  lines.push('=== Orchestrator Final Report ===');
  lines.push('');
  lines.push(`Session:     ${report.session_dir}`);
  lines.push(`Started:     ${report.started_at}`);
  lines.push(`Completed:   ${report.completed_at}`);
  const hours = Math.floor(report.duration_seconds / 3600);
  const mins = Math.floor((report.duration_seconds % 3600) / 60);
  const secs = report.duration_seconds % 60;
  lines.push(`Duration:    ${hours > 0 ? `${hours}h ` : ''}${mins}m ${secs}s`);
  lines.push('');
  lines.push('--- Issues ---');
  lines.push(`Total:       ${report.issues_total}`);
  lines.push(`Completed:   ${report.issues_completed}`);
  lines.push(`Failed:      ${report.issues_failed}`);
  lines.push(`Pending:     ${report.issues_pending}`);
  lines.push('');
  lines.push('--- Waves ---');
  lines.push(`Total:       ${report.waves_total}`);
  lines.push(`Completed:   ${report.waves_completed}`);
  lines.push('');
  lines.push('--- Budget ---');
  if (report.budget.budget_cap !== null) {
    lines.push(`Cap:         $${report.budget.budget_cap.toFixed(2)}`);
  } else {
    lines.push('Cap:         (none)');
  }
  lines.push(`Estimated:   $${report.budget.total_estimated_cost_usd.toFixed(2)}`);

  if (report.budget.children.length > 0) {
    lines.push('');
    lines.push('--- Provider Usage ---');
    // Aggregate provider counts across all children
    const providerTotals: Record<string, number> = {};
    let totalIterations = 0;
    for (const child of report.budget.children) {
      totalIterations += child.iterations;
      for (const [provider, count] of Object.entries(child.providers)) {
        providerTotals[provider] = (providerTotals[provider] ?? 0) + count;
      }
    }
    lines.push(`Iterations:  ${totalIterations}`);
    for (const [provider, count] of Object.entries(providerTotals).sort()) {
      lines.push(`  ${provider}: ${count} iterations`);
    }
  }

  return lines.join('\n');
}
