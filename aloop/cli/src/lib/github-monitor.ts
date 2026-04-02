import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// --- Types ---

export interface EtagCacheEntry {
  etag: string;
  cachedAt: string;
  data: unknown;
}

export interface EtagCacheState {
  version: 1;
  entries: Record<string, EtagCacheEntry>;
}

export interface GhExecResult {
  stdout: string;
  stderr: string;
}

export type GhExecFn = (args: string[]) => Promise<GhExecResult>;

export interface ConditionalRequestResult {
  status: 'modified' | 'not_modified' | 'error';
  data?: unknown;
  etag?: string;
  error?: string;
}

export interface BulkIssueState {
  number: number;
  title: string;
  state: string;
  updatedAt: string;
  labels: string[];
  assignees: string[];
  pr: {
    number: number;
    state: string;
    merged: boolean;
    mergeable: string | null;
    headSha: string;
    checkRuns: Array<{
      name: string;
      status: string;
      conclusion: string | null;
    }>;
  } | null;
  comments: Array<{
    id: number;
    author: string;
    body: string;
    createdAt: string;
  }>;
  projectStatus: string | null;
}

export interface BulkFetchResult {
  issues: BulkIssueState[];
  fetchedAt: string;
  fromCache: boolean;
}

// --- ETag Cache ---

const CACHE_VERSION = 1;
let _cacheTtlMs = 5 * 60 * 1000; // 5 minutes — configurable via setCacheTtlMs

/**
 * Override the default ETag cache TTL. Call once at startup if pipeline.yml
 * provides a custom gh_etag_cache_ttl_ms value.
 */
export function setCacheTtlMs(ttlMs: number): void {
  _cacheTtlMs = ttlMs;
}

export class EtagCache {
  private state: EtagCacheState;
  private cacheFile: string;
  private dirty: boolean;

  constructor(cacheDir: string) {
    this.cacheFile = path.join(cacheDir, 'etag-cache.json');
    this.state = { version: CACHE_VERSION, entries: {} };
    this.dirty = false;
  }

  async load(): Promise<void> {
    if (!existsSync(this.cacheFile)) return;
    try {
      const raw = await readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'version' in parsed &&
        (parsed as { version: number }).version === CACHE_VERSION &&
        'entries' in parsed &&
        typeof (parsed as { entries: unknown }).entries === 'object'
      ) {
        this.state = parsed as EtagCacheState;
      }
    } catch {
      // Corrupted cache — start fresh
      this.state = { version: CACHE_VERSION, entries: {} };
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const dir = path.dirname(this.cacheFile);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.cacheFile, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    this.dirty = false;
  }

  get(key: string): EtagCacheEntry | undefined {
    return this.state.entries[key];
  }

  set(key: string, etag: string, data: unknown): void {
    this.state.entries[key] = {
      etag,
      cachedAt: new Date().toISOString(),
      data,
    };
    this.dirty = true;
  }

  invalidate(key: string): boolean {
    if (key in this.state.entries) {
      delete this.state.entries[key];
      this.dirty = true;
      return true;
    }
    return false;
  }

  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of Object.keys(this.state.entries)) {
      if (key.startsWith(prefix)) {
        delete this.state.entries[key];
        count++;
      }
    }
    if (count > 0) this.dirty = true;
    return count;
  }

  clear(): void {
    this.state = { version: CACHE_VERSION, entries: {} };
    this.dirty = true;
  }

  isFresh(key: string, ttlMs: number = _cacheTtlMs): boolean {
    const entry = this.state.entries[key];
    if (!entry) return false;
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    return age < ttlMs;
  }
}

// --- Conditional Request Wrapper ---

/**
 * Execute a `gh api` request with ETag-based conditional caching.
 *
 * If a cached entry exists and is within TTL, returns cached data directly
 * without making a network request.
 *
 * If a cached ETag exists but TTL has expired, sends a conditional request
 * with `If-None-Match`. On 304, returns cached data. On 200, updates cache.
 *
 * On any error (including 304 parsing failure), falls back to the uncached
 * response so callers always get data.
 */
