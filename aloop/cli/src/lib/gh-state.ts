import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listActiveSessions, resolveHomeDir, stopSession, type SessionInfo } from '../commands/session.js';

export const GH_WATCH_VERSION = 1 as const;
export const GH_FEEDBACK_DEFAULT_MAX_ITERATIONS = 5;
export const GH_WATCH_DEFAULT_MAX_CONCURRENT = 3;

export type GhWatchIssueStatus = 'running' | 'queued' | 'completed' | 'stopped';

export interface GhWatchIssueEntry {
  issue_number: number;
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

export interface GhWatchState {
  version: 1;
  issues: Record<string, GhWatchIssueEntry>;
  queue: number[];
}

export interface GhWatchCycleSummary {
  started: number[];
  queued: number[];
  active: number;
  tracked: number;
  feedback_resumed: number[];
}

export type GhWatchIssue = { number: number; title: string; url: string };

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

export interface GhStartResult {
  issue: { number: number; title: string; url: string; repo: string | null };
  session: { id: string; dir: string; prompts_dir: string; work_dir: string; branch: string | null; worktree: boolean; pid: number };
  base_branch: 'agent/main' | 'main';
  pr: { number: number | null; url: string | null } | null;
  issue_comment_posted: boolean;
  completion_state: string | null;
  pending_completion: boolean;
  warnings: string[];
}

export interface GhWatchCommandOptions {
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
  output?: 'json' | 'text';
  once?: boolean;
  dryRun?: boolean;
  maxCiRetries?: string | number;
}

export const ghLoopRuntime = {
  listActiveSessions: (homeDir: string): Promise<SessionInfo[]> => listActiveSessions(homeDir),
  stopSession: (homeDir: string, sessionId: string): Promise<{ success: boolean; reason?: string }> =>
    stopSession(homeDir, sessionId),
  startIssue: async (_options: GhStartCommandOptions): Promise<GhStartResult> => {
    throw new Error('ghLoopRuntime.startIssue is not initialized');
  },
  now: (): string => new Date().toISOString(),
};

export function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  return undefined;
}

export function parsePositiveIntegerOption(value: unknown, fallback: number, optionName: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parsePositiveInteger(value);
  if (!parsed) throw new Error(`${optionName} must be a positive integer.`);
  return parsed;
}

export function extractPositiveIntegers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => parsePositiveInteger(v)).filter((v): v is number => v !== undefined);
}

export function extractRepoFromIssueUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/[^\/]+\/([^\/]+)\/([^\/]+)\/issues\/\d+/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

export function getSessionDir(homeDir: string | undefined, sessionId: string): string {
  return path.join(homeDir || os.homedir(), '.aloop', 'sessions', sessionId);
}

export function getWatchStatePath(homeDir?: string): string {
  return path.join(resolveHomeDir(homeDir), '.aloop', 'watch.json');
}

export function createEmptyWatchState(): GhWatchState {
  return { version: GH_WATCH_VERSION, issues: {}, queue: [] };
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && (v as string).trim() ? (v as string) : null;
}

export function normalizeWatchIssueEntry(value: unknown): GhWatchIssueEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  const issueNumber = parsePositiveInteger(c.issue_number);
  if (!issueNumber) return null;
  const rawStatus = typeof c.status === 'string' ? c.status : '';
  const status: GhWatchIssueStatus =
    rawStatus === 'running' || rawStatus === 'queued' || rawStatus === 'completed' || rawStatus === 'stopped'
      ? rawStatus : 'queued';
  const now = new Date().toISOString();
  return {
    issue_number: issueNumber,
    session_id: strOrNull(c.session_id),
    branch: strOrNull(c.branch),
    repo: strOrNull(c.repo),
    pr_number: parsePositiveInteger(c.pr_number) ?? null,
    pr_url: strOrNull(c.pr_url),
    status,
    completion_state: strOrNull(c.completion_state),
    completion_finalized: c.completion_finalized === true,
    created_at: strOrNull(c.created_at) ?? now,
    updated_at: strOrNull(c.updated_at) ?? now,
    feedback_iteration:
      typeof c.feedback_iteration === 'number' && Number.isInteger(c.feedback_iteration) && c.feedback_iteration >= 0
        ? c.feedback_iteration : 0,
    max_feedback_iterations: parsePositiveInteger(c.max_feedback_iterations) ?? GH_FEEDBACK_DEFAULT_MAX_ITERATIONS,
    processed_comment_ids: extractPositiveIntegers(c.processed_comment_ids),
    processed_issue_comment_ids: extractPositiveIntegers(c.processed_issue_comment_ids),
    processed_run_ids: extractPositiveIntegers(c.processed_run_ids),
    last_ci_failure_signature: strOrNull(c.last_ci_failure_signature),
    last_ci_failure_summary: strOrNull(c.last_ci_failure_summary),
    same_ci_failure_count:
      typeof c.same_ci_failure_count === 'number' && Number.isInteger(c.same_ci_failure_count) && c.same_ci_failure_count >= 0
        ? c.same_ci_failure_count : 0,
  };
}

