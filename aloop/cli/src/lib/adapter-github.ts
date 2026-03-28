/**
 * GitHubAdapter — OrchestratorAdapter implementation wrapping the `gh` CLI.
 * Supports GitHub.com and GitHub Enterprise Server via `ghHost` / `GH_HOST`.
 */

import type { GhExecFn, BulkFetchResult } from './github-monitor.js';
import { fetchBulkIssueState } from './github-monitor.js';
import type {
  AdapterConfig,
  OrchestratorAdapter,
  AdapterIssue,
  AdapterPr,
  PrStatus,
  PrChecksResult,
  AdapterComment,
  AdapterReview,
} from './adapter.js';

export class GitHubAdapter implements OrchestratorAdapter {
  readonly repoSlug: string;
  readonly baseUrl: string;
  private readonly execGh: GhExecFn;

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

  async createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr> {
    const result = await this.execGh([
      'pr', 'create', '--repo', this.repoSlug,
      '--base', opts.base, '--head', opts.head,
      '--title', opts.title, '--body', opts.body,
    ]);
    const match = result.stdout.match(/\/pull\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    return { number, url: result.stdout.trim() };
  }

  async mergePr(prNumber: number, strategy: 'squash' | 'merge' | 'rebase'): Promise<void> {
    const args = ['pr', 'merge', String(prNumber), '--repo', this.repoSlug, `--${strategy}`, '--delete-branch'];
    await this.execGh(args);
  }

  async getPrStatus(prNumber: number): Promise<PrStatus> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repoSlug,
      '--json', 'state,mergeable,statusCheckRollup',
    ]);
    const data = JSON.parse(result.stdout) as {
      state: string;
      mergeable: string;
      statusCheckRollup?: Array<{
        name: string;
        status: string;
        conclusion: string | null;
      }>;
    };
    const checks = (data.statusCheckRollup ?? []).map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion ?? '',
    }));
    return {
      state: data.state,
      mergeable: data.mergeable === 'MERGEABLE',
      checks,
    };
  }

  async getPrChecks(prNumber: number): Promise<PrChecksResult> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repoSlug,
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

  async getPrComments(prNumber: number, since?: string): Promise<AdapterComment[]> {
    const apiPath = `repos/${this.repoSlug}/issues/${prNumber}/comments`;
    const args = ['api', apiPath, '--jq', '.'];
    if (since) args.push('-f', `since=${since}`);
    const result = await this.execGh(args);
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

  async getPrReviews(prNumber: number): Promise<AdapterReview[]> {
    const result = await this.execGh([
      'api', `repos/${this.repoSlug}/pulls/${prNumber}/reviews`, '--jq', '.',
    ]);
    const items = JSON.parse(result.stdout) as Array<{
      id: number;
      user?: { login: string };
      state: string;
      body: string;
    }>;
    return items.map((r) => ({
      id: r.id,
      author: r.user?.login ?? 'unknown',
      state: r.state,
      body: r.body,
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

  async closePr(prNumber: number, opts?: { comment?: string }): Promise<void> {
    const args = ['pr', 'close', String(prNumber), '--repo', this.repoSlug];
    if (opts?.comment) {
      args.push('--comment', opts.comment);
    }
    await this.execGh(args);
  }

  async getPrDiff(prNumber: number): Promise<string> {
    const result = await this.execGh(['pr', 'diff', String(prNumber), '--repo', this.repoSlug]);
    return result.stdout;
  }

  async queryPrs(opts?: { head?: string; base?: string; state?: string; limit?: number }): Promise<AdapterPr[]> {
    const args = [
      'pr', 'list', '--repo', this.repoSlug,
      '--json', 'number,url',
      '--limit', String(opts?.limit ?? 100),
    ];
    if (opts?.head) args.push('--head', opts.head);
    if (opts?.base) args.push('--base', opts.base);
    if (opts?.state) args.push('--state', opts.state);
    const result = await this.execGh(args);
    const items = JSON.parse(result.stdout) as Array<{ number: number; url?: string }>;
    return items.map((item) => ({ number: item.number, url: item.url ?? '' }));
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
