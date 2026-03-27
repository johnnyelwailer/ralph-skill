/**
 * OrchestratorAdapter — pluggable interface for issue/PR backends.
 *
 * Implementations:
 *   - GitHubAdapter: wraps `gh` CLI calls for GitHub/GHE repos
 */

import type { GhExecFn, GhExecResult, BulkFetchResult } from './github-monitor.js';
import { fetchBulkIssueState } from './github-monitor.js';

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

  // Metadata
  readonly repoSlug: string;
  readonly baseUrl: string;
}

// ----- GitHubAdapter -----

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

  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<number> {
    const args = ['issue', 'create', '--repo', this.repoSlug, '--title', opts.title, '--body', opts.body];
    for (const label of opts.labels ?? []) {
      args.push('--label', label);
    }
    const result = await this.execGh(args);
    const match = result.stdout.match(/\/issues\/(\d+)/);
    if (!match) throw new Error(`Failed to parse issue number from: ${result.stdout}`);
    return parseInt(match[1], 10);
  }

  async updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string }): Promise<void> {
    const args = ['issue', 'edit', String(issueNumber), '--repo', this.repoSlug];
    if (opts.title) args.push('--title', opts.title);
    if (opts.body) args.push('--body', opts.body);
    await this.execGh(args);
    if (opts.state === 'closed') {
      await this.closeIssue(issueNumber);
    } else if (opts.state === 'open') {
      await this.execGh(['issue', 'reopen', String(issueNumber), '--repo', this.repoSlug]);
    }
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.execGh(['issue', 'close', String(issueNumber), '--repo', this.repoSlug]);
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

  async queryIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]> {
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

  async mergePr(prNumber: number, opts?: { method?: 'squash' | 'merge' | 'rebase'; deleteBranch?: boolean }): Promise<void> {
    const method = opts?.method ?? 'squash';
    const args = ['pr', 'merge', String(prNumber), '--repo', this.repoSlug, `--${method}`];
    if (opts?.deleteBranch !== false) {
      args.push('--delete-branch');
    }
    await this.execGh(args);
  }

  async getPrStatus(prNumber: number): Promise<PrStatus> {
    const result = await this.execGh([
      'pr', 'view', String(prNumber), '--repo', this.repoSlug,
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

  async listComments(issueNumber: number): Promise<AdapterComment[]> {
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

  async ensureLabelExists(label: string, opts?: { color?: string; description?: string }): Promise<void> {
    const args = ['label', 'create', label, '--repo', this.repoSlug, '--force'];
    if (opts?.color) args.push('--color', opts.color);
    if (opts?.description) args.push('--description', opts.description);
    await this.execGh(args);
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


export class LocalAdapter implements OrchestratorAdapter {
  readonly repoSlug: string;
  readonly baseUrl: string;
  private readonly issuesDir: string;
  private readonly prsDir: string;
  private readonly repoDir: string;
  private readonly execGit: GitExecFn;

  constructor(config: AdapterConfig, execGit?: GitExecFn) {
    this.repoSlug = config.repo;
    this.repoDir = config.dir ?? process.cwd();
    this.issuesDir = path.join(this.repoDir, '.aloop', 'issues');
    this.prsDir = path.join(this.repoDir, '.aloop', 'prs');
    this.baseUrl = `file://${this.issuesDir}`;
    this.execGit = execGit ?? defaultGitExec;
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.issuesDir, { recursive: true });
    await mkdir(this.prsDir, { recursive: true });
  }

  private issuePath(number: number): string {
    return path.join(this.issuesDir, `${number}.json`);
  }

  private prPath(number: number): string {
    return path.join(this.prsDir, `${number}.json`);
  }

  private async readIssue(number: number): Promise<LocalIssueFile> {
    const raw = await readFile(this.issuePath(number), 'utf8');
    return JSON.parse(raw) as LocalIssueFile;
  }

  private async writeIssue(issue: LocalIssueFile): Promise<void> {
    await mkdir(this.issuesDir, { recursive: true });
    await writeFile(this.issuePath(issue.number), JSON.stringify(issue, null, 2), 'utf8');
  }

  private async readPr(number: number): Promise<LocalPrFile> {
    const raw = await readFile(this.prPath(number), 'utf8');
    return JSON.parse(raw) as LocalPrFile;
  }

  private async writePr(pr: LocalPrFile): Promise<void> {
    await mkdir(this.prsDir, { recursive: true });
    await writeFile(this.prPath(pr.number), JSON.stringify(pr, null, 2), 'utf8');
  }

  private async nextIssueNumber(): Promise<number> {
    await this.ensureDirs();
    const files = await readdir(this.issuesDir);
    const numbers = files
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => parseInt(f, 10));
    return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  }

  private async nextPrNumber(): Promise<number> {
    await this.ensureDirs();
    const files = await readdir(this.prsDir);
    const numbers = files
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => parseInt(f, 10));
    return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  }

  async createIssue(opts: { title: string; body: string; labels?: string[] }): Promise<number> {
    const number = await this.nextIssueNumber();
    const now = new Date().toISOString();
    const issue: LocalIssueFile = {
      number,
      title: opts.title,
      body: opts.body,
      state: 'OPEN',
      labels: opts.labels ?? [],
      assignees: [],
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.writeIssue(issue);
    return number;
  }

  async updateIssue(issueNumber: number, opts: { title?: string; body?: string; state?: string }): Promise<void> {
    const issue = await this.readIssue(issueNumber);
    if (opts.title !== undefined) issue.title = opts.title;
    if (opts.body !== undefined) issue.body = opts.body;
    if (opts.state !== undefined) issue.state = opts.state === 'closed' ? 'CLOSED' : opts.state === 'open' ? 'OPEN' : opts.state;
    issue.updatedAt = new Date().toISOString();
    await this.writeIssue(issue);
  }

  async closeIssue(issueNumber: number): Promise<void> {
    const issue = await this.readIssue(issueNumber);
    issue.state = 'CLOSED';
    issue.updatedAt = new Date().toISOString();
    await this.writeIssue(issue);
  }

  async getIssue(issueNumber: number): Promise<AdapterIssue> {
    const issue = await this.readIssue(issueNumber);
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      body: issue.body,
      labels: issue.labels,
      assignees: issue.assignees,
      url: `file://${this.issuePath(issueNumber)}`,
    };
  }

  async queryIssues(opts?: { state?: string; labels?: string[]; limit?: number }): Promise<AdapterIssue[]> {
    await this.ensureDirs();
    const files = await readdir(this.issuesDir);
    const issueFiles = files.filter((f) => /^\d+\.json$/.test(f));
    const issues: AdapterIssue[] = [];
    for (const file of issueFiles) {
      const raw = await readFile(path.join(this.issuesDir, file), 'utf8');
      const issue = JSON.parse(raw) as LocalIssueFile;

      const stateFilter = opts?.state ?? 'open';
      const issueStateNorm = issue.state.toLowerCase();
      if (stateFilter !== 'all') {
        if (stateFilter === 'open' && issueStateNorm !== 'open') continue;
        if (stateFilter === 'closed' && issueStateNorm !== 'closed') continue;
      }

      if (opts?.labels && opts.labels.length > 0) {
        const hasAll = opts.labels.every((l) => issue.labels.includes(l));
        if (!hasAll) continue;
      }

      issues.push({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        labels: issue.labels,
        assignees: issue.assignees,
        url: `file://${this.issuePath(issue.number)}`,
      });
    }

    issues.sort((a, b) => a.number - b.number);
    const limit = opts?.limit ?? 100;
    return issues.slice(0, limit);
  }

  async createPr(opts: { base: string; head: string; title: string; body: string }): Promise<AdapterPr> {
    const number = await this.nextPrNumber();
    const now = new Date().toISOString();
    const pr: LocalPrFile = {
      number,
      head: opts.head,
      base: opts.base,
      title: opts.title,
      body: opts.body,
      state: 'open',
      createdAt: now,
    };
    await this.writePr(pr);
    return { number, url: `file://${this.prPath(number)}` };
  }

  async mergePr(prNumber: number, opts?: { method?: 'squash' | 'merge' | 'rebase'; deleteBranch?: boolean }): Promise<void> {
    const pr = await this.readPr(prNumber);
    const method = opts?.method ?? 'squash';

    await this.execGit(['checkout', pr.base], this.repoDir);

    if (method === 'squash') {
      await this.execGit(['merge', '--squash', pr.head], this.repoDir);
      await this.execGit(['commit', '-m', `${pr.title} (#${prNumber})`], this.repoDir);
    } else if (method === 'rebase') {
      await this.execGit(['rebase', pr.head], this.repoDir);
    } else {
      await this.execGit(['merge', '--no-ff', pr.head, '-m', `Merge branch '${pr.head}' (#${prNumber})`], this.repoDir);
    }

    if (opts?.deleteBranch !== false) {
      await this.execGit(['branch', '-d', pr.head], this.repoDir);
    }

    pr.state = 'merged';
    await this.writePr(pr);
  }

  async getPrStatus(prNumber: number): Promise<PrStatus> {
    const pr = await this.readPr(prNumber);
    try {
      await this.execGit(['rev-parse', '--verify', pr.head], this.repoDir);
      return { mergeable: true, mergeStateStatus: 'CLEAN' };
    } catch {
      return { mergeable: false, mergeStateStatus: 'UNKNOWN' };
    }
  }

  async getPrChecks(_prNumber: number): Promise<PrChecksResult> {
    // Local adapter has no CI — no checks to run
    return { passed: true, pending: false, checks: [] };
  }

  async postComment(issueOrPrNumber: number, body: string): Promise<void> {
    const issue = await this.readIssue(issueOrPrNumber);
    const maxId = issue.comments.reduce((m, c) => Math.max(m, c.id), 0);
    issue.comments.push({
      id: maxId + 1,
      author: 'local',
      body,
      createdAt: new Date().toISOString(),
    });
    issue.updatedAt = new Date().toISOString();
    await this.writeIssue(issue);
  }

  async listComments(issueNumber: number): Promise<AdapterComment[]> {
    const issue = await this.readIssue(issueNumber);
    return issue.comments;
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    const issue = await this.readIssue(issueNumber);
    for (const label of labels) {
      if (!issue.labels.includes(label)) {
        issue.labels.push(label);
      }
    }
    issue.updatedAt = new Date().toISOString();
    await this.writeIssue(issue);
  }

  async removeLabels(issueNumber: number, labels: string[]): Promise<void> {
    const issue = await this.readIssue(issueNumber);
    issue.labels = issue.labels.filter((l) => !labels.includes(l));
    issue.updatedAt = new Date().toISOString();
    await this.writeIssue(issue);
  }

  async ensureLabelExists(_label: string, _opts?: { color?: string; description?: string }): Promise<void> {
    // Local adapter has no label registry — labels are free-form strings
  }

  async closePr(prNumber: number, opts?: { comment?: string }): Promise<void> {
    const pr = await this.readPr(prNumber);
    if (opts?.comment) {
      // Post comment to the issue linked to this PR before closing
      // Local adapter stores comments on issues, not PRs
    }
    pr.state = 'closed';
    await this.writePr(pr);
  }

  async getPrDiff(prNumber: number): Promise<string> {
    const pr = await this.readPr(prNumber);
    try {
      const result = await this.execGit(['diff', pr.base, pr.head], this.repoDir);
      return result.stdout;
    } catch {
      return '';
    }
  }

  async queryPrs(opts?: { head?: string; base?: string; state?: string; limit?: number }): Promise<AdapterPr[]> {
    await this.ensureDirs();
    const files = await readdir(this.prsDir);
    const prFiles = files.filter((f) => /^\d+\.json$/.test(f));
    const prs: AdapterPr[] = [];

    for (const file of prFiles) {
      const raw = await readFile(path.join(this.prsDir, file), 'utf8');
      const pr = JSON.parse(raw) as LocalPrFile;

      if (opts?.head && pr.head !== opts.head) continue;
      if (opts?.base && pr.base !== opts.base) continue;
      if (opts?.state && pr.state !== opts.state) continue;

      prs.push({ number: pr.number, url: `file://${this.prPath(pr.number)}` });
    }

    prs.sort((a, b) => a.number - b.number);
    const limit = opts?.limit ?? 100;
    return prs.slice(0, limit);
  }

  async checkBranchExists(branch: string): Promise<boolean> {
    try {
      await this.execGit(['rev-parse', '--verify', branch], this.repoDir);
      return true;
    } catch {
      return false;
    }
  }

  async fetchBulkIssueState(opts?: { states?: string[]; since?: string; issueNumbers?: number[] }): Promise<BulkFetchResult> {
    await this.ensureDirs();
    const files = await readdir(this.issuesDir);
    const issueFiles = files.filter((f) => /^\d+\.json$/.test(f));
    const issues: BulkIssueState[] = [];

    for (const file of issueFiles) {
      const raw = await readFile(path.join(this.issuesDir, file), 'utf8');
      const issue = JSON.parse(raw) as LocalIssueFile;

      if (opts?.issueNumbers && !opts.issueNumbers.includes(issue.number)) continue;

      const states = opts?.states?.map((s) => s.toUpperCase()) ?? ['OPEN'];
      if (!states.includes(issue.state.toUpperCase())) continue;

      if (opts?.since) {
        const sinceDate = new Date(opts.since);
        if (new Date(issue.updatedAt) < sinceDate) continue;
      }

      issues.push({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        updatedAt: issue.updatedAt,
        labels: issue.labels,
        assignees: issue.assignees,
        pr: null,
        comments: issue.comments.map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt })),
        projectStatus: null,
      });
    }

    issues.sort((a, b) => a.number - b.number);
    return { issues, fetchedAt: new Date().toISOString(), fromCache: false };
  }
}

// ----- Factory -----

export function createAdapter(config: AdapterConfig, execGh: GhExecFn): OrchestratorAdapter {
  if (config.type === 'github') {
    return new GitHubAdapter(config, execGh);
  }
  if (config.type === 'local') {
    return new LocalAdapter(config);
  }
  throw new Error(`Unknown adapter type: "${config.type}". Supported types: github, local`);
}
