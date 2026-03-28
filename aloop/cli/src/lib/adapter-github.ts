/**
 * GitHubAdapter — OrchestratorAdapter implementation wrapping the `gh` CLI.
 * Supports GitHub.com and GitHub Enterprise Server via `ghHost` / `GH_HOST`.
 *
 * PR-related methods are in adapter-github-pr.ts and attached via prototype.
 */

import type { GhExecFn, BulkFetchResult } from './github-monitor.js';
import { fetchBulkIssueState } from './github-monitor.js';
import type {
  AdapterConfig,
  OrchestratorAdapter,
  AdapterIssue,
  AdapterComment,
  AdapterPr,
  PrStatus,
  PrChecksResult,
  AdapterReview,
} from './adapter.js';
import { PR_METHODS } from './adapter-github-pr.js';

export class GitHubAdapter implements OrchestratorAdapter {
  readonly repoSlug: string;
  readonly baseUrl: string;
  readonly execGh: GhExecFn;

  constructor(config: AdapterConfig, execGh: GhExecFn) {
    this.repoSlug = config.repo;
    const host = config.ghHost ?? process.env['GH_HOST'] ?? 'github.com';
    this.baseUrl = `https://${host}`;
    this.execGh = execGh;
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }> {
    const args = ['issue', 'create', '--repo', this.repoSlug, '--title', title, '--body', body];
    for (const label of labels) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const url = result.stdout.trim();
    const match = url.match(/\/issues\/(\d+)/);
    if (!match) throw new Error(`Failed to parse issue number from: ${result.stdout}`);
    return { number: parseInt(match[1], 10), url };
  }

  async updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string; labelsAdd?: string[]; labelsRemove?: string[] }): Promise<void> {
    const args = ['issue', 'edit', String(issueNumber), '--repo', this.repoSlug];
    if (opts.title) args.push('--title', opts.title);
    if (opts.body) args.push('--body', opts.body);
    await this.execGh(args);
    if (opts.labelsAdd && opts.labelsAdd.length > 0) {
      await this.addLabels(issueNumber, opts.labelsAdd);
    }
    if (opts.labelsRemove && opts.labelsRemove.length > 0) {
      await this.removeLabels(issueNumber, opts.labelsRemove);
    }
    if (opts.state === 'closed') {
      await this.closeIssue(issueNumber, '');
    } else if (opts.state === 'open') {
      await this.execGh(['issue', 'reopen', String(issueNumber), '--repo', this.repoSlug]);
    }
  }

  async closeIssue(issueNumber: number, reason: string): Promise<void> {
    const args = ['issue', 'close', String(issueNumber), '--repo', this.repoSlug];
    if (reason) args.push('--comment', reason);
    await this.execGh(args);
  }

  async getIssue(issueNumber: number): Promise<AdapterIssue> {
    const result = await this.execGh([
      'issue', 'view', String(issueNumber), '--repo', this.repoSlug,
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

  async listIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]> {
    const args = [
      'issue', 'list', '--repo', this.repoSlug,
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

  async postComment(issueOrPrNumber: number, body: string): Promise<void> {
    await this.execGh(['issue', 'comment', String(issueOrPrNumber), '--repo', this.repoSlug, '--body', body]);
  }

  async getIssueComments(issueNumber: number, since?: string): Promise<AdapterComment[]> {
    if (since) {
      const result = await this.execGh([
        'api', `repos/${this.repoSlug}/issues/${issueNumber}/comments`,
        '--jq', '.',
        '-f', `since=${since}`,
      ]);
      const items = JSON.parse(result.stdout) as Array<{
        id: number;
        user?: { login: string };
        body: string;
        created_at: string;
      }>;
      return items.map((c) => ({
        id: c.id,
        author: c.user?.login ?? 'unknown',
        body: c.body,
        createdAt: c.created_at,
      }));
    }
    const result = await this.execGh([
      'issue', 'view', String(issueNumber), '--repo', this.repoSlug,
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
      await this.execGh(['issue', 'edit', String(issueNumber), '--repo', this.repoSlug, '--add-label', label]);
    }
  }

  async removeLabels(issueNumber: number, labels: string[]): Promise<void> {
    for (const label of labels) {
      await this.execGh(['issue', 'edit', String(issueNumber), '--repo', this.repoSlug, '--remove-label', label]);
    }
  }

  async ensureLabelsExist(labels: string[]): Promise<void> {
    for (const label of labels) {
      await this.execGh(['label', 'create', label, '--repo', this.repoSlug, '--force']);
    }
  }

  async checkBranchExists(branch: string): Promise<boolean> {
    try {
      await this.execGh(['api', `repos/${this.repoSlug}/branches/${branch}`, '--jq', '.name']);
      return true;
    } catch {
      return false;
    }
  }

  async fetchBulkIssueState(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult> {
    return fetchBulkIssueState(this.repoSlug, this.execGh, {
      states: opts?.states,
      since: opts?.since,
      issueNumbers: opts?.issueNumbers,
    });
  }

}

// Declaration merging — tells TypeScript that GitHubAdapter has PR methods at runtime
// (mixed in via Object.assign below). No implementation here; see adapter-github-pr.ts.
export interface GitHubAdapter {
  createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr>;
  mergePr(prNumber: number, strategy: 'squash' | 'merge' | 'rebase'): Promise<void>;
  getPrStatus(prNumber: number): Promise<PrStatus>;
  getPrChecks(prNumber: number): Promise<PrChecksResult>;
  getPrComments(prNumber: number, since?: string): Promise<AdapterComment[]>;
  getPrReviews(prNumber: number): Promise<AdapterReview[]>;
  closePr(prNumber: number, opts?: { comment?: string }): Promise<void>;
  getPrDiff(prNumber: number): Promise<string>;
  queryPrs(opts?: { head?: string; base?: string; state?: string; limit?: number }): Promise<AdapterPr[]>;
}

Object.assign(GitHubAdapter.prototype, PR_METHODS);
