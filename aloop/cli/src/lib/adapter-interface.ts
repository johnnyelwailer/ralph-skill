/**
 * OrchestratorAdapter — shared interface types.
 *
 * Defines the pluggable adapter interface and supporting value types.
 * The first (and currently only) implementation is GitHubAdapter in adapter-github.ts.
 */

import type { BulkFetchResult } from './github-monitor.js';

// ----- Supporting types -----

export interface AdapterConfig {
  /** Adapter type — currently only "github" is supported. */
  type: string;
  /** Repository in "owner/name" format. */
  repo: string;
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

// ----- Interface (spec-aligned) -----

export interface OrchestratorAdapter {
  // Issue lifecycle
  createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }>;
  updateIssue(number: number, update: { body?: string; labels_add?: string[]; labels_remove?: string[]; state?: 'open' | 'closed' }): Promise<void>;
  closeIssue(number: number): Promise<void>;
  getIssue(number: number): Promise<{ number: number; title: string; body: string; state: string; labels: string[] }>;
  listIssues(filters: { labels?: string[]; state?: 'open' | 'closed' | 'all' }): Promise<Array<{ number: number; title: string; state: string }>>;

  // Comments
  postComment(issueNumber: number, body: string): Promise<void>;
  listComments(issueNumber: number, since?: string): Promise<Array<{ id: number; body: string; author: string; created_at: string }>>;

  // PR lifecycle
  createPR(title: string, body: string, head: string, base: string): Promise<{ number: number; url: string }>;
  mergePR(number: number, method: 'squash' | 'merge' | 'rebase'): Promise<void>;
  closePR(number: number, comment?: string): Promise<void>;
  listPRs(filters: { head?: string; state?: 'open' | 'closed' | 'all' }): Promise<Array<{ number: number; url: string; title: string; state: string; headRefName: string; baseRefName: string }>>;
  getPRStatus(number: number): Promise<{ mergeable: boolean; ci_status: 'success' | 'failure' | 'pending'; reviews: Array<{ verdict: string }> }>;
  getPrChecks(prNumber: number): Promise<PrChecksResult>;
  getPrDiff(prNumber: number): Promise<string>;

  // Project status (optional)
  setIssueStatus?(number: number, status: string): Promise<void>;

  // Bulk fetch (optional — not all adapters support GraphQL-based bulk fetching)
  fetchBulkIssueState?(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult>;

  // Repository queries (optional — not all adapters support these)
  hasWorkflows?(): Promise<boolean>;
  branchExists?(branchName: string): Promise<boolean>;
}
