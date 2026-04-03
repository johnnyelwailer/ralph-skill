/**
 * GitHubAdapter — OrchestratorAdapter implementation backed by the `gh` CLI.
 *
 * Delegates GitHub Projects v2 status logic to adapter-github-project.ts
 * to keep this file under 300 LOC.
 */

import type { GhExecFn, BulkFetchResult } from './github-monitor.js';
import { fetchBulkIssueState } from './github-monitor.js';
import type { AdapterConfig, OrchestratorAdapter, PrChecksResult } from './adapter-interface.js';
import type { ProjectStatusContext } from './adapter-github-project.js';
import { setIssueStatusViaProject, resolveProjectStatusContext } from './adapter-github-project.js';

export class GitHubAdapter implements OrchestratorAdapter {
  private readonly repo: string;
  private readonly execGh: GhExecFn;
  private readonly projectStatusContextCache = new Map<number, ProjectStatusContext | null>();

  constructor(config: AdapterConfig, execGh: GhExecFn) {
    this.repo = config.repo;
    this.execGh = execGh;
  }

  async setIssueStatus(number: number, status: string): Promise<void> {
    await setIssueStatusViaProject(this.repo, this.execGh, this.projectStatusContextCache, number, status);
  }

  async getIssueStatus(number: number): Promise<string | null> {
    const context = await resolveProjectStatusContext(this.repo, this.execGh, this.projectStatusContextCache, number);
    if (!context) return null;
    const query = 'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:20){nodes{id project{id} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}';
    const response = await this.execGh([
      'api', 'graphql',
      '-f', `query=${query}`,
      '-F', `owner=${this.repo.split('/')[0]}`,
      '-F', `repo=${this.repo.split('/')[1]}`,
      '-F', `number=${number}`,
    ]);
    try {
      const parsed = JSON.parse(response.stdout) as {
        data?: {
          repository?: {
            issue?: {
              projectItems?: {
                nodes?: Array<{
                  id?: string;
                  project?: { id?: string };
                  fieldValueByName?: { name?: string };
                }>;
              };
            };
          };
        };
      };
      const nodes = parsed.data?.repository?.issue?.projectItems?.nodes;
      if (!Array.isArray(nodes)) return null;
      const statusNode = nodes.find(n => n.id === context.itemId);
      return statusNode?.fieldValueByName?.name ?? null;
    } catch {
      return null;
    }
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<{ number: number; url: string }> {
    const args = ['issue', 'create', '--repo', this.repo, '--title', title, '--body', body];
    for (const label of labels) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const url = result.stdout.trim();
    const match = url.match(/\/issues\/(\d+)/);
    if (!match) throw new Error(`Failed to parse issue number from: ${result.stdout}`);
    return { number: parseInt(match[1], 10), url };
  }

  async updateIssue(number: number, update: { body?: string; labels_add?: string[]; labels_remove?: string[]; state?: 'open' | 'closed' }): Promise<void> {
    if (update.body) {
      const args = ['issue', 'edit', String(number), '--repo', this.repo, '--body', update.body];
      await this.execGh(args);
    }
    if (update.labels_add?.length) {
      for (const label of update.labels_add) {
        await this.execGh(['issue', 'edit', String(number), '--repo', this.repo, '--add-label', label]);
      }
    }
    if (update.labels_remove?.length) {
      for (const label of update.labels_remove) {
        await this.execGh(['issue', 'edit', String(number), '--repo', this.repo, '--remove-label', label]);
      }
    }
    if (update.state === 'closed') {
      await this.execGh(['issue', 'close', String(number), '--repo', this.repo]);
    } else if (update.state === 'open') {
      await this.execGh(['issue', 'reopen', String(number), '--repo', this.repo]);
    }
  }

  async closeIssue(number: number): Promise<void> {
    await this.execGh(['issue', 'close', String(number), '--repo', this.repo]);
  }

  async getIssue(number: number): Promise<{ number: number; title: string; body: string; state: string; labels: string[] }> {
    const result = await this.execGh([
      'issue', 'view', String(number), '--repo', this.repo,
      '--json', 'number,title,state,body,labels',
    ]);
    const data = JSON.parse(result.stdout) as {
      number: number;
      title: string;
      state: string;
      body?: string;
      labels?: Array<{ name: string }>;
    };
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      state: data.state,
      labels: (data.labels ?? []).map((l) => l.name),
    };
  }

