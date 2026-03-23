import { Command } from 'commander';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startCommandWithDeps, type StartCommandOptions, type StartCommandResult } from './start.js';
import { listActiveSessions, resolveHomeDir, stopSession, type SessionInfo } from './session.js';
import { normalizeCiDetailForSignature } from '../lib/ci-utils.js';
import { withErrorHandling } from '../lib/error-handling.js';

const execFileAsync = promisify(execFile);
const GH_PATH_HARDENING_BLOCK_MESSAGE = 'blocked by aloop PATH hardening';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

function extractGhCliError(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeStderr = (error as { stderr?: unknown }).stderr;
    if (typeof maybeStderr === 'string' && maybeStderr.trim()) {
      return maybeStderr.trim();
    }
  }
  return extractErrorMessage(error);
}

function isPathHardeningBlockedError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const stderr = extractGhCliError(error).toLowerCase();
  const needle = GH_PATH_HARDENING_BLOCK_MESSAGE.toLowerCase();
  return message.includes(needle) || stderr.includes(needle);
}

function getGhBinaryCandidateNames(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    return ['gh.exe', 'gh.cmd', 'gh.bat', 'gh'];
  }
  return ['gh'];
}

export function selectUsableGhBinary(pathValue: string, platform: NodeJS.Platform = process.platform): string | null {
  if (!pathValue.trim()) {
    return null;
  }
  const candidates = getGhBinaryCandidateNames(platform);
  const pathEntries = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    for (const candidateName of candidates) {
      const fullPath = path.join(entry, candidateName);
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) {
        continue;
      }
      if (stats.size <= 1024) {
        try {
          const contents = fs.readFileSync(fullPath, 'utf8');
          if (contents.includes(GH_PATH_HARDENING_BLOCK_MESSAGE)) {
            continue;
          }
        } catch {
          // Ignore unreadable candidate and continue scanning for a real gh binary.
        }
      }
      return fullPath;
    }
  }

  return null;
}

// Exported for test mocking — all gh CLI execution goes through this object
export const ghExecutor = {
  async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('gh', args);
    } catch (error) {
      if (!isPathHardeningBlockedError(error)) {
        throw error;
      }
      // Try current PATH first (skipping shims), then ALOOP_ORIGINAL_PATH
      // which holds the pre-hardening PATH exported by loop.sh/loop.ps1.
      const fallbackBinary =
        selectUsableGhBinary(process.env.PATH ?? '') ??
        selectUsableGhBinary(process.env.ALOOP_ORIGINAL_PATH ?? '');
      if (!fallbackBinary) {
        throw error;
      }
      return execFileAsync(fallbackBinary, args);
    }
  }
};

// Define the gh command
export const ghCommand = new Command('gh')
  .description('Policy-enforced GitHub operations');

export interface GhStartCommandOptions {
  issue: string | number;
  spec?: string;
  provider?: string;
  max?: string | number;
  repo?: string;
  homeDir?: string;
  projectRoot?: string;
  output?: 'json' | 'text';
}

type GhOutputMode = 'json' | 'text';

interface GhStatusCommandOptions {
  homeDir?: string;
  output?: GhOutputMode;
}

interface GhStopCommandOptions {
  issue?: string | number;
  all?: boolean;
  homeDir?: string;
  output?: GhOutputMode;
}

interface GhWatchCommandOptions {
  label?: string[];
  assignee?: string;
  milestone?: string;
  maxConcurrent?: string | number;
  repo?: string;
  interval?: string | number;
  homeDir?: string;
  projectRoot?: string;
  provider?: string;
  max?: string | number;
  output?: GhOutputMode;
  once?: boolean;
}

type GhWatchIssue = {
  number: number;
  title: string;
  url: string;
};

export type GhWatchIssueStatus = 'running' | 'queued' | 'completed' | 'stopped';

export interface GhWatchIssueEntry {
  issue_number: number;
  title?: string | null;
  session_id: string | null;
  branch: string | null;
  repo: string | null;
  pr_number: number | null;
  pr_url: string | null;
  status: GhWatchIssueStatus;
  completion_state: string | null;
  completion_finalized: boolean;
  created_at: string;
  updated_at: string;
  feedback_iteration: number;
  max_feedback_iterations: number;
  processed_comment_ids: number[];
  processed_issue_comment_ids: number[];
  processed_run_ids: number[];
  last_ci_failure_signature?: string | null;
  last_ci_failure_summary?: string | null;
  same_ci_failure_count?: number;
}

interface GhWatchState {
  version: 1;
  issues: Record<string, GhWatchIssueEntry>;
  queue: number[];
}

interface GhWatchCycleSummary {
  started: number[];
  queued: number[];
  active: number;
  tracked: number;
  feedback_resumed: number[];
}

export interface GhStartResult {
  issue: {
    number: number;
    title: string;
    url: string;
    repo: string | null;
  };
  session: {
    id: string;
    dir: string;
    prompts_dir: string;
    work_dir: string;
    branch: string | null;
    worktree: boolean;
    pid: number;
  };
  base_branch: 'agent/main' | 'main';
  pr: { number: number | null; url: string | null } | null;
  issue_comment_posted: boolean;
  completion_state: string | null;
  pending_completion: boolean;
  warnings: string[];
}

interface GhIssueCommentView {
  author?: { login?: string };
  body?: string;
}

interface GhIssueView {
  number: number;
  title: string;
  body?: string;
  url: string;
  labels?: Array<{ name?: string }>;
  comments?: GhIssueCommentView[];
}

interface GhStartDeps {
  startSession: (options: StartCommandOptions) => Promise<StartCommandResult>;
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  readFile: (filePath: string, encoding: BufferEncoding) => string;
  writeFile: (filePath: string, content: string) => void;
  existsSync: (filePath: string) => boolean;
  cwd: () => string;
}

const defaultGhStartDeps: GhStartDeps = {
  startSession: (options) => startCommandWithDeps(options),
  execGh: (args) => ghExecutor.exec(args),
  execGit: (args) => execFileAsync('git', args),
  readFile: (filePath, encoding) => fs.readFileSync(filePath, encoding),
  writeFile: (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
  existsSync: (filePath) => fs.existsSync(filePath),
  cwd: () => process.cwd(),
};

const GH_WATCH_VERSION = 1 as const;
const GH_WATCH_DEFAULT_LABEL = 'aloop';
const GH_WATCH_DEFAULT_INTERVAL_SECONDS = 60;
const GH_WATCH_DEFAULT_MAX_CONCURRENT = 3;
const GH_FEEDBACK_DEFAULT_MAX_ITERATIONS = 5;
const GH_SAME_CI_FAILURE_LIMIT = 3;

export const ghLoopRuntime = {
  listActiveSessions: async (homeDir: string): Promise<SessionInfo[]> => listActiveSessions(homeDir),
  stopSession: async (homeDir: string, sessionId: string): Promise<{ success: boolean; reason?: string }> => stopSession(homeDir, sessionId),
  startIssue: async (options: GhStartCommandOptions): Promise<GhStartResult> => ghStartCommandWithDeps(options),
  now: (): string => new Date().toISOString(),
};

function createEmptyWatchState(): GhWatchState {
  return {
    version: GH_WATCH_VERSION,
    issues: {},
    queue: [],
  };
}

function resolveAloopRoot(homeDir?: string): string {
  return path.join(resolveHomeDir(homeDir), '.aloop');
}

function getWatchStatePath(homeDir?: string): string {
  return path.join(resolveAloopRoot(homeDir), 'watch.json');
}

function normalizeWatchIssueEntry(value: unknown): GhWatchIssueEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const issueNumber = parsePositiveInteger(candidate.issue_number);
  if (!issueNumber) {
    return null;
  }

  const rawStatus = typeof candidate.status === 'string' ? candidate.status : '';
  const status: GhWatchIssueStatus =
    rawStatus === 'running' || rawStatus === 'queued' || rawStatus === 'completed' || rawStatus === 'stopped'
      ? rawStatus
      : 'queued';

  return {
    issue_number: issueNumber,
    title: typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title : null,
    session_id: typeof candidate.session_id === 'string' && candidate.session_id.trim() ? candidate.session_id : null,
    branch: typeof candidate.branch === 'string' && candidate.branch.trim() ? candidate.branch : null,
    repo: typeof candidate.repo === 'string' && candidate.repo.trim() ? candidate.repo : null,
    pr_number: parsePositiveInteger(candidate.pr_number) ?? null,
    pr_url: typeof candidate.pr_url === 'string' && candidate.pr_url.trim() ? candidate.pr_url : null,
    status,
    completion_state: typeof candidate.completion_state === 'string' && candidate.completion_state.trim() ? candidate.completion_state : null,
    completion_finalized: candidate.completion_finalized === true,
    created_at: typeof candidate.created_at === 'string' && candidate.created_at.trim() ? candidate.created_at : ghLoopRuntime.now(),
    updated_at: typeof candidate.updated_at === 'string' && candidate.updated_at.trim() ? candidate.updated_at : ghLoopRuntime.now(),
    feedback_iteration: typeof candidate.feedback_iteration === 'number' && Number.isInteger(candidate.feedback_iteration) && candidate.feedback_iteration >= 0 ? candidate.feedback_iteration : 0,
    max_feedback_iterations: parsePositiveInteger(candidate.max_feedback_iterations) ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: extractPositiveIntegers(candidate.processed_comment_ids),
    processed_issue_comment_ids: extractPositiveIntegers(candidate.processed_issue_comment_ids),
    processed_run_ids: extractPositiveIntegers(candidate.processed_run_ids),
    last_ci_failure_signature: typeof candidate.last_ci_failure_signature === 'string' && candidate.last_ci_failure_signature.trim()
      ? candidate.last_ci_failure_signature
      : null,
    last_ci_failure_summary: typeof candidate.last_ci_failure_summary === 'string' && candidate.last_ci_failure_summary.trim()
      ? candidate.last_ci_failure_summary
      : null,
    same_ci_failure_count: typeof candidate.same_ci_failure_count === 'number' && Number.isInteger(candidate.same_ci_failure_count) && candidate.same_ci_failure_count >= 0
      ? candidate.same_ci_failure_count
      : 0,
  };
}


