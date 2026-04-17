/**
 * OrchestratorAdapter — pluggable interface for issue/PR backends.
 *
 * The first (and currently only) implementation is GitHubAdapter,
 * which wraps `gh` CLI calls. Future adapters (e.g. file-based local)
 * can implement this same interface.
 */

import type { GhExecFn, GhExecResult, BulkIssueState, BulkFetchResult } from './github-monitor.js';
import { parseRepoSlug, fetchBulkIssueState } from './github-monitor.js';

// ----- Supporting types -----

export interface AdapterConfig {
  /** Adapter type — currently only "github" is supported. */
  type: string;
  /** Repository in "owner/name" format. */
  repo: string;
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
  mergeable: boolean;
  mergeStateStatus: string;
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

// ----- Interface -----

export interface OrchestratorAdapter {
  // Issue CRUD
  createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<number>;
  updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string }): Promise<void>;
  closeIssue(issueNumber: number): Promise<void>;
  getIssue(issueNumber: number): Promise<AdapterIssue>;
  queryIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]>;

  // PR operations
  createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr>;
  mergePr(prNumber: number, opts?: { method?: 'squash' | 'merge' | 'rebase'; deleteBranch?: boolean }): Promise<void>;
  getPrStatus(prNumber: number): Promise<PrStatus>;
  getPrChecks(prNumber: number): Promise<PrChecksResult>;

  // Comments
  postComment(issueOrPrNumber: number, body: string): Promise<void>;
  listComments(issueNumber: number): Promise<AdapterComment[]>;

  // Labels
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  removeLabels(issueNumber: number, labels: string[]): Promise<void>;
  ensureLabelExists(label: string, opts?: { color?: string; description?: string }): Promise<void>;

  // Bulk fetch
  fetchBulkIssueState(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult>;
}

// ----- GitHubAdapter -----

export class GitHubAdapter implements OrchestratorAdapter {
  private readonly repo: string;
  private readonly execGh: GhExecFn;

  constructor(config: AdapterConfig, execGh: GhExecFn) {
    this.repo = config.repo;
    this.execGh = execGh;
  }

  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<number> {
    const args = ['issue', 'create', '--repo', this.repo, '--title', opts.title, '--body', opts.body];
    for (const label of opts.labels ?? []) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const match = result.stdout.match(/\/issues\/(\d+)/);
    if (!match) throw new Error(`Failed to parse issue number from: ${result.stdout}`);
    return parseInt(match[1], 10);
  }