export function normalizeWatchState(value: unknown): GhWatchState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createEmptyWatchState();
  const record = value as Record<string, unknown>;
  const state = createEmptyWatchState();
  if (Array.isArray(record.queue)) {
    state.queue = record.queue.map((e) => parsePositiveInteger(e)).filter((e): e is number => e !== undefined);
  }
  if (record.issues && typeof record.issues === 'object' && !Array.isArray(record.issues)) {
    for (const [key, rawEntry] of Object.entries(record.issues as Record<string, unknown>)) {
      const normalized = normalizeWatchIssueEntry(rawEntry);
      if (normalized) state.issues[key] = normalized;
    }
  }
  const queueFromEntries = Object.values(state.issues).filter((e) => e.status === 'queued').map((e) => e.issue_number);
  const merged = [...state.queue, ...queueFromEntries];
  const seen = new Set<number>();
  state.queue = merged.filter((n) => { if (seen.has(n)) return false; seen.add(n); return true; });
  return state;
}

export function loadWatchState(homeDir?: string): GhWatchState {
  const watchPath = getWatchStatePath(homeDir);
  if (!fs.existsSync(watchPath)) return createEmptyWatchState();
  try {
    return normalizeWatchState(JSON.parse(fs.readFileSync(watchPath, 'utf8')) as unknown);
  } catch {
    return createEmptyWatchState();
  }
}

export function saveWatchState(homeDir: string | undefined, state: GhWatchState): void {
  const watchPath = getWatchStatePath(homeDir);
  fs.mkdirSync(path.dirname(watchPath), { recursive: true });
  fs.writeFileSync(watchPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function watchEntryFromStartResult(result: GhStartResult): GhWatchIssueEntry {
  const now = new Date().toISOString();
  return {
    issue_number: result.issue.number,
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

export function getRunningTrackedCount(state: GhWatchState): number {
  return Object.values(state.issues).filter((e) => e.status === 'running').length;
}

export function setWatchEntry(state: GhWatchState, entry: GhWatchIssueEntry): void {
  state.issues[String(entry.issue_number)] = entry;
  state.queue = state.queue.filter((n) => n !== entry.issue_number);
}

export function enqueueIssue(state: GhWatchState, issue: GhWatchIssue): void {
  const now = new Date().toISOString();
  const existing = state.issues[String(issue.number)];
  if (existing && (existing.status === 'running' || existing.status === 'completed')) return;
  state.issues[String(issue.number)] = {
    issue_number: issue.number,
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
  if (!state.queue.includes(issue.number)) state.queue.push(issue.number);
}

export function removeTrackedIssue(state: GhWatchState, issueNumber: number): void {
  delete state.issues[String(issueNumber)];
  state.queue = state.queue.filter((n) => n !== issueNumber);
}

export function readSessionState(homeDir: string | undefined, sessionId: string): string | null {
  const statusFile = path.join(getSessionDir(homeDir, sessionId), 'status.json');
  if (!fs.existsSync(statusFile)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = (raw as Record<string, unknown>).state;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function refreshWatchState(
  homeDir: string | undefined,
  state: GhWatchState,
): Promise<Map<string, SessionInfo>> {
  const resolvedHomeDir = resolveHomeDir(homeDir);
  const activeSessions = await ghLoopRuntime.listActiveSessions(resolvedHomeDir);
  const byId = new Map<string, SessionInfo>(activeSessions.map((s) => [s.session_id, s]));
  for (const entry of Object.values(state.issues)) {
    if (!entry.session_id || entry.status === 'queued') continue;
    if (byId.get(entry.session_id)) {
      entry.status = 'running';
      entry.updated_at = new Date().toISOString();
      continue;
    }
    const sessionState = readSessionState(homeDir, entry.session_id);
    if (sessionState === 'exited') {
      entry.status = 'completed';
      entry.completion_state = sessionState;
      entry.updated_at = new Date().toISOString();
    } else if (sessionState === 'stopped') {
      entry.status = 'stopped';
      entry.completion_state = sessionState;
      entry.updated_at = new Date().toISOString();
    }
  }
  state.queue = state.queue.filter((n) => state.issues[String(n)]?.status === 'queued');
  return byId;
}