function normalizeWatchState(value: unknown): GhWatchState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyWatchState();
  }

  const record = value as Record<string, unknown>;
  const state = createEmptyWatchState();
  if (Array.isArray(record.queue)) {
    state.queue = record.queue
      .map((entry) => parsePositiveInteger(entry))
      .filter((entry): entry is number => entry !== undefined);
  }

  if (record.issues && typeof record.issues === 'object' && !Array.isArray(record.issues)) {
    for (const [key, rawEntry] of Object.entries(record.issues as Record<string, unknown>)) {
      const normalized = normalizeWatchIssueEntry(rawEntry);
      if (!normalized) {
        continue;
      }
      state.issues[key] = normalized;
    }
  }

  const queueFromEntries = Object.values(state.issues)
    .filter((entry) => entry.status === 'queued')
    .map((entry) => entry.issue_number);

  const mergedQueue = [...state.queue, ...queueFromEntries];
  const seen = new Set<number>();
  state.queue = mergedQueue.filter((issueNumber) => {
    if (seen.has(issueNumber)) {
      return false;
    }
    seen.add(issueNumber);
    return true;
  });

  return state;
}

function loadWatchState(homeDir?: string): GhWatchState {
  const watchPath = getWatchStatePath(homeDir);
  if (!fs.existsSync(watchPath)) {
    return createEmptyWatchState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(watchPath, 'utf8')) as unknown;
    return normalizeWatchState(parsed);
  } catch {
    return createEmptyWatchState();
  }
}

function saveWatchState(homeDir: string | undefined, state: GhWatchState): void {
  const watchPath = getWatchStatePath(homeDir);
  fs.mkdirSync(path.dirname(watchPath), { recursive: true });
  fs.writeFileSync(watchPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parsePositiveIntegerOption(value: unknown, fallback: number, optionName: string): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function watchEntryFromStartResult(result: GhStartResult): GhWatchIssueEntry {
  const now = ghLoopRuntime.now();
  return {
    issue_number: result.issue.number,
    title: result.issue.title || null,
    session_id: result.session.id,
    branch: result.session.branch,
    repo: result.issue.repo,
    pr_number: result.pr?.number ?? null,
    pr_url: result.pr?.url ?? null,
    status: result.pending_completion ? 'running' : 'completed',
    completion_state: result.completion_state,
    completion_finalized: !result.pending_completion,
    created_at: now,
    updated_at: now,
    feedback_iteration: 0,
    max_feedback_iterations: GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: [],
    processed_issue_comment_ids: [],
    processed_run_ids: [],
    last_ci_failure_signature: null,
    last_ci_failure_summary: null,
    same_ci_failure_count: 0,
  };
}

function getRunningTrackedCount(state: GhWatchState): number {
  return Object.values(state.issues).filter((entry) => entry.status === 'running').length;
}

function setWatchEntry(state: GhWatchState, entry: GhWatchIssueEntry): void {
  state.issues[String(entry.issue_number)] = entry;
  state.queue = state.queue.filter((issueNumber) => issueNumber !== entry.issue_number);
}

function enqueueIssue(state: GhWatchState, issue: GhWatchIssue): void {
  const now = ghLoopRuntime.now();
  const existing = state.issues[String(issue.number)];
  if (existing && (existing.status === 'running' || existing.status === 'completed')) {
    return;
  }
  state.issues[String(issue.number)] = {
    issue_number: issue.number,
    title: issue.title || existing?.title || null,
    session_id: existing?.session_id ?? null,
    branch: existing?.branch ?? null,
    repo: existing?.repo ?? extractRepoFromIssueUrl(issue.url),
    pr_number: existing?.pr_number ?? null,
    pr_url: existing?.pr_url ?? null,
    status: 'queued',
    completion_state: existing?.completion_state ?? null,
    completion_finalized: existing?.completion_finalized ?? false,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    feedback_iteration: existing?.feedback_iteration ?? 0,
    max_feedback_iterations: existing?.max_feedback_iterations ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: existing?.processed_comment_ids ?? [],
    processed_issue_comment_ids: existing?.processed_issue_comment_ids ?? [],
    processed_run_ids: existing?.processed_run_ids ?? [],
    last_ci_failure_signature: existing?.last_ci_failure_signature ?? null,
    last_ci_failure_summary: existing?.last_ci_failure_summary ?? null,
    same_ci_failure_count: existing?.same_ci_failure_count ?? 0,
  };
  if (!state.queue.includes(issue.number)) {
    state.queue.push(issue.number);
  }
}


function removeTrackedIssue(state: GhWatchState, issueNumber: number): void {
  delete state.issues[String(issueNumber)];
  state.queue = state.queue.filter((queuedIssue) => queuedIssue !== issueNumber);
}

function readSessionState(homeDir: string | undefined, sessionId: string): string | null {
  const sessionDir = getSessionDir(homeDir, sessionId);
  const statusFile = path.join(sessionDir, 'status.json');
  if (!fs.existsSync(statusFile)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const value = (raw as Record<string, unknown>).state;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

async function refreshWatchState(homeDir: string | undefined, state: GhWatchState): Promise<Map<string, SessionInfo>> {
  const resolvedHomeDir = resolveHomeDir(homeDir);
  const activeSessions = await ghLoopRuntime.listActiveSessions(resolvedHomeDir);
  const byId = new Map<string, SessionInfo>(activeSessions.map((session) => [session.session_id, session]));

  for (const entry of Object.values(state.issues)) {
    if (!entry.session_id || entry.status === 'queued') {
      continue;
    }
    const active = byId.get(entry.session_id);
    if (active) {
      entry.status = 'running';
      entry.updated_at = ghLoopRuntime.now();
      continue;
    }

    const sessionState = readSessionState(homeDir, entry.session_id);
    if (sessionState === 'exited') {
      entry.status = 'completed';
      entry.completion_state = sessionState;
      entry.updated_at = ghLoopRuntime.now();
    } else if (sessionState === 'stopped') {
      entry.status = 'stopped';
      entry.completion_state = sessionState;
      entry.updated_at = ghLoopRuntime.now();
    }
  }

  state.queue = state.queue.filter((issueNumber) => state.issues[String(issueNumber)]?.status === 'queued');
  return byId;
}

function parseGhIssueList(raw: string): GhWatchIssue[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  const issues: GhWatchIssue[] = [];
  for (const value of parsed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const number = parsePositiveInteger(record.number);
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    if (!number || !title || !url) {
      continue;
    }
    issues.push({ number, title, url });
  }
  return issues;
}

async function fetchMatchingIssues(options: GhWatchCommandOptions): Promise<GhWatchIssue[]> {
  const labels = Array.isArray(options.label) && options.label.length > 0 ? options.label : [GH_WATCH_DEFAULT_LABEL];
  const args = ['issue', 'list', '--state', 'open', '--json', 'number,title,url', '--limit', '100'];
  for (const label of labels) {
    if (label.trim()) {
      args.push('--label', label.trim());
    }
  }
  if (typeof options.assignee === 'string' && options.assignee.trim()) {
    args.push('--assignee', options.assignee.trim());
  }
  if (typeof options.milestone === 'string' && options.milestone.trim()) {
    args.push('--milestone', options.milestone.trim());
  }
  if (typeof options.repo === 'string' && options.repo.trim()) {
    args.push('--repo', options.repo.trim());
  }

  try {
    const response = await ghExecutor.exec(args);
    return parseGhIssueList(response.stdout);
  } catch (error) {
    throw new Error(`gh issue list failed: ${extractGhCliError(error)}`);
  }
}

async function launchTrackedIssue(issueNumber: number, options: GhWatchCommandOptions, state: GhWatchState): Promise<GhWatchIssueEntry> {
  const result = await ghLoopRuntime.startIssue({
    issue: issueNumber,
    repo: options.repo,
    homeDir: options.homeDir,
    projectRoot: options.projectRoot,
    provider: options.provider,
    max: options.max,
    output: 'json',
  });
  const entry = watchEntryFromStartResult(result);
  setWatchEntry(state, entry);
  return entry;
}

// --- PR Feedback Loop ---

interface PrReviewComment {
  id: number;
  body: string;
  user?: { login?: string };
  path?: string;
  line?: number;
  state?: string;
}

interface PrIssueComment {
  id: number;
  body: string;
  user?: { login?: string };
}

interface PrCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  log?: string;
}

interface PrFeedback {
  new_comments: PrReviewComment[];
  new_issue_comments: PrIssueComment[];
  failed_checks: PrCheckRun[];
}

function buildCiFailureSignature(failedChecks: PrCheckRun[]): string | null {
  if (failedChecks.length === 0) {
    return null;
  }
  const parts = failedChecks
    .map((check) => {
      const tail = (check.log ?? '')
        .split('\n')
        .slice(-20)
        .join('\n');
      return `${check.name}|${normalizeCiDetailForSignature(tail)}`;
    })
    .sort();
  return parts.join('||');
}

function buildCiFailureSummary(failedChecks: PrCheckRun[]): string {
  if (failedChecks.length === 0) {
    return 'No CI failures detected.';
  }
  const lines = failedChecks.map((check) => {
    const tail = (check.log ?? '')
      .split('\n')
      .slice(-8)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' | ');
    return `- ${check.name}${tail ? `: ${tail}` : ''}`;
  });
  return ['CI failures:', ...lines].join('\n');
}

async function fetchPrReviewComments(repo: string, prNumber: number): Promise<PrReviewComment[]> {
  // Fetch individual review comments via pulls/comments endpoint.
  const commentsResponse = await ghExecutor.exec([
    'api', `repos/${repo}/pulls/${prNumber}/comments`,
    '--method', 'GET',
  ]);

  const parsed = JSON.parse(commentsResponse.stdout || '[]') as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'number' ? entry.id : 0,
      body: typeof entry.body === 'string' ? entry.body : '',
      user: entry.user && typeof entry.user === 'object' ? { login: typeof (entry.user as Record<string, unknown>).login === 'string' ? (entry.user as Record<string, unknown>).login as string : undefined } : undefined,
      path: typeof entry.path === 'string' ? entry.path : undefined,
      line: typeof entry.line === 'number' ? entry.line : undefined,
      state: typeof entry.state === 'string' ? entry.state : undefined,
    }))
    .filter((comment) => comment.id > 0);
}

