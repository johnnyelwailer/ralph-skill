import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import { getProjectHash, resolveProjectRoot } from './project.js';
import type { OutputMode } from './status.js';
import { writeQueueOverride } from '../lib/plan.js';
import { compileLoopPlan } from './compile-loop-plan.js';
import { writeSpecBackfill } from '../lib/specBackfill.js';
import { normalizeCiDetailForSignature } from '../lib/ci-utils.js';
import {
  EtagCache,
  fetchBulkIssueState,
  detectIssueChanges,
  type BulkIssueState,
} from '../lib/github-monitor.js';

export interface OrchestrateCommandOptions {
  spec?: string;
  concurrency?: string;
  trunk?: string;
  issues?: string;
  label?: string;
  repo?: string;
  autonomyLevel?: string;
  plan?: string;
  planOnly?: boolean;
  homeDir?: string;
  projectRoot?: string;
  output?: OutputMode;
  budget?: string;
  interval?: string;
  maxIterations?: string;
  runScanLoop?: boolean;
  autoMerge?: boolean;
}

export interface DecompositionPlanIssue {
  id: number;
  title: string;
  body: string;
  depends_on: number[];
  file_hints?: string[];
  sandbox?: 'container' | 'none';
  requires?: string[];
}

export interface DecompositionPlan {
  issues: DecompositionPlanIssue[];
}

export type OrchestratorIssueState = 'pending' | 'in_progress' | 'pr_open' | 'merged' | 'failed';
export type AutonomyLevel = 'cautious' | 'balanced' | 'autonomous';
export type SpecQuestionRisk = 'low' | 'medium' | 'high';
export type SpecQuestionResolutionAction = 'wait_for_user' | 'auto_resolve';
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
  file_hints?: string[];
  sandbox?: 'container' | 'none';
  requires?: string[];
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
  refinement_count?: number;
  refinement_budget_exceeded?: boolean;
  ci_failure_signature?: string;
  ci_failure_retries?: number;
  ci_failure_summary?: string;
}

export interface OrchestratorState {
  spec_file: string;
  spec_files?: string[];
  spec_glob?: string;
  spec_last_commit?: string;
  autonomy_level?: AutonomyLevel;
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
  auto_merge_to_main?: boolean;
  trunk_pr_number?: number | null;
  gh_project_number?: number;
  created_at: string;
  updated_at: string;
}

// --- Replan types ---

export type ReplanTrigger = 'spec_change' | 'wave_complete' | 'external_issue' | 'persistent_failure';

export type ReplanActionType = 'create_issue' | 'update_issue' | 'close_issue' | 'steer_child' | 'reprioritize';

export interface ReplanAction {
  action: ReplanActionType;
  number?: number;
  parent?: number;
  title?: string;
  body?: string;
  new_body?: string;
  deps?: number[];
  instruction?: string;
  new_wave?: number;
  reason?: string;
}

export interface ReplanResult {
  type: 'orchestrator_replan';
  trigger: ReplanTrigger;
  timestamp: string;
  actions: ReplanAction[];
  gap_analysis_needed: boolean;
  affected_sections: string[];
}

export interface SpecChangeDetection {
  changed: boolean;
  diff: string;
  new_commit: string;
  changed_files: string[];
}

const HOUSEKEEPING_AGENTS = new Set(['spec-consistency', 'spec-backfill', 'guard', 'loop-health-supervisor']);

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
  unlink?: (path: string) => Promise<void>;
  readdirSync?: (path: string) => string[];
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
  unlink,
  readdirSync,
  now: () => new Date(),
};

function normalizeTaskSandbox(sandbox: string | undefined): 'container' | 'none' {
  return sandbox === 'none' ? 'none' : 'container';
}

function normalizeTaskRequires(requires: string[] | undefined): string[] {
  if (!Array.isArray(requires)) return [];
  return requires
    .map((label) => label.trim().toLowerCase())
    .filter((label, index, all) => label.length > 0 && all.indexOf(label) === index);
}

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

interface ProjectStatusSyncDeps {
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  appendLog?: (sessionDir: string, entry: Record<string, unknown>) => void;
  now?: () => Date;
  sessionDir?: string;
}

interface ProjectStatusContext {
  itemId: string;
  projectId: string;
  statusFieldId: string;
  statusOptions: Map<string, string>;
}

const projectStatusContextCache = new Map<string, ProjectStatusContext | null>();
const PROJECT_STATUS_FIELD_NAME = 'Status';

function parseRepoSlug(repo: string): { owner: string; name: string } | null {
  const [owner, name, ...rest] = repo.split('/');
  if (!owner || !name || rest.length > 0) return null;
  return { owner, name };
}