export async function ghApiWithEtag(
  endpoint: string,
  cache: EtagCache,
  execGh: GhExecFn,
  options: { ttlMs?: number; method?: string; extraArgs?: string[] } = {},
): Promise<ConditionalRequestResult> {
  const { ttlMs = _cacheTtlMs, method = 'GET', extraArgs = [] } = options;
  const cacheKey = `${method}:${endpoint}`;

  // Check if cache is still fresh — skip network entirely
  if (cache.isFresh(cacheKey, ttlMs)) {
    const entry = cache.get(cacheKey);
    if (entry) {
      return { status: 'modified', data: entry.data, etag: entry.etag };
    }
  }

  // Build gh api args
  const args = ['api', endpoint, '--method', method, '--include', ...extraArgs];

  // Add conditional request header if we have a cached ETag
  const cachedEntry = cache.get(cacheKey);
  if (cachedEntry?.etag) {
    args.push('-H', `If-None-Match: ${cachedEntry.etag}`);
  }

  try {
    const result = await execGh(args);
    const rawOutput = result.stdout;

    // Parse response: headers are separated from body by a blank line
    // gh api --include may use \r\n\r\n or \n\n depending on platform
    let headerEnd = rawOutput.indexOf('\r\n\r\n');
    let separatorLen = 4;
    if (headerEnd < 0) {
      headerEnd = rawOutput.indexOf('\n\n');
      separatorLen = 2;
    }
    const headerSection = headerEnd >= 0 ? rawOutput.substring(0, headerEnd) : '';
    const bodySection = headerEnd >= 0 ? rawOutput.substring(headerEnd + separatorLen) : rawOutput;

    // Check for 304 Not Modified
    const statusMatch = headerSection.match(/^HTTP\/[\d.]+ (\d{3})/m);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;

    if (statusCode === 304) {
      // Not modified — return cached data
      if (cachedEntry) {
        return { status: 'not_modified', data: cachedEntry.data, etag: cachedEntry.etag };
      }
      // No cached data but got 304 — shouldn't happen, treat as error
      return { status: 'error', error: '304 received but no cached data available' };
    }

    // Extract ETag from response headers
    const etagMatch = headerSection.match(/(?:^|\r?\n)etag:\s*(.+?)(?:\r?\n|$)/i);
    const newEtag = etagMatch ? etagMatch[1].trim().replace(/^"|"$/g, '') : undefined;

    // Parse body as JSON
    let data: unknown;
    try {
      data = JSON.parse(bodySection);
    } catch {
      data = bodySection;
    }

    // Update cache
    if (newEtag) {
      cache.set(cacheKey, newEtag, data);
    }

    return { status: 'modified', data, etag: newEtag };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: 'error', error: msg };
  }
}

// --- Bulk GraphQL Fetch ---

const BULK_ISSUE_QUERY = `
query($owner: String!, $repo: String!, $states: [IssueState!], $since: DateTime) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, states: $states, filterBy: {since: $since}, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        updatedAt
        labels(first: 20) {
          nodes { name }
        }
        assignees(first: 10) {
          nodes { login }
        }
        comments(last: 10) {
          nodes {
            id
            author { login }
            body
            createdAt
          }
        }
        projectItems(first: 5) {
          nodes {
            fieldValues(first: 20) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
          }
        }
        timelineItems(first: 1, itemTypes: [CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  state
                  merged
                  mergeable
                  headRefOid
                  commits(last: 1) {
                    nodes {
                      commit {
                        checkSuites(first: 5) {
                          nodes {
                            checkRuns(first: 20) {
                              nodes {
                                name
                                status
                                conclusion
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`.trim();

export function parseRepoSlug(repo: string): { owner: string; name: string } | null {
  const [owner, name, ...rest] = repo.split('/');
  if (!owner || !name || rest.length > 0) return null;
  return { owner, name };
}

/**
 * Fetch bulk issue state via a single GraphQL query.
 * Replaces multiple REST calls with one targeted query that returns
 * issue metadata, PR status, check runs, comments, and project status.
 */