async function fetchPrIssueComments(repo: string, prNumber: number): Promise<PrIssueComment[]> {
  const response = await ghExecutor.exec([
    'api', `repos/${repo}/issues/${prNumber}/comments`,
    '--method', 'GET',
  ]);

  const parsed = JSON.parse(response.stdout || '[]') as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'number' ? entry.id : 0,
      body: typeof entry.body === 'string' ? entry.body : '',
      user: entry.user && typeof entry.user === 'object' ? { login: typeof (entry.user as Record<string, unknown>).login === 'string' ? (entry.user as Record<string, unknown>).login as string : undefined } : undefined,
    }))
    .filter((comment) => comment.id > 0);
}

async function fetchFailedCheckLogs(repo: string, sha: string): Promise<Map<number, string>> {
  const logs = new Map<number, string>();
  try {
    const runsResponse = await ghExecutor.exec([
      'run', 'list', '--repo', repo, '--commit', sha, '--status', 'failure', '--json', 'databaseId', '--limit', '5'
    ]);
    const runs = JSON.parse(runsResponse.stdout || '[]') as { databaseId: number }[];
    for (const run of runs) {
      try {
        const logResponse = await ghExecutor.exec([
          'run', 'view', String(run.databaseId), '--repo', repo, '--log-failed'
        ]);
        if (logResponse.stdout.trim()) {
          logs.set(run.databaseId, logResponse.stdout.trim());
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return logs;
}

async function fetchPrCheckRuns(repo: string, prNumber: number): Promise<PrCheckRun[]> {
  // Get the PR head SHA first, then check runs for that commit
  const prResponse = await ghExecutor.exec([
    'api', `repos/${repo}/pulls/${prNumber}`,
    '--method', 'GET', '--jq', '.head.sha',
  ]);
  const sha = prResponse.stdout.trim();
  if (!sha) {
    return [];
  }

  const checksResponse = await ghExecutor.exec([
    'api', `repos/${repo}/commits/${sha}/check-runs`,
    '--method', 'GET',
  ]);
  const parsed = JSON.parse(checksResponse.stdout || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const checkRuns = (parsed as Record<string, unknown>).check_runs;
  if (!Array.isArray(checkRuns)) {
    return [];
  }

  const runs: PrCheckRun[] = checkRuns
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'number' ? entry.id : 0,
      name: typeof entry.name === 'string' ? entry.name : '',
      status: typeof entry.status === 'string' ? entry.status : '',
      conclusion: typeof entry.conclusion === 'string' ? entry.conclusion : null,
      html_url: typeof entry.html_url === 'string' ? entry.html_url : undefined,
      log: undefined as string | undefined,
    }))
    .filter((run) => run.id > 0);

  const hasFailures = runs.some(r => r.status === 'completed' && r.conclusion === 'failure');
  if (hasFailures) {
    const logs = await fetchFailedCheckLogs(repo, sha);
    // We don't have a direct mapping from check-run ID to GHA run ID here easily,
    // so we'll just attach the failed logs to any failed check run for context.
    // In practice, buildFeedbackSteering will collect these.
    if (logs.size > 0) {
      const combinedLog = Array.from(logs.values()).join('\n---\n');
      for (const run of runs) {
        if (run.status === 'completed' && run.conclusion === 'failure') {
          run.log = combinedLog;
        }
      }
    }
  }

  return runs;
}

function collectNewFeedback(
  entry: GhWatchIssueEntry,
  reviewComments: PrReviewComment[],
  issueComments: PrIssueComment[],
  checkRuns: PrCheckRun[]
): PrFeedback {
  const processedCommentSet = new Set(entry.processed_comment_ids);
  const processedIssueCommentSet = new Set(entry.processed_issue_comment_ids);
  const processedRunSet = new Set(entry.processed_run_ids);

  const newReviewComments = reviewComments.filter((comment) => !processedCommentSet.has(comment.id));
  const newIssueComments = issueComments
    .filter((comment) => !processedIssueCommentSet.has(comment.id))
    .filter((comment) => comment.body.toLowerCase().includes('@aloop'));

  const failedChecks = checkRuns
    .filter((run) => run.status === 'completed' && run.conclusion === 'failure')
    .filter((run) => !processedRunSet.has(run.id));

  return {
    new_comments: newReviewComments,
    new_issue_comments: newIssueComments,
    failed_checks: failedChecks
  };
}

function hasFeedback(feedback: PrFeedback): boolean {
  return feedback.new_comments.length > 0 || feedback.new_issue_comments.length > 0 || feedback.failed_checks.length > 0;
}

function buildFeedbackSteering(feedback: PrFeedback, prNumber: number): string {
  const parts: string[] = [
    '# PR Feedback — Automated Re-iteration',
    '',
    `PR #${prNumber} received feedback that requires fixes.`,
    '',
  ];

  if (feedback.new_comments.length > 0) {
    parts.push('## Review Comments', '');
    for (const comment of feedback.new_comments) {
      const author = comment.user?.login ?? 'unknown';
      const location = comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ''}` : '';
      parts.push(`### ${author}${location ? ` — \`${location}\`` : ''}`);
      parts.push('');
      parts.push(comment.body.trim());
      parts.push('');
    }
  }

  if (feedback.new_issue_comments.length > 0) {
    parts.push('## Mentions (@aloop)', '');
    for (const comment of feedback.new_issue_comments) {
      const author = comment.user?.login ?? 'unknown';
      parts.push(`### @${author} (comment)`);
      parts.push('');
      parts.push(comment.body.trim());
      parts.push('');
    }
  }

  if (feedback.failed_checks.length > 0) {
    parts.push('## CI Failures', '');
    for (const check of feedback.failed_checks) {
      parts.push(`- **${check.name}** failed${check.html_url ? ` ([view](${check.html_url}))` : ''}`);
      if (check.log) {
        parts.push('');
        parts.push('```');
        // Extract last 200 lines if too long
        const logLines = check.log.split('\n');
        if (logLines.length > 200) {
          parts.push('... (truncated)');
          parts.push(...logLines.slice(-200));
        } else {
          parts.push(check.log);
        }
        parts.push('```');
        parts.push('');
      }
    }
    parts.push('');
    parts.push('Fix the CI failures above. Review the error logs and address root causes.');
    parts.push('');
  }

  parts.push('Address all feedback above, then commit and push.');
  return parts.join('\n');
}

function markFeedbackProcessed(entry: GhWatchIssueEntry, feedback: PrFeedback): void {
  for (const comment of feedback.new_comments) {
    if (!entry.processed_comment_ids.includes(comment.id)) {
      entry.processed_comment_ids.push(comment.id);
    }
  }
  for (const comment of feedback.new_issue_comments) {
    if (!entry.processed_issue_comment_ids.includes(comment.id)) {
      entry.processed_issue_comment_ids.push(comment.id);
    }
  }
  for (const check of feedback.failed_checks) {
    if (!entry.processed_run_ids.includes(check.id)) {
      entry.processed_run_ids.push(check.id);
    }
  }
  entry.feedback_iteration += 1;
  entry.updated_at = ghLoopRuntime.now();
}

async function checkAndApplyPrFeedback(
  entry: GhWatchIssueEntry,
  options: GhWatchCommandOptions,
): Promise<boolean> {
  if (!entry.repo || !entry.pr_number || !entry.session_id) {
    return false;
  }
  if (entry.status !== 'completed') {
    return false;
  }
  if (entry.feedback_iteration >= entry.max_feedback_iterations) {
    return false;
  }

  let reviewComments: PrReviewComment[];
  let issueComments: PrIssueComment[];
  let checkRuns: PrCheckRun[];
  try {
    [reviewComments, issueComments, checkRuns] = await Promise.all([
      fetchPrReviewComments(entry.repo, entry.pr_number),
      fetchPrIssueComments(entry.repo, entry.pr_number),
      fetchPrCheckRuns(entry.repo, entry.pr_number),
    ]);
  } catch {
    return false;
  }

  const feedback = collectNewFeedback(entry, reviewComments, issueComments, checkRuns);
  const ciSignature = buildCiFailureSignature(feedback.failed_checks);
  if (ciSignature) {
    const nextSameFailureCount = entry.last_ci_failure_signature === ciSignature
      ? (entry.same_ci_failure_count ?? 0) + 1
      : 1;
    entry.last_ci_failure_signature = ciSignature;
    entry.last_ci_failure_summary = buildCiFailureSummary(feedback.failed_checks);
    entry.same_ci_failure_count = nextSameFailureCount;
    if (nextSameFailureCount >= GH_SAME_CI_FAILURE_LIMIT) {
      markFeedbackProcessed(entry, feedback);
      entry.status = 'stopped';
      entry.completion_state = 'persistent_ci_failure';
      entry.updated_at = ghLoopRuntime.now();
      const summary = [
        `Auto re-iteration halted for #${entry.issue_number}.`,
        `Same CI failure persisted for ${nextSameFailureCount} consecutive attempts.`,
        entry.last_ci_failure_summary,
        'Please investigate manually and update the branch before resuming.',
      ].join('\n\n');
      try {
        await ghExecutor.exec([
          'issue', 'comment', String(entry.issue_number),
          '--repo', entry.repo,
          '--body', summary,
        ]);
      } catch {
        // Best-effort issue comment.
      }
      return false;
    }
  } else {
    entry.last_ci_failure_signature = null;
    entry.last_ci_failure_summary = null;
    entry.same_ci_failure_count = 0;
  }

  if (!hasFeedback(feedback)) {
    // Even if no feedback matches our triggers, we should mark all seen comments as processed
    // to avoid re-scanning them every cycle.
    let updated = false;
    for (const c of reviewComments) {
      if (!entry.processed_comment_ids.includes(c.id)) {
        entry.processed_comment_ids.push(c.id);
        updated = true;
      }
    }
    for (const c of issueComments) {
      if (!entry.processed_issue_comment_ids.includes(c.id)) {
        entry.processed_issue_comment_ids.push(c.id);
        updated = true;
      }
    }
    if (updated) {
      entry.updated_at = ghLoopRuntime.now();
    }
    return false;
  }

  // Write STEERING.md to the session worktree
  const sessionDir = getSessionDir(options.homeDir, entry.session_id);
  const worktreePath = path.join(sessionDir, 'worktree');
  const steeringPath = path.join(worktreePath, 'STEERING.md');
  const steeringContent = buildFeedbackSteering(feedback, entry.pr_number);

  fs.mkdirSync(path.dirname(steeringPath), { recursive: true });
  fs.writeFileSync(steeringPath, steeringContent, 'utf8');

  // Resume the session by starting a new loop in-place on the worktree
  try {
    await ghLoopRuntime.startIssue({
      issue: entry.issue_number,
      repo: entry.repo,
      homeDir: options.homeDir,
      projectRoot: worktreePath,
      provider: options.provider,
      max: options.max,
      output: 'json',
    });
  } catch {
    // If resume fails, leave steering in place for manual pickup
    return false;
  }

  markFeedbackProcessed(entry, feedback);
  entry.status = 'running';
  return true;
}


export {
  collectNewFeedback,
  hasFeedback,
  buildFeedbackSteering,
  markFeedbackProcessed,
  checkAndApplyPrFeedback,
  fetchPrReviewComments,
  fetchPrCheckRuns,
  GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
  normalizeWatchIssueEntry,
  normalizeWatchState,
  loadWatchState,
  parsePositiveIntegerOption,
  enqueueIssue,
  parseGhIssueList,
  readSessionState,
  refreshWatchState,
  fetchMatchingIssues,
  fetchPrIssueComments,
  fetchFailedCheckLogs,
  finalizeWatchEntry,
  runGhWatchCycle,
  ghWatchCommand,
  ghStatusCommand,
  includesAloopTrackingLabel,
  buildGhArgs,
  parseGhOutput,
  executeGhOperation,
  evaluatePolicy,
  formatGhStatusRows,
  computeGhStats,
  ghStopCommand,
  buildCiFailureSignature,
  buildCiFailureSummary,
};

export type { PrReviewComment, PrCheckRun, PrFeedback };

async function finalizeWatchEntry(
  entry: GhWatchIssueEntry,
  options: GhWatchCommandOptions,
): Promise<boolean> {
  if (!entry.repo || !entry.branch || !entry.session_id || !entry.completion_state) {
    return false;
  }

  const sessionDir = getSessionDir(options.homeDir, entry.session_id);
  const metaPath = path.join(sessionDir, 'meta.json');
  let projectRoot = options.projectRoot ?? process.cwd();
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
      if (typeof meta.project_root === 'string' && meta.project_root.trim()) {
        projectRoot = meta.project_root;
      }
    } catch {
      // ignore
    }
  }

  let issueTitle = `Issue ${entry.issue_number}`;
  try {
    const issueRaw = await ghExecutor.exec(['issue', 'view', String(entry.issue_number), '--json', 'title', '--repo', entry.repo]);
    const issuePayload = JSON.parse(issueRaw.stdout) as { title: string };
    if (issuePayload.title) {
      issueTitle = issuePayload.title;
    }
  } catch {
    // ignore
  }

  let baseBranch: 'agent/main' | 'main' = 'main';
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--verify', 'agent/main']);
    baseBranch = 'agent/main';
  } catch {
    try {
      await execFileAsync('git', ['-C', projectRoot, 'branch', 'agent/main', 'main']);
      baseBranch = 'agent/main';
    } catch {
      baseBranch = 'main';
    }
  }

  const prTitle = `[aloop] ${issueTitle}`;
  const prBody = `Automated implementation for issue #${entry.issue_number}.\n\nCloses #${entry.issue_number}`;

  try {
    const prCreate = await ghExecutor.exec([
      'pr', 'create',
      '--repo', entry.repo,
      '--base', baseBranch,
      '--head', entry.branch,
      '--title', prTitle,
      '--body', prBody,
    ]);
    const pr = parsePrReference(prCreate.stdout);
    if (pr.number !== null) {
      entry.pr_number = pr.number;
      entry.pr_url = pr.url;

      const configPath = path.join(sessionDir, 'config.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
          const createdPrNumbers = extractPositiveIntegers(config.created_pr_numbers);
          const next = new Set<number>(createdPrNumbers);
          next.add(pr.number);
          config.created_pr_numbers = Array.from(next.values());
          config.childCreatedPrNumbers = Array.from(next.values());
          fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        } catch {
          // ignore
        }
      }
    }
  } catch (err: any) {
    try {
      const prList = await ghExecutor.exec([
        'pr', 'list',
        '--repo', entry.repo,
        '--head', entry.branch,
        '--json', 'number,url'
      ]);
      const existing = JSON.parse(prList.stdout) as { number: number; url: string }[];
      if (existing.length > 0) {
        entry.pr_number = existing[0].number;
        entry.pr_url = existing[0].url;
      }
    } catch {
      // ignore
    }
  }

  if (entry.pr_number === null) {
    return false;
  }

  const summary = [
    `Aloop session ${entry.session_id} completed for #${entry.issue_number}.`,
    entry.pr_url ? `Created PR: ${entry.pr_url}` : 'Created PR (URL unavailable).',
    `Branch: ${entry.branch}`,
    `State: ${entry.completion_state}`,
  ].join('\n');

  try {
    await ghExecutor.exec(['issue', 'comment', String(entry.issue_number), '--repo', entry.repo, '--body', summary]);
  } catch {
    return false;
  }

  return true;
}