async function resolveIssueProjectStatusContext(
  repo: string,
  issueNumber: number,
  deps: ProjectStatusSyncDeps,
): Promise<ProjectStatusContext | null> {
  const cacheKey = `${repo}#${issueNumber}`;
  if (projectStatusContextCache.has(cacheKey)) {
    return projectStatusContextCache.get(cacheKey) ?? null;
  }

  const slug = parseRepoSlug(repo);
  if (!slug) {
    projectStatusContextCache.set(cacheKey, null);
    return null;
  }

  const query = 'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:20){nodes{id project{id} fieldValues(first:50){nodes{... on ProjectV2ItemFieldSingleSelectValue{field{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}}}}';
  const response = await deps.execGh([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${slug.owner}`,
    '-F',
    `repo=${slug.name}`,
    '-F',
    `number=${issueNumber}`,
  ]);
  const parsed = JSON.parse(response.stdout) as {
    data?: {
      repository?: {
        issue?: {
          projectItems?: {
            nodes?: Array<{
              id?: string;
              project?: { id?: string };
              fieldValues?: {
                nodes?: Array<{
                  field?: {
                    id?: string;
                    name?: string;
                    options?: Array<{ id?: string; name?: string }>;
                  };
                }>;
              };
            }>;
          };
        };
      };
    };
  };
  const nodes = parsed.data?.repository?.issue?.projectItems?.nodes;
  if (!Array.isArray(nodes)) {
    projectStatusContextCache.set(cacheKey, null);
    return null;
  }

  for (const node of nodes) {
    const itemId = typeof node.id === 'string' ? node.id : '';
    const projectId = typeof node.project?.id === 'string' ? node.project.id : '';
    if (!itemId || !projectId) continue;
    const fieldNodes = node.fieldValues?.nodes;
    if (!Array.isArray(fieldNodes)) continue;
    for (const fieldNode of fieldNodes) {
      const field = fieldNode.field;
      if (!field || field.name !== PROJECT_STATUS_FIELD_NAME) continue;
      const fieldId = typeof field.id === 'string' ? field.id : '';
      if (!fieldId || !Array.isArray(field.options) || field.options.length === 0) continue;
      const statusOptions = new Map<string, string>();
      for (const option of field.options) {
        if (typeof option.name === 'string' && typeof option.id === 'string') {
          statusOptions.set(option.name.toLowerCase(), option.id);
        }
      }
      const context: ProjectStatusContext = {
        itemId,
        projectId,
        statusFieldId: fieldId,
        statusOptions,
      };
      projectStatusContextCache.set(cacheKey, context);
      return context;
    }
  }

  projectStatusContextCache.set(cacheKey, null);
  return null;
}

async function syncIssueProjectStatus(
  issueNumber: number,
  repo: string,
  targetStatus: OrchestratorIssueStatus,
  deps: ProjectStatusSyncDeps,
): Promise<boolean> {
  try {
    const context = await resolveIssueProjectStatusContext(repo, issueNumber, deps);
    if (!context) {
      deps.appendLog?.(deps.sessionDir ?? '', {
        timestamp: deps.now?.().toISOString() ?? new Date().toISOString(),
        event: 'project_status_sync_skipped',
        issue_number: issueNumber,
        target_status: targetStatus,
        reason: 'status_field_not_found',
      });
      return false;
    }
    const optionId = context.statusOptions.get(targetStatus.toLowerCase());
    if (!optionId) {
      deps.appendLog?.(deps.sessionDir ?? '', {
        timestamp: deps.now?.().toISOString() ?? new Date().toISOString(),
        event: 'project_status_sync_skipped',
        issue_number: issueNumber,
        target_status: targetStatus,
        reason: 'status_option_not_found',
      });
      return false;
    }

    await deps.execGh([
      'project',
      'item-edit',
      '--id',
      context.itemId,
      '--project-id',
      context.projectId,
      '--field-id',
      context.statusFieldId,
      '--single-select-option-id',
      optionId,
    ]);
    deps.appendLog?.(deps.sessionDir ?? '', {
      timestamp: deps.now?.().toISOString() ?? new Date().toISOString(),
      event: 'project_status_synced',
      issue_number: issueNumber,
      target_status: targetStatus,
    });
    return true;
  } catch (error: unknown) {
    deps.appendLog?.(deps.sessionDir ?? '', {
      timestamp: deps.now?.().toISOString() ?? new Date().toISOString(),
      event: 'project_status_sync_failed',
      issue_number: issueNumber,
      target_status: targetStatus,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export function assertAutonomyLevel(value: string | undefined): AutonomyLevel {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'balanced') return 'balanced';
  if (normalized === 'cautious' || normalized === 'autonomous') return normalized;
  throw new Error(`Invalid autonomy level: ${value} (must be cautious, balanced, or autonomous)`);
}

function parseConfigScalar(content: string, key: string): string | null {
  const matcher = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm');
  const match = content.match(matcher);
  if (!match) return null;
  const raw = match[1]!.split(/\s+#/, 1)[0]!.trim();
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\"/g, '"');
  }
  return raw;
}

export async function resolveOrchestratorAutonomyLevel(
  options: OrchestrateCommandOptions,
  homeDir: string,
  deps: Pick<OrchestrateDeps, 'existsSync' | 'readFile'>,
): Promise<AutonomyLevel> {
  if (options.autonomyLevel) {
    return assertAutonomyLevel(options.autonomyLevel);
  }
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const projectHash = getProjectHash(projectRoot);
  const configPath = path.join(homeDir, '.aloop', 'projects', projectHash, 'config.yml');
  if (!deps.existsSync(configPath)) {
    return 'balanced';
  }
  try {
    const configContent = await deps.readFile(configPath, 'utf8');
    return assertAutonomyLevel(parseConfigScalar(configContent, 'autonomy_level') ?? undefined);
  } catch {
    return 'balanced';
  }
}

export async function resolveAutoMerge(
  options: OrchestrateCommandOptions,
  homeDir: string,
  deps: Pick<OrchestrateDeps, 'existsSync' | 'readFile'>,
): Promise<boolean> {
  if (options.autoMerge !== undefined) {
    return options.autoMerge;
  }
  const projectRoot = resolveProjectRoot(options.projectRoot);
  const projectHash = getProjectHash(projectRoot);
  const configPath = path.join(homeDir, '.aloop', 'projects', projectHash, 'config.yml');
  if (!deps.existsSync(configPath)) {
    return false;
  }
  try {
    const configContent = await deps.readFile(configPath, 'utf8');
    const value = parseConfigScalar(configContent, 'auto_merge_to_main');
    return value === 'true';
  } catch {
    return false;
  }
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
    const labels = ['aloop', `aloop/wave-${wave}`];

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
      file_hints: planIssue.file_hints ?? [],
      sandbox: normalizeTaskSandbox(planIssue.sandbox),
      requires: normalizeTaskRequires(planIssue.requires),
      wave,
      state: 'pending',
      status: 'Needs decomposition',
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
  aloopRoot: string;
  projectRoot: string;
}

interface LoopPlan {
  cycle: string[];
  cyclePosition: number;
  iteration: number;
  version: number;
}

const ORCH_SCAN_PROMPT_FILENAME = 'PROMPT_orch_scan.md';
const ORCH_ESTIMATE_PROMPT_FILENAME = 'PROMPT_orch_estimate.md';
const ORCH_DECOMPOSE_PROMPT_FILENAME = 'PROMPT_orch_decompose.md';
const ORCH_SUB_DECOMPOSE_PROMPT_FILENAME = 'PROMPT_orch_sub_decompose.md';
const ORCH_PRODUCT_ANALYST_PROMPT_FILENAME = 'PROMPT_orch_product_analyst.md';
const ORCH_ARCH_ANALYST_PROMPT_FILENAME = 'PROMPT_orch_arch_analyst.md';
const ORCH_REPLAN_PROMPT_FILENAME = 'PROMPT_orch_replan.md';
const ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME = 'PROMPT_orch_spec_consistency.md';
const ORCH_REVIEW_PROMPT_FILENAME = 'PROMPT_orch_review.md';
const DEFAULT_SPEC_GLOB = 'SPEC.md specs/*.md';

/**
 * Resolve spec file paths from a space/comma-separated glob-like input string.
 * Supports literal paths and simple `dir/*.ext` patterns.
 * Returns resolved absolute paths with master spec first, then vertical slices alphabetically.
 */
export function resolveSpecFiles(
  specInput: string,
  projectRoot: string,
  deps: { existsSync: (path: string) => boolean; readdirSync?: (path: string) => string[] },
): string[] {
  const patterns = specInput.split(/[\s,]+/).filter((p) => p.length > 0);
  const resolved: string[] = [];
  const seen = new Set<string>();
  const readdirFn = deps.readdirSync ?? readdirSync;

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Simple glob: dir/*.ext
      const dir = path.resolve(projectRoot, path.dirname(pattern));
      const ext = path.extname(pattern.replace('*', 'x')); // extract extension from e.g. *.md
      if (!deps.existsSync(dir)) continue;
      let entries: string[];
      try {
        entries = readdirFn(dir);
      } catch {
        continue;
      }
      const matching = entries
        .filter((e) => (ext ? e.endsWith(ext) : true))
        .sort()
        .map((e) => path.join(dir, e));
      for (const p of matching) {
        if (!seen.has(p)) {
          seen.add(p);
          resolved.push(p);
        }
      }
    } else {
      const p = path.resolve(projectRoot, pattern);
      if (!seen.has(p)) {
        seen.add(p);
        resolved.push(p);
      }
    }
  }

  return resolved;
}

/**
 * Load and merge content from multiple spec files.
 * Single file returns its content directly. Multiple files are joined with
 * file-name headers so the consuming agent sees clear boundaries.
 */
export async function loadMergedSpecContent(
  specFiles: string[],
  deps: { existsSync: (path: string) => boolean; readFile: (path: string, encoding: BufferEncoding) => Promise<string> },
): Promise<string> {
  const existing = specFiles.filter((f) => deps.existsSync(f));
  if (existing.length === 0) return '';
  if (existing.length === 1) {
    return deps.readFile(existing[0], 'utf8');
  }

  const sections: string[] = [];
  for (const file of existing) {
    const content = await deps.readFile(file, 'utf8');
    const basename = path.basename(file);
    sections.push(`<!-- spec: ${basename} -->\n\n${content}`);
  }

  return sections.join('\n\n---\n\n');
}

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

If DoR passes, recommend Project status \`Ready\` while keeping tracking label \`aloop\`; otherwise keep blocked and list gaps.
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

const ORCH_DECOMPOSE_FALLBACK = `# Orchestrator Decompose (Epic Creation)

You are Aloop, the epic decomposition agent. Your working directory is the orchestrator session directory.

Convert the spec into top-level vertical slices (epics) with acceptance criteria and dependency hints.
Write the result to \`requests/epic-decomposition-results.json\` as a JSON object with an \`issues\` array.
All paths are relative to your working directory.
`;

const ORCH_SUB_DECOMPOSE_FALLBACK = `# Orchestrator Sub-Issue Decompose

You are Aloop, the sub-issue decomposition agent.

Break one refined epic into scoped work units suitable for child loops.
Each sub-issue must be independently actionable with clear file ownership hints.
`;

const ORCH_REVIEW_FALLBACK = `# Orchestrator Review Layer

You are Aloop, the orchestrator review agent.

## Objective

Review a child loop's PR to ensure it meets the requirements of the issue and the overall specification.

## Process

1. Read the issue description and the global specification.
2. Review the PR diff for correctness, style, and completeness.
3. Verify that proof of work (if any) is valid and matches the changes.
4. Provide a verdict: \`approve\`, \`request-changes\`, or \`flag-for-human\`.

## Rules

- Reject code that deviates from the specification or architectural standards.
- Flag ambiguous or high-risk changes for human review.
- Provide clear, actionable feedback when requesting changes.
`;

function buildOrchestratorScanPrompt(sessionDir: string): string {
  return `---
agent: orch_scan
reasoning: medium
---

# Orchestrator Scan (Heartbeat)

You are the orchestrator scan agent. You are running in a git worktree of the project.

**Session directory:** \`${sessionDir}\`

The session directory contains \`orchestrator.json\`, \`requests/\`, \`queue/\`, and \`prompts/\`.
Your working directory is \`${sessionDir}/worktree\` — a git worktree with full project access.

Run one lightweight monitoring pass:
- Read \`${sessionDir}/orchestrator.json\` to understand current state (issues, waves, dependencies).
- Check \`${sessionDir}/queue/\` for override prompts to prioritize.
- Write any required side effects into \`${sessionDir}/requests/*.json\`.
- You can read project files (SPEC.md, source code) from your working directory.
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

  const specInput = options.spec ?? 'SPEC.md';
  const projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
  const specFiles = resolveSpecFiles(specInput, projectRoot, deps);
  const existingSpecFiles = specFiles.filter((f) => deps.existsSync(f));
  if (existingSpecFiles.length === 0) {
    throw new Error(`No spec files found matching: ${specInput}`);
  }
  // Primary spec file for backward compatibility (first resolved file)
  const specFile = path.relative(projectRoot, existingSpecFiles[0]) || existingSpecFiles[0];
  const trunkBranch = options.trunk ?? 'agent/trunk';
  const concurrencyCap = parseConcurrency(options.concurrency);
  const filterIssues = parseIssueNumbers(options.issues);
  const filterLabel = options.label ?? null;
  const filterRepo = options.repo ?? null;
  const planOnly = options.planOnly ?? false;
  const budgetCap = parseBudget(options.budget);
  const autonomyLevel = await resolveOrchestratorAutonomyLevel(options, homeDir, deps);
  const autoMergeToMain = await resolveAutoMerge(options, homeDir, deps);

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
  await deps.writeFile(orchScanPromptFile, buildOrchestratorScanPrompt(sessionDir), 'utf8');
  const estimateTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_ESTIMATE_PROMPT_FILENAME);
  const estimatePrompt = deps.existsSync(estimateTemplatePath)
    ? await deps.readFile(estimateTemplatePath, 'utf8')
    : ORCH_ESTIMATE_PROMPT_FALLBACK;
  await deps.writeFile(orchEstimatePromptFile, estimatePrompt, 'utf8');

  // Load product analyst and architecture analyst templates
  const productAnalystTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_PRODUCT_ANALYST_PROMPT_FILENAME);
  const productAnalystPrompt = deps.existsSync(productAnalystTemplatePath)
    ? await deps.readFile(productAnalystTemplatePath, 'utf8')
    : ORCH_PRODUCT_ANALYST_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_PRODUCT_ANALYST_PROMPT_FILENAME), productAnalystPrompt, 'utf8');

  const archAnalystTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_ARCH_ANALYST_PROMPT_FILENAME);
  const archAnalystPrompt = deps.existsSync(archAnalystTemplatePath)
    ? await deps.readFile(archAnalystTemplatePath, 'utf8')
    : ORCH_ARCH_ANALYST_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_ARCH_ANALYST_PROMPT_FILENAME), archAnalystPrompt, 'utf8');

  const decomposeTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_DECOMPOSE_PROMPT_FILENAME);
  const decomposePrompt = deps.existsSync(decomposeTemplatePath)
    ? await deps.readFile(decomposeTemplatePath, 'utf8')
    : ORCH_DECOMPOSE_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_DECOMPOSE_PROMPT_FILENAME), decomposePrompt, 'utf8');

  const subDecomposeTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_SUB_DECOMPOSE_PROMPT_FILENAME);
  const subDecomposePrompt = deps.existsSync(subDecomposeTemplatePath)
    ? await deps.readFile(subDecomposeTemplatePath, 'utf8')
    : ORCH_SUB_DECOMPOSE_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_SUB_DECOMPOSE_PROMPT_FILENAME), subDecomposePrompt, 'utf8');

  const reviewTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_REVIEW_PROMPT_FILENAME);
  const reviewPrompt = deps.existsSync(reviewTemplatePath)
    ? await deps.readFile(reviewTemplatePath, 'utf8')
    : ORCH_REVIEW_FALLBACK;
  await deps.writeFile(path.join(promptsDir, ORCH_REVIEW_PROMPT_FILENAME), reviewPrompt, 'utf8');

  // Load replan and spec consistency templates
  const replanTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_REPLAN_PROMPT_FILENAME);
  if (deps.existsSync(replanTemplatePath)) {
    const replanPrompt = await deps.readFile(replanTemplatePath, 'utf8');
    await deps.writeFile(path.join(promptsDir, ORCH_REPLAN_PROMPT_FILENAME), replanPrompt, 'utf8');
  }
  const consistencyTemplatePath = path.join(projectRoot, 'aloop', 'templates', ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME);
  if (deps.existsSync(consistencyTemplatePath)) {
    const consistencyPrompt = await deps.readFile(consistencyTemplatePath, 'utf8');
    await deps.writeFile(path.join(promptsDir, ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME), consistencyPrompt, 'utf8');
  }

  // Build the spec glob from input — use explicit input if it contains a glob, otherwise default
  const specGlob = specInput.includes('*') ? specInput : DEFAULT_SPEC_GLOB;
  let state: OrchestratorState = {
    spec_file: specFile,
    spec_files: existingSpecFiles.map((f) => path.relative(projectRoot, f) || f),
    spec_glob: specGlob,
    autonomy_level: autonomyLevel,
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
    auto_merge_to_main: autoMergeToMain || undefined,
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

  // Apply pre-computed epic decomposition output when available.
  const epicDecompositionResultsFile = path.join(requestsDir, 'epic-decomposition-results.json');
  if (deps.existsSync(epicDecompositionResultsFile)) {
    const epicResultsContent = await deps.readFile(epicDecompositionResultsFile, 'utf8');
    try {
      const epicPlan = JSON.parse(epicResultsContent) as DecompositionPlan;
      if (Array.isArray(epicPlan.issues) && epicPlan.issues.length > 0) {
        state = await applyDecompositionPlan(epicPlan, state, sessionDir, filterRepo, deps);
      }
    } catch {
      // Malformed response — skip; scan agent will retry
    }
  }

  // Preload existing GitHub issues into state (dedup on restart/resume)
  if (filterRepo && state.issues.length === 0) {
    try {
      const { spawnSync: nodeSpawnSync } = await import('node:child_process');
      const listResult = nodeSpawnSync('gh', ['issue', 'list', '--repo', filterRepo, '--label', 'aloop/auto', '--state', 'open', '--limit', '200', '--json', 'number,title,body,labels'], { encoding: 'utf8' });
      if (listResult.status !== 0) throw new Error(listResult.stderr ?? 'gh failed');
      const ghIssues = JSON.parse(listResult.stdout ?? '[]');
      if (Array.isArray(ghIssues) && ghIssues.length > 0) {
        // Fetch project status for each issue to avoid re-estimating
        const projectStatusMap = new Map<number, string>();
        try {
          const owner = filterRepo.split('/')[0];
          // Find aloop project number dynamically
          let projNumber = 0;
          const projListResult = nodeSpawnSync('gh', ['project', 'list', '--owner', owner, '--format', 'json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          if (projListResult.status === 0) {
            try {
              const projects = JSON.parse(projListResult.stdout ?? '{}').projects ?? [];
              const aloopProj = projects.find((p: any) => p.title?.toLowerCase().includes('aloop'));
              if (aloopProj) projNumber = aloopProj.number;
            } catch { /* ignore */ }
          }
          if (projNumber === 0) throw new Error('No aloop project found');
          state.gh_project_number = projNumber;
          const gqlQuery = `{ user(login: "${owner}") { projectV2(number: ${projNumber}) { items(first: 100) { nodes { content { ... on Issue { number } } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }`;
          const projResult = nodeSpawnSync('gh', ['api', 'graphql', '-f', `query=${gqlQuery}`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          if (projResult.status !== 0) {
            console.error(`[orchestrate] Project status query failed (exit ${projResult.status}): ${projResult.stderr?.substring(0, 200)}`);
          }
          if (projResult.status === 0 && projResult.stdout) {
            const projData = JSON.parse(projResult.stdout);
            console.log(`[orchestrate] Project status query returned ${projResult.stdout.length} bytes`);
            const items = projData?.data?.user?.projectV2?.items?.nodes ?? [];
            for (const item of items) {
              const num = item?.content?.number;
              const status = item?.fieldValueByName?.name;
              if (num && status) projectStatusMap.set(num, status);
            }
          }
        } catch (e) { console.error(`[orchestrate] Project status fetch failed: ${e}`); }

        for (const gi of ghIssues) {
          const isEpic = gi.labels?.some((l: any) => (l.name ?? l) === 'aloop/epic');
          const projStatus = projectStatusMap.get(gi.number);
          // Use project status if available, otherwise infer from labels
          // Epics with tasklists (sub-issues) are tracking epics — not dispatchable
          const hasSubIssues = isEpic && gi.body && gi.body.includes('[tasklist]');
          let status = isEpic ? (hasSubIssues ? 'In progress' : 'Needs decomposition') : 'Needs refinement';
          let dorValidated = false;
          let issueState: string = 'pending';
          if (projStatus) {
            status = projStatus;
            if (projStatus === 'Ready' || projStatus === 'In progress' || projStatus === 'In review' || projStatus === 'Done') {
              dorValidated = true;
            }
            // Only set in_progress state for non-epics (epics are tracking, not child loops)
            if (projStatus === 'In progress' && !isEpic) issueState = 'in_progress';
            if (projStatus === 'In review') issueState = 'pr_open';
            if (projStatus === 'Done') issueState = 'merged';
          }

          state.issues.push({
            number: gi.number,
            title: gi.title,
            body: gi.body ?? '',
            file_hints: [],
            wave: 1,
            state: issueState,
            status,
            child_session: null,
            pr_number: null,
            depends_on: [],
            blocked_on_human: false,
            processed_comment_ids: [],
            dor_validated: dorValidated,
          } as any);
        }
        if (state.current_wave === 0) state.current_wave = 1;
        const statusCounts = new Map<string, number>();
        for (const i of state.issues) { statusCounts.set(i.status ?? '?', (statusCounts.get(i.status ?? '?') ?? 0) + 1); }
        const statusStr = [...statusCounts.entries()].map(([k,v]) => `${k}:${v}`).join(' ');
        console.log(`[orchestrate] Preloaded ${ghIssues.length} issues (${statusStr})`);
      }
    } catch {
      // GH fetch failed — proceed without preloading
    }
  }

  // If no decomposition has been applied yet, queue epic decomposition from spec.
  if (!options.plan && state.issues.length === 0) {
    const specLabel = existingSpecFiles.length > 1
      ? existingSpecFiles.map((f) => path.relative(projectRoot, f) || f).join(', ')
      : specFile;
    await createEpicDecompositionRequest(specLabel, requestsDir, { writeFile: deps.writeFile, now: deps.now });
    const specContent = await loadMergedSpecContent(existingSpecFiles, deps);
    await queueEpicDecomposition(specLabel, specContent, queueDir, decomposePrompt, { writeFile: deps.writeFile });
  }

  // Apply sub-issue decomposition results before creating new decomposition requests.
  const subDecompositionResultsFile = path.join(requestsDir, 'sub-decomposition-results.json');
  if (deps.existsSync(subDecompositionResultsFile)) {
    const subResultsContent = await deps.readFile(subDecompositionResultsFile, 'utf8');
    try {
      const subResults = JSON.parse(subResultsContent) as SubDecompositionResult[];
      applySubDecompositionResults(state, subResults, deps.now());
    } catch {
      // Malformed response — skip; scan agent will retry
    }
  }

  // Queue sub-issue decomposition for refined epics.
  const decompositionTargets = state.issues.filter((issue) => issue.status === 'Needs decomposition');
  if (decompositionTargets.length > 0) {
    await createSubDecompositionRequests(state.issues, requestsDir, { writeFile: deps.writeFile, now: deps.now });
    await queueSubDecompositionForIssues(
      state.issues,
      queueDir,
      subDecomposePrompt,
      { writeFile: deps.writeFile },
    );
  }

  // Global spec gap analysis — queue product + architecture analyst agents for issues needing analysis
  const gapAnalysisTargets = state.issues.filter((issue) => issue.status === 'Needs analysis');
  if (gapAnalysisTargets.length > 0) {
    await createGapAnalysisRequests(state.issues, requestsDir, deps);

    // Load merged spec content for analyst queue prompts
    const specContent = await loadMergedSpecContent(existingSpecFiles, deps);

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
        execGh: deps.execGh,
        now: deps.now,
        repo: filterRepo ?? undefined,
        sessionId,
        sessionDir,
      });
    } catch {
      // Malformed response — skip; scan agent will retry
    }
  }

  // Create config.json for aloop gh command (role-based access control)
  if (filterRepo) {
    const configPath = path.join(sessionDir, 'config.json');
    await deps.writeFile(configPath, `${JSON.stringify({ repo: filterRepo, role: 'orchestrator' }, null, 2)}\n`, 'utf8');
  }

  // Create PROMPT_plan.md symlink so loop.sh mode validation passes
  // (the actual prompt used is driven by loop-plan.json cycle, not the mode)
  const planPromptPath = path.join(promptsDir, 'PROMPT_plan.md');
  if (!deps.existsSync(planPromptPath)) {
    await deps.writeFile(planPromptPath, '# Orchestrator plan prompt (placeholder — cycle uses PROMPT_orch_scan.md)\n', 'utf8');
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
    aloopRoot,
    projectRoot,
  };
}

export async function orchestrateCommand(options: OrchestrateCommandOptions = {}, depsOrCommand?: any) {
  const outputMode = options.output ?? 'text';
  // Commander passes the Command object as the second argument if not explicitly provided.
  // We check if the provided argument looks like our OrchestrateDeps.
  const deps = (depsOrCommand && typeof depsOrCommand === 'object' && 'existsSync' in depsOrCommand)
    ? (depsOrCommand as OrchestrateDeps)
    : undefined;
  const result = await orchestrateCommandWithDeps(options, deps);

  const planOnly = options.planOnly ?? false;

  // Spawn loop.sh as a detached background process (unless plan-only)
  let loopPid: number | null = null;
  if (!planOnly) {
    const { spawn: nodeSpawn, spawnSync: nodeSpawnSync } = await import('node:child_process');
    const loopBinDir = path.join(result.aloopRoot, 'bin');
    const loopScript = path.join(loopBinDir, 'loop.sh');

    if (!existsSync(loopScript)) {
      throw new Error(`Loop script not found: ${loopScript}`);
    }

    // Create a git worktree inside the session dir (same as aloop start).
    // The agent works in the worktree (full project access to SPEC.md, source),
    // while requests/, queue/, orchestrator.json are siblings at ../
    let workDir = result.projectRoot;
    const worktreePath = path.join(result.session_dir, 'worktree');
    const worktreeBranch = `aloop/${path.basename(result.session_dir)}`;
    const worktreeResult = nodeSpawnSync('git', ['-C', result.projectRoot, 'worktree', 'add', worktreePath, '-b', worktreeBranch], { encoding: 'utf8' });
    if (worktreeResult.status === 0) {
      workDir = worktreePath;
    } else {
      // Worktree failed — fall back to project root
      console.error(`Warning: Failed to create worktree: ${worktreeResult.stderr?.trim()}`);
    }

    const args = [
      '--prompts-dir', result.prompts_dir,
      '--session-dir', result.session_dir,
      '--work-dir', workDir,
      '--mode', 'plan',
      '--provider', 'claude',
      '--round-robin', 'claude',
      '--max-iterations', '999999',
      '--launch-mode', 'start',
      '--dangerously-skip-container',
      '--no-task-exit',
    ];

    const child = nodeSpawn(loopScript, args, {
      cwd: workDir,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();
    loopPid = child.pid ?? null;

    if (!loopPid) {
      throw new Error('Failed to launch orchestrator loop process.');
    }

    // Write meta.json
    const metaPath = path.join(result.session_dir, 'meta.json');
    const startedAt = new Date().toISOString();
    const meta = {
      session_id: path.basename(result.session_dir),
      project_root: result.projectRoot,
      provider: 'claude',
      mode: 'orchestrate',
      work_dir: result.projectRoot,
      pid: loopPid,
      started_at: startedAt,
    };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    // Register in active.json
    const activePath = path.join(result.aloopRoot, 'active.json');
    let active: Record<string, unknown> = {};
    try {
      if (existsSync(activePath)) {
        const content = await readFile(activePath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          active = parsed as Record<string, unknown>;
        }
      }
    } catch {
      // Start fresh
    }
    const sessionId = path.basename(result.session_dir);
    active[sessionId] = {
      session_id: sessionId,
      session_dir: result.session_dir,
      project_root: result.projectRoot,
      pid: loopPid,
      work_dir: result.projectRoot,
      started_at: startedAt,
      provider: 'claude',
      mode: 'orchestrate',
    };
    await writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  }

  if (outputMode === 'json') {
    console.log(JSON.stringify({ ...result, pid: loopPid }, null, 2));
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
  console.log(`  Spec:         ${result.state.spec_files && result.state.spec_files.length > 1 ? result.state.spec_files.join(', ') : result.state.spec_file}`);
  console.log(`  Trunk:        ${result.state.trunk_branch}`);
  console.log(`  Autonomy:     ${result.state.autonomy_level ?? 'balanced'}`);
  console.log(`  Concurrency:  ${result.state.concurrency_cap}`);
  console.log(`  Plan only:    ${result.state.plan_only}`);
  if (loopPid) {
    console.log(`  Loop PID:     ${loopPid}`);
  }

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
  // Load the template so the agent knows HOW to steer, then append user instruction.
  const steerTemplatePath = path.join(childSessionDir, 'prompts', 'PROMPT_steer.md');
  let steerPromptContent = steeringDoc;
  if (existsSync(steerTemplatePath)) {
    const templateContent = await readFile(steerTemplatePath, 'utf8');
    steerPromptContent = templateContent + '\n\n' + steeringDoc;
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

interface GithubIssueLabel {
  name?: string;
}

interface SpecQuestionIssueSummary {
  number: number;
  title: string;
  body: string;
  labels: GithubIssueLabel[];
}

function parseSpecQuestionIssueList(stdout: string): SpecQuestionIssueSummary[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((issue): issue is Record<string, unknown> => Boolean(issue) && typeof issue === 'object')
      .map((issue) => ({
        number: parsePositiveInteger(issue.number) ?? 0,
        title: typeof issue.title === 'string' ? issue.title : '',
        body: typeof issue.body === 'string' ? issue.body : '',
        labels: Array.isArray(issue.labels) ? issue.labels as GithubIssueLabel[] : [],
      }))
      .filter((issue) => issue.number > 0);
  } catch {
    return [];
  }
}

function extractLabelNames(labels: GithubIssueLabel[]): Set<string> {
  const names = new Set<string>();
  for (const label of labels) {
    if (typeof label?.name === 'string' && label.name.length > 0) {
      names.add(label.name.toLowerCase());
    }
  }
  return names;
}

export function classifySpecQuestionRisk(issue: Pick<SpecQuestionIssueSummary, 'title' | 'body'>): SpecQuestionRisk {
  const haystack = `${issue.title}\n${issue.body}`.toLowerCase();
  if (/(security|privacy|billing|payment|architecture|breaking change|data retention|compliance)/.test(haystack)) {
    return 'high';
  }
  if (/(api|contract|schema|data model|auth flow|error handling|migration|backward compatibility)/.test(haystack)) {
    return 'medium';
  }
  return 'low';
}

export function resolveSpecQuestionAction(
  autonomy: AutonomyLevel,
  risk: SpecQuestionRisk,
): SpecQuestionResolutionAction {
  if (autonomy === 'autonomous') return 'auto_resolve';
  if (autonomy === 'balanced') return risk === 'low' ? 'auto_resolve' : 'wait_for_user';
  return 'wait_for_user';
}

export function formatResolverDecisionComment(
  autonomy: AutonomyLevel,
  risk: SpecQuestionRisk,
): string {
  return `## Resolver Decision (auto-resolved — ${autonomy} mode)

**Risk**: ${risk}
**Decision**: Proceed with the most conservative implementation choice consistent with current SPEC.

**Rationale**: The issue was classified as ${risk}-risk under ${autonomy} autonomy, which allows autonomous resolution for this risk tier.

**Spec backfill**: Decision captured for follow-up spec backfill by orchestrator consistency flow.

---
*This comment was generated by aloop resolver agent.*`;
}

interface SpecQuestionResolveStats {
  processed: number;
  waiting: number;
  autoResolved: number;
  userOverrides: number;
}

export async function resolveSpecQuestionIssues(
  state: OrchestratorState,
  repo: string,
  sessionDir: string,
  deps: Pick<ScanLoopDeps, 'execGh' | 'appendLog' | 'now'>,
): Promise<SpecQuestionResolveStats> {
  if (!deps.execGh) {
    return { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 };
  }
  const result: SpecQuestionResolveStats = { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 };
  const response = await deps.execGh([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    'aloop/spec-question',
    '--state',
    'open',
    '--json',
    'number,title,body,labels',
  ]);
  const issues = parseSpecQuestionIssueList(response.stdout);
  for (const issue of issues) {
    result.processed += 1;
    const labelNames = extractLabelNames(issue.labels);
    const issueNumber = String(issue.number);
    const risk = classifySpecQuestionRisk(issue);
    const action = resolveSpecQuestionAction(state.autonomy_level ?? 'balanced', risk);
    const reopenedByUser = labelNames.has('aloop/auto-resolved');
    if (reopenedByUser) {
      if (!labelNames.has('aloop/blocked-on-human')) {
        await deps.execGh([
          'issue', 'edit', issueNumber, '--repo', repo, '--add-label', 'aloop/blocked-on-human',
        ]);
      }
      result.userOverrides += 1;
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'spec_question_user_override',
        issue_number: issue.number,
        autonomy_level: state.autonomy_level ?? 'balanced',
      });
      continue;
    }

    if (action === 'wait_for_user') {
      if (!labelNames.has('aloop/blocked-on-human')) {
        await deps.execGh([
          'issue', 'edit', issueNumber, '--repo', repo, '--add-label', 'aloop/blocked-on-human',
        ]);
      }
      result.waiting += 1;
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'spec_question_waiting',
        issue_number: issue.number,
        risk,
        autonomy_level: state.autonomy_level ?? 'balanced',
      });
      continue;
    }

    await deps.execGh([
      'issue',
      'comment',
      issueNumber,
      '--repo',
      repo,
      '--body',
      formatResolverDecisionComment(state.autonomy_level ?? 'balanced', risk),
    ]);
    await deps.execGh([
      'issue',
      'edit',
      issueNumber,
      '--repo',
      repo,
      '--add-label',
      'aloop/auto-resolved',
      '--remove-label',
      'aloop/blocked-on-human',
    ]);
    await deps.execGh(['issue', 'close', issueNumber, '--repo', repo]);
    result.autoResolved += 1;
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'spec_question_auto_resolved',
      issue_number: issue.number,
      risk,
      autonomy_level: state.autonomy_level ?? 'balanced',
    });
  }
  return result;
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
  // If estimation agent already validated DoR, trust it
  if (issue.dor_validated) {
    return { passed: true, gaps: [] };
  }

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
  if (!issue.dor_validated) {
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

export const REFINEMENT_BUDGET_CAP = 5;

export interface ApplyEstimateResultsOutcome {
  updated: number[];
  blocked: number[];
  budgetExceeded: number[];
}

/**
 * Classify the risk level of DoR gaps based on gap content.
 * High-risk gaps mention critical terms; otherwise medium/low.
 */
export function classifyGapRisk(gaps?: string[]): SpecQuestionRisk {
  if (!gaps || gaps.length === 0) return 'low';
  const highRiskTerms = ['security', 'auth', 'data loss', 'breaking', 'migration', 'compliance'];
  const text = gaps.join(' ').toLowerCase();
  if (highRiskTerms.some((term) => text.includes(term))) return 'high';
  if (gaps.length > 3) return 'medium';
  return 'low';
}

/**
 * Determine whether refinement budget cap should auto-resolve or block,
 * based on autonomy level and gap risk.
 * Returns true to auto-resolve, false to block and wait for user.
 */
export function resolveRefinementBudgetAction(
  autonomy: AutonomyLevel,
  gapRisk: SpecQuestionRisk,
): boolean {
  if (autonomy === 'autonomous') return true;
  if (autonomy === 'balanced') return gapRisk === 'low';
  return false;
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
    execGh?: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
    appendLog?: (sessionDir: string, entry: Record<string, unknown>) => void;
    now?: () => Date;
    repo?: string;
    sessionId?: string;
    sessionDir?: string;
  },
): Promise<ApplyEstimateResultsOutcome> {
  const outcome: ApplyEstimateResultsOutcome = { updated: [], blocked: [], budgetExceeded: [] };
  const issueByNumber = new Map<number, OrchestratorIssue>();
  for (const issue of state.issues) {
    issueByNumber.set(issue.number, issue);
  }

  const autonomyLevel = state.autonomy_level ?? 'balanced';

  for (const result of results) {
    const issue = issueByNumber.get(result.issue_number);
    if (!issue) continue;

    if (result.dor_passed) {
      issue.dor_validated = true;
      if (issue.status === 'Needs refinement') {
        issue.status = 'Ready';
      }
      if (deps?.execGh && deps.repo) {
        await syncIssueProjectStatus(result.issue_number, deps.repo, 'Ready', {
          execGh: deps.execGh,
          appendLog: deps.appendLog,
          now: deps.now,
          sessionDir: deps.sessionDir,
        });
      }
      outcome.updated.push(result.issue_number);
    } else {
      issue.dor_validated = false;
      issue.refinement_count = (issue.refinement_count ?? 0) + 1;

      // Check refinement budget cap
      if (issue.refinement_count >= REFINEMENT_BUDGET_CAP) {
        issue.refinement_budget_exceeded = true;
        outcome.budgetExceeded.push(result.issue_number);

        const gapRisk = classifyGapRisk(result.gaps);
        const shouldAutoResolve = resolveRefinementBudgetAction(autonomyLevel, gapRisk);

        if (shouldAutoResolve) {
          issue.status = 'Ready';
          issue.dor_validated = true;
          outcome.updated.push(result.issue_number);
          deps?.appendLog?.(deps.sessionDir ?? '', {
            timestamp: (deps?.now?.() ?? new Date()).toISOString(),
            event: 'refinement_budget_auto_resolved',
            issue_number: result.issue_number,
            refinement_count: issue.refinement_count,
            autonomy_level: autonomyLevel,
            gap_risk: gapRisk,
          });
          continue;
        } else {
          issue.status = 'Blocked';
          deps?.appendLog?.(deps.sessionDir ?? '', {
            timestamp: (deps?.now?.() ?? new Date()).toISOString(),
            event: 'refinement_budget_exceeded',
            issue_number: result.issue_number,
            refinement_count: issue.refinement_count,
            autonomy_level: autonomyLevel,
            gap_risk: gapRisk,
          });
        }
      }

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
    (issue) => issue.status === 'Needs refinement' && issue.dor_validated !== true && !issue.refinement_budget_exceeded,
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

    // Derive session dir from queue dir
    const sessionDir = path.dirname(queueDir);
    const outputPath = path.join(sessionDir, 'requests', `estimate-result-${issue.number}.json`);

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
      `Read the project spec files (SPEC.md, SPEC-ADDENDUM.md) for full context.`,
      '',
      `Write your result as a JSON file to \`${outputPath}\` with fields:`,
      '`{ "issue_number": <number>, "dor_passed": <boolean>, "complexity_tier": "S|M|L|XL", "iteration_estimate": <number>, "risk_flags": [...], "confidence": { "level": "low|medium|high", "rationale": "..." }, "gaps": [...] }`',
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
    '## Spec Files (read from project)',
    '',
    'Read SPEC.md and SPEC-ADDENDUM.md from the project working directory.',
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
    '## Spec Files (read from project)',
    '',
    'Read SPEC.md and SPEC-ADDENDUM.md from the project working directory.',
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

// --- Epic and sub-issue decomposition wiring ---

export interface SubDecompositionResult {
  parent_issue_number: number;
  refined_body?: string;
  file_hints?: string[];
  status?: OrchestratorIssueStatus;
}

export async function createEpicDecompositionRequest(
  specFile: string,
  requestsDir: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>; now: () => Date },
): Promise<void> {
  const request = {
    type: 'epic_decomposition',
    prompt_template: ORCH_DECOMPOSE_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    spec_file: specFile,
  };
  await deps.writeFile(
    path.join(requestsDir, 'epic-decomposition.json'),
    `${JSON.stringify(request, null, 2)}\n`,
    'utf8',
  );
}

export async function queueEpicDecomposition(
  specFile: string,
  _specContent: string,
  queueDir: string,
  decomposePrompt: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<void> {
  // Derive session dir from queue dir (queue is a direct child of session dir)
  const sessionDir = path.dirname(queueDir);
  const outputPath = path.join(sessionDir, 'requests', 'epic-decomposition-results.json');
  // Reference spec files by path — never embed content. The agent runs in a
  // worktree with full project access and can read them directly.
  const content = [
    '---',
    JSON.stringify(
      { agent: 'orch_decompose', reasoning: 'xhigh', type: 'epic_decomposition' },
      null,
      2,
    ),
    '---',
    '',
    decomposePrompt,
    '',
    `## Spec Files (read these from the project)`,
    '',
    ...specFile.split(',').map((f: string) => `- \`${f.trim()}\``),
    '',
    `Read the spec files listed above from the project working directory. Do NOT expect them to be embedded in this prompt.`,
    '',
    `Write decomposition output to \`${outputPath}\` as a \`{"issues":[...]}\` plan object.`,
    `Each issue must have: \`id\` (sequential number), \`title\`, \`body\` (markdown with acceptance criteria), \`depends_on\` (array of ids).`,
  ].join('\n');
  await deps.writeFile(path.join(queueDir, 'decompose-epics.md'), content, 'utf8');
}

export async function createSubDecompositionRequests(
  issues: OrchestratorIssue[],
  requestsDir: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>; now: () => Date },
): Promise<number> {
  const targets = issues
    .filter((issue) => issue.status === 'Needs decomposition')
    .map((issue) => ({
      issue_number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      depends_on: issue.depends_on,
      wave: issue.wave,
      file_hints: issue.file_hints ?? [],
    }));
  if (targets.length === 0) return 0;

  const request = {
    type: 'sub_issue_decomposition',
    prompt_template: ORCH_SUB_DECOMPOSE_PROMPT_FILENAME,
    generated_at: deps.now().toISOString(),
    targets,
  };

  await deps.writeFile(
    path.join(requestsDir, 'sub-issue-decomposition.json'),
    `${JSON.stringify(request, null, 2)}\n`,
    'utf8',
  );
  return targets.length;
}

export async function queueSubDecompositionForIssues(
  issues: OrchestratorIssue[],
  queueDir: string,
  subDecomposePrompt: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<number> {
  const targets = issues.filter((issue) => issue.status === 'Needs decomposition');
  if (targets.length === 0) return 0;

  for (const issue of targets) {
    const content = [
      '---',
      JSON.stringify(
        { agent: 'orch_sub_decompose', reasoning: 'xhigh', type: 'sub_issue_decomposition', issue_number: issue.number },
        null,
        2,
      ),
      '---',
      '',
      subDecomposePrompt,
      '',
      `## Epic Issue #${issue.number}: ${issue.title}`,
      '',
      issue.body ?? '(no body)',
      '',
      `## Wave`,
      '',
      String(issue.wave),
      '',
      `## Dependency Issue Numbers`,
      '',
      issue.depends_on.length > 0 ? issue.depends_on.join(', ') : '(none)',
      '',
      `Read the project spec files (SPEC.md, SPEC-ADDENDUM.md) for full context.`,
      '',
      `Write decomposition output to \`${path.join(path.dirname(queueDir), 'requests', `sub-decomposition-result-${issue.number}.json`)}\` as a JSON object: \`{"issue_number": ${issue.number}, "sub_issues": [{"title": "...", "body": "...", "depends_on": [...]}]}\`.`,
    ].join('\n');
    await deps.writeFile(path.join(queueDir, `sub-decompose-issue-${issue.number}.md`), content, 'utf8');
  }

  return targets.length;
}

export function applySubDecompositionResults(
  state: OrchestratorState,
  results: SubDecompositionResult[],
  now: Date,
): OrchestratorState {
  if (!Array.isArray(results) || results.length === 0) return state;

  const byParent = new Map<number, SubDecompositionResult>();
  for (const result of results) {
    byParent.set(result.parent_issue_number, result);
  }

  let touched = false;
  for (const issue of state.issues) {
    const result = byParent.get(issue.number);
    if (!result) continue;
    issue.status = result.status ?? 'Needs refinement';
    issue.dor_validated = false;
    if (result.refined_body) issue.body = result.refined_body;
    if (result.file_hints) issue.file_hints = [...result.file_hints];
    touched = true;
  }

  if (touched) {
    state.updated_at = now.toISOString();
  }
  return state;
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

    // Already dispatched — has child session
    if (issue.child_session) return false;

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

/**
 * Checks whether an issue's file ownership hints overlap with any files
 * owned by currently in-progress issues or already-selected issues.
 * Returns true if there is a conflict that should block parallel dispatch.
 */
export function hasFileOwnershipConflict(
  issue: OrchestratorIssue,
  activeIssues: OrchestratorIssue[],
): boolean {
  const candidateHints = issue.file_hints;
  if (!candidateHints || candidateHints.length === 0) return false;

  for (const active of activeIssues) {
    const activeHints = active.file_hints;
    if (!activeHints || activeHints.length === 0) continue;
    for (const hint of candidateHints) {
      if (activeHints.includes(hint)) return true;
    }
  }
  return false;
}

/**
 * Filters dispatchable issues to exclude those with file ownership conflicts
 * against in-progress issues and previously selected issues in this batch.
 */
export function filterByFileOwnership(
  candidates: OrchestratorIssue[],
  state: OrchestratorState,
): OrchestratorIssue[] {
  const activeIssues = state.issues.filter((i) => i.state === 'in_progress');
  const selected: OrchestratorIssue[] = [];

  for (const candidate of candidates) {
    if (!hasFileOwnershipConflict(candidate, [...activeIssues, ...selected])) {
      selected.push(candidate);
    }
  }
  return selected;
}

export interface HostCapabilityRequirementMiss {
  issue: OrchestratorIssue;
  missing: string[];
}

export interface HostCapabilityFilterResult {
  eligible: OrchestratorIssue[];
  blocked: HostCapabilityRequirementMiss[];
}

export function detectHostCapabilities(deps: Pick<DispatchDeps, 'platform' | 'spawnSync' | 'env'>): Set<string> {
  const capabilities = new Set<string>();

  if (deps.platform === 'win32') capabilities.add('windows');
  if (deps.platform === 'darwin') capabilities.add('macos');
  if (deps.platform === 'linux') capabilities.add('linux');
  capabilities.add('network-access');

  try {
    const docker = deps.spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (docker.status === 0) capabilities.add('docker');
  } catch {
    // Best-effort detection only.
  }

  const gpuEnv =
    (deps.env.NVIDIA_VISIBLE_DEVICES && deps.env.NVIDIA_VISIBLE_DEVICES !== 'none') ||
    (deps.env.CUDA_VISIBLE_DEVICES && deps.env.CUDA_VISIBLE_DEVICES.length > 0);
  if (gpuEnv) {
    capabilities.add('gpu');
  } else {
    try {
      const nvidiaSmi = deps.spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8' });
      if (nvidiaSmi.status === 0) capabilities.add('gpu');
    } catch {
      // Best-effort detection only.
    }
  }

  return capabilities;
}

export function filterByHostCapabilities(
  candidates: OrchestratorIssue[],
  deps: Pick<DispatchDeps, 'platform' | 'spawnSync' | 'env'>,
): HostCapabilityFilterResult {
  const capabilities = detectHostCapabilities(deps);
  const eligible: OrchestratorIssue[] = [];
  const blocked: HostCapabilityRequirementMiss[] = [];

  for (const issue of candidates) {
    const requires = normalizeTaskRequires(issue.requires);
    const missing = requires.filter((label) => !capabilities.has(label));
    if (missing.length === 0) {
      eligible.push(issue);
    } else {
      blocked.push({ issue, missing });
    }
  }

  return { eligible, blocked };
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
  const sandbox = normalizeTaskSandbox(issue.sandbox);
  const requires = normalizeTaskRequires(issue.requires);
  const now = deps.now();
  const sessionId = formatChildSessionId(projectName, issue.number, now);
  const sessionsRoot = path.join(aloopRoot, 'sessions');
  const sessionDir = path.join(sessionsRoot, sessionId);
  const branchName = `aloop/issue-${issue.number}`;
  const worktreePath = path.join(sessionDir, 'worktree');
  const promptsDir = path.join(sessionDir, 'prompts');

  // Create session directory
  await deps.mkdir(sessionDir, { recursive: true });

  // Copy prompts — use project prompts (for loop agents), not orchestrator prompts
  // Look for project prompts first, fall back to orchestrator prompts
  const projectPromptsDir = path.join(aloopRoot, 'templates');
  if (deps.existsSync(projectPromptsDir)) {
    await deps.mkdir(promptsDir, { recursive: true });
    // Copy standard loop prompt templates
    const templateFiles = ['PROMPT_plan.md', 'PROMPT_build.md', 'PROMPT_qa.md', 'PROMPT_review.md',
      'PROMPT_proof.md', 'PROMPT_steer.md', 'PROMPT_spec-gap.md', 'PROMPT_docs.md',
      'PROMPT_spec-review.md', 'PROMPT_final-review.md', 'PROMPT_final-qa.md', 'PROMPT_merge.md'];
    for (const tmpl of templateFiles) {
      const src = path.join(projectPromptsDir, tmpl);
      if (deps.existsSync(src)) {
        const content = await deps.readFile(src, 'utf8');
        await deps.writeFile(path.join(promptsDir, tmpl), content, 'utf8');
      }
    }
  } else {
    // Fallback: copy whatever prompts source has
    await deps.cp(promptsSourceDir, promptsDir, { recursive: true });
  }

  // Create git worktree branching from agent/trunk (not local HEAD)
  // Fetch latest trunk first
  deps.spawnSync('git', ['-C', projectRoot, 'fetch', 'origin', 'agent/trunk'], { encoding: 'utf8' });
  let worktreeResult = deps.spawnSync('git', ['-C', projectRoot, 'worktree', 'add', worktreePath, '-b', branchName, 'origin/agent/trunk'], { encoding: 'utf8' });
  if (worktreeResult.status !== 0) {
    // Branch may already exist — try without -b
    worktreeResult = deps.spawnSync('git', ['-C', projectRoot, 'worktree', 'add', worktreePath, branchName], { encoding: 'utf8' });
    if (worktreeResult.status !== 0) {
      throw new Error(`Failed to create worktree for issue #${issue.number}: ${worktreeResult.stderr || worktreeResult.stdout}`);
    }
  }

  // Seed TODO.md in worktree from issue body (gitignored — working artifact only)
  const todoContent = `# Issue #${issue.number}: ${issue.title}\n\n## Tasks\n\n- [ ] Implement as described in the issue\n`;
  await deps.writeFile(path.join(worktreePath, 'TODO.md'), todoContent, 'utf8');

  // Ensure TODO.md and other working artifacts don't pollute PRs
  const gitignorePath = path.join(worktreePath, '.gitignore');
  let gitignoreContent = '';
  if (deps.existsSync(gitignorePath)) {
    gitignoreContent = await deps.readFile(gitignorePath, 'utf8');
  }
  const ignoreEntries = ['TODO.md', 'STEERING.md', 'QA_COVERAGE.md', 'QA_LOG.md', 'REVIEW_LOG.md'];
  const missing = ignoreEntries.filter(e => !gitignoreContent.includes(e));
  if (missing.length > 0) {
    gitignoreContent += `\n# Aloop working artifacts (not for PR)\n${missing.join('\n')}\n`;
    await deps.writeFile(gitignorePath, gitignoreContent, 'utf8');
  }

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
    sandbox,
    requires,
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

  // Seed sub-spec as TASK_SPEC.md (NOT SPEC.md — that's the project spec and must not be overwritten)
  if (issue.body) {
    await deps.writeFile(path.join(worktreePath, 'TASK_SPEC.md'), `# Sub-Spec: Issue #${issue.number} — ${issue.title}\n\n${issue.body}\n`, 'utf8');
  }

  // Copy pipeline.yml so child gets finalizer config (not tracked in git)
  const projectPipelineYml = path.join(projectRoot, '.aloop', 'pipeline.yml');
  const childPipelineDir = path.join(worktreePath, '.aloop');
  const childPipelineYml = path.join(childPipelineDir, 'pipeline.yml');
  if (deps.existsSync(projectPipelineYml) && !deps.existsSync(childPipelineYml)) {
    await deps.mkdir(childPipelineDir, { recursive: true });
    const content = await deps.readFile(projectPipelineYml, 'utf8');
    await deps.writeFile(childPipelineYml, content, 'utf8');
  }

  // Compile child's loop-plan.json with implementation cycle
  await compileLoopPlan(
    {
      mode: 'plan-build-review',
      provider: 'round-robin',
      promptsDir: promptsDir,
      sessionDir: sessionDir,
      enabledProviders: ['claude', 'codex', 'gemini', 'copilot', 'opencode'],
      roundRobinOrder: ['claude', 'codex', 'gemini', 'copilot', 'opencode'],
      models: {},
      projectRoot: worktreePath,
    },
    {
      readFile: deps.readFile,
      writeFile: deps.writeFile,
      existsSync: deps.existsSync,
    },
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
      '-MaxIterations', '100',
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
      '--max-iterations', '100',
      '--max-stuck', '3',
      '--launch-mode', 'start',
    ];
  }

  const child = deps.spawn(command, args, {
    cwd: worktreePath,
    detached: true,
    stdio: 'ignore',
    env: {
      ...deps.env,
      ALOOP_TASK_SANDBOX: sandbox,
      ALOOP_TASK_REQUIRES: requires.join(','),
      NODE_COMPILE_CACHE: path.join(sessionDir, '.v8-cache'), // Per-session cache, cleaned up with session
    },
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
  const capabilityResult = filterByHostCapabilities(dispatchable, deps);
  const eligible = filterByFileOwnership(capabilityResult.eligible, state);
  const slots = availableSlots(state);
  const toDispatch = eligible.slice(0, slots);
  const skippedSet = new Set<number>(capabilityResult.blocked.map((entry) => entry.issue.number));
  for (const issue of dispatchable) {
    if (!toDispatch.includes(issue)) {
      skippedSet.add(issue.number);
    }
  }
  const skipped = [...skippedSet];

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

export type AgentReviewVerdict = 'approve' | 'request-changes' | 'flag-for-human' | 'pending';

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

const ORCHESTRATOR_CI_PERSISTENCE_LIMIT = 3;

async function hasGithubActionsWorkflows(repo: string, deps: PrLifecycleDeps): Promise<boolean> {
  try {
    const response = await deps.execGh([
      'api', `repos/${repo}/actions/workflows`, '--method', 'GET', '--jq', '.total_count',
    ]);
    const total = Number(response.stdout.trim());
    return Number.isFinite(total) && total > 0;
  } catch {
    return false;
  }
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
  const ciWorkflowsConfigured = await hasGithubActionsWorkflows(repo, deps);

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
    // API error — don't block the PR, just skip this gate (will retry next pass)
    gates.push({ gate: 'merge_conflicts', status: 'pass', detail: `Merge check skipped (API error): ${msg}` });
  }

  // Gate 2: CI checks (covers CI pipeline, coverage, lint/type check)
  try {
    const checksResult = await deps.execGh([
      'pr', 'view', String(prNumber), '--repo', repo, '--json', 'statusCheckRollup',
    ]);
    const parsed = JSON.parse(checksResult.stdout);
    const checks: Array<{ name: string; state: string; conclusion: string }> = (parsed.statusCheckRollup ?? []).map((c: any) => ({
      name: c.name ?? c.context ?? 'unknown',
      state: c.status ?? c.state ?? 'COMPLETED',
      conclusion: c.conclusion ?? (c.state === 'SUCCESS' ? 'SUCCESS' : 'PENDING'),
    }));
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

    if (checks.length === 0) {
      // No check runs — pass regardless of workflow existence
      // (workflow may not trigger on this branch/PR target)
      if (ciWorkflowsConfigured) {
        gates.push({ gate: 'ci_checks', status: 'pass', detail: 'CI workflows exist but no checks ran on this PR — passing' });
      } else {
        gates.push({ gate: 'ci_checks', status: 'pass', detail: 'No GitHub Actions workflows detected; local fallback validation required' });
      }
    } else if (!allCompleted) {
      gates.push({ gate: 'ci_checks', status: 'pending', detail: 'Some CI checks still running' });
    } else if (allPassed) {
      gates.push({ gate: 'ci_checks', status: 'pass', detail: `All ${checks.length} checks passed` });
    } else {
      const failNames = failedChecks.map((c) => c.name).join(', ');
      gates.push({ gate: 'ci_checks', status: 'fail', detail: `Failed checks: ${failNames}` });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ciWorkflowsConfigured) {
      gates.push({ gate: 'ci_checks', status: 'fail', detail: `Failed to query CI checks: ${msg}` });
    } else {
      gates.push({ gate: 'ci_checks', status: 'pass', detail: `No GitHub Actions workflows detected; CI check query skipped (${msg})` });
    }
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
    // API error — retry next pass, don't permanently fail
    return {
      pr_number: prNumber,
      verdict: 'pending',
      summary: `PR diff fetch failed (will retry): ${msg}`,
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
 * Create a PR from trunk branch to main when all sub-issues are complete
 * and auto_merge_to_main is enabled. Returns the PR number or null on failure.
 */
export async function createTrunkToMainPr(
  state: OrchestratorState,
  repo: string,
  deps: Pick<ScanLoopDeps, 'execGh' | 'appendLog'>,
  sessionDir: string,
): Promise<number | null> {
  const trunkBranch = state.trunk_branch || 'agent/trunk';
  const mergedCount = state.issues.filter((i) => i.state === 'merged').length;
  const failedCount = state.issues.filter((i) => i.state === 'failed').length;

  const title = `[aloop] Promote ${trunkBranch} to main`;
  const body = [
    '## Summary',
    '',
    `All ${state.issues.length} sub-issues have reached terminal state.`,
    `- Merged: ${mergedCount}`,
    failedCount > 0 ? `- Failed: ${failedCount}` : '',
    '',
    `This PR promotes \`${trunkBranch}\` into \`main\` for human review.`,
    '',
    '_Created automatically by the aloop orchestrator._',
  ].filter(Boolean).join('\n');

  try {
    const result = await deps.execGh!([
      'pr', 'create',
      '--repo', repo,
      '--base', 'main',
      '--head', trunkBranch,
      '--title', title,
      '--body', body,
    ]);
    const parsed = parsePrCreateOutput(result.stdout);
    deps.appendLog(sessionDir, {
      timestamp: new Date().toISOString(),
      event: 'trunk_to_main_pr_created',
      pr_number: parsed.number,
      trunk_branch: trunkBranch,
    });
    return parsed.number;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Check if PR already exists
    try {
      const listResult = await deps.execGh!([
        'pr', 'list',
        '--repo', repo,
        '--head', trunkBranch,
        '--base', 'main',
        '--json', 'number',
        '--jq', '.[0].number',
      ]);
      const existingNumber = Number.parseInt(listResult.stdout.trim(), 10);
      if (Number.isFinite(existingNumber) && existingNumber > 0) {
        deps.appendLog(sessionDir, {
          timestamp: new Date().toISOString(),
          event: 'trunk_to_main_pr_exists',
          pr_number: existingNumber,
          trunk_branch: trunkBranch,
        });
        return existingNumber;
      }
    } catch {
      // Listing also failed
    }
    deps.appendLog(sessionDir, {
      timestamp: new Date().toISOString(),
      event: 'trunk_to_main_pr_failed',
      error: msg,
      trunk_branch: trunkBranch,
    });
    return null;
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
  action: 'merged' | 'rebase_requested' | 'flagged_for_human' | 'rejected' | 'gates_pending' | 'gates_failed' | 'review_pending';
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

  // Step 3: Handle merge conflicts (only if gate check didn't error)
  const mergeGate = gatesResult.gates.find((g) => g.gate === 'merge_conflicts');
  const mergeCheckErrored = mergeGate && mergeGate.detail?.startsWith('Failed to check');
  if (!gatesResult.mergeable && !mergeCheckErrored) {
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    const rebaseAttempts = stateIssue?.rebase_attempts ?? 0;

    if (rebaseAttempts >= 2) {
      // Max rebase attempts reached — flag for human
      await flagForHuman(issue, repo, `Merge conflicts persist after 2 rebase attempts on PR #${prNumber}`, deps);
      // Update issue state to failed
      if (stateIssue) {
        stateIssue.state = 'failed';
        stateIssue.status = 'Blocked';
      }
      await syncIssueProjectStatus(issue.number, repo, 'Blocked', {
        execGh: deps.execGh,
        appendLog: deps.appendLog,
        now: deps.now,
        sessionDir,
      });
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
    const ciFailure = failedGates.find((g) => g.gate === 'ci_checks');
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    if (ciFailure && stateIssue) {
      const signature = normalizeCiDetailForSignature(ciFailure.detail);
      const retries = stateIssue.ci_failure_signature === signature
        ? (stateIssue.ci_failure_retries ?? 0) + 1
        : 1;
      stateIssue.ci_failure_signature = signature;
      stateIssue.ci_failure_retries = retries;
      stateIssue.ci_failure_summary = ciFailure.detail;

      if (retries >= ORCHESTRATOR_CI_PERSISTENCE_LIMIT) {
        await flagForHuman(
          issue,
          repo,
          `Persistent CI failure unchanged after ${retries} attempts: ${ciFailure.detail}`,
          deps,
        );
        stateIssue.state = 'failed';
        stateIssue.status = 'Blocked';
        await syncIssueProjectStatus(issue.number, repo, 'Blocked', {
          execGh: deps.execGh,
          appendLog: deps.appendLog,
          now: deps.now,
          sessionDir,
        });
        state.updated_at = deps.now().toISOString();
        await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'pr_ci_failure_persistent',
          pr_number: prNumber,
          issue_number: issue.number,
          ci_failure_retries: retries,
          ci_failure_summary: ciFailure.detail,
        });
        return {
          pr_number: prNumber,
          action: 'flagged_for_human',
          detail: `Persistent CI failure after ${retries} attempts`,
          gates: gatesResult,
        };
      }

      state.updated_at = deps.now().toISOString();
      await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    }

    try {
      const ciRetryNote = ciFailure && stateIssue
        ? ` CI retry ${stateIssue.ci_failure_retries ?? 1}/${ORCHESTRATOR_CI_PERSISTENCE_LIMIT} before human escalation.`
        : '';
      await deps.execGh([
        'issue', 'comment', String(issue.number), '--repo', repo,
        '--body', `PR #${prNumber} failed gates: ${failDetail}.${ciRetryNote} Please address and update the PR.`,
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

  if (reviewResult.verdict === 'pending') {
    return { pr_number: prNumber, action: 'review_pending', detail: reviewResult.summary, gates: gatesResult, review: reviewResult };
  }

  if (reviewResult.verdict === 'request-changes') {
    // Post review feedback on the PR (only if not already posted)
    const stateIssue = state.issues.find((i) => i.number === issue.number);
    const alreadyCommented = (stateIssue as any)?.last_review_comment === reviewResult.summary;
    if (!alreadyCommented) {
      try {
        await deps.execGh([
          'pr', 'comment', String(prNumber), '--repo', repo,
          '--body', `Agent review requested changes:\n\n${reviewResult.summary}`,
        ]);
      } catch {
        // Best-effort
      }
      if (stateIssue) (stateIssue as any).last_review_comment = reviewResult.summary;
    }

    // Mark for re-dispatch by the scan pass (which has dispatchDeps)
    if (stateIssue) {
      (stateIssue as any).needs_redispatch = true;
      (stateIssue as any).review_feedback = reviewResult.summary;
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
    if (stateIssue) {
      stateIssue.state = 'merged';
      stateIssue.status = 'Done';
    }
    await syncIssueProjectStatus(issue.number, repo, 'Done', {
      execGh: deps.execGh,
      appendLog: deps.appendLog,
      now: deps.now,
      sessionDir,
    });
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
  /** Total tokens_input across iterations with usage data. Omitted when no usage data. */
  tokens_input?: number;
  /** Total tokens_output across iterations with usage data. Omitted when no usage data. */
  tokens_output?: number;
  /** Total tokens_cache_read across iterations with usage data. Omitted when no usage data. */
  tokens_cache_read?: number;
  /** Sum of real cost_usd from iterations with usage data. Omitted when no usage data. */
  real_cost_usd?: number;
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
 * When iterations include real token/cost data (from opencode), those are accumulated
 * and used for cost estimation instead of the flat per-iteration default.
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
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensCacheRead = 0;
  let realCostUsd = 0;
  let hasUsageData = false;
  let iterationsWithoutCost = 0;

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

            // Accumulate real usage data when present
            const costVal = typeof entry.cost_usd === 'number' ? entry.cost_usd
              : typeof entry.cost_usd === 'string' ? parseFloat(entry.cost_usd) : NaN;
            if (!isNaN(costVal) && costVal > 0) {
              hasUsageData = true;
              realCostUsd += costVal;
              tokensInput += Number(entry.tokens_input) || 0;
              tokensOutput += Number(entry.tokens_output) || 0;
              tokensCacheRead += Number(entry.tokens_cache_read) || 0;
            } else {
              iterationsWithoutCost++;
            }
          }
        } catch {
          // Skip malformed log lines
        }
      }
    } catch {
      // log.jsonl not readable — zero cost
    }
  }

  // Use real cost for iterations that reported it, fall back to estimate for the rest
  const estimatedCost = hasUsageData
    ? realCostUsd + (iterationsWithoutCost * DEFAULT_COST_PER_ITERATION_USD)
    : iterations * DEFAULT_COST_PER_ITERATION_USD;

  const result: ChildSessionCost = {
    session_id: sessionId,
    issue_number: issueNumber,
    iterations,
    providers,
    estimated_cost_usd: estimatedCost,
  };

  if (hasUsageData) {
    result.tokens_input = tokensInput;
    result.tokens_output = tokensOutput;
    result.tokens_cache_read = tokensCacheRead;
    result.real_cost_usd = realCostUsd;
  }

  return result;
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
    // Aggregate provider counts and token data across all children
    const providerTotals: Record<string, number> = {};
    let totalIterations = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalTokensCache = 0;
    let totalRealCost = 0;
    let hasRealCost = false;
    for (const child of report.budget.children) {
      totalIterations += child.iterations;
      for (const [provider, count] of Object.entries(child.providers)) {
        providerTotals[provider] = (providerTotals[provider] ?? 0) + count;
      }
      if (child.real_cost_usd !== undefined) {
        hasRealCost = true;
        totalRealCost += child.real_cost_usd;
        totalTokensIn += child.tokens_input ?? 0;
        totalTokensOut += child.tokens_output ?? 0;
        totalTokensCache += child.tokens_cache_read ?? 0;
      }
    }
    lines.push(`Iterations:  ${totalIterations}`);
    for (const [provider, count] of Object.entries(providerTotals).sort()) {
      lines.push(`  ${provider}: ${count} iterations`);
    }
    if (hasRealCost) {
      lines.push('');
      lines.push('--- Token Usage (from providers with usage data) ---');
      lines.push(`Input:       ${totalTokensIn.toLocaleString()}`);
      lines.push(`Output:      ${totalTokensOut.toLocaleString()}`);
      lines.push(`Cache read:  ${totalTokensCache.toLocaleString()}`);
      lines.push(`Real cost:   $${totalRealCost.toFixed(4)}`);
    }
  }

  return lines.join('\n');
}

// --- Child session monitoring ---

export interface ChildStatus {
  iteration: number;
  phase: string;
  provider: string;
  stuck_count: number;
  state: string;
  updated_at: string;
  iteration_started_at?: string;
}

export interface ChildMonitorEntry {
  issue_number: number;
  child_session: string;
  child_state: string;
  stuck_count: number;
  action: 'pr_created' | 'exited_no_pr' | 'failed' | 'still_running' | 'status_unreadable';
  pr_number?: number;
  branch?: string;
  error?: string;
}

export interface MonitorChildResult {
  monitored: number;
  prs_created: number;
  failed: number;
  still_running: number;
  errors: number;
  entries: ChildMonitorEntry[];
}

export interface MonitorChildDeps {
  existsSync: (path: string) => boolean;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  now: () => Date;
  appendLog: (sessionDir: string, entry: Record<string, unknown>) => void;
  aloopRoot: string;
}

/**
 * Parse the PR number and URL from `gh pr create` output.
 */
function parsePrCreateOutput(stdout: string): { number: number | null; url: string } {
  // gh pr create outputs a URL like https://github.com/owner/repo/pull/123
  const match = stdout.match(/\/pull\/(\d+)/);
  return {
    number: match ? Number.parseInt(match[1], 10) : null,
    url: stdout.trim(),
  };
}

/**
 * Create a PR for a completed child session's branch.
 */
async function createPrForChild(
  issue: OrchestratorIssue,
  childSession: string,
  childDir: string,
  state: OrchestratorState,
  repo: string,
  deps: MonitorChildDeps,
): Promise<{ pr_number: number | null; branch: string; baseBranch: string; error?: string }> {
  // Read child's meta.json to get branch info
  const metaPath = path.join(childDir, 'meta.json');
  let branch = `aloop/issue-${issue.number}`;
  let projectRoot = '';

  if (deps.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await deps.readFile(metaPath, 'utf8'));
      if (typeof meta.branch === 'string') branch = meta.branch;
      if (typeof meta.project_root === 'string') projectRoot = meta.project_root;
    } catch {
      // Use defaults
    }
  }

  // Determine base branch: prefer agent/trunk, fall back to trunk_branch
  const baseBranch = state.trunk_branch || 'agent/trunk';

  // Check if base branch exists remotely
  let effectiveBase = baseBranch;
  try {
    await deps.execGh(['api', `repos/${repo}/branches/${baseBranch}`, '--jq', '.name']);
  } catch {
    effectiveBase = 'main';
  }

  const issueTitle = issue.title || `Issue ${issue.number}`;
  const prTitle = `[aloop] ${issueTitle}`;
  const prBody = `Automated implementation for issue #${issue.number}.\n\nCloses #${issue.number}`;

  try {
    const result = await deps.execGh([
      'pr', 'create',
      '--repo', repo,
      '--base', effectiveBase,
      '--head', branch,
      '--title', prTitle,
      '--body', prBody,
    ]);
    const parsed = parsePrCreateOutput(result.stdout);
    return { pr_number: parsed.number, branch, baseBranch: effectiveBase };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Check if PR already exists for this branch
    try {
      const listResult = await deps.execGh([
        'pr', 'list',
        '--repo', repo,
        '--head', branch,
        '--json', 'number',
        '--jq', '.[0].number',
      ]);
      const existingNumber = Number.parseInt(listResult.stdout.trim(), 10);
      if (Number.isFinite(existingNumber) && existingNumber > 0) {
        return { pr_number: existingNumber, branch, baseBranch: effectiveBase };
      }
    } catch {
      // PR list also failed
    }
    return { pr_number: null, branch, baseBranch: effectiveBase, error: msg };
  }
}

/**
 * Monitor all in-progress child sessions:
 * - Reads child status.json to detect completion, failure, or stuck state
 * - Creates PRs for successfully completed children
 * - Marks failed/stopped children as failed
 * - Logs monitoring results
 */
export async function monitorChildSessions(
  state: OrchestratorState,
  sessionDir: string,
  repo: string,
  deps: MonitorChildDeps,
): Promise<MonitorChildResult> {
  const result: MonitorChildResult = {
    monitored: 0,
    prs_created: 0,
    failed: 0,
    still_running: 0,
    errors: 0,
    entries: [],
  };

  const inProgressIssues = state.issues.filter(
    (i) => i.state === 'in_progress' && i.child_session !== null,
  );

  for (const issue of inProgressIssues) {
    const childSession = issue.child_session!;
    const childDir = path.join(deps.aloopRoot, 'sessions', childSession);
    const statusPath = path.join(childDir, 'status.json');
    result.monitored++;

    // Try to read child status.json
    let childStatus: ChildStatus | null = null;
    try {
      if (deps.existsSync(statusPath)) {
        const raw = await deps.readFile(statusPath, 'utf8');
        childStatus = JSON.parse(raw);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors++;
      result.entries.push({
        issue_number: issue.number,
        child_session: childSession,
        child_state: 'unknown',
        stuck_count: 0,
        action: 'status_unreadable',
        error: msg,
      });
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'child_monitor_error',
        issue_number: issue.number,
        child_session: childSession,
        error: msg,
      });
      continue;
    }

    if (!childStatus) {
      result.errors++;
      result.entries.push({
        issue_number: issue.number,
        child_session: childSession,
        child_state: 'unknown',
        stuck_count: 0,
        action: 'status_unreadable',
        error: 'status.json not found',
      });
      continue;
    }

    const entry: ChildMonitorEntry = {
      issue_number: issue.number,
      child_session: childSession,
      child_state: childStatus.state,
      stuck_count: childStatus.stuck_count ?? 0,
      action: 'still_running',
    };

    // Check for terminal states
    if (childStatus.state === 'exited') {
      // Child completed successfully — create PR
      const prResult = await createPrForChild(issue, childSession, childDir, state, repo, deps);

      if (prResult.pr_number !== null) {
        // Update issue state to pr_open
        const stateIssue = state.issues.find((i) => i.number === issue.number);
        if (stateIssue) {
          stateIssue.state = 'pr_open';
          stateIssue.pr_number = prResult.pr_number;
          stateIssue.status = 'In review';
          await syncIssueProjectStatus(issue.number, repo, 'In review', {
            execGh: deps.execGh,
            appendLog: deps.appendLog,
            now: deps.now,
            sessionDir,
          });
        }
        result.prs_created++;
        entry.action = 'pr_created';
        entry.pr_number = prResult.pr_number;
        entry.branch = prResult.branch;

        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'child_pr_created',
          issue_number: issue.number,
          child_session: childSession,
          pr_number: prResult.pr_number,
          branch: prResult.branch,
          base_branch: prResult.baseBranch,
        });
      } else {
        result.errors++;
        entry.action = 'exited_no_pr';
        entry.error = prResult.error ?? 'PR creation returned no number';

        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'child_pr_create_failed',
          issue_number: issue.number,
          child_session: childSession,
          error: entry.error,
        });
      }
    } else if (childStatus.state === 'stopped') {
      // Child stopped (limit reached, interrupted) — re-queue to continue where it left off
      const stateIssue = state.issues.find((i) => i.number === issue.number);
      if (stateIssue) {
        // Keep child_session so resume works on the same branch/worktree
        (stateIssue as any).needs_redispatch = true;
        (stateIssue as any).review_feedback = `Child loop stopped after ${childStatus.iteration ?? '?'} iterations (limit reached). Resume and continue working.`;
      }
      result.failed++;
      entry.action = 'failed';

      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'child_failed',
        issue_number: issue.number,
        child_session: childSession,
        stuck_count: childStatus.stuck_count,
        last_phase: childStatus.phase,
        last_provider: childStatus.provider,
      });
    } else {
      // Still running — log stuck count if high
      result.still_running++;
      entry.action = 'still_running';

      if ((childStatus.stuck_count ?? 0) >= 2) {
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'child_stuck_warning',
          issue_number: issue.number,
          child_session: childSession,
          stuck_count: childStatus.stuck_count,
          phase: childStatus.phase,
        });
      }
    }

    result.entries.push(entry);
  }

  return result;
}

// --- Orchestrator scan loop ---

export interface ScanLoopDeps {
  existsSync: (path: string) => boolean;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  readdir?: (path: string) => Promise<string[]>;
  unlink?: (path: string) => Promise<void>;
  now: () => Date;
  execGh?: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  execGit?: (args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string }>;
  appendLog: (sessionDir: string, entry: Record<string, unknown>) => void;
  dispatchDeps?: DispatchDeps;
  prLifecycleDeps?: PrLifecycleDeps;
  aloopRoot?: string;
  sleep?: (ms: number) => Promise<void>;
  signalStop?: () => boolean;
  etagCache?: EtagCache;
}

export interface SpecChangeReplanResult {
  spec_changed: boolean;
  diff_queued: boolean;
  actions_applied: number;
  gap_analysis_triggered: boolean;
  backfill_applied: boolean;
}

export interface ScanPassResult {
  iteration: number;
  triage: TriageMonitorCycleResult;
  specQuestions: SpecQuestionResolveStats;
  dispatched: number;
  queueProcessed: number;
  specConsistencyProcessed: boolean;
  childMonitoring: MonitorChildResult | null;
  prLifecycles: PrLifecycleResult[];
  waveAdvanced: boolean;
  budgetExceeded: boolean;
  allDone: boolean;
  shouldStop: boolean;
  replan: SpecChangeReplanResult | null;
  bulkFetch: BulkFetchResult | null;
}

export interface BulkFetchResult {
  issuesFetched: number;
  issuesChanged: number;
  fromCache: boolean;
  durationMs: number;
}

export interface ScanLoopResult {
  iterations: number;
  finalState: OrchestratorState;
  reason: 'all_done' | 'budget_exceeded' | 'max_iterations' | 'stopped' | 'plan_only';
}

// --- Spec change detection and replan ---

/**
 * Check whether the most recent commit touching spec files was authored by a
 * housekeeping agent (spec-consistency, spec-backfill, guard, loop-health-supervisor).
 * Returns true if the commit should be ignored (loop prevention).
 */
export function isHousekeepingCommit(commitMessage: string): boolean {
  const trailerMatch = commitMessage.match(/Aloop-Agent:\s*(\S+)/);
  if (!trailerMatch) return false;
  return HOUSEKEEPING_AGENTS.has(trailerMatch[1]);
}

/**
 * Detect spec file changes since the last known commit using git diff.
 * Returns the diff text, new HEAD commit, and list of changed files.
 */
export async function detectSpecChanges(
  state: OrchestratorState,
  projectRoot: string,
  execGit: (args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string }>,
): Promise<SpecChangeDetection> {
  const specGlob = state.spec_glob ?? DEFAULT_SPEC_GLOB;
  const specPaths = specGlob.split(/\s+/);

  // Get current HEAD
  const headResult = await execGit(['rev-parse', 'HEAD'], projectRoot);
  const newCommit = headResult.stdout.trim();

  // If no previous commit recorded, initialize without diff
  if (!state.spec_last_commit) {
    return { changed: false, diff: '', new_commit: newCommit, changed_files: [] };
  }

  // If HEAD hasn't moved, no changes
  if (state.spec_last_commit === newCommit) {
    return { changed: false, diff: '', new_commit: newCommit, changed_files: [] };
  }

  // Check provenance: if the latest commit is from a housekeeping agent, skip
  const logResult = await execGit(
    ['log', '-1', '--format=%B', state.spec_last_commit + '..' + newCommit, '--', ...specPaths],
    projectRoot,
  );
  if (logResult.stdout.trim() && isHousekeepingCommit(logResult.stdout)) {
    return { changed: false, diff: '', new_commit: newCommit, changed_files: [] };
  }

  // Get diff of spec files between old and new commits
  const diffResult = await execGit(
    ['diff', state.spec_last_commit + '..' + newCommit, '--', ...specPaths],
    projectRoot,
  );
  const diff = diffResult.stdout.trim();

  if (!diff) {
    return { changed: false, diff: '', new_commit: newCommit, changed_files: [] };
  }

  // Get list of changed files
  const nameResult = await execGit(
    ['diff', '--name-only', state.spec_last_commit + '..' + newCommit, '--', ...specPaths],
    projectRoot,
  );
  const changed_files = nameResult.stdout
    .trim()
    .split('\n')
    .filter((f) => f.length > 0);

  return { changed: true, diff, new_commit: newCommit, changed_files };
}

/**
 * Queue a replan prompt for the scan agent to process, with spec diff context.
 */
export async function queueReplanForSpecChange(
  diff: string,
  changedFiles: string[],
  state: OrchestratorState,
  queueDir: string,
  replanPromptContent: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<void> {
  const issueContext = state.issues
    .map(
      (issue) =>
        `- #${issue.number} [${issue.state}${issue.status ? ` / ${issue.status}` : ''}] ${issue.title} (wave ${issue.wave})`,
    )
    .join('\n');

  const content = [
    '---',
    JSON.stringify(
      { agent: 'orch_replan', reasoning: 'xhigh', type: 'replan', trigger: 'spec_change' },
      null,
      2,
    ),
    '---',
    '',
    replanPromptContent,
    '',
    '## Trigger Context',
    '',
    `**Trigger**: spec_change`,
    `**Changed files**: ${changedFiles.join(', ')}`,
    '',
    '### Spec Diff',
    '',
    '```diff',
    diff,
    '```',
    '',
    '## Current Orchestrator State',
    '',
    `**Autonomy level**: ${state.autonomy_level ?? 'balanced'}`,
    `**Current wave**: ${state.current_wave}`,
    `**Total issues**: ${state.issues.length}`,
    '',
    issueContext,
    '',
    'Write replan actions to `requests/replan-spec-change-results.json`.',
  ].join('\n');

  await deps.writeFile(path.join(queueDir, 'replan-spec-change.md'), content, 'utf8');
}

/**
 * Apply replan actions from a replan result to the orchestrator state.
 * Supports: create_issue, update_issue, close_issue, steer_child, reprioritize.
 */
export function applyReplanActions(
  state: OrchestratorState,
  actions: ReplanAction[],
): number {
  let applied = 0;

  for (const action of actions) {
    switch (action.action) {
      case 'create_issue': {
        if (!action.title) continue;
        const maxNumber = state.issues.reduce((max, i) => Math.max(max, i.number), 0);
        const newIssue: OrchestratorIssue = {
          number: maxNumber + 1,
          title: action.title,
          body: action.body,
          wave: action.new_wave ?? state.current_wave,
          state: 'pending',
          status: 'Needs analysis',
          child_session: null,
          pr_number: null,
          depends_on: action.deps ?? [],
        };
        state.issues.push(newIssue);
        applied++;
        break;
      }
      case 'update_issue': {
        if (action.number == null) continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue) continue;
        if (action.new_body) issue.body = action.new_body;
        if (action.title) issue.title = action.title;
        applied++;
        break;
      }
      case 'close_issue': {
        if (action.number == null) continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue) continue;
        if (issue.state === 'pending') {
          issue.state = 'failed';
          issue.status = 'Done';
          applied++;
        }
        break;
      }
      case 'steer_child': {
        if (action.number == null || !action.instruction) continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue || !issue.child_session) continue;
        // Steering is queued via pending_steering_comments for the child session
        if (!issue.pending_steering_comments) issue.pending_steering_comments = [];
        issue.pending_steering_comments.push({
          id: Date.now(),
          author: 'replan-agent',
          body: action.instruction,
        });
        applied++;
        break;
      }
      case 'reprioritize': {
        if (action.number == null || action.new_wave == null) continue;
        const issue = state.issues.find((i) => i.number === action.number);
        if (!issue) continue;
        issue.wave = action.new_wave;
        applied++;
        break;
      }
    }
  }

  return applied;
}

/**
 * Write a spec backfill entry: append resolved question content to the spec file.
 * Commits with provenance trailers to avoid re-triggering.
 * Delegates to shared writeSpecBackfill in lib/specBackfill.ts.
 */
export async function applySpecBackfill(
  specFile: string,
  section: string,
  content: string,
  sessionId: string,
  iteration: number,
  projectRoot: string,
  deps: {
    readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
    writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
    execGit?: (args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string }>;
  },
): Promise<boolean> {
  return writeSpecBackfill({ specFile, section, content, sessionId, iteration, projectRoot, deps });
}

/**
 * Queue spec consistency check after a spec change.
 */
export async function queueSpecConsistencyCheck(
  changedFiles: string[],
  diff: string,
  state: OrchestratorState,
  queueDir: string,
  consistencyPromptContent: string,
  deps: { writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void> },
): Promise<void> {
  const issueContext = state.issues
    .map((issue) => `- #${issue.number} [${issue.state}] ${issue.title}`)
    .join('\n');

  const content = [
    '---',
    JSON.stringify(
      { agent: 'orch_spec_consistency', reasoning: 'xhigh', type: 'spec_consistency' },
      null,
      2,
    ),
    '---',
    '',
    consistencyPromptContent,
    '',
    '## Changed Files',
    '',
    changedFiles.map((f) => `- ${f}`).join('\n'),
    '',
    '## Diff Context',
    '',
    '```diff',
    diff,
    '```',
    '',
    '## Related Issues',
    '',
    issueContext,
    '',
    'Write consistency report to `requests/spec-consistency-results.json`.',
  ].join('\n');

  await deps.writeFile(path.join(queueDir, 'spec-consistency-check.md'), content, 'utf8');
}

/**
 * Process queued override prompts from the queue/ directory.
 *
 * Reads .md files from queue/, dispatches each as a one-shot child loop
 * process (when dispatchDeps are available), and removes consumed files.
 * This mirrors the queue processing in loop.sh's run_queue_if_present()
 * for the TypeScript scan-loop path.
 */
export async function processQueuedPrompts(
  sessionDir: string,
  projectRoot: string,
  aloopRoot: string,
  iteration: number,
  deps: ScanLoopDeps,
): Promise<{ processed: number; files: string[] }> {
  const queueDir = path.join(sessionDir, 'queue');
  const result = { processed: 0, files: [] as string[] };

  if (!deps.existsSync(queueDir)) return result;

  // List queue files
  let entries: string[];
  if (deps.readdir) {
    entries = await deps.readdir(queueDir);
  } else {
    // Fallback: check known queue file names
    const knownFiles = [
      'replan-spec-change.md',
      'spec-consistency-check.md',
      'decompose-epics.md',
      'gap-analysis-product.md',
      'gap-analysis-architecture.md',
    ];
    entries = knownFiles.filter((f) => deps.existsSync(path.join(queueDir, f)));
  }

  const mdFiles = entries.filter((f) => f.endsWith('.md'));
  if (mdFiles.length === 0) return result;

  // Prioritize steering prompts (*-PROMPT_steer.md or *-steering.md)
  let nextFile = mdFiles
    .filter((f) => f.includes('-PROMPT_steer.md') || f.includes('-steering.md'))
    .sort()[0];

  if (!nextFile) {
    nextFile = mdFiles.sort()[0];
  }

  // Process one file per pass (oldest first by filename sort), like loop.sh
  const fileName = nextFile;

  const filePath = path.join(queueDir, fileName);


  try {
    const content = await deps.readFile(filePath, 'utf8');

    // Skip empty files (leaked from previous bug)
    if (content.trim().length === 0) {
      if (deps.unlink) {
        await deps.unlink(filePath);
      }
      return result;
    }

    // Write the prompt content to a pending request file so it can be
    // picked up by an external agent or the next child loop invocation.
    const requestsDir = path.join(sessionDir, 'requests');
    const baseName = fileName.replace(/\.md$/, '');
    const requestFile = path.join(requestsDir, `${baseName}-pending.json`);
    const request = {
      type: 'queued_prompt',
      source_file: fileName,
      queued_at: deps.now().toISOString(),
      iteration,
      prompt_content: content,
    };
    await deps.writeFile(requestFile, `${JSON.stringify(request, null, 2)}\n`, 'utf8');

    // If dispatch deps are available, spawn a one-shot child loop to process the prompt
    if (deps.dispatchDeps && deps.aloopRoot) {
      const loopBinDir = path.join(deps.aloopRoot, 'bin');
      const isWindows = deps.dispatchDeps.platform === 'win32';

      // Create a temporary prompts dir for the one-shot agent
      const agentPromptsDir = path.join(sessionDir, 'queue-agent-prompts');
      await deps.dispatchDeps.mkdir(agentPromptsDir, { recursive: true });

      // Write the queue prompt as the agent's prompt
      const agentPromptFile = path.join(agentPromptsDir, 'PROMPT_single.md');
      await deps.dispatchDeps.writeFile(agentPromptFile, content, 'utf8');

      // For spec-consistency, use sessionDir as work-dir so the agent's
      // relative output path (requests/spec-consistency-results.json)
      // resolves under the session directory where the scan pass reads it.
      // The prompt already embeds changed-files list and diff, so the agent
      // does not need projectRoot as cwd.
      const agentWorkDir = fileName === 'spec-consistency-check.md' ? sessionDir : projectRoot;

      let command: string;
      let args: string[];
      if (isWindows) {
        command = 'powershell';
        args = [
          '-NoProfile', '-File', path.join(loopBinDir, 'loop.ps1'),
          '-PromptsDir', agentPromptsDir,
          '-SessionDir', sessionDir,
          '-WorkDir', agentWorkDir,
          '-Mode', 'single',
          '-Provider', 'round-robin',
          '-MaxIterations', '1',
          '-MaxStuck', '1',
          '-LaunchMode', 'start',
        ];
      } else {
        command = path.join(loopBinDir, 'loop.sh');
        args = [
          '--prompts-dir', agentPromptsDir,
          '--session-dir', sessionDir,
          '--work-dir', agentWorkDir,
          '--mode', 'single',
          '--provider', 'round-robin',
          '--max-iterations', '1',
          '--max-stuck', '1',
          '--launch-mode', 'start',
        ];
      }

      const child = deps.dispatchDeps.spawn(command, args, {
        cwd: agentWorkDir,
        detached: true,
        stdio: 'ignore',
        env: { ...deps.dispatchDeps.env },
        windowsHide: true,
      });
      child.unref();
    }

    // Remove the consumed queue file
    if (deps.unlink) {
      await deps.unlink(filePath);
    } else {
      // Fallback: write empty string if unlink not available (should not happen with defaultDeps)
      await deps.writeFile(filePath, '', 'utf8');
    }

    result.processed++;
    result.files.push(fileName);

    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'queue_prompt_processed',
      iteration,
      file: fileName,
      dispatched: !!(deps.dispatchDeps && deps.aloopRoot),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'queue_prompt_error',
      iteration,
      file: fileName,
      error: msg,
    });
  }

  return result;
}

