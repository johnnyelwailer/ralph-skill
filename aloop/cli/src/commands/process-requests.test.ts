import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { getDirectorySizeBytes, pruneLargeV8CacheDir, processRequestsCommand } from './process-requests.js';

interface ProcessRequestsFixture {
  rootDir: string;
  homeDir: string;
  sessionDir: string;
  requestsDir: string;
  cleanup: () => Promise<void>;
}

function makeState(issueOverrides: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: true,
    issues: issueOverrides.map((issue, index) => ({
      number: Number(issue.number ?? index + 1),
      title: String(issue.title ?? `Issue ${index + 1}`),
      body: String(issue.body ?? ''),
      wave: Number(issue.wave ?? 1),
      state: String(issue.state ?? 'pending'),
      status: String(issue.status ?? 'Needs refinement'),
      child_session: issue.child_session ?? null,
      pr_number: issue.pr_number ?? null,
      depends_on: Array.isArray(issue.depends_on) ? issue.depends_on : [],
      blocked_on_human: Boolean(issue.blocked_on_human ?? false),
      processed_comment_ids: Array.isArray(issue.processed_comment_ids) ? issue.processed_comment_ids : [],
      dor_validated: issue.dor_validated ?? false,
      ...issue,
    })),
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-22T00:00:00.000Z',
    updated_at: '2026-03-22T00:00:00.000Z',
  };
}