async function runGhWatchCycle(options: GhWatchCommandOptions): Promise<GhWatchCycleSummary> {
  const maxConcurrent = parsePositiveIntegerOption(options.maxConcurrent, GH_WATCH_DEFAULT_MAX_CONCURRENT, '--max-concurrent');
  const state = loadWatchState(options.homeDir);
  await refreshWatchState(options.homeDir, state);

  const matchedIssues = await fetchMatchingIssues(options);
  for (const issue of matchedIssues) {
    if (!state.issues[String(issue.number)]) {
      enqueueIssue(state, issue);
    }
  }

  // Check completed entries with PRs for feedback re-iteration
  const feedbackResumed: number[] = [];
  const completedWithPr = Object.values(state.issues).filter(
    (entry) => entry.status === 'completed' && entry.pr_number !== null,
  );
  for (const entry of completedWithPr) {
    const resumed = await checkAndApplyPrFeedback(entry, options);
    if (resumed) {
      feedbackResumed.push(entry.issue_number);
    }
  }

  // Check newly completed entries that need PR creation and finalization
  const newlyCompleted = Object.values(state.issues).filter(
    (entry) => (entry.status === 'completed' || entry.status === 'stopped') && isTerminalState(entry.completion_state) && !entry.completion_finalized
  );
  for (const entry of newlyCompleted) {
    const success = await finalizeWatchEntry(entry, options);
    if (success) {
      entry.completion_finalized = true;
      entry.updated_at = ghLoopRuntime.now();
    }
  }

  const started: number[] = [];
  const queued = [...state.queue];
  let running = getRunningTrackedCount(state);

  while (running < maxConcurrent && state.queue.length > 0) {
    const nextIssue = state.queue.shift();
    if (!nextIssue) {
      break;
    }
    const launched = await launchTrackedIssue(nextIssue, options, state);
    started.push(nextIssue);
    if (launched.status === 'running') {
      running += 1;
    }
  }

  saveWatchState(options.homeDir, state);
  return {
    started,
    queued,
    active: running,
    tracked: Object.keys(state.issues).length,
    feedback_resumed: feedbackResumed,
  };
}

