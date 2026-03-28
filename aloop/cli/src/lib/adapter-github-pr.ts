/**
 * PR-related methods for GitHubAdapter.
 * Separated to keep both adapter files under 300 LOC.
 */

import type { AdapterPr, PrStatus, PrChecksResult, AdapterComment, AdapterReview } from './adapter.js';
import type { GitHubAdapter } from './adapter-github.js';

export const PR_METHODS = {
  async createPr(this: GitHubAdapter, opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr> {
    const result = await this.execGh([
      'pr', 'create', '--repo', this.repoSlug,
      '--base', opts.base, '--head', opts.head,
      '--title', opts.title, '--body', opts.body,
    ]);
    const match = result.stdout.match(/\/pull\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    return { number, url: result.stdout.trim() };
  },

  async mergePr(this: GitHubAdapter, prNumber: number, strategy: 'squash' | 'merge' | 'rebase'): Promise<void> {
    const args = ['pr', 'merge', String(prNumber), '--repo', this.repoSlug, `--${strategy}`, '--delete-branch'];
    await this.execGh(args);
  },

  async getPrStatus(this: GitHubAdapter, prNumber: number): Promise<PrStatus> {
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
  },

  async getPrChecks(this: GitHubAdapter, prNumber: number): Promise<PrChecksResult> {
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
  },

  async getPrComments(this: GitHubAdapter, prNumber: number, since?: string): Promise<AdapterComment[]> {
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
  },

  async getPrReviews(this: GitHubAdapter, prNumber: number): Promise<AdapterReview[]> {
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
  },

  async closePr(this: GitHubAdapter, prNumber: number, opts?: { comment?: string }): Promise<void> {
    const args = ['pr', 'close', String(prNumber), '--repo', this.repoSlug];
    if (opts?.comment) {
      args.push('--comment', opts.comment);
    }
    await this.execGh(args);
  },

  async getPrDiff(this: GitHubAdapter, prNumber: number): Promise<string> {
    const result = await this.execGh(['pr', 'diff', String(prNumber), '--repo', this.repoSlug]);
    return result.stdout;
  },

  async queryPrs(this: GitHubAdapter, opts?: { head?: string; base?: string; state?: string; limit?: number }): Promise<AdapterPr[]> {
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
  },
};