async function createFixture(issueOverrides: Record<string, unknown>[] = []): Promise<ProcessRequestsFixture> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-process-requests-'));
  const homeDir = path.join(rootDir, 'home');
  const sessionDir = path.join(rootDir, 'session');
  const requestsDir = path.join(sessionDir, 'requests');
  const projectRoot = path.join(rootDir, 'project');

  await mkdir(path.join(homeDir, '.aloop', 'sessions'), { recursive: true });
  await mkdir(path.join(homeDir, '.aloop', '.cache'), { recursive: true });
  await mkdir(requestsDir, { recursive: true });
  await mkdir(path.join(sessionDir, 'prompts'), { recursive: true });
  await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
  await mkdir(path.join(sessionDir, 'worktree'), { recursive: true });
  await mkdir(projectRoot, { recursive: true });

  await writeFile(path.join(sessionDir, 'meta.json'), JSON.stringify({ project_root: projectRoot }), 'utf8');
  await writeFile(path.join(sessionDir, 'loop-plan.json'), JSON.stringify({ iteration: 1 }), 'utf8');
  await writeFile(path.join(sessionDir, 'orchestrator.json'), JSON.stringify(makeState(issueOverrides), null, 2), 'utf8');

  return {
    rootDir,
    homeDir,
    sessionDir,
    requestsDir,
    cleanup: async () => {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe('process-requests V8 cache helpers', () => {
  it('getDirectorySizeBytes sums nested file sizes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-size-'));
    try {
      await mkdir(path.join(root, 'nested'), { recursive: true });
      await writeFile(path.join(root, 'a.bin'), Buffer.alloc(1024));
      await writeFile(path.join(root, 'nested', 'b.bin'), Buffer.alloc(2048));

      const total = await getDirectorySizeBytes(root);
      assert.equal(total, 3072);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir does not prune when below threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-small-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(2048));

      const result = await pruneLargeV8CacheDir(root, 10 * 1024);
      assert.equal(result.pruned, false);
      assert.equal(result.sizeBytes, 2048);
      assert.equal(existsSync(root), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir removes cache dir when above threshold', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-large-'));
    try {
      await writeFile(path.join(root, 'cache.bin'), Buffer.alloc(4096));

      const result = await pruneLargeV8CacheDir(root, 1024);
      assert.equal(result.pruned, true);
      assert.equal(result.sizeBytes, 4096);
      assert.equal(existsSync(root), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pruneLargeV8CacheDir is a no-op when directory is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'aloop-v8-missing-'));
    const missing = path.join(root, 'missing');
    try {
      const result = await pruneLargeV8CacheDir(missing, 1);
      assert.deepEqual(result, { sizeBytes: 0, pruned: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('processRequestsCommand error handling and concurrency', () => {
  it('ignores malformed estimate result files without crashing', async () => {
    const fixture = await createFixture([{ number: 7, state: 'pending' }]);
    try {
      const malformedEstimate = path.join(fixture.requestsDir, 'estimate-result-7.json');
      await writeFile(malformedEstimate, '{not-json', 'utf8');

      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
          output: 'json',
        });
      });

      const state = JSON.parse(await readFile(path.join(fixture.sessionDir, 'orchestrator.json'), 'utf8'));
      assert.equal(state.issues[0].dor_validated, false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('tolerates cleanup when child session directories are missing', async () => {
    const fixture = await createFixture([
      { number: 21, state: 'merged', child_session: 'missing-child-session' },
    ]);
    try {
      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
        });
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('swallows cleanup prune errors (permission-style rm failures)', async () => {
    const fixture = await createFixture([
      { number: 31, state: 'merged', child_session: 'child-cleanup-fail' },
    ]);
    const originalPath = process.env.PATH;
    try {
      const fakeBinDir = path.join(fixture.rootDir, 'fake-bin');
      await mkdir(fakeBinDir, { recursive: true });
      const fakeRmPath = path.join(fakeBinDir, 'rm');
      await writeFile(fakeRmPath, '#!/usr/bin/env bash\nexit 1\n', 'utf8');
      await chmod(fakeRmPath, 0o755);
      process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

      const childCacheDir = path.join(
        fixture.homeDir,
        '.aloop',
        'sessions',
        'child-cleanup-fail',
        '.v8-cache',
      );
      await mkdir(childCacheDir, { recursive: true });
      await writeFile(path.join(childCacheDir, 'cache.bin'), 'x', 'utf8');

      await assert.doesNotReject(async () => {
        await processRequestsCommand({
          sessionDir: fixture.sessionDir,
          homeDir: fixture.homeDir,
        });
      });

      assert.equal(existsSync(childCacheDir), true);
    } finally {
      process.env.PATH = originalPath;
      await fixture.cleanup();
    }
  });

  it('handles concurrent invocations over the same requests directory', async () => {
    const fixture = await createFixture([{ number: 42, state: 'pending' }]);
    try {
      await writeFile(
        path.join(fixture.requestsDir, 'estimate-result-42.json'),
        JSON.stringify({ issue_number: 42, dor_passed: true, complexity_tier: 'S', iteration_estimate: 1 }),
        'utf8',
      );

      const settled = await Promise.allSettled([
        processRequestsCommand({ sessionDir: fixture.sessionDir, homeDir: fixture.homeDir }),
        processRequestsCommand({ sessionDir: fixture.sessionDir, homeDir: fixture.homeDir }),
      ]);

      assert.deepEqual(
        settled.map((entry) => entry.status),
        ['fulfilled', 'fulfilled'],
      );

      const archivedEstimate = path.join(fixture.requestsDir, 'processed', 'estimate-result-42.json');
      assert.equal(existsSync(archivedEstimate), true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('creates PR for completed child session even when issue status text is stale', async () => {
    const fixture = await createFixture([
      {
        number: 42,
        title: 'Ship feature',
        state: 'in_progress',
        status: 'Needs refinement',
        child_session: 'child-42',
      },
    ]);
    const originalPath = process.env.PATH;
    try {
      const statePath = path.join(fixture.sessionDir, 'orchestrator.json');
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      state.filter_repo = 'acme/widgets';
      await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

      const childDir = path.join(fixture.homeDir, '.aloop', 'sessions', 'child-42');
      const childWorktree = path.join(childDir, 'worktree');
      await mkdir(childWorktree, { recursive: true });
      await writeFile(path.join(childDir, 'status.json'), JSON.stringify({ state: 'completed' }), 'utf8');

      const fakeBinDir = path.join(fixture.rootDir, 'fake-bin');
      await mkdir(fakeBinDir, { recursive: true });
      const ghBodyLog = path.join(fixture.rootDir, 'gh-body.log');
      const ghScript = `#!/usr/bin/env bash
set -u
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  prev=""
  for arg in "$@"; do
    if [ "$prev" = "--body" ]; then
      printf '%s\\n' "$arg" >> "${ghBodyLog}"
      break
    fi
    prev="$arg"
  done
  echo "https://github.com/acme/widgets/pull/123"
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"comments":[],"mergeable":"MERGEABLE"}'
  exit 0
fi
echo '{}'
exit 0
`;
      const gitScript = `#!/usr/bin/env bash
set -u
if [ "$#" -ge 4 ] && [ "$1" = "-C" ] && [ "$3" = "status" ] && [ "$4" = "--porcelain" ]; then
  exit 0
fi
if [ "$#" -ge 3 ] && [ "$1" = "-C" ] && [ "$3" = "status" ]; then
  echo ""
  exit 0
fi
exit 0
`;
      await writeFile(path.join(fakeBinDir, 'gh'), ghScript, 'utf8');
      await writeFile(path.join(fakeBinDir, 'git'), gitScript, 'utf8');
      await chmod(path.join(fakeBinDir, 'gh'), 0o755);
      await chmod(path.join(fakeBinDir, 'git'), 0o755);
      process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`;

      await processRequestsCommand({
        sessionDir: fixture.sessionDir,
        homeDir: fixture.homeDir,
      });

      const updated = JSON.parse(await readFile(statePath, 'utf8'));
      assert.equal(updated.issues[0].pr_number, 123);
      assert.equal(updated.issues[0].state, 'pr_open');
      assert.equal(updated.issues[0].status, 'In review');

      const ghBody = await readFile(ghBodyLog, 'utf8');
      assert.ok(ghBody.includes('Closes #42'));
    } finally {
      process.env.PATH = originalPath;
      await fixture.cleanup();
    }
  });
});
