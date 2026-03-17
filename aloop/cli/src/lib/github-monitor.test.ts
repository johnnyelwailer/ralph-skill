import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  EtagCache,
  ghApiWithEtag,
  fetchBulkIssueState,
  parseRepoSlug,
  detectIssueChanges,
  buildSinceTimestamp,
  type GhExecFn,
  type BulkIssueState,
} from './github-monitor.js';

// --- EtagCache tests ---

describe('EtagCache', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'etag-cache-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('starts with empty cache', async () => {
    const cache = new EtagCache(tmpDir);
    assert.equal(cache.get('any-key'), undefined);
  });

  it('persists entries across load/save', async () => {
    const cache = new EtagCache(tmpDir);
    cache.set('GET:/test', 'etag-123', { data: 'value' });
    await cache.save();

    const cache2 = new EtagCache(tmpDir);
    await cache2.load();
    const entry = cache2.get('GET:/test');
    assert.ok(entry);
    assert.equal(entry.etag, 'etag-123');
    assert.deepEqual(entry.data, { data: 'value' });
  });

  it('handles corrupt cache file gracefully', async () => {
    const cache = new EtagCache(tmpDir);
    await writeFile(path.join(tmpDir, 'github-etag-cache.json'), '{broken', 'utf8');
    await cache.load();
    // Should not throw, should start fresh
    assert.equal(cache.get('any-key'), undefined);
  });

  it('handles wrong version cache file', async () => {
    const cache = new EtagCache(tmpDir);
    await writeFile(
      path.join(tmpDir, 'github-etag-cache.json'),
      JSON.stringify({ version: 99, entries: { 'key': { etag: 'x', cachedAt: '', data: null } } }),
      'utf8',
    );
    await cache.load();
    assert.equal(cache.get('key'), undefined);
  });

  it('invalidates single entries', () => {
    const cache = new EtagCache(tmpDir);
    cache.set('GET:/a', 'etag-a', 'data-a');
    cache.set('GET:/b', 'etag-b', 'data-b');

    assert.ok(cache.invalidate('GET:/a'));
    assert.equal(cache.get('GET:/a'), undefined);
    assert.ok(cache.get('GET:/b'));
  });

  it('invalidates by prefix', () => {
    const cache = new EtagCache(tmpDir);
    cache.set('GET:repos/o/r/issues/1', 'e1', 'd1');
    cache.set('GET:repos/o/r/issues/2', 'e2', 'd2');
    cache.set('GET:repos/o/r/pulls/1', 'e3', 'd3');

    const count = cache.invalidatePrefix('GET:repos/o/r/issues/');
    assert.equal(count, 2);
    assert.equal(cache.get('GET:repos/o/r/issues/1'), undefined);
    assert.equal(cache.get('GET:repos/o/r/issues/2'), undefined);
    assert.ok(cache.get('GET:repos/o/r/pulls/1'));
  });

  it('clears all entries', () => {
    const cache = new EtagCache(tmpDir);
    cache.set('a', 'e', 'd');
    cache.set('b', 'e', 'd');
    cache.clear();
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('b'), undefined);
  });

  it('checks freshness with TTL', () => {
    const cache = new EtagCache(tmpDir);
    cache.set('GET:/fresh', 'etag', 'data');

    // Should be fresh with 60s TTL
    assert.ok(cache.isFresh('GET:/fresh', 60000));

    // Non-existent key is not fresh
    assert.ok(!cache.isFresh('GET:/missing', 60000));
  });

  it('saves only when dirty', async () => {
    const cache = new EtagCache(tmpDir);
    await cache.save(); // no-op, not dirty

    // File should not exist
    const cacheFile = path.join(tmpDir, 'github-etag-cache.json');
    try {
      await readFile(cacheFile, 'utf8');
      assert.fail('file should not exist');
    } catch {
      // expected
    }

    cache.set('key', 'etag', 'data');
    await cache.save();

    const content = await readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.version, 1);
    assert.ok(parsed.entries.key);
  });
});