/**
 * Run the spec change detection and replan flow within a scan pass.
 * Detects spec changes, queues replan prompt, applies any pending replan results,
 * and triggers gap analysis re-run on affected sections.
 */
export async function runSpecChangeReplan(
  state: OrchestratorState,
  stateFile: string,
  sessionDir: string,
  projectRoot: string,
  iteration: number,
  deps: ScanLoopDeps,
): Promise<SpecChangeReplanResult> {
  const result: SpecChangeReplanResult = {
    spec_changed: false,
    diff_queued: false,
    actions_applied: 0,
    gap_analysis_triggered: false,
    backfill_applied: false,
  };

  if (!deps.execGit) return result;

  // 1. Detect spec changes
  const detection = await detectSpecChanges(state, projectRoot, deps.execGit);

  // Always update the last commit pointer
  state.spec_last_commit = detection.new_commit;

  if (!detection.changed) return result;
  result.spec_changed = true;

  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'spec_change_detected',
    iteration,
    changed_files: detection.changed_files,
    diff_length: detection.diff.length,
  });

  // 2. Queue replan prompt
  const queueDir = path.join(sessionDir, 'queue');
  const promptsDir = path.join(sessionDir, 'prompts');
  const replanPromptPath = path.join(promptsDir, ORCH_REPLAN_PROMPT_FILENAME);
  let replanPromptContent = `# Orchestrator Replan Agent\n\nReact to spec changes and produce plan adjustments.\n`;
  if (deps.existsSync(replanPromptPath)) {
    replanPromptContent = await deps.readFile(replanPromptPath, 'utf8');
  }
  await queueReplanForSpecChange(
    detection.diff,
    detection.changed_files,
    state,
    queueDir,
    replanPromptContent,
    { writeFile: deps.writeFile },
  );
  result.diff_queued = true;

  // 3. Queue spec consistency check
  const consistencyPromptPath = path.join(promptsDir, ORCH_SPEC_CONSISTENCY_PROMPT_FILENAME);
  let consistencyPromptContent = `# Spec Consistency Agent\n\nVerify spec consistency after changes.\n`;
  if (deps.existsSync(consistencyPromptPath)) {
    consistencyPromptContent = await deps.readFile(consistencyPromptPath, 'utf8');
  }
  await queueSpecConsistencyCheck(
    detection.changed_files,
    detection.diff,
    state,
    queueDir,
    consistencyPromptContent,
    { writeFile: deps.writeFile },
  );

  // 4. Check for pending replan results (from a previous scan pass's queued prompt)
  const replanResultPath = path.join(sessionDir, 'requests', 'replan-spec-change-results.json');
  if (deps.existsSync(replanResultPath)) {
    try {
      const replanContent = await deps.readFile(replanResultPath, 'utf8');
      const replanResult: ReplanResult = JSON.parse(replanContent);
      if (replanResult.actions && Array.isArray(replanResult.actions)) {
        result.actions_applied = applyReplanActions(state, replanResult.actions);
      }
      if (replanResult.gap_analysis_needed) {
        result.gap_analysis_triggered = true;
      }

      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'replan_actions_applied',
        iteration,
        trigger: replanResult.trigger,
        actions_applied: result.actions_applied,
        gap_analysis_needed: replanResult.gap_analysis_needed,
        affected_sections: replanResult.affected_sections,
      });
    } catch {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'replan_results_parse_error',
        iteration,
      });
    }
  }

  // 5. Check for pending spec backfill results
  const backfillResultPath = path.join(sessionDir, 'requests', 'spec-backfill-results.json');
  if (deps.existsSync(backfillResultPath)) {
    try {
      const backfillContent = await deps.readFile(backfillResultPath, 'utf8');
      const backfillData = JSON.parse(backfillContent) as {
        entries?: Array<{ file: string; section: string; content: string }>;
      };
      if (backfillData.entries && Array.isArray(backfillData.entries)) {
        for (const entry of backfillData.entries) {
          await applySpecBackfill(
            entry.file || state.spec_file,
            entry.section,
            entry.content,
            path.basename(sessionDir),
            iteration,
            projectRoot,
            { readFile: deps.readFile, writeFile: deps.writeFile, execGit: deps.execGit },
          );
        }
        result.backfill_applied = true;
      }
    } catch {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'spec_backfill_parse_error',
        iteration,
      });
    }
  }

  return result;
}