export async function fetchBulkIssueState(
  repo: string,
  execGh: GhExecFn,
  options: {
    states?: string[];
    since?: string;
    issueNumbers?: number[];
  } = {},
): Promise<BulkFetchResult> {
  const slug = parseRepoSlug(repo);
  if (!slug) {
    return { issues: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  const { states = ['OPEN'], since } = options;

  const args = [
    'api', 'graphql',
    '-f', `query=${BULK_ISSUE_QUERY}`,
    '-F', `owner=${slug.owner}`,
    '-F', `repo=${slug.name}`,
    '-F', `states=${states.join(',')}`,
  ];

  if (since) {
    args.push('-F', `since=${since}`);
  }

  const result = await execGh(args);
  const parsed = JSON.parse(result.stdout) as {
    data?: {
      repository?: {
        issues?: {
          nodes?: Array<{
            number?: number;
            title?: string;
            state?: string;
            updatedAt?: string;
            labels?: { nodes?: Array<{ name?: string }> };
            assignees?: { nodes?: Array<{ login?: string }> };
            comments?: { nodes?: Array<{
              id?: string;
              author?: { login?: string };
              body?: string;
              createdAt?: string;
            }> };
            projectItems?: { nodes?: Array<{
              fieldValues?: { nodes?: Array<{
                name?: string;
                field?: { name?: string };
              }> };
            }> };
            timelineItems?: { nodes?: Array<{
              source?: {
                number?: number;
                state?: string;
                merged?: boolean;
                mergeable?: string;
                headRefOid?: string;
                commits?: { nodes?: Array<{
                  commit?: {
                    checkSuites?: { nodes?: Array<{
                      checkRuns?: { nodes?: Array<{
                        name?: string;
                        status?: string;
                        conclusion?: string | null;
                      }> };
                    }> };
                  };
                }> };
              };
            }> };
          }>;
        };
      };
    };
  };

  const nodes = parsed.data?.repository?.issues?.nodes ?? [];
  const issues: BulkIssueState[] = [];

  for (const node of nodes) {
    if (typeof node.number !== 'number') continue;

    // Extract PR info from timeline
    let pr: BulkIssueState['pr'] = null;
    const timelineNodes = node.timelineItems?.nodes ?? [];
    for (const timelineNode of timelineNodes) {
      const source = timelineNode?.source;
      if (source && typeof source.number === 'number') {
        const checkRuns: Array<{ name: string; status: string; conclusion: string | null }> = [];
        const commitNodes = source.commits?.nodes ?? [];
        for (const commitNode of commitNodes) {
          const suiteNodes = commitNode?.commit?.checkSuites?.nodes ?? [];
          for (const suite of suiteNodes) {
            const runNodes = suite?.checkRuns?.nodes ?? [];
            for (const run of runNodes) {
              if (typeof run?.name === 'string') {
                checkRuns.push({
                  name: run.name,
                  status: typeof run.status === 'string' ? run.status : '',
                  conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
                });
              }
            }
          }
        }

        pr = {
          number: source.number,
          state: typeof source.state === 'string' ? source.state : '',
          merged: source.merged === true,
          mergeable: typeof source.mergeable === 'string' ? source.mergeable : null,
          headSha: typeof source.headRefOid === 'string' ? source.headRefOid : '',
          checkRuns,
        };
        break;
      }
    }

    // Extract project status
    let projectStatus: string | null = null;
    const projectNodes = node.projectItems?.nodes ?? [];
    for (const projectNode of projectNodes) {
      const fieldNodes = projectNode?.fieldValues?.nodes ?? [];
      for (const fieldNode of fieldNodes) {
        if (fieldNode?.field?.name === 'Status' && typeof fieldNode.name === 'string') {
          projectStatus = fieldNode.name;
          break;
        }
      }
      if (projectStatus) break;
    }

    // Filter by specific issue numbers if provided
    if (options.issueNumbers && !options.issueNumbers.includes(node.number)) {
      continue;
    }

    issues.push({
      number: node.number,
      title: typeof node.title === 'string' ? node.title : '',
      state: typeof node.state === 'string' ? node.state : '',
      updatedAt: typeof node.updatedAt === 'string' ? node.updatedAt : '',
      labels: (node.labels?.nodes ?? [])
        .map((l) => (typeof l?.name === 'string' ? l.name : ''))
        .filter(Boolean),
      assignees: (node.assignees?.nodes ?? [])
        .map((a) => (typeof a?.login === 'string' ? a.login : ''))
        .filter(Boolean),
      pr,
      comments: (node.comments?.nodes ?? [])
        .filter((c): c is { id: string; author: { login?: string }; body: string; createdAt: string } =>
          typeof c?.id === 'string' && typeof c?.body === 'string')
        .map((c) => ({
          id: parseInt(c.id.replace(/\D/g, ''), 10) || 0,
          author: typeof c.author?.login === 'string' ? c.author.login : 'unknown',
          body: c.body,
          createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
        })),
      projectStatus,
    });
  }

  return {
    issues,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };
}

// --- Change Detection Helpers ---

export interface ChangeDetectionResult {
  changed: boolean;
  reason: string;
  previousUpdatedAt?: string;
  currentUpdatedAt?: string;
}

/**
 * Detect if an issue has changed by comparing timestamps from bulk fetch
 * against the last known state.
 */
export function detectIssueChanges(
  current: BulkIssueState,
  lastKnown: { updatedAt?: string; prNumber?: number | null; state?: string },
): ChangeDetectionResult {
  if (!lastKnown.updatedAt) {
    return { changed: true, reason: 'first_seen' };
  }

  if (current.updatedAt !== lastKnown.updatedAt) {
    return {
      changed: true,
      reason: 'timestamp_mismatch',
      previousUpdatedAt: lastKnown.updatedAt,
      currentUpdatedAt: current.updatedAt,
    };
  }

  // Check if PR appeared or changed
  if (current.pr && !lastKnown.prNumber) {
    return { changed: true, reason: 'pr_created' };
  }

  if (current.pr && lastKnown.prNumber && current.pr.number !== lastKnown.prNumber) {
    return { changed: true, reason: 'pr_changed' };
  }

  // Check if PR state changed
  if (current.pr && current.pr.state === 'MERGED' && lastKnown.state !== 'merged') {
    return { changed: true, reason: 'pr_merged' };
  }

  return { changed: false, reason: 'unchanged' };
}

/**
 * Build a `since` timestamp that covers a lookback window.
 * Used to limit GraphQL queries to recently-changed issues.
 */
export function buildSinceTimestamp(lookbackMinutes: number = 60): string {
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);
  return since.toISOString();
}
