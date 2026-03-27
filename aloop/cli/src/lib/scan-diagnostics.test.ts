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
  assert.equal(result[0]!.hash, 'child_failed:42:OOM error occurred');
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

test('trackBlockers: non-array existingRecords falls back to empty array', () => {
  const pass = makePassResult({
    iteration: 1,
    dispatched: 1,
    childMonitoring: {
      monitored: 1,
      prs_created: 0,
      failed: 1,
      still_running: 0,
      errors: 0,
      entries: [
        { issue_number: 42, child_session: 'sess-1', child_state: 'failed', stuck_count: 0, action: 'failed', error: 'OOM' },
      ],
    },
  });
  const result = trackBlockers(pass, {} as unknown as BlockerRecord[], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.type, 'child_failed');
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
    { hash: 'h1', type: 'child_failed', affectedIssue: 5, errorSnippet: 'OOM error occurred', firstSeenIteration: 1, lastSeenIteration: 3, count: 3 },
  ];
  await writeDiagnosticsJson('/ses', records, 3, writeFile as never);
  assert.equal(written.length, 1);
  assert.equal(written[0]!.path, '/ses/diagnostics.json');
  const parsed = JSON.parse(written[0]!.data) as Array<{ type: string; message: string; first_seen_iteration: number; current_iteration: number; severity: string; suggested_fix: string }>;
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.type, 'child_failed');
  assert.equal(parsed[0]!.message, 'OOM error occurred');
  assert.equal(parsed[0]!.first_seen_iteration, 1);
  assert.equal(parsed[0]!.current_iteration, 3);
  assert.equal(parsed[0]!.severity, 'warning');
  assert.equal(parsed[0]!.suggested_fix, 'Investigate child_failed for issue #5: OOM error occurred');
});

test('writeDiagnosticsJson: does NOT write when count < threshold', async () => {
  const written: unknown[] = [];
  const writeFile = async () => { written.push(true); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 5, errorSnippet: 'err', firstSeenIteration: 1, lastSeenIteration: 2, count: 2 },
  ];
  await writeDiagnosticsJson('/ses', records, 3, writeFile as never);
  assert.equal(written.length, 0);
});

// --- writeAlertMd ---

test('writeAlertMd: writes when count >= threshold', async () => {
  const written: { path: string; data: string }[] = [];
  const writeFile = async (p: string, d: string) => { written.push({ path: p, data: d }); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 7, errorSnippet: 'bad', firstSeenIteration: 1, lastSeenIteration: 6, count: 6 },
  ];
  await writeAlertMd('/ses', records, 3, writeFile as never);
  assert.equal(written.length, 1);
  assert.equal(written[0]!.path, '/ses/ALERT.md');
  assert.ok(written[0]!.data.includes('# ALERT: Persistent Blockers Detected'));
  assert.ok(written[0]!.data.includes('## child_failed (issue 7)'));
});