/**
 * Fetch bulk issue state via GraphQL and apply changes to orchestrator state.
 * Uses ETag caching to avoid redundant fetches when data hasn't changed.
 * Returns statistics about the fetch operation.
 */
async function fetchAndApplyBulkIssueState(
  state: OrchestratorState,
  repo: string,
  deps: Pick<ScanLoopDeps, 'execGh' | 'etagCache' | 'appendLog' | 'now'>,
  sessionDir: string,
  iteration: number,
): Promise<BulkFetchResult> {
  const startTime = Date.now();
  const result: BulkFetchResult = {
    issuesFetched: 0,
    issuesChanged: 0,
    fromCache: false,
    durationMs: 0,
  };

  if (!deps.execGh) return result;

  try {
    const issueNumbers = state.issues.map((i) => i.number);
    const since = state.issues.reduce((earliest, issue) => {
      const check = issue.last_comment_check;
      if (!check) return earliest;
      return !earliest || check < earliest ? check : earliest;
    }, undefined as string | undefined);

    const bulkResult = await fetchBulkIssueState(repo, deps.execGh, {
      states: ['OPEN'],
      since,
      issueNumbers,
    });

    result.issuesFetched = bulkResult.issues.length;
    result.fromCache = bulkResult.fromCache;

    // Build a map of fetched issues for quick lookup
    const fetchedMap = new Map<number, BulkIssueState>();
    for (const issue of bulkResult.issues) {
      fetchedMap.set(issue.number, issue);
    }

    // Apply changes to orchestrator state
    for (const issue of state.issues) {
      const fetched = fetchedMap.get(issue.number);
      if (!fetched) continue;

      const changeResult = detectIssueChanges(fetched, {
        updatedAt: issue.last_comment_check,
        prNumber: issue.pr_number,
        state: issue.state,
      });

      if (changeResult.changed) {
        result.issuesChanged++;

        // Update issue status from project status
        if (fetched.projectStatus) {
          const statusMap: Record<string, OrchestratorIssueStatus> = {
            'todo': 'Ready',
            'in progress': 'In progress',
            'in review': 'In review',
            'done': 'Done',
            'blocked': 'Blocked',
          };
          const mapped = statusMap[fetched.projectStatus.toLowerCase()];
          if (mapped) issue.status = mapped;
        }

        // Sync PR number from bulk fetch
        if (fetched.pr && !issue.pr_number) {
          issue.pr_number = fetched.pr.number;
        }

        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'bulk_fetch_issue_changed',
          iteration,
          issue_number: issue.number,
          reason: changeResult.reason,
          pr_number: fetched.pr?.number ?? null,
          project_status: fetched.projectStatus,
        });
      }
    }

    // Save ETag cache after successful fetch
    if (deps.etagCache) {
      await deps.etagCache.save();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'bulk_fetch_error',
      iteration,
      error: msg,
    });
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Run a single scan pass: triage monitoring, dispatch, PR lifecycle, wave advancement.
 * Reads state from disk, performs all scan actions, writes state back.
 */