async function ghWatchCommand(options: GhWatchCommandOptions): Promise<void> {
  const outputMode = options.output ?? 'text';
  const intervalSeconds = parsePositiveIntegerOption(options.interval, GH_WATCH_DEFAULT_INTERVAL_SECONDS, '--interval');
  const runOnce = options.once === true;

  if (runOnce) {
    const summary = await runGhWatchCycle(options);
    if (outputMode === 'json') {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(`watch cycle complete: started=${summary.started.length} queued=${summary.queued.length} active=${summary.active} tracked=${summary.tracked} feedback_resumed=${summary.feedback_resumed.length}`);
    return;
  }

  let stopping = false;
  const markStopping = (): void => {
    stopping = true;
  };

  process.on('SIGINT', markStopping);
  process.on('SIGTERM', markStopping);

  try {
    while (!stopping) {
      const summary = await runGhWatchCycle(options);
      if (outputMode === 'json') {
        console.log(JSON.stringify(summary));
      } else {
        console.log(`watch cycle complete: started=${summary.started.length} queued=${summary.queued.length} active=${summary.active} tracked=${summary.tracked} feedback_resumed=${summary.feedback_resumed.length}`);
      }
      if (stopping) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
    }
  } finally {
    process.off('SIGINT', markStopping);
    process.off('SIGTERM', markStopping);
  }
}

function failGhWatch(outputMode: GhOutputMode, error: unknown): never {
  const message = `gh watch failed: ${extractGhCliError(error)}`;
  if (outputMode === 'json') {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(message);
  }
  return process.exit(1) as never;
}

const STATUS_COLORS: Record<string, string> = {
  running: '\x1B[33m',
  completed: '\x1B[32m',
  stopped: '\x1B[31m',
};
const ANSI_RESET = '\x1B[0m';

function colorizeStatus(status: string, useTTY: boolean): string {
  if (!useTTY) return status;
  const color = STATUS_COLORS[status];
  return color ? `${color}${status}${ANSI_RESET}` : status;
}

function truncateTitle(title: string | null | undefined, maxLen: number): string {
  if (!title) return '—';
  return title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
}

function formatGhStatusRows(state: GhWatchState, sessionsById: Map<string, SessionInfo>, useTTY?: boolean): string {
  const entries = Object.values(state.issues).sort((a, b) => a.issue_number - b.issue_number);
  if (entries.length === 0) {
    return 'No GH-linked sessions.';
  }

  const isTTY = useTTY ?? (process.stdout.isTTY === true);
  const lines: string[] = [
    'Issue  Title                          Branch                PR    Status      Iteration  Feedback',
  ];
  for (const entry of entries) {
    const branch = entry.status === 'queued' ? '(queued)' : (entry.branch ?? '—');
    const prRef = entry.pr_number ? `#${entry.pr_number}` : '—';
    const session = entry.session_id ? sessionsById.get(entry.session_id) : undefined;
    const iteration = session?.iteration !== null && session?.iteration !== undefined ? String(session.iteration) : '—';
    const issueCell = `#${entry.issue_number}`.padEnd(6);
    const titleCell = truncateTitle(entry.title, 30).padEnd(30);
    const feedbackCell = entry.feedback_iteration > 0
      ? `${entry.feedback_iteration}/${entry.max_feedback_iterations}`
      : '—';
    const statusDisplay = isTTY
      ? `${STATUS_COLORS[entry.status] ?? ''}${entry.status.padEnd(11)}${STATUS_COLORS[entry.status] ? ANSI_RESET : ''}`
      : entry.status.padEnd(11);
    lines.push(`${issueCell} ${titleCell} ${branch.padEnd(20)} ${prRef.padEnd(5)} ${statusDisplay} ${iteration.padEnd(9)} ${feedbackCell}`);
  }
  return lines.join('\n');
}

function computeGhStats(state: GhWatchState): { total: number; active: number; completed: number; prsPending: number } {
  const entries = Object.values(state.issues);
  return {
    total: entries.length,
    active: entries.filter((e) => e.status === 'running').length,
    completed: entries.filter((e) => e.status === 'completed').length,
    prsPending: entries.filter((e) => e.pr_number !== null && e.status !== 'completed').length,
  };
}

async function ghStatusCommand(options: GhStatusCommandOptions): Promise<void> {
  const outputMode = options.output ?? 'text';
  const state = loadWatchState(options.homeDir);
  const sessionsById = await refreshWatchState(options.homeDir, state);
  saveWatchState(options.homeDir, state);

  const entries = Object.values(state.issues).sort((a, b) => a.issue_number - b.issue_number);
  const stats = computeGhStats(state);
  if (outputMode === 'json') {
    console.log(JSON.stringify({ issues: entries, stats }, null, 2));
    return;
  }
  console.log(formatGhStatusRows(state, sessionsById));
  console.log(`\nTotal: ${stats.total}  Active: ${stats.active}  Completed: ${stats.completed}  PRs pending: ${stats.prsPending}`);
}

async function ghStopCommand(options: GhStopCommandOptions): Promise<void> {
  const outputMode = options.output ?? 'text';
  const issueNumber = parsePositiveInteger(options.issue);
  const stopAll = options.all === true;
  if (!stopAll && !issueNumber) {
    throw new Error('gh stop requires either --issue <number> or --all.');
  }
  if (stopAll && issueNumber) {
    throw new Error('gh stop accepts either --issue or --all, not both.');
  }

  const state = loadWatchState(options.homeDir);
  await refreshWatchState(options.homeDir, state);
  const targets = stopAll
    ? Object.values(state.issues)
    : issueNumber
      ? [state.issues[String(issueNumber)]].filter((entry): entry is GhWatchIssueEntry => Boolean(entry))
      : [];

  if (!stopAll && issueNumber && targets.length === 0) {
    throw new Error(`No GH-linked session found for issue #${issueNumber}.`);
  }

  const resolvedHomeDir = resolveHomeDir(options.homeDir);
  const results: Array<{ issue_number: number; session_id: string | null; success: boolean; reason?: string }> = [];
  for (const entry of targets) {
    if (entry.session_id && entry.status === 'running') {
      const stopResult = await ghLoopRuntime.stopSession(resolvedHomeDir, entry.session_id);
      results.push({ issue_number: entry.issue_number, session_id: entry.session_id, success: stopResult.success, reason: stopResult.reason });
    } else {
      results.push({ issue_number: entry.issue_number, session_id: entry.session_id, success: true });
    }
    removeTrackedIssue(state, entry.issue_number);
  }
  saveWatchState(options.homeDir, state);

  const failed = results.filter((result) => !result.success);
  if (outputMode === 'json') {
    console.log(JSON.stringify({ stopped: results, failed: failed.length }, null, 2));
  } else if (results.length === 0) {
    console.log('No GH-linked sessions to stop.');
  } else {
    for (const result of results) {
      if (result.success) {
        console.log(`Stopped GH-linked issue #${result.issue_number}${result.session_id ? ` (${result.session_id})` : ''}.`);
      } else {
        console.log(`Failed to stop issue #${result.issue_number}: ${result.reason ?? 'unknown error'}`);
      }
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

// Common options for gh subcommands
function addGhRequestSubcommand(name: string, description: string) {
  return ghCommand
    .command(name)
    .description(description)
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--request <file>', 'Request JSON file path')
    .option('--role <role>', 'Role: child-loop or orchestrator', 'child-loop')
    .option('--home-dir <dir>', 'Home directory override')
    .action(withErrorHandling(async (options) => {
      await executeGhOperation(name, options);
    }));
}

function addGhSinceSubcommand(name: string, description: string) {
  return ghCommand
    .command(name)
    .description(description)
    .requiredOption('--session <id>', 'Session ID')
    .requiredOption('--since <timestamp>', 'Only return comments created at/after this timestamp (ISO-8601)')
    .option('--role <role>', 'Role: child-loop or orchestrator', 'orchestrator')
    .option('--home-dir <dir>', 'Home directory override')
    .action(withErrorHandling(async (options) => {
      await executeGhOperation(name, options);
    }));
}


ghCommand
  .command('start')
  .description('Start a GitHub-linked aloop session for an issue')
  .requiredOption('--issue <number>', 'GitHub issue number')
  .option('--spec <path>', 'Additional specification file to include in prompt context')
  .option('--provider <provider>', 'Provider override for the launched loop')
  .option('--max <number>', 'Max iteration override')
  .option('--repo <owner/repo>', 'Explicit GitHub repository (defaults to issue URL owner/repo)')
  .option('--project-root <path>', 'Project root override')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(async (options: GhStartCommandOptions) => {
    const result = await ghStartCommandWithDeps(options);
    if (options.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Started GH-linked session ${result.session.id} for issue #${result.issue.number}.`);
    console.log(`Branch: ${result.session.branch}`);
    console.log(`Base branch: ${result.base_branch}`);
    console.log(`Work dir: ${result.session.work_dir}`);
    if (result.pending_completion) {
      console.log('Loop is still running; PR creation and issue summary comment will occur when the session reaches a terminal state.');
    } else if (result.pr?.url) {
      console.log(`PR: ${result.pr.url}`);
      console.log('Posted summary comment back to the source issue.');
    }
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`Warning: ${warning}`);
      }
    }
  }));

ghCommand
  .command('watch')
  .description('Monitor matching issues and start GH-linked loops with queueing')
  .option('--label <label...>', 'Issue labels to match (default: aloop)')
  .option('--assignee <assignee>', 'Only include issues assigned to this user')
  .option('--milestone <milestone>', 'Only include issues in this milestone')
  .option('--max-concurrent <number>', 'Max running GH-linked loops', String(GH_WATCH_DEFAULT_MAX_CONCURRENT))
  .option('--interval <seconds>', 'Polling interval in seconds', String(GH_WATCH_DEFAULT_INTERVAL_SECONDS))
  .option('--repo <owner/repo>', 'Explicit GitHub repository (default: current)')
  .option('--provider <provider>', 'Provider override for spawned loops')
  .option('--max <number>', 'Max iteration override for spawned loops')
  .option('--project-root <path>', 'Project root override for spawned loops')
  .option('--home-dir <path>', 'Home directory override')
  .option('--once', 'Run a single poll cycle and exit')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(async (options: GhWatchCommandOptions) => {
    const outputMode = options.output ?? 'text';
    try {
      await ghWatchCommand(options);
    } catch (error) {
      failGhWatch(outputMode, error);
    }
  });

ghCommand
  .command('status')
  .description('Show GH-linked issue/session/PR state from watch tracking')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(async (options: GhStatusCommandOptions) => {
    await ghStatusCommand(options);
  }));

