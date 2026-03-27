import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trackBlockers,
  writeDiagnosticsJson,
  writeAlertMd,
  runSelfHealingAndDiagnostics,
  type BlockerRecord,
} from './scan-diagnostics.js';
import type { ScanPassResult, OrchestratorState } from '../commands/orchestrate.js';
import type { OrchestratorAdapter } from './adapter.js';

// --- Helpers ---

function makePassResult(overrides: Partial<ScanPassResult> = {}): ScanPassResult {
  return {
    iteration: 1,
    triage: { processed_issues: 0, triaged_entries: 0 },
    specQuestions: { processed: 0, waiting: 0, autoResolved: 0, userOverrides: 0 },
    dispatched: 0,
    queueProcessed: 0,
    specConsistencyProcessed: false,
    childMonitoring: null,
    prLifecycles: [],
    waveAdvanced: false,
    budgetExceeded: false,
    allDone: false,
    shouldStop: false,
    replan: null,
    bulkFetch: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    spec_file: 'SPEC.md',
    trunk_branch: 'main',
    concurrency_cap: 2,
    current_wave: 1,
    plan_only: false,
    issues: [],
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// --- trackBlockers ---

test('trackBlockers: new blocker created from child failure', () => {
  const pass = makePassResult({
    iteration: 1,
    dispatched: 1, // suppress no_progress
    childMonitoring: {
      monitored: 1,
      prs_created: 0,
      failed: 1,
      still_running: 0,
      errors: 0,
      entries: [
        {
          issue_number: 42,
          child_session: 'sess-1',
          child_state: 'failed',
          stuck_count: 0,
          action: 'failed',
          error: 'OOM error occurred',
        },
      ],
    },
  });

  const result = trackBlockers(pass, [], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.type, 'child_failed');
  assert.equal(result[0]!.affectedIssue, 42);
  assert.equal(result[0]!.count, 1);
  assert.equal(result[0]!.firstSeenIteration, 1);
  assert.equal(result[0]!.lastSeenIteration, 1);
  assert.ok(result[0]!.hash.length > 0);
});

test('trackBlockers: existing blocker accumulates count', () => {
  const pass = makePassResult({
    iteration: 2,
    dispatched: 1, // suppress no_progress
    childMonitoring: {
      monitored: 1,
      prs_created: 0,
      failed: 1,
      still_running: 0,
      errors: 0,
      entries: [
        {
          issue_number: 42,
          child_session: 'sess-1',
          child_state: 'failed',
          stuck_count: 0,
          action: 'failed',
          error: 'OOM error occurred',
        },
      ],
    },
  });

  const existing: BlockerRecord[] = [
    {
      hash: 'child_failed:42:OOM error occurred',
      type: 'child_failed',
      affectedIssue: 42,
      errorSnippet: 'OOM error occurred',
      firstSeenIteration: 1,
      lastSeenIteration: 1,
      count: 1,
    },
  ];

  const result = trackBlockers(pass, existing, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.count, 2);
  assert.equal(result[0]!.firstSeenIteration, 1);
  assert.equal(result[0]!.lastSeenIteration, 2);
});

test('trackBlockers: hash uniqueness across types and issues', () => {
  const pass = makePassResult({
    iteration: 1,
    dispatched: 1, // suppress no_progress
    childMonitoring: {
      monitored: 2,
      prs_created: 0,
      failed: 1,
      still_running: 0,
      errors: 1,
      entries: [
        { issue_number: 1, child_session: 's1', child_state: 'failed', stuck_count: 0, action: 'failed', error: 'err' },
        { issue_number: 2, child_session: 's2', child_state: 'failed', stuck_count: 0, action: 'exited_no_pr', error: 'err' },
      ],
    },
  });

  const result = trackBlockers(pass, [], 1);
  assert.equal(result.length, 2);
  const hashes = new Set(result.map((r) => r.hash));
  assert.equal(hashes.size, 2);
});

test('trackBlockers: no_progress blocker when nothing happens', () => {
  const pass = makePassResult({ iteration: 3, dispatched: 0, waveAdvanced: false, allDone: false, budgetExceeded: false, shouldStop: false });
  const result = trackBlockers(pass, [], 3);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.type, 'no_progress');
  assert.equal(result[0]!.affectedIssue, null);
});

test('trackBlockers: no no_progress blocker when allDone', () => {
  const pass = makePassResult({ iteration: 1, dispatched: 0, waveAdvanced: false, allDone: true });
  const result = trackBlockers(pass, [], 1);
  assert.equal(result.length, 0);
});

test('trackBlockers: no no_progress blocker when something was dispatched', () => {
  const pass = makePassResult({ iteration: 1, dispatched: 1 });
  const result = trackBlockers(pass, [], 1);
  assert.equal(result.length, 0);
});

// --- writeDiagnosticsJson ---

test('writeDiagnosticsJson: writes file when count >= threshold', async () => {
  const written: { path: string; data: string }[] = [];
  const writeFile = async (p: string, d: string) => { written.push({ path: p, data: d }); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 5, errorSnippet: 'err', firstSeenIteration: 1, lastSeenIteration: 3, count: 3 },
  ];
  await writeDiagnosticsJson('/ses', records, 3, () => new Date('2024-01-01T00:00:00Z'), writeFile as never);
  assert.equal(written.length, 1);
  assert.equal(written[0]!.path, '/ses/diagnostics.json');
  const parsed = JSON.parse(written[0]!.data) as { affected_issues: number[]; suggested_actions: string[] };
  assert.deepEqual(parsed.affected_issues, [5]);
  assert.ok(parsed.suggested_actions.length > 0);
});