  async listIssues(filters: { labels?: string[]; state?: 'open' | 'closed' | 'all' }): Promise<Array<{ number: number; title: string; state: string }>> {
    const args = [
      'issue', 'list', '--repo', this.repo,
      '--state', filters?.state ?? 'open',
      '--json', 'number,title,state',
      '--limit', '100',
    ];
    for (const label of filters?.labels ?? []) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const items = JSON.parse(result.stdout) as Array<{
      number: number;
      title: string;
      state: string;
    }>;
    return items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
    }));
  }

  async createPR(title: string, body: string, head: string, base: string): Promise<{ number: number; url: string }> {
    const result = await this.execGh([
      'pr', 'create', '--repo', this.repo,
      '--base', base, '--head', head,
      '--title', title, '--body', body,
    ]);
    const match = result.stdout.match(/\/pull\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    return { number, url: result.stdout.trim() };
  }

  async mergePR(number: number, method: 'squash' | 'merge' | 'rebase'): Promise<void> {
    const args = ['pr', 'merge', String(number), '--repo', this.repo, `--${method}`, '--delete-branch'];
    await this.execGh(args);
  }

  async closePR(number: number, comment?: string): Promise<void> {
    const args = ['pr', 'close', String(number), '--repo', this.repo];
    if (comment) {
      args.push('--comment', comment);
    }
    await this.execGh(args);
  }

  async listPRs(filters: { head?: string; state?: 'open' | 'closed' | 'all' }): Promise<Array<{ number: number; url: string; title: string; state: string; headRefName: string; baseRefName: string }>> {
    const args = [
      'pr', 'list', '--repo', this.repo,
      '--state', filters?.state ?? 'open',
      '--json', 'number,url,title,state,headRefName,baseRefName',
      '--limit', '100',
    ];
    if (filters?.head) {
      args.push('--head', filters.head);
    }
    const result = await this.execGh(args);
    const items = JSON.parse(result.stdout) as Array<{
      number: number;
      url: string;
      title: string;
      state: string;
      headRefName: string;
      baseRefName: string;
    }>;
    return items.map((item) => ({
      number: item.number,
      url: item.url,
      title: item.title,
      state: item.state,
      headRefName: item.headRefName,
      baseRefName: item.baseRefName,
    }));
  }

  async getPRStatus(prNumber: number): Promise<{ mergeable: boolean; ci_status: 'success' | 'failure' | 'pending'; reviews: Array<{ verdict: string }> }> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repo,
      '--json', 'mergeable,statusCheckRollup,reviews',
    ]);
    const data = JSON.parse(result.stdout) as {
      mergeable: string;
      statusCheckRollup?: Array<{ status: string; conclusion: string | null }>;
      reviews?: Array<{ state: string }>;
    };
    const checks = data.statusCheckRollup ?? [];
    let ci_status: 'success' | 'failure' | 'pending';
    if (checks.some((c) => c.status !== 'COMPLETED')) {
      ci_status = 'pending';
    } else if (checks.some((c) => c.conclusion !== 'SUCCESS' && c.conclusion !== 'NEUTRAL' && c.conclusion !== 'SKIPPED')) {
      ci_status = 'failure';
    } else {
      ci_status = 'success';
    }
    return {
      mergeable: data.mergeable === 'MERGEABLE',
      ci_status,
      reviews: (data.reviews ?? []).map((r) => ({ verdict: r.state.toLowerCase() })),
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

  async getPrDiff(prNumber: number): Promise<string> {
    const result = await this.execGh(['pr', 'diff', String(prNumber), '--repo', this.repo]);
    return result.stdout;
  }

  async postComment(issueNumber: number, body: string): Promise<void> {
    await this.execGh(['issue', 'comment', String(issueNumber), '--repo', this.repo, '--body', body]);
  }

  async listComments(issueNumber: number, since?: string): Promise<Array<{ id: number; body: string; author: string; created_at: string }>> {
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
    let comments = (data.comments ?? []).map((c) => ({
      id: parseInt(c.id.replace(/\D/g, ''), 10) || 0,
      body: c.body,
      author: c.author?.login ?? 'unknown',
      created_at: c.createdAt,
    }));
    if (since) {
      const sinceDate = new Date(since);
      comments = comments.filter((c) => new Date(c.created_at) > sinceDate);
    }
    return comments;
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

  async hasWorkflows(): Promise<boolean> {
    try {
      const response = await this.execGh([
        'api', `repos/${this.repo}/actions/workflows`, '--method', 'GET', '--jq', '.total_count',
      ]);
      const total = Number(response.stdout.trim());
      return Number.isFinite(total) && total > 0;
    } catch {
      return false;
    }
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.execGh(['api', `repos/${this.repo}/branches/${branchName}`, '--jq', '.name']);
      return true;
    } catch {
      return false;
    }
  }
}

// ----- Factory -----

export function createAdapter(config: AdapterConfig, execGh: GhExecFn): OrchestratorAdapter {
  if (config.type === 'github') {
    return new GitHubAdapter(config, execGh);
  }
  throw new Error(`Unknown adapter type: "${config.type}". Supported types: github`);
}