ghCommand
  .command('stop')
  .description('Stop GH-linked loops for one issue or all tracked issues')
  .option('--issue <number>', 'GitHub issue number to stop')
  .option('--all', 'Stop all tracked GH-linked loops')
  .option('--home-dir <path>', 'Home directory override')
  .option('--output <mode>', 'Output format: json or text', 'text')
  .action(withErrorHandling(async (options: GhStopCommandOptions) => {
    await ghStopCommand(options);
  }));

// Register subcommands
addGhRequestSubcommand('pr-create', 'Create a pull request');
addGhRequestSubcommand('pr-comment', 'Comment on a pull request');
addGhRequestSubcommand('issue-comment', 'Comment on an issue');
addGhRequestSubcommand('issue-create', 'Create an issue (orchestrator only)');
addGhRequestSubcommand('issue-close', 'Close an issue (orchestrator only)');
addGhRequestSubcommand('issue-label', 'Add/remove issue labels (orchestrator only)');
addGhRequestSubcommand('pr-merge', 'Merge a pull request (orchestrator only)');
addGhRequestSubcommand('branch-delete', 'Delete a branch (always rejected)');
addGhSinceSubcommand('issue-comments', 'List issue comments since a timestamp (orchestrator only)');
addGhSinceSubcommand('pr-comments', 'List pull request review comments since a timestamp (orchestrator only)');

type SessionPolicyContext = {
  repo: string;
  assignedIssueNumber?: number;
  childCreatedPrNumbers: number[];
};

function getSessionDir(homeDir: string | undefined, sessionId: string): string {
  const baseHome = homeDir || os.homedir();
  return path.join(baseHome, '.aloop', 'sessions', sessionId);
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}


function sanitizeBranchSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    return 'issue';
  }
  return slug.slice(0, 40).replace(/-+$/g, '');
}

export function extractRepoFromIssueUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/[^\/]+\/([^\/]+)\/([^\/]+)\/issues\/\d+/i);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}

function parsePrReference(raw: string): { number: number | null; url: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { number: null, url: null };
  }
  const match = trimmed.match(/\/pull\/(\d+)/);
  return {
    number: match ? Number.parseInt(match[1], 10) : null,
    url: trimmed,
  };
}

function extractPositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => parsePositiveInteger(value))
    .filter((value): value is number => value !== undefined);
}

function normalizeIssuePayload(payload: unknown, expectedIssueNumber: number): GhIssueView {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid issue payload returned by gh issue view.');
  }

  const issue = payload as Record<string, unknown>;
  const number = parsePositiveInteger(issue.number);
  if (number !== expectedIssueNumber) {
    throw new Error(`gh issue view returned unexpected issue number: ${String(issue.number)}`);
  }

  const title = typeof issue.title === 'string' ? issue.title.trim() : '';
  const url = typeof issue.url === 'string' ? issue.url.trim() : '';
  if (!title || !url) {
    throw new Error('Issue payload is missing required title/url fields.');
  }

  const labels = Array.isArray(issue.labels)
    ? issue.labels
      .filter((entry): entry is { name?: string } => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({ name: typeof entry.name === 'string' ? entry.name : undefined }))
    : [];

  const comments = Array.isArray(issue.comments)
    ? issue.comments
      .filter((entry): entry is { author?: { login?: string }; body?: string } => Boolean(entry) && typeof entry === 'object')
      .map((entry) => ({
        author: entry.author && typeof entry.author === 'object' ? { login: typeof entry.author.login === 'string' ? entry.author.login : undefined } : undefined,
        body: typeof entry.body === 'string' ? entry.body : undefined,
      }))
    : [];

  return {
    number,
    title,
    body: typeof issue.body === 'string' ? issue.body : '',
    url,
    labels,
    comments,
  };
}

function buildIssueContextBlock(issue: GhIssueView, specContent: string | null): string {
  const labels = (issue.labels ?? [])
    .map((label) => label.name)
    .filter((name): name is string => Boolean(name));

  const commentLines = (issue.comments ?? [])
    .slice(-10)
    .map((comment, index) => {
      const author = comment.author?.login ?? 'unknown';
      const body = (comment.body ?? '').trim().replace(/\s+/g, ' ');
      const snippet = body.length > 160 ? `${body.slice(0, 157)}...` : body;
      return `${index + 1}. @${author}: ${snippet}`;
    });

  const parts: string[] = [
    '<!-- aloop-gh-issue-context:start -->',
    '# GitHub Issue Requirements',
    '',
    `Issue: #${issue.number} — ${issue.title}`,
    `URL: ${issue.url}`,
    `Labels: ${labels.length > 0 ? labels.join(', ') : '(none)'}`,
    '',
    '## Issue Body',
    '',
    (issue.body ?? '').trim() || '(empty)',
  ];

  if (commentLines.length > 0) {
    parts.push('', '## Recent Comments', '', ...commentLines);
  }

  if (specContent !== null) {
    parts.push('', '## Additional Spec Context (--spec)', '', specContent.trim() || '(empty)');
  }

  parts.push('', '<!-- aloop-gh-issue-context:end -->', '');
  return parts.join('\n');
}

function upsertIssueContextPrompt(existingContent: string, contextBlock: string): string {
  const pattern = /<!-- aloop-gh-issue-context:start -->[\s\S]*?<!-- aloop-gh-issue-context:end -->\n*/g;
  const stripped = existingContent.replace(pattern, '').trimStart();
  return `${contextBlock}${stripped.endsWith('\n') ? stripped : `${stripped}\n`}`;
}

function isTerminalState(value: unknown): value is 'exited' | 'stopped' {
  return value === 'exited' || value === 'stopped';
}