// --- ghApiWithEtag tests ---

describe('ghApiWithEtag', () => {
  let tmpDir: string;
  let cache: EtagCache;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gh-etag-test-'));
    cache = new EtagCache(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('makes unconditional request when no cached ETag', async () => {
    const mockExec: GhExecFn = async (args) => {
      assert.ok(args.includes('--include'));
      assert.ok(!args.some((a) => a.includes('If-None-Match')));
      return {
        stdout: 'HTTP/1.1 200 OK\r\nETag: "abc123"\r\n\r\n{"key":"value"}',
        stderr: '',
      };
    };

    const result = await ghApiWithEtag('repos/test/repo', cache, mockExec);
    assert.equal(result.status, 'modified');
    assert.deepEqual(result.data, { key: 'value' });
    assert.equal(result.etag, 'abc123');

    // Cache should be populated
    const entry = cache.get('GET:repos/test/repo');
    assert.ok(entry);
    assert.equal(entry.etag, 'abc123');
  });

  it('sends conditional request with cached ETag', async () => {
    cache.set('GET:repos/test/repo', 'existing-etag', { cached: true });

    const mockExec: GhExecFn = async (args) => {
      assert.ok(args.includes('--include'));
      assert.ok(args.some((a) => a.includes('If-None-Match')), 'should include If-None-Match header');
      const headerArg = args.find((a) => a.includes('If-None-Match'));
      assert.ok(headerArg?.includes('existing-etag'), 'should include cached ETag value');
      return {
        stdout: 'HTTP/1.1 304 Not Modified\r\n\r\n',
        stderr: '',
      };
    };

    const result = await ghApiWithEtag('repos/test/repo', cache, mockExec, { ttlMs: 0 });
    assert.equal(result.status, 'not_modified');
    assert.deepEqual(result.data, { cached: true });
  });

  it('returns cached data directly when within TTL', async () => {
    cache.set('GET:repos/test/repo', 'etag', { cached: true });

    let execCalled = false;
    const mockExec: GhExecFn = async () => {
      execCalled = true;
      throw new Error('should not be called');
    };

    // TTL of 60 seconds — cache entry was just set, so it's fresh
    const result = await ghApiWithEtag('repos/test/repo', cache, mockExec, { ttlMs: 60000 });
    assert.equal(result.status, 'modified');
    assert.deepEqual(result.data, { cached: true });
    assert.ok(!execCalled);
  });

  it('handles exec errors gracefully', async () => {
    const mockExec: GhExecFn = async () => {
      throw new Error('network error');
    };

    const result = await ghApiWithEtag('repos/test/repo', cache, mockExec);
    assert.equal(result.status, 'error');
    assert.ok(result.error?.includes('network error'));
  });

  it('handles response without ETag header', async () => {
    const mockExec: GhExecFn = async () => ({
      stdout: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"no":"etag"}',
      stderr: '',
    });

    const result = await ghApiWithEtag('repos/test/repo', cache, mockExec);
    assert.equal(result.status, 'modified');
    assert.deepEqual(result.data, { no: 'etag' });
    assert.equal(result.etag, undefined);
    // Cache should NOT be updated without ETag
    assert.equal(cache.get('GET:repos/test/repo'), undefined);
  });
});

// --- fetchBulkIssueState tests ---