test('writeDiagnosticsJson: does NOT write when count < threshold', async () => {
  const written: unknown[] = [];
  const writeFile = async () => { written.push(true); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 5, errorSnippet: 'err', firstSeenIteration: 1, lastSeenIteration: 2, count: 2 },
  ];
  await writeDiagnosticsJson('/ses', records, 3, () => new Date(), writeFile as never);
  assert.equal(written.length, 0);
});

// --- writeAlertMd ---

test('writeAlertMd: writes when count >= threshold * 2', async () => {
  const written: { path: string; data: string }[] = [];
  const writeFile = async (p: string, d: string) => { written.push({ path: p, data: d }); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 7, errorSnippet: 'bad', firstSeenIteration: 1, lastSeenIteration: 6, count: 6 },
  ];
  await writeAlertMd('/ses', records, 3, writeFile as never);
  assert.equal(written.length, 1);
  assert.equal(written[0]!.path, '/ses/ALERT.md');
  assert.ok(written[0]!.data.includes('ALERT'));
  assert.ok(written[0]!.data.includes('7'));
});

test('writeAlertMd: does NOT write when count < threshold * 2', async () => {
  const written: unknown[] = [];
  const writeFile = async () => { written.push(true); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 7, errorSnippet: 'bad', firstSeenIteration: 1, lastSeenIteration: 4, count: 4 },
  ];
  await writeAlertMd('/ses', records, 3, writeFile as never);
  assert.equal(written.length, 0);
});

// --- runSelfHealingAndDiagnostics stale session cleanup ---

test('runSelfHealingAndDiagnostics: stale session → removed from active.json, issue state set to failed', async () => {
  const files: Record<string, string> = {
    '/root/active.json': JSON.stringify({
      'sess-stale': { pid: 99999, session_dir: '/ses' },
    }),
    '/ses/orchestrator.json': JSON.stringify(makeState({
      issues: [
        {
          number: 1, title: 'Test', wave: 1, state: 'in_progress', child_session: 'sess-stale',
          pr_number: null, depends_on: [],
        },
      ],
    })),
  };
  const written: Record<string, string> = {};

  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: (p: string) => files[p] !== undefined,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => false,
  };

  const state = makeState({ diagnostics_blocker_threshold: 3 });
  const pass = makePassResult({ iteration: 1, allDone: true }); // allDone to suppress no_progress

  await runSelfHealingAndDiagnostics(pass, '/ses', [], state, null, deps, '/root');

  const active = JSON.parse(written['/root/active.json']!) as Record<string, unknown>;
  assert.ok(!('sess-stale' in active), 'stale session should be removed from active.json');

  const orchState = JSON.parse(written['/ses/orchestrator.json']!) as OrchestratorState;
  const issue = orchState.issues[0]!;
  assert.equal(issue.state, 'failed');
});