function loadJsonObject(filePath: string, deps: GhStartDeps): Record<string, unknown> {
  if (!deps.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(deps.readFile(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function ghStartCommandWithDeps(options: GhStartCommandOptions, deps: GhStartDeps = defaultGhStartDeps): Promise<GhStartResult> {
  const issueNumber = parsePositiveInteger(options.issue);
  if (!issueNumber) {
    throw new Error('gh start requires --issue <number>.');
  }

  const warnings: string[] = [];
  const issueViewArgs = ['issue', 'view', String(issueNumber), '--json', 'number,title,body,url,labels,comments'];
  const requestedRepo = typeof options.repo === 'string' && options.repo.trim() ? options.repo.trim() : null;
  if (requestedRepo) {
    issueViewArgs.push('--repo', requestedRepo);
  }
  const issueRaw = await deps.execGh(issueViewArgs);
  const issuePayload = JSON.parse(issueRaw.stdout) as unknown;
  const issue = normalizeIssuePayload(issuePayload, issueNumber);

  const issueRepo = requestedRepo ?? extractRepoFromIssueUrl(issue.url);
  if (!issueRepo) {
    warnings.push('Could not infer repository from issue URL; PR creation/link-back will require --repo.');
  }

  let specContent: string | null = null;
  if (typeof options.spec === 'string' && options.spec.trim()) {
    const specPath = path.isAbsolute(options.spec) ? options.spec : path.join(deps.cwd(), options.spec);
    if (!deps.existsSync(specPath)) {
      throw new Error(`--spec file not found: ${specPath}`);
    }
    specContent = deps.readFile(specPath, 'utf8');
  }

  const started = await deps.startSession({
    projectRoot: options.projectRoot,
    homeDir: options.homeDir,
    provider: options.provider,
    maxIterations: options.max,
  });

  if (!started.worktree || !started.worktree_path || !started.branch) {
    throw new Error('gh start requires a git worktree session. Remove in-place/worktree fallback constraints and retry.');
  }

  const desiredBranch = `agent/issue-${issue.number}-${sanitizeBranchSlug(issue.title)}`;
  if (started.branch !== desiredBranch) {
    await deps.execGit(['-C', started.worktree_path, 'branch', '-m', desiredBranch]);
  }

  const planPromptPath = path.join(started.prompts_dir, 'PROMPT_plan.md');
  if (!deps.existsSync(planPromptPath)) {
    throw new Error(`Missing planner prompt: ${planPromptPath}`);
  }
  const currentPlanPrompt = deps.readFile(planPromptPath, 'utf8');
  const issueContext = buildIssueContextBlock(issue, specContent);
  deps.writeFile(planPromptPath, upsertIssueContextPrompt(currentPlanPrompt, issueContext));

  const metaPath = path.join(started.session_dir, 'meta.json');
  const statusPath = path.join(started.session_dir, 'status.json');
  const configPath = path.join(started.session_dir, 'config.json');

  const meta = loadJsonObject(metaPath, deps);
  meta.branch = desiredBranch;
  meta.gh_issue_number = issue.number;
  meta.gh_issue_url = issue.url;
  meta.gh_repo = issueRepo;
  deps.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  const config = loadJsonObject(configPath, deps);
  const createdPrNumbers = extractPositiveIntegers(config.created_pr_numbers);
  config.repo = issueRepo;
  config.issue_number = issue.number;
  config.assignedIssueNumber = issue.number;
  config.created_pr_numbers = createdPrNumbers;
  config.childCreatedPrNumbers = createdPrNumbers;
  config.role = 'child-loop';
  config.issue_url = issue.url;
  deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  let baseBranch: 'agent/main' | 'main' = 'main';
  const projectRoot = typeof meta.project_root === 'string' && meta.project_root.trim() ? meta.project_root : (options.projectRoot ?? deps.cwd());
  try {
    await deps.execGit(['-C', projectRoot, 'rev-parse', '--verify', 'agent/main']);
    baseBranch = 'agent/main';
  } catch {
    try {
      await deps.execGit(['-C', projectRoot, 'branch', 'agent/main', 'main']);
      baseBranch = 'agent/main';
    } catch {
      warnings.push('Unable to create agent/main from main; PR base will remain main.');
      baseBranch = 'main';
    }
  }

  const status = loadJsonObject(statusPath, deps);
  const completionState = typeof status.state === 'string' ? status.state : null;
  let pr: { number: number | null; url: string | null } | null = null;
  let issueCommentPosted = false;
  let pendingCompletion = true;

  if (isTerminalState(completionState) && issueRepo) {
    const prTitle = `[aloop] ${issue.title}`;
    const prBody = `Automated implementation for issue #${issue.number}.\n\nCloses #${issue.number}`;
    const prCreate = await deps.execGh([
      'pr', 'create',
      '--repo', issueRepo,
      '--base', baseBranch,
      '--head', desiredBranch,
      '--title', prTitle,
      '--body', prBody,
    ]);
    pr = parsePrReference(prCreate.stdout);

    if (pr.number !== null) {
      const next = new Set<number>(createdPrNumbers);
      next.add(pr.number);
      config.created_pr_numbers = Array.from(next.values());
      config.childCreatedPrNumbers = Array.from(next.values());
      deps.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    const summary = [
      `Aloop session ${started.session_id} completed for #${issue.number}.`,
      pr?.url ? `Created PR: ${pr.url}` : 'Created PR (URL unavailable).',
      `Branch: ${desiredBranch}`,
      `State: ${completionState}`,
    ].join('\n');
    await deps.execGh(['issue', 'comment', String(issue.number), '--repo', issueRepo, '--body', summary]);
    issueCommentPosted = true;
    pendingCompletion = false;
  } else {
    pendingCompletion = true;
  }

  const trackedState = loadWatchState(options.homeDir);
  const trackedEntry = watchEntryFromStartResult({
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      repo: issueRepo,
    },
    session: {
      id: started.session_id,
      dir: started.session_dir,
      prompts_dir: started.prompts_dir,
      work_dir: started.work_dir,
      branch: desiredBranch,
      worktree: started.worktree,
      pid: started.pid,
    },
    base_branch: baseBranch,
    pr,
    issue_comment_posted: issueCommentPosted,
    completion_state: completionState,
    pending_completion: pendingCompletion,
    warnings,
  });
  setWatchEntry(trackedState, trackedEntry);
  saveWatchState(options.homeDir, trackedState);

  return {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      repo: issueRepo,
    },
    session: {
      id: started.session_id,
      dir: started.session_dir,
      prompts_dir: started.prompts_dir,
      work_dir: started.work_dir,
      branch: desiredBranch,
      worktree: started.worktree,
      pid: started.pid,
    },
    base_branch: baseBranch,
    pr,
    issue_comment_posted: issueCommentPosted,
    completion_state: completionState,
    pending_completion: pendingCompletion,
    warnings,
  };
}

function includesAloopTrackingLabel(targetLabels: unknown): boolean {
  if (Array.isArray(targetLabels)) {
    return targetLabels.some((label) => label === 'aloop' || label === 'aloop/auto');
  }

  if (typeof targetLabels === 'string') {
    return targetLabels
      .split(',')
      .map((label) => label.trim())
      .some((label) => label === 'aloop' || label === 'aloop/auto');
  }

  return false;
}

function appendLog(sessionDir: string, entry: any) {
  const logFile = path.join(sessionDir, 'log.jsonl');
  const logData = JSON.stringify(entry) + String.fromCharCode(10);
  if (fs.existsSync(sessionDir)) {
    fs.appendFileSync(logFile, logData);
  } else {
    // Scaffold: if session dir doesn't exist, we skip or error out. 
    // We'll just create it for testing purposes if we need to.
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.appendFileSync(logFile, logData);
  }
}

function requiresRequestFile(operation: string): boolean {
  return operation !== 'issue-comments' && operation !== 'pr-comments';
}

function buildGhArgs(operation: string, payload: any, enforced: any): string[] {
  const repo = enforced.repo;

  switch (operation) {
    case 'pr-create': {
      const args = ['pr', 'create', '--repo', repo, '--base', enforced.base];
      if (payload.title) args.push('--title', String(payload.title));
      if (payload.body) args.push('--body', String(payload.body));
      if (payload.head) args.push('--head', String(payload.head));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push('--label', String(label));
        }
      }
      return args;
    }
    case 'pr-comment': {
      const prNum = enforced.pr_number ?? payload.pr_number;
      const args = ['pr', 'comment', String(prNum), '--repo', repo];
      if (payload.body) args.push('--body', String(payload.body));
      return args;
    }
    case 'issue-comment': {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const args = ['issue', 'comment', String(issueNum), '--repo', repo];
      if (payload.body) args.push('--body', String(payload.body));
      return args;
    }
    case 'issue-create': {
      const args = ['issue', 'create', '--repo', repo];
      if (payload.title) args.push('--title', String(payload.title));
      if (payload.body) args.push('--body', String(payload.body));
      if (Array.isArray(payload.labels)) {
        for (const label of payload.labels) {
          args.push('--label', String(label));
        }
      }
      return args;
    }
    case 'issue-close': {
      const issueNum = payload.issue_number;
      return ['issue', 'close', String(issueNum), '--repo', repo];
    }
    case 'issue-label': {
      const issueNum = enforced.issue_number ?? payload.issue_number;
      const action = enforced.label_action ?? payload.label_action;
      const label = enforced.label ?? payload.label;
      const args = ['issue', 'edit', String(issueNum), '--repo', repo];
      if (action === 'add') {
        args.push('--add-label', String(label));
      } else {
        args.push('--remove-label', String(label));
      }
      return args;
    }
    case 'pr-merge': {
      const prNum = payload.pr_number;
      const method = enforced.merge_method ?? payload.strategy ?? 'squash';
      return ['pr', 'merge', String(prNum), '--repo', repo, `--${method}`];
    }
    case 'issue-comments': {
      return ['api', `repos/${repo}/issues/comments`, '--method', 'GET', '-f', `since=${String(enforced.since)}`];
    }
    case 'pr-comments': {
      return ['api', `repos/${repo}/pulls/comments`, '--method', 'GET', '-f', `since=${String(enforced.since)}`];
    }
    default:
      throw new Error(`Cannot build gh args for operation: ${operation}`);
  }
}

function parseGhOutput(operation: string, stdout: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const trimmed = stdout.trim();

  if (operation === 'pr-create') {
    const match = trimmed.match(/\/pull\/(\d+)/);
    if (match) {
      result.pr_number = parseInt(match[1], 10);
    }
    if (trimmed) result.url = trimmed;
  } else if (operation === 'issue-create') {
    const match = trimmed.match(/\/issues\/(\d+)/);
    if (match) {
      result.issue_number = parseInt(match[1], 10);
    }
    if (trimmed) result.url = trimmed;
  } else if (operation === 'issue-comments' || operation === 'pr-comments') {
    const parsed = trimmed ? JSON.parse(trimmed) : [];
    const comments = Array.isArray(parsed) ? parsed : [];
    result.comments = comments;
    result.comment_count = comments.length;
  }

  return result;
}

async function executeGhOperation(operation: string, options: any) {
  const sessionDir = getSessionDir(options.homeDir, options.session);
  const requestFile = options.request;
  const needsRequestFile = requiresRequestFile(operation);
  const role = options.role;

  // Load session config
  let sessionPolicy: SessionPolicyContext;
  const configFile = path.join(sessionDir, 'config.json');
  try {
    if (!fs.existsSync(configFile)) {
      throw new Error(`Session config not found: ${configFile}`);
    }
    const configContent = fs.readFileSync(configFile, 'utf8');
    const config = JSON.parse(configContent);
    if (!config || typeof config.repo !== 'string' || !config.repo.trim()) {
      throw new Error(`Invalid session config: missing or invalid 'repo' in ${configFile}`);
    }

    const assignedIssueNumber = parsePositiveInteger(config.issue_number);
    const childCreatedPrNumbers = Array.isArray(config.created_pr_numbers)
      ? config.created_pr_numbers
        .map((value: unknown) => parsePositiveInteger(value))
        .filter((value: number | undefined): value is number => value !== undefined)
      : [];

    sessionPolicy = {
      repo: config.repo,
      assignedIssueNumber,
      childCreatedPrNumbers,
    };
  } catch (e: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event: 'gh_operation_denied',
      type: operation,
      session: options.session,
      role: role,
      reason: e.message
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  }

  // Read request payload
  let requestPayload: any = {};
  if (needsRequestFile) {
    if (typeof requestFile !== 'string' || !requestFile.trim()) {
      console.error(`Request file not provided for operation: ${operation}`);
      process.exit(1);
    }

    if (fs.existsSync(requestFile)) {
      try {
        requestPayload = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
      } catch (e) {
        console.error(`Failed to parse request file: ${requestFile}`);
        process.exit(1);
      }
    } else {
      console.error(`Request file not found: ${requestFile}`);
      process.exit(1);
    }
  } else {
    requestPayload = {
      since: options.since,
    };
  }

  // Evaluate policy
  const { allowed, reason, enforced } = evaluatePolicy(operation, role, requestPayload, sessionPolicy);

  const timestamp = new Date().toISOString();
  const requestFileName = typeof requestFile === 'string' ? path.basename(requestFile) : undefined;

  if (!allowed) {
    const logEntry = {
      timestamp,
      event: 'gh_operation_denied',
      type: operation,
      session: options.session,
      role: role,
      reason: reason || `${operation} not allowed for ${role} role`
    };
    appendLog(sessionDir, logEntry);
    console.error(JSON.stringify(logEntry));
    process.exit(1);
  } else {
    // Build and execute real gh CLI command
    const ghArgs = buildGhArgs(operation, requestPayload, enforced);

    let ghResult: { stdout: string; stderr: string };
    try {
      ghResult = await ghExecutor.exec(ghArgs);
    } catch (e: any) {
      const errorEntry = {
        timestamp,
        event: 'gh_operation_error',
        type: operation,
        session: options.session,
        role: role,
        request_file: requestFileName,
        error: e.message,
        stderr: e.stderr || '',
        enforced: enforced,
      };
      appendLog(sessionDir, errorEntry);
      console.error(JSON.stringify(errorEntry));
      process.exit(1);
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = parseGhOutput(operation, ghResult.stdout);
    } catch (e: any) {
      const parseErrorEntry: any = {
        timestamp,
        event: 'gh_operation_error',
        type: operation,
        session: options.session,
        role: role,
        error: e.message,
        stderr: ghResult.stderr || '',
        enforced: enforced,
      };
      if (requestFileName) {
        parseErrorEntry.request_file = requestFileName;
      }
      appendLog(sessionDir, parseErrorEntry);
      console.error(JSON.stringify(parseErrorEntry));
      process.exit(1);
    }

    const logEntry: any = {
      timestamp,
      event: 'gh_operation',
      type: operation,
      session: options.session,
      role: role,
      result: 'success',
      enforced: enforced,
      ...parsed,
    };
    if (requestFileName) {
      logEntry.request_file = requestFileName;
    }

    appendLog(sessionDir, logEntry);
    console.log(JSON.stringify(logEntry));
  }
}

function evaluatePolicy(
  operation: string,
  role: string,
  payload: any,
  sessionPolicy: SessionPolicyContext,
): { allowed: boolean, reason?: string, enforced?: any } {
  if (payload.repo && payload.repo !== sessionPolicy.repo) {
    return {
      allowed: false,
      reason: `Mismatched repo: requested ${payload.repo}, but session is bound to ${sessionPolicy.repo}`,
    };
  }

  if (typeof payload.base === 'string' && payload.base.trim().toLowerCase() === 'main') {
    return { allowed: false, reason: 'Operations targeting main are rejected; human must promote to main' };
  }

  if (role === 'child-loop') {
    switch (operation) {
      case 'pr-create':
        return { 
          allowed: true, 
          enforced: { base: 'agent/trunk', repo: sessionPolicy.repo }
        };
      case 'issue-comment': {
        const targetIssueNumber = parsePositiveInteger(payload.issue_number);
        if (targetIssueNumber === undefined) {
          return { allowed: false, reason: 'Child issue-comment requires numeric issue_number' };
        }
        if (sessionPolicy.assignedIssueNumber === undefined) {
          return { allowed: false, reason: 'Child session is missing assigned issue scope in config' };
        }
        if (targetIssueNumber !== sessionPolicy.assignedIssueNumber) {
          return {
            allowed: false,
            reason: `Child issue-comment must target assigned issue #${sessionPolicy.assignedIssueNumber}`,
          };
        }
        return { allowed: true, enforced: { issue_number: sessionPolicy.assignedIssueNumber, repo: sessionPolicy.repo } };
      }
      case 'pr-comment': {
        const targetPrNumber = parsePositiveInteger(payload.pr_number);
        if (targetPrNumber === undefined) {
          return { allowed: false, reason: 'Child pr-comment requires numeric pr_number' };
        }
        if (!sessionPolicy.childCreatedPrNumbers.includes(targetPrNumber)) {
          return {
            allowed: false,
            reason: `Child pr-comment must target a PR created by this session (${targetPrNumber} is out of scope)`,
          };
        }
        return { allowed: true, enforced: { pr_number: targetPrNumber, repo: sessionPolicy.repo } };
      }
      case 'pr-merge':
      case 'issue-create':
      case 'issue-close':
      case 'issue-label':
      case 'issue-comments':
      case 'pr-comments':
      case 'branch-delete':
        return { allowed: false, reason: `${operation} not allowed for child-loop role` };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  } else if (role === 'orchestrator') {
    switch (operation) {
      case 'issue-create':
        if (!includesAloopTrackingLabel(payload.labels)) {
           return { allowed: false, reason: 'Must include aloop tracking label' };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'issue-close':
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: 'issue-close requires aloop-scoped target validation' };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'pr-create':
        return { allowed: true, enforced: { base: 'agent/trunk', repo: sessionPolicy.repo } };
      case 'pr-merge':
        // Only to agent/trunk, only squash merge
        return { allowed: true, enforced: { base: 'agent/trunk', merge_method: 'squash', repo: sessionPolicy.repo } };
      case 'issue-label': {
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: 'issue-label requires aloop-scoped target validation' };
        }
        const issueNumber = parsePositiveInteger(payload.issue_number);
        if (issueNumber === undefined) {
          return { allowed: false, reason: 'issue-label requires numeric issue_number' };
        }
        const action = payload.label_action;
        if (action !== 'add' && action !== 'remove') {
          return { allowed: false, reason: 'issue-label requires label_action: add or remove' };
        }
        if (payload.label !== 'aloop/blocked-on-human') {
          return { allowed: false, reason: 'issue-label only permits aloop/blocked-on-human' };
        }
        return {
          allowed: true,
          enforced: {
            repo: sessionPolicy.repo,
            issue_number: issueNumber,
            label_action: action,
            label: 'aloop/blocked-on-human',
          }
        };
      }
      case 'issue-comments':
      case 'pr-comments':
        if (typeof payload.since !== 'string' || !payload.since.trim()) {
          return { allowed: false, reason: `${operation} requires --since timestamp` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo, since: payload.since.trim() } };
      case 'pr-comment':
      case 'issue-comment':
        if (!includesAloopTrackingLabel(payload.target_labels)) {
          return { allowed: false, reason: `${operation} requires aloop-scoped target validation` };
        }
        return { allowed: true, enforced: { repo: sessionPolicy.repo } };
      case 'branch-delete':
        return { allowed: false, reason: 'branch-delete rejected - cleanup is manual' };
      default:
        return { allowed: false, reason: `Unknown operation: ${operation}` };
    }
  }

  return { allowed: false, reason: `Unknown role: ${role}` };
}