describe('fetchBulkIssueState', () => {
  it('returns empty array for invalid repo slug', async () => {
    const result = await fetchBulkIssueState('invalid', async () => ({ stdout: '{}', stderr: '' }));
    assert.deepEqual(result.issues, []);
  });

  it('parses bulk GraphQL response correctly', async () => {
    const mockResponse = {
      data: {
        repository: {
          issues: {
            nodes: [
              {
                number: 42,
                title: 'Test Issue',
                state: 'OPEN',
                updatedAt: '2026-03-17T10:00:00Z',
                labels: { nodes: [{ name: 'bug' }, { name: 'P1' }] },
                assignees: { nodes: [{ login: 'user1' }] },
                comments: {
                  nodes: [
                    {
                      id: 'IC_123',
                      author: { login: 'reviewer' },
                      body: 'Looks good',
                      createdAt: '2026-03-17T09:00:00Z',
                    },
                  ],
                },
                projectItems: {
                  nodes: [
                    {
                      fieldValues: {
                        nodes: [
                          {
                            name: 'In Progress',
                            field: { name: 'Status' },
                          },
                        ],
                      },
                    },
                  ],
                },
                timelineItems: {
                  nodes: [
                    {
                      source: {
                        number: 100,
                        state: 'OPEN',
                        merged: false,
                        mergeable: 'MERGEABLE',
                        headRefOid: 'abc123def',
                        commits: {
                          nodes: [
                            {
                              commit: {
                                checkSuites: {
                                  nodes: [
                                    {
                                      checkRuns: {
                                        nodes: [
                                          { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
                                          { name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
                                        ],
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    const mockExec: GhExecFn = async () => ({
      stdout: JSON.stringify(mockResponse),
      stderr: '',
    });

    const result = await fetchBulkIssueState('owner/repo', mockExec);
    assert.equal(result.issues.length, 1);

    const issue = result.issues[0];
    assert.equal(issue.number, 42);
    assert.equal(issue.title, 'Test Issue');
    assert.equal(issue.state, 'OPEN');
    assert.deepEqual(issue.labels, ['bug', 'P1']);
    assert.deepEqual(issue.assignees, ['user1']);
    assert.equal(issue.projectStatus, 'In Progress');
    assert.ok(issue.pr);
    assert.equal(issue.pr.number, 100);
    assert.equal(issue.pr.merged, false);
    assert.equal(issue.pr.checkRuns.length, 2);
    assert.equal(issue.pr.checkRuns[0].name, 'test');
    assert.equal(issue.pr.checkRuns[1].conclusion, 'FAILURE');
    assert.equal(issue.comments.length, 1);
    assert.equal(issue.comments[0].author, 'reviewer');
  });

  it('handles issues without PRs', async () => {
    const mockResponse = {
      data: {
        repository: {
          issues: {
            nodes: [
              {
                number: 1,
                title: 'No PR issue',
                state: 'OPEN',
                updatedAt: '2026-03-17T08:00:00Z',
                labels: { nodes: [] },
                assignees: { nodes: [] },
                comments: { nodes: [] },
                projectItems: { nodes: [] },
                timelineItems: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    const result = await fetchBulkIssueState('o/r', async () => ({
      stdout: JSON.stringify(mockResponse),
      stderr: '',
    }));

    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].pr, null);
    assert.equal(result.issues[0].projectStatus, null);
  });

  it('filters by issueNumbers when provided', async () => {
    const mockResponse = {
      data: {
        repository: {
          issues: {
            nodes: [
              {
                number: 1,
                title: 'Issue 1',
                state: 'OPEN',
                updatedAt: '2026-03-17T08:00:00Z',
                labels: { nodes: [] },
                assignees: { nodes: [] },
                comments: { nodes: [] },
                projectItems: { nodes: [] },
                timelineItems: { nodes: [] },
              },
              {
                number: 2,
                title: 'Issue 2',
                state: 'OPEN',
                updatedAt: '2026-03-17T08:00:00Z',
                labels: { nodes: [] },
                assignees: { nodes: [] },
                comments: { nodes: [] },
                projectItems: { nodes: [] },
                timelineItems: { nodes: [] },
              },
            ],
          },
        },
      },
    };

    const result = await fetchBulkIssueState('o/r', async () => ({
      stdout: JSON.stringify(mockResponse),
      stderr: '',
    }), { issueNumbers: [2] });

    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].number, 2);
  });

  it('handles malformed response gracefully', async () => {
    const result = await fetchBulkIssueState('o/r', async () => ({
      stdout: '{}',
      stderr: '',
    }));
    assert.deepEqual(result.issues, []);
  });
});

// --- parseRepoSlug tests ---

describe('parseRepoSlug', () => {
  it('parses valid slugs', () => {
    assert.deepEqual(parseRepoSlug('owner/repo'), { owner: 'owner', name: 'repo' });
    assert.deepEqual(parseRepoSlug('org/project'), { owner: 'org', name: 'project' });
  });

  it('rejects invalid slugs', () => {
    assert.equal(parseRepoSlug(''), null);
    assert.equal(parseRepoSlug('noslash'), null);
    assert.equal(parseRepoSlug('a/b/c'), null);
    assert.equal(parseRepoSlug('/repo'), null);
    assert.equal(parseRepoSlug('owner/'), null);
  });
});

// --- detectIssueChanges tests ---

describe('detectIssueChanges', () => {
  it('detects first seen', () => {
    const current: BulkIssueState = {
      number: 1, title: '', state: 'OPEN', updatedAt: '', labels: [],
      assignees: [], pr: null, comments: [], projectStatus: null,
    };
    const result = detectIssueChanges(current, {});
    assert.equal(result.changed, true);
    assert.equal(result.reason, 'first_seen');
  });

  it('detects timestamp mismatch', () => {
    const current: BulkIssueState = {
      number: 1, title: '', state: 'OPEN', updatedAt: '2026-03-17T10:00:00Z',
      labels: [], assignees: [], pr: null, comments: [], projectStatus: null,
    };
    const result = detectIssueChanges(current, { updatedAt: '2026-03-17T09:00:00Z' });
    assert.equal(result.changed, true);
    assert.equal(result.reason, 'timestamp_mismatch');
  });

  it('detects no change', () => {
    const current: BulkIssueState = {
      number: 1, title: '', state: 'OPEN', updatedAt: '2026-03-17T10:00:00Z',
      labels: [], assignees: [], pr: null, comments: [], projectStatus: null,
    };
    const result = detectIssueChanges(current, { updatedAt: '2026-03-17T10:00:00Z' });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'unchanged');
  });

  it('detects PR created', () => {
    const current: BulkIssueState = {
      number: 1, title: '', state: 'OPEN', updatedAt: '2026-03-17T10:00:00Z',
      labels: [], assignees: [],
      pr: { number: 5, state: 'OPEN', merged: false, mergeable: 'MERGEABLE', headSha: 'abc', checkRuns: [] },
      comments: [], projectStatus: null,
    };
    const result = detectIssueChanges(current, { updatedAt: '2026-03-17T10:00:00Z', prNumber: null });
    assert.equal(result.changed, true);
    assert.equal(result.reason, 'pr_created');
  });

  it('detects PR merged', () => {
    const current: BulkIssueState = {
      number: 1, title: '', state: 'OPEN', updatedAt: '2026-03-17T10:00:00Z',
      labels: [], assignees: [],
      pr: { number: 5, state: 'MERGED', merged: true, mergeable: null, headSha: 'abc', checkRuns: [] },
      comments: [], projectStatus: null,
    };
    const result = detectIssueChanges(current, { updatedAt: '2026-03-17T10:00:00Z', prNumber: 5, state: 'in_progress' });
    assert.equal(result.changed, true);
    assert.equal(result.reason, 'pr_merged');
  });
});

// --- buildSinceTimestamp tests ---

describe('buildSinceTimestamp', () => {
  it('returns ISO string within lookback window', () => {
    const ts = buildSinceTimestamp(60);
    const date = new Date(ts);
    assert.ok(!isNaN(date.getTime()));
    // Should be roughly 60 minutes ago
    const diff = Date.now() - date.getTime();
    assert.ok(diff >= 59 * 60 * 1000 && diff <= 61 * 60 * 1000);
  });

  it('accepts custom lookback', () => {
    const ts = buildSinceTimestamp(5);
    const date = new Date(ts);
    const diff = Date.now() - date.getTime();
    assert.ok(diff >= 4 * 60 * 1000 && diff <= 6 * 60 * 1000);
  });
});