test('writeAlertMd: does NOT write when count < threshold', async () => {
  const written: unknown[] = [];
  const writeFile = async () => { written.push(true); };
  const records: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 7, errorSnippet: 'bad', firstSeenIteration: 1, lastSeenIteration: 2, count: 2 },
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

test('runSelfHealingAndDiagnostics: stale session with no matching child_session does not rewrite orchestrator.json', async () => {
  const files: Record<string, string> = {
    '/root/active.json': JSON.stringify({
      'sess-stale': { pid: 99999, session_dir: '/ses' },
    }),
    '/ses/orchestrator.json': JSON.stringify(makeState({
      issues: [
        {
          number: 1, title: 'Test', wave: 1, state: 'in_progress', child_session: 'sess-other',
          pr_number: null, depends_on: [],
        },
        {
          number: 2, title: 'Test2', wave: 1, state: 'in_progress', child_session: null,
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
  const pass = makePassResult({ iteration: 1, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', [], state, null, deps, '/root');

  // active.json should be rewritten with stale entry removed
  const active = JSON.parse(written['/root/active.json']!) as Record<string, unknown>;
  assert.ok(!('sess-stale' in active), 'stale session should be removed from active.json');

  // orchestrator.json should NOT be rewritten because no issue matched the stale session
  assert.ok(!written['/ses/orchestrator.json'], 'orchestrator.json should NOT be rewritten when no issue matches stale session');
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
  const diag = JSON.parse(written['/ses/diagnostics.json']!) as Array<{ type: string; severity: string; suggested_fix: string }>;
  assert.equal(diag.length, 1);
  assert.equal(diag[0]!.type, 'child_failed');
  assert.equal(diag[0]!.severity, 'warning');
  assert.equal(diag[0]!.suggested_fix, 'Investigate child_failed for issue #1: err');
});

// --- stuck: true written to orchestrator.json ---

test('runSelfHealingAndDiagnostics: writes stuck:true to orchestrator.json when blocker count >= threshold', async () => {
  const orchState = makeState({ diagnostics_blocker_threshold: 5 });
  const files: Record<string, string> = {
    '/ses/orchestrator.json': JSON.stringify(orchState),
  };
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const existing: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 3, errorSnippet: 'OOM', firstSeenIteration: 1, lastSeenIteration: 5, count: 5 },
  ];
  const pass = makePassResult({ iteration: 6, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, orchState, null, deps);

  assert.ok(written['/ses/orchestrator.json'], 'orchestrator.json should be written');
  const saved = JSON.parse(written['/ses/orchestrator.json']!) as OrchestratorState;
  assert.equal(saved.stuck, true);
});

test('runSelfHealingAndDiagnostics: does NOT write stuck when no blocker reaches threshold', async () => {
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (_p: string) => { throw new Error('no file'); },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 5 });
  const existing: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 3, errorSnippet: 'OOM', firstSeenIteration: 1, lastSeenIteration: 4, count: 4 },
  ];
  const pass = makePassResult({ iteration: 5, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  assert.ok(!written['/ses/orchestrator.json'], 'orchestrator.json should NOT be written when count < threshold');
});

// --- no_progress escalation: pause loop ---

test('runSelfHealingAndDiagnostics: no_progress blocker at threshold writes state:paused to status.json', async () => {
  const files: Record<string, string> = {
    '/ses/status.json': JSON.stringify({ state: 'running', phase: 'build', iteration: 5 }),
  };
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 5 });
  const existing: BlockerRecord[] = [
    { hash: 'no_progress:null:No issues dispatched or triaged', type: 'no_progress', affectedIssue: null, errorSnippet: 'No issues dispatched or triaged', firstSeenIteration: 1, lastSeenIteration: 5, count: 5 },
  ];
  const pass = makePassResult({ iteration: 6, dispatched: 0, waveAdvanced: false, allDone: false, budgetExceeded: false, shouldStop: false });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  assert.ok(written['/ses/status.json'], 'status.json should be written');
  const status = JSON.parse(written['/ses/status.json']!) as { state: string };
  assert.equal(status.state, 'paused');
});

test('runSelfHealingAndDiagnostics: no_progress blocker below threshold does NOT pause', async () => {
  const files: Record<string, string> = {
    '/ses/status.json': JSON.stringify({ state: 'running', phase: 'build', iteration: 4 }),
  };
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 5 });
  const existing: BlockerRecord[] = [
    { hash: 'no_progress:null:No issues dispatched or triaged', type: 'no_progress', affectedIssue: null, errorSnippet: 'No issues dispatched or triaged', firstSeenIteration: 1, lastSeenIteration: 4, count: 3 },
  ];
  // dispatched=0, no wave advancement → no_progress detected → count increments 3→4 (still below threshold=5)
  const pass = makePassResult({ iteration: 5, dispatched: 0, waveAdvanced: false, allDone: false, budgetExceeded: false, shouldStop: false });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  assert.ok(!written['/ses/status.json'], 'status.json should NOT be written when no_progress count < threshold');
});

test('runSelfHealingAndDiagnostics: child_failed blocker at threshold does NOT pause loop', async () => {
  const files: Record<string, string> = {
    '/ses/status.json': JSON.stringify({ state: 'running', phase: 'build', iteration: 5 }),
  };
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-01T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 5 });
  const existing: BlockerRecord[] = [
    { hash: 'h1', type: 'child_failed', affectedIssue: 3, errorSnippet: 'OOM', firstSeenIteration: 1, lastSeenIteration: 5, count: 5 },
  ];
  const pass = makePassResult({ iteration: 6, allDone: true });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  assert.ok(!written['/ses/status.json'], 'status.json should NOT be written for non-no_progress blockers');
});

test('runSelfHealingAndDiagnostics: already paused status.json is not overwritten', async () => {
  const files: Record<string, string> = {
    '/ses/status.json': JSON.stringify({ state: 'paused', updated_at: '2024-01-01T00:00:00.000Z' }),
  };
  const written: Record<string, string> = {};
  const deps = {
    readFile: async (p: string) => {
      if (files[p] !== undefined) return files[p]!;
      throw new Error(`not found: ${p}`);
    },
    writeFile: async (p: string, d: string) => { written[p] = d; },
    existsSync: () => false,
    now: () => new Date('2024-01-02T00:00:00Z'),
    isProcessAlive: (_pid: number) => true,
  };

  const state = makeState({ diagnostics_blocker_threshold: 5 });
  const existing: BlockerRecord[] = [
    { hash: 'no_progress:null:No issues dispatched or triaged', type: 'no_progress', affectedIssue: null, errorSnippet: 'No issues dispatched or triaged', firstSeenIteration: 1, lastSeenIteration: 6, count: 6 },
  ];
  const pass = makePassResult({ iteration: 7, dispatched: 0, waveAdvanced: false, allDone: false, budgetExceeded: false, shouldStop: false });

  await runSelfHealingAndDiagnostics(pass, '/ses', existing, state, null, deps);

  assert.ok(!written['/ses/status.json'], 'status.json should NOT be rewritten when already paused');
});