  async updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string }): Promise<void> {
    const args = ['issue', 'edit', String(issueNumber), '--repo', this.repo];
    if (opts.title) args.push('--title', opts.title);
    if (opts.body) args.push('--body', opts.body);
    await this.execGh(args);
    if (opts.state === 'closed') {
      await this.closeIssue(issueNumber);
    } else if (opts.state === 'open') {
      await this.execGh(['issue', 'reopen', String(issueNumber), '--repo', this.repo]);
    }
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.execGh(['issue', 'close', String(issueNumber), '--repo', this.repo]);
  }

  async getIssue(issueNumber: number): Promise<AdapterIssue> {
    const result = await this.execGh([
      'issue', 'view', String(issueNumber), '--repo', this.repo,
      '--json', 'number,title,state,body,labels,assignees,url',
    ]);
    const data = JSON.parse(result.stdout) as {
      number: number;
      title: string;
      state: string;
      body?: string;
      labels?: Array<{ name: string }>;
      assignees?: Array<{ login: string }>;
      url?: string;
    };
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      body: data.body,
      labels: (data.labels ?? []).map((l) => l.name),
      assignees: (data.assignees ?? []).map((a) => a.login),
      url: data.url,
    };
  }

  async queryIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]> {
    const args = [
      'issue', 'list', '--repo', this.repo,
      '--state', opts?.state ?? 'open',
      '--json', 'number,title,state,labels,assignees,url',
      '--limit', String(opts?.limit ?? 100),
    ];
    for (const label of opts?.labels ?? []) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const items = JSON.parse(result.stdout) as Array<{
      number: number;
      title: string;
      state: string;
      labels?: Array<{ name: string }>;
      assignees?: Array<{ login: string }>;
      url?: string;
    }>;
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      labels: (item.labels ?? []).map((l) => l.name),
      assignees: (item.assignees ?? []).map((a) => a.login),
      url: item.url,
    }));
  }

  async createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr> {
    const result = await this.execGh([
      'pr', 'create', '--repo', this.repo,
      '--base', opts.base, '--head', opts.head,
      '--title', opts.title, '--body', opts.body,
    ]);
    const match = result.stdout.match(/\/pull\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    return { number, url: result.stdout.trim() };
  }

  async mergePr(prNumber: number, opts?: { method?: 'squash' | 'merge' | 'rebase'; deleteBranch?: boolean }): Promise<void> {
    const method = opts?.method ?? 'squash';
    const args = ['pr', 'merge', String(prNumber), '--repo', this.repo, `--${method}`];
    if (opts?.deleteBranch !== false) {
      args.push('--delete-branch');
    }
    await this.execGh(args);
  }

  async getPrStatus(prNumber: number): Promise<PrStatus> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repo,
      '--json', 'mergeable,mergeStateStatus',
    ]);
    const data = JSON.parse(result.stdout) as { mergeable: string; mergeStateStatus: string };
    return {
      mergeable: data.mergeable === 'MERGEABLE',
      mergeStateStatus: data.mergeStateStatus,
    };
  }

  async getPrChecks(prNumber: number): Promise<PrChecksResult> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repo,
      '--json', 'statusCheckRollup',
    ]);
    const data = JSON.parse(result.stdout) as {
      statusCheckRollup?: Array<{
        name: string;
        status: string;
        conclusion: string | null;
      }>;
    };
    const checks = data.statusCheckRollup ?? [];
    const pending = checks.some((c) => c.status !== 'COMPLETED');
    const failed = checks.some((c) => c.status === 'COMPLETED' && c.conclusion !== 'SUCCESS' && c.conclusion !== 'NEUTRAL' && c.conclusion !== 'SKIPPED');
    return {
      passed: !pending && !failed && checks.length > 0,
      pending,
      checks: checks.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion })),
    };
  }

  async postComment(issueOrPrNumber: number, body: string): Promise<void> {
    await this.execGh(['issue', 'comment', String(issueOrPrNumber), '--repo', this.repo, '--body', body]);
  }

  async listComments(issueNumber: number): Promise<AdapterComment[]> {
    const result = await this.execGh([
      'issue', 'view', String(issueNumber), '--repo', this.repo,
      '--json', 'comments',
    ]);
    const data = JSON.parse(result.stdout) as {
      comments?: Array<{
        id: string;
        author: { login: string };
        body: string;
        createdAt: string;
      }>;
    };
    return (data.comments ?? []).map((c) => ({
      id: parseInt(c.id.replace(/\D/g, ''), 10) || 0,
      author: c.author?.login ?? 'unknown',
      body: c.body,
      createdAt: c.createdAt,
    }));
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    for (const label of labels) {
      await this.execGh(['issue', 'edit', String(issueNumber), '--repo', this.repo, '--add-label', label]);
    }
  }

  async removeLabels(issueNumber: number, labels: string[]): Promise<void> {
    for (const label of labels) {
      await this.execGh(['issue', 'edit', String(issueNumber), '--repo', this.repo, '--remove-label', label]);
    }
  }

  async ensureLabelExists(label: string, opts?: { color?: string; description?: string }): Promise<void> {
    const args = ['label', 'create', label, '--repo', this.repo, '--force'];
    if (opts?.color) args.push('--color', opts.color);
    if (opts?.description) args.push('--description', opts.description);
    await this.execGh(args);
  }

  async fetchBulkIssueState(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult> {
    return fetchBulkIssueState(this.repo, this.execGh, {
      states: opts?.states,
      since: opts?.since,
      issueNumbers: opts?.issueNumbers,
    });
  }
}

// ----- Factory -----

export function createAdapter(config: AdapterConfig, execGh: GhExecFn): OrchestratorAdapter {
  if (config.type === 'github') {
    return new GitHubAdapter(config, execGh);
  }
  throw new Error(`Unknown adapter type: "${config.type}". Supported types: github`);
}