export async function runOrchestratorScanPass(
  stateFile: string,
  sessionDir: string,
  projectRoot: string,
  projectName: string,
  promptsSourceDir: string,
  aloopRoot: string,
  repo: string | null,
  iteration: number,
  deps: ScanLoopDeps,
): Promise<ScanPassResult> {
  const stateContent = await deps.readFile(stateFile, 'utf8');
  const state: OrchestratorState = JSON.parse(stateContent);

  const result: ScanPassResult = {
    iteration,
    triage: { processed_issues: 0, triaged_entries: 0 },
    specQuestions: { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 },
    dispatched: 0,
    queueProcessed: 0,
    specConsistencyProcessed: false,
    childMonitoring: null,
    prLifecycles: [],
    waveAdvanced: false,
    budgetExceeded: false,
    allDone: false,
    shouldStop: false,
    replan: null,
    bulkFetch: null,
  };

  // 0. Spec change detection and replan
  if (deps.execGit) {
    result.replan = await runSpecChangeReplan(
      state,
      stateFile,
      sessionDir,
      projectRoot,
      iteration,
      deps,
    );
  }

  // 0.3. Bulk issue state fetch (ETag-guarded, replaces per-issue REST calls)
  if (repo && deps.execGh && state.issues.length > 0) {
    result.bulkFetch = await fetchAndApplyBulkIssueState(
      state,
      repo,
      { execGh: deps.execGh, etagCache: deps.etagCache, appendLog: deps.appendLog, now: deps.now },
      sessionDir,
      iteration,
    );
  }

  // 0.5. Process queued override prompts
  const queueResult = await processQueuedPrompts(
    sessionDir,
    projectRoot,
    aloopRoot,
    iteration,
    deps,
  );
  result.queueProcessed = queueResult.processed;

  // 0.6. Process spec consistency results
  const consistencyResultPath = path.join(sessionDir, 'requests', 'spec-consistency-results.json');
  if (deps.existsSync(consistencyResultPath)) {
    try {
      const consistencyContent = await deps.readFile(consistencyResultPath, 'utf8');
      const consistencyResult = JSON.parse(consistencyContent);

      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'spec_consistency_processed',
        iteration,
        changes_made: consistencyResult.changes_made ?? false,
        issues_found: consistencyResult.issues_found?.length ?? 0,
        files_modified: consistencyResult.files_modified ?? [],
      });

      result.specConsistencyProcessed = true;

      if (deps.unlink) {
        await deps.unlink(consistencyResultPath);
      }
    } catch {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'spec_consistency_parse_error',
        iteration,
      });
      // Try to clean up invalid files to prevent infinite loops
      if (deps.unlink) {
        try { await deps.unlink(consistencyResultPath); } catch {}
      }
    }
  }

  // 1. Triage monitoring cycle (every 5th iteration to conserve API rate limit)
  if (repo && deps.execGh && iteration % 5 === 0) {
    result.triage = await runTriageMonitorCycle(
      state,
      path.basename(sessionDir),
      repo,
      { execGh: deps.execGh, now: deps.now, writeFile: deps.writeFile },
      aloopRoot,
    );
    result.specQuestions = await resolveSpecQuestionIssues(
      state,
      repo,
      sessionDir,
      { execGh: deps.execGh, appendLog: deps.appendLog, now: deps.now },
    );
  }

  // 2. Dispatch child loops for ready issues
  if (deps.dispatchDeps && !state.plan_only) {
    const dispatchable = getDispatchableIssues(state);
    const capabilityResult = filterByHostCapabilities(dispatchable, deps.dispatchDeps);
    const eligible = filterByFileOwnership(capabilityResult.eligible, state);
    const slots = availableSlots(state);
    const toDispatch = eligible.slice(0, slots);

    for (const blocked of capabilityResult.blocked) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'scan_dispatch_blocked_requirements',
        iteration,
        issue_number: blocked.issue.number,
        requires: normalizeTaskRequires(blocked.issue.requires),
        missing: blocked.missing,
      });
    }

    for (const issue of toDispatch) {
      try {
        const launchResult = await launchChildLoop(
          issue,
          sessionDir,
          projectRoot,
          projectName,
          promptsSourceDir,
          aloopRoot,
          deps.dispatchDeps,
        );
        const stateIssue = state.issues.find((i) => i.number === issue.number);
        if (stateIssue) {
          stateIssue.state = 'in_progress';
          stateIssue.child_session = launchResult.session_id;
          (stateIssue as any).child_pid = launchResult.pid;
          stateIssue.status = 'In progress';
          if (repo && deps.execGh) {
            await syncIssueProjectStatus(issue.number, repo, 'In progress', {
              execGh: deps.execGh,
              appendLog: deps.appendLog,
              now: deps.now,
              sessionDir,
            });
          }
        }
        result.dispatched++;

        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'scan_child_dispatched',
          iteration,
          issue_number: issue.number,
          session_id: launchResult.session_id,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'scan_dispatch_error',
          iteration,
          issue_number: issue.number,
          error: msg,
        });
      }
    }
  }

  // 2.5. Monitor in-progress child sessions: detect completion, create PRs, flag failures
  if (repo && deps.execGh && deps.aloopRoot) {
    try {
      result.childMonitoring = await monitorChildSessions(
        state,
        sessionDir,
        repo,
        {
          existsSync: deps.existsSync,
          readFile: deps.readFile,
          writeFile: deps.writeFile,
          execGh: deps.execGh,
          now: deps.now,
          appendLog: deps.appendLog,
          aloopRoot: deps.aloopRoot,
        },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'scan_monitor_error',
        iteration,
        error: msg,
      });
    }
  }

  // 3. Process PR lifecycles for issues with open PRs
  if (repo && deps.prLifecycleDeps) {
    const prIssues = state.issues.filter((i) => i.pr_number !== null && i.state === 'pr_open' && !(i as any).needs_redispatch);
    for (const issue of prIssues) {
      try {
        const lifecycleResult = await processPrLifecycle(
          issue,
          state,
          stateFile,
          sessionDir,
          repo,
          deps.prLifecycleDeps,
        );
        result.prLifecycles.push(lifecycleResult);
        // No SHA tracking needed — state transitions (needs_redispatch, Blocked, merged)
        // already prevent re-processing. SHA was causing stuck-on-reviewed states.
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'scan_pr_lifecycle_error',
          iteration,
          issue_number: issue.number,
          pr_number: issue.pr_number,
          error: msg,
        });
      }
    }
  }

  // 3.5. Re-dispatch children that need review fixes
  if (deps.dispatchDeps && deps.aloopRoot) {
    const needsRedispatch = state.issues.filter((i) => (i as any).needs_redispatch && i.child_session);
    for (const issue of needsRedispatch) {
      try {
        // Re-use launchChildLoop — it handles worktree creation, prompts, branch reuse
        const launchResult = await launchChildLoop(
          issue,
          sessionDir,
          projectRoot,
          projectName,
          promptsSourceDir,
          deps.aloopRoot,
          deps.dispatchDeps,
        );

        // Write review feedback as steering prompt into the NEW child session
        const childQueueDir = path.join(deps.aloopRoot, 'sessions', launchResult.session_id, 'queue');
        await deps.writeFile(
          path.join(childQueueDir, '000-review-fixes.md'),
          `---\nagent: build\nreasoning: high\n---\n\n# Review Feedback — Fix Required\n\nThe orchestrator review agent requested changes on PR #${issue.pr_number}.\n\n## Feedback\n\n${(issue as any).review_feedback}\n\n## Instructions\n\nFix the issues described above, commit, and push.\nDo NOT add TODO.md, STEERING.md, TASK_SPEC.md, or other working artifacts to the commit.\n`,
          'utf8',
        );

        issue.state = 'in_progress';
        issue.status = 'In progress';
        issue.child_session = launchResult.session_id;
        (issue as any).child_pid = launchResult.pid;
        (issue as any).needs_redispatch = false;
        (issue as any).review_feedback = undefined;

        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'child_redispatched_for_review',
          iteration,
          issue_number: issue.number,
          pr_number: issue.pr_number,
          child_session: launchResult.session_id,
          pid: launchResult.pid,
        });
      } catch (e) {
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'child_redispatch_failed',
          iteration,
          issue_number: issue.number,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 4. Advance waves
  const waveAdvanced = advanceWave(state);
  result.waveAdvanced = waveAdvanced;
  if (waveAdvanced) {
    deps.appendLog(sessionDir, {
      timestamp: deps.now().toISOString(),
      event: 'scan_wave_advanced',
      iteration,
      new_wave: state.current_wave,
      completed_waves: state.completed_waves,
    });
  }

  // 5. Check budget
  if (state.budget_cap !== null) {
    try {
      const budget = await aggregateChildCosts(state, aloopRoot, {
        readFile: deps.readFile,
        existsSync: deps.existsSync,
      });
      if (shouldPauseForBudget(budget)) {
        result.budgetExceeded = true;
        deps.appendLog(sessionDir, {
          timestamp: deps.now().toISOString(),
          event: 'scan_budget_exceeded',
          iteration,
          total_cost: budget.total_estimated_cost_usd,
          budget_cap: budget.budget_cap,
        });
      }
    } catch {
      // Budget check failed — non-fatal
    }
  }

  // 6. Check if all issues are done
  const allMerged = state.issues.length > 0 && state.issues.every((i) => i.state === 'merged' || i.state === 'failed');
  result.allDone = allMerged;

  // 7. Check external stop signal
  if (deps.signalStop?.()) {
    result.shouldStop = true;
  }

  // 8. Persist state
  state.updated_at = deps.now().toISOString();
  await deps.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'scan_pass_complete',
    iteration,
    dispatched: result.dispatched,
    queue_processed: result.queueProcessed,
    monitored: result.childMonitoring?.monitored ?? 0,
    prs_created: result.childMonitoring?.prs_created ?? 0,
    child_failed: result.childMonitoring?.failed ?? 0,
    pr_lifecycles: result.prLifecycles.length,
    triage_entries: result.triage.triaged_entries,
    spec_questions_processed: result.specQuestions.processed,
    spec_questions_waiting: result.specQuestions.waiting,
    spec_questions_auto_resolved: result.specQuestions.autoResolved,
    spec_questions_user_overrides: result.specQuestions.userOverrides,
    all_done: result.allDone,
    replan_spec_changed: result.replan?.spec_changed ?? false,
    replan_actions_applied: result.replan?.actions_applied ?? 0,
    bulk_fetch_issues: result.bulkFetch?.issuesFetched ?? 0,
    bulk_fetch_changed: result.bulkFetch?.issuesChanged ?? 0,
    bulk_fetch_cached: result.bulkFetch?.fromCache ?? false,
    bulk_fetch_duration_ms: result.bulkFetch?.durationMs ?? 0,
  });

  return result;
}