test('runSelfHealingAndDiagnostics: alive session not cleaned up', async () => {
  const files: Record<string, string> = {
    '/root/active.json': JSON.stringify({
      'sess-alive': { pid: 12345, session_dir: '/ses' },
    }),
    '/ses/orchestrator.json': JSON.stringify(makeState({
      issues: [
        { number: 1, title: 'Test', wave: 1, state: 'in_progress', child_session: 'sess-alive', pr_number: null, depends_on: [] },
      ],
    })),
  };
  const written: Record<string, string> = {};

  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: (p: string) => files[p] !== undefined,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState();
  const pass = makePassResult({ iteration: 1, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', [], state, null, deps, '/root');

  assert.ok(!written['/root/active.json'], 'active.json should not be rewritten if no stale entries');
});

// --- runSelfHealingAndDiagnostics label auto-creation ---

test('runSelfHealingAndDiagnostics: label_not_found blocker triggers ensureLabelExists', async () => {
  const ensureCalls: string[] = [];
  const adapter = {
    ensureLabelExists: async (label: string) => { ensureCalls.push(label); },
  } as unknown as OrchestratorAdapter;

  const existing: BlockerRecord[] = [
    {
      hash: 'label_not_found:null:aloop/needs-work',
      type: 'label_not_found',
      affectedIssue: null,
      errorSnippet: 'aloop/needs-work',
      firstSeenIteration: 1,
      lastSeenIteration: 1,
      count: 1,
    },
  ];

  const deps = {
    readFile: async (_p: string) => { throw new Error('no file'); },
    writeFile: async () => {},
    existsSync: () => false,
    now: () => new Date(),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 3 });
  const pass = makePassResult({ iteration: 2, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, adapter, deps);

  assert.ok(ensureCalls.includes('aloop/needs-work'), 'should call ensureLabelExists for label_not_found blocker');
});

test('runSelfHealingAndDiagnostics: label ensureLabelExists error is swallowed', async () => {
  const adapter = {
    ensureLabelExists: async () => { throw new Error('already exists'); },
  } as unknown as OrchestratorAdapter;

  const existing: BlockerRecord[] = [
    {
      hash: 'label_not_found:null:my-label',
      type: 'label_not_found',
      affectedIssue: null,
      errorSnippet: 'my-label',
      firstSeenIteration: 1,
      lastSeenIteration: 1,
      count: 1,
    },
  ];

  const deps = {
    readFile: async (_p: string) => { throw new Error('no file'); },
    writeFile: async () => {},
    existsSync: () => false,
    now: () => new Date(),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 3 });
  const pass = makePassResult({ iteration: 2, allDone: true });

  // Should not throw
  await assert.doesNotReject(() =>
    runSelfHealingAndDiagnostics(pass, '/ses', existing, state, adapter, deps),
  );
});

// --- default threshold ---

test('runSelfHealingAndDiagnostics: missing diagnostics_blocker_threshold defaults to 5', async () => {
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (_p: string) => { throw new Error('no file'); },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState(); // no diagnostics_blocker_threshold
  const existing: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 1, errorSnippet: 'err', firstSeenIteration: 1, lastSeenIteration: 5, count: 5 },
  ];
  const pass = makePassResult({ iteration: 6, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  // count=5 >= default threshold=5 → diagnostics.json should be written
  assert.ok(written['/ses/diagnostics.json'], 'diagnostics.json should be written with default threshold of 5');
});
