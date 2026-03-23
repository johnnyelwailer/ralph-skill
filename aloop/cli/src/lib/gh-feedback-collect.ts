import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { GhWatchIssueEntry } from './gh-state.js';

const execFileAsync = promisify(execFile);
const GH_PATH_HARDENING_BLOCK_MESSAGE = 'blocked by aloop PATH hardening';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return String(error);
}

function extractGhCliError(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybeStderr = (error as { stderr?: unknown }).stderr;
    if (typeof maybeStderr === 'string' && maybeStderr.trim()) return maybeStderr.trim();
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
  if (platform === 'win32') return ['gh.exe', 'gh.cmd', 'gh.bat', 'gh'];
  return ['gh'];
}

export function selectUsableGhBinary(pathValue: string, platform: NodeJS.Platform = process.platform): string | null {
  if (!pathValue.trim()) return null;
  const candidates = getGhBinaryCandidateNames(platform);
  const pathEntries = pathValue.split(path.delimiter).map((e) => e.trim()).filter(Boolean);
  for (const entry of pathEntries) {
    for (const candidateName of candidates) {
      const fullPath = path.join(entry, candidateName);
      if (!fs.existsSync(fullPath)) continue;
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) continue;
      if (stats.size <= 1024) {
        try {
          const contents = fs.readFileSync(fullPath, 'utf8');
          if (contents.includes(GH_PATH_HARDENING_BLOCK_MESSAGE)) continue;
        } catch {
          // ignore unreadable candidate
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
      if (!isPathHardeningBlockedError(error)) throw error;
      const fallbackBinary =
        selectUsableGhBinary(process.env.PATH ?? '') ??
        selectUsableGhBinary(process.env.ALOOP_ORIGINAL_PATH ?? '');
      if (!fallbackBinary) throw error;
      return execFileAsync(fallbackBinary, args);
    }
  }
};

export interface PrReviewComment {
  id: number;
  body: string;
  user?: { login?: string };
  path?: string;
  line?: number;
  state?: string;
}

export interface PrIssueComment {
  id: number;
  body: string;
  user?: { login?: string };
}

export interface PrCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
  log?: string;
}

export interface PrFeedback {
  new_comments: PrReviewComment[];
  new_issue_comments: PrIssueComment[];
  failed_checks: PrCheckRun[];
}

export async function fetchPrReviewComments(repo: string, prNumber: number): Promise<PrReviewComment[]> {
  const response = await ghExecutor.exec([
    'api', `repos/${repo}/pulls/${prNumber}/comments`, '--method', 'GET',
  ]);
  const parsed = JSON.parse(response.stdout || '[]') as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'number' ? entry.id : 0,
      body: typeof entry.body === 'string' ? entry.body : '',
      user: entry.user && typeof entry.user === 'object'
        ? { login: typeof (entry.user as Record<string, unknown>).login === 'string' ? (entry.user as Record<string, unknown>).login as string : undefined }
        : undefined,
      path: typeof entry.path === 'string' ? entry.path : undefined,
      line: typeof entry.line === 'number' ? entry.line : undefined,
      state: typeof entry.state === 'string' ? entry.state : undefined,
    }))
    .filter((c) => c.id > 0);
}

export async function fetchPrIssueComments(repo: string, prNumber: number): Promise<PrIssueComment[]> {
  const response = await ghExecutor.exec([
    'api', `repos/${repo}/issues/${prNumber}/comments`, '--method', 'GET',
  ]);
  const parsed = JSON.parse(response.stdout || '[]') as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'number' ? entry.id : 0,
      body: typeof entry.body === 'string' ? entry.body : '',
      user: entry.user && typeof entry.user === 'object'
        ? { login: typeof (entry.user as Record<string, unknown>).login === 'string' ? (entry.user as Record<string, unknown>).login as string : undefined }
        : undefined,
    }))
    .filter((c) => c.id > 0);
}

export async function fetchFailedCheckLogs(repo: string, sha: string): Promise<Map<number, string>> {
  const logs = new Map<number, string>();
  try {
    const runsResponse = await ghExecutor.exec([
      'run', 'list', '--repo', repo, '--commit', sha, '--status', 'failure', '--json', 'databaseId', '--limit', '5',
    ]);
    const runs = JSON.parse(runsResponse.stdout || '[]') as { databaseId: number }[];
    for (const run of runs) {
      try {
        const logResponse = await ghExecutor.exec(['run', 'view', String(run.databaseId), '--repo', repo, '--log-failed']);
        if (logResponse.stdout.trim()) logs.set(run.databaseId, logResponse.stdout.trim());
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return logs;
}

export async function fetchPrCheckRuns(repo: string, prNumber: number): Promise<PrCheckRun[]> {
  const prResponse = await ghExecutor.exec([
    'api', `repos/${repo}/pulls/${prNumber}`, '--method', 'GET', '--jq', '.head.sha',
  ]);
  const sha = prResponse.stdout.trim();
  if (!sha) return [];
  const checksResponse = await ghExecutor.exec([
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--method', 'GET',
  ]);
  const parsed = JSON.parse(checksResponse.stdout || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const checkRuns = (parsed as Record<string, unknown>).check_runs;
  if (!Array.isArray(checkRuns)) return [];
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
  const hasFailures = runs.some((r) => r.status === 'completed' && r.conclusion === 'failure');
  if (hasFailures) {
    const logs = await fetchFailedCheckLogs(repo, sha);
    if (logs.size > 0) {
      const combinedLog = Array.from(logs.values()).join('\n---\n');
      for (const run of runs) {
        if (run.status === 'completed' && run.conclusion === 'failure') run.log = combinedLog;
      }
    }
  }
  return runs;
}

export function collectNewFeedback(
  entry: GhWatchIssueEntry,
  reviewComments: PrReviewComment[],
  issueComments: PrIssueComment[],
  checkRuns: PrCheckRun[],
): PrFeedback {
  const processedCommentSet = new Set(entry.processed_comment_ids);
  const processedIssueCommentSet = new Set(entry.processed_issue_comment_ids);
  const processedRunSet = new Set(entry.processed_run_ids);
  return {
    new_comments: reviewComments.filter((c) => !processedCommentSet.has(c.id)),
    new_issue_comments: issueComments
      .filter((c) => !processedIssueCommentSet.has(c.id))
      .filter((c) => c.body.toLowerCase().includes('@aloop')),
    failed_checks: checkRuns
      .filter((r) => r.status === 'completed' && r.conclusion === 'failure')
      .filter((r) => !processedRunSet.has(r.id)),
  };
}