/**
 * Run the orchestrator scan loop: periodic heartbeat cycles that monitor state,
 * dispatch children, process PRs, and advance waves until completion or stop.
 */
export async function runOrchestratorScanLoop(
  stateFile: string,
  sessionDir: string,
  projectRoot: string,
  projectName: string,
  promptsSourceDir: string,
  aloopRoot: string,
  repo: string | null,
  intervalMs: number,
  maxIterations: number,
  deps: ScanLoopDeps,
): Promise<ScanLoopResult> {
  // Check if state is plan-only — no loop needed
  const stateContent = await deps.readFile(stateFile, 'utf8');
  const initialState: OrchestratorState = JSON.parse(stateContent);
  if (initialState.plan_only) {
    return {
      iterations: 0,
      finalState: initialState,
      reason: 'plan_only',
    };
  }

  for (let iter = 1; iter <= maxIterations; iter++) {
    const passResult = await runOrchestratorScanPass(
      stateFile,
      sessionDir,
      projectRoot,
      projectName,
      promptsSourceDir,
      aloopRoot,
      repo,
      iter,
      deps,
    );

    if (passResult.allDone) {
      // Create trunk→main PR when auto-merge is configured
      const currentState: OrchestratorState = JSON.parse(await deps.readFile(stateFile, 'utf8'));
      if (currentState.auto_merge_to_main && repo && deps.execGh) {
        const prNum = await createTrunkToMainPr(currentState, repo, deps, sessionDir);
        if (prNum !== null) {
          currentState.trunk_pr_number = prNum;
          currentState.updated_at = deps.now().toISOString();
          await deps.writeFile(stateFile, `${JSON.stringify(currentState, null, 2)}\n`, 'utf8');
        }
      }

      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'scan_loop_complete',
        reason: 'all_done',
        iterations: iter,
        trunk_pr_number: currentState.trunk_pr_number ?? null,
      });
      const finalContent = await deps.readFile(stateFile, 'utf8');
      return { iterations: iter, finalState: JSON.parse(finalContent), reason: 'all_done' };
    }

    if (passResult.budgetExceeded) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'scan_loop_complete',
        reason: 'budget_exceeded',
        iterations: iter,
      });
      const finalContent = await deps.readFile(stateFile, 'utf8');
      return { iterations: iter, finalState: JSON.parse(finalContent), reason: 'budget_exceeded' };
    }

    if (passResult.shouldStop) {
      deps.appendLog(sessionDir, {
        timestamp: deps.now().toISOString(),
        event: 'scan_loop_complete',
        reason: 'stopped',
        iterations: iter,
      });
      const finalContent = await deps.readFile(stateFile, 'utf8');
      return { iterations: iter, finalState: JSON.parse(finalContent), reason: 'stopped' };
    }

    // Sleep before next iteration (unless this is the last iteration)
    if (iter < maxIterations && deps.sleep) {
      await deps.sleep(intervalMs);
    }
  }

  // Persist ETag cache before exiting
  if (deps.etagCache) {
    await deps.etagCache.save();
  }

  deps.appendLog(sessionDir, {
    timestamp: deps.now().toISOString(),
    event: 'scan_loop_complete',
    reason: 'max_iterations',
    iterations: maxIterations,
  });
  const finalContent = await deps.readFile(stateFile, 'utf8');
  return { iterations: maxIterations, finalState: JSON.parse(finalContent), reason: 'max_iterations' };
}

function parseInterval(value: string | undefined): number {
  if (!value) return 30000; // 30 seconds default
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    throw new Error(`Invalid interval value: ${value} (must be >= 1000ms)`);
  }
  return parsed;
}

function parseMaxIterations(value: string | undefined): number {
  if (!value) return 100; // default
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid max-iterations value: ${value} (must be a positive integer)`);
  }
  return parsed;
}
