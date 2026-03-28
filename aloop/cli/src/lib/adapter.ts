/**
 * OrchestratorAdapter — pluggable interface for issue/PR backends.
 *
 * Implementations:
 *   - GitHubAdapter: wraps `gh` CLI calls for GitHub/GHE repos
 */

import type { GhExecFn, BulkFetchResult } from './github-monitor.js';
import { GitHubAdapter } from './adapter-github.js';

// ----- Supporting types -----

export interface AdapterConfig {
  /** Adapter type — "github". */
  type: string;
  /** Repository in "owner/name" format. */
  repo: string;
  /** GitHub host for GHE support (e.g. "git.corp.example.com"). Defaults to GH_HOST env var or "github.com". */
  ghHost?: string;
}

export interface AdapterIssue {
  number: number;
  title: string;
  state: string;
  body?: string;
  labels: string[];
  assignees: string[];
  url?: string;
}

export interface AdapterPr {
  number: number;
  url: string;
}

export interface PrStatus {
  state: string;
  mergeable: boolean;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string;
  }>;
}

export interface PrChecksResult {
  passed: boolean;
  pending: boolean;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}

export interface AdapterComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface AdapterReview {
  id: number;
  author: string;
  state: string;
  body: string;
}

// ----- Interface -----

export interface OrchestratorAdapter {
  // Issue CRUD
  createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }>;
  updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string; labelsAdd?: string[]; labelsRemove?: string[] }): Promise<void>;
  closeIssue(issueNumber: number, reason: string): Promise<void>;
  getIssue(issueNumber: number): Promise<AdapterIssue>;
  listIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]>;

  // PR operations
  createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr>;
  mergePr(prNumber: number, strategy: 'squash' | 'merge' | 'rebase'): Promise<void>;
  getPrStatus(prNumber: number): Promise<PrStatus>;
  getPrChecks(prNumber: number): Promise<PrChecksResult>;
  getPrComments(prNumber: number, since?: string): Promise<AdapterComment[]>;
  getPrReviews(prNumber: number): Promise<AdapterReview[]>;

  // Comments
  postComment(issueOrPrNumber: number, body: string): Promise<void>;
  getIssueComments(issueNumber: number, since?: string): Promise<AdapterComment[]>;

  // Labels
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  removeLabels(issueNumber: number, labels: string[]): Promise<void>;
  ensureLabelsExist(labels: string[]): Promise<void>;

  // PR close
  closePr(prNumber: number, opts?: { comment?: string }): Promise<void>;

  // PR diff
  getPrDiff(prNumber: number): Promise<string>;

  // PR query
  queryPrs(opts?: { head?: string; base?: string; state?: string; limit?: number }): Promise<AdapterPr[]>;

  // Branch existence
  checkBranchExists(branch: string): Promise<boolean>;

  // Bulk fetch
  fetchBulkIssueState(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult>;

  // Project board (optional — not all backends support this)
  syncProjectStatus?(issueNumber: number, status: string): Promise<void>;

  // Metadata
  readonly repoSlug: string;
  readonly baseUrl: string;
}

// ----- Re-export implementation -----

export { GitHubAdapter };

// ----- Factory -----

export function createAdapter(config: AdapterConfig, execGh: GhExecFn): OrchestratorAdapter {
  if (config.type === 'github') {
    return new GitHubAdapter(config, execGh);
  }
  throw new Error(`Unknown adapter type: "${config.type}". Supported types: github`);
}
