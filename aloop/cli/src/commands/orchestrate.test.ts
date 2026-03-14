import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  orchestrateCommand,
  orchestrateCommandWithDeps,
  validateDependencyGraph,
  assignWaves,
  applyDecompositionPlan,
  getDispatchableIssues,
  countActiveChildren,
  availableSlots,
  launchChildLoop,
  dispatchChildLoops,
  checkPrGates,
  reviewPrDiff,
  mergePr,
  requestRebase,
  flagForHuman,
  processPrLifecycle,
  applyTriageConfidenceFloor,
  classifyTriageComment,
  runTriageClassificationLoop,
  shouldPauseForHumanFeedback,
  getUnprocessedTriageComments,
  applyTriageResultsToIssue,
  isWaveComplete,
  advanceWave,
  parseChildSessionCost,
  aggregateChildCosts,
  shouldPauseForBudget,
  generateFinalReport,
  formatFinalReportText,
  type OrchestrateCommandOptions,
  type OrchestrateDeps,
  type DispatchDeps,
  type DecompositionPlanIssue,
  type DecompositionPlan,
  type OrchestratorState,
  type OrchestratorIssue,
  type PrLifecycleDeps,
  type AgentReviewResult,
  type BudgetDeps,
  type BudgetSummary,
  type TriageComment,
  type TriageDeps,
} from './orchestrate.js';

function createMockDeps(overrides: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const writtenFiles: Record<string, string> = {};
  const createdDirs: string[] = [];

  return {
    existsSync: () => false,
    readFile: async () => '',
    writeFile: async (path: string, data: string) => {
      writtenFiles[path] = data;
    },
    mkdir: async (path: string) => {
      createdDirs.push(path);
      return undefined;
    },
    now: () => new Date('2026-03-09T10:30:00Z'),
    ...overrides,
    // expose for assertions
    get _writtenFiles() { return writtenFiles; },
    get _createdDirs() { return createdDirs; },
  } as OrchestrateDeps & { _writtenFiles: Record<string, string>; _createdDirs: string[] };
}

describe('orchestrateCommandWithDeps', () => {
  it('creates orchestrator.json with default options', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({}, deps);

    assert.equal(result.state.spec_file, 'SPEC.md');
    assert.equal(result.state.trunk_branch, 'agent/trunk');
    assert.equal(result.state.concurrency_cap, 3);
    assert.equal(result.state.current_wave, 0);
    assert.equal(result.state.plan_only, false);
    assert.deepStrictEqual(result.state.issues, []);
    assert.deepStrictEqual(result.state.completed_waves, []);
    assert.equal(result.state.filter_issues, null);
    assert.equal(result.state.filter_label, null);
    assert.equal(result.state.filter_repo, null);
    assert.equal(result.state.created_at, '2026-03-09T10:30:00.000Z');
    assert.equal(result.state.updated_at, '2026-03-09T10:30:00.000Z');
    assert.ok(result.state_file.includes('orchestrator.json'));
    assert.ok(result.session_dir.includes('orchestrator-20260309-103000'));
  });

  it('respects --spec, --trunk, --concurrency options', async () => {
    const deps = createMockDeps();
    const options: OrchestrateCommandOptions = {
      spec: 'DESIGN.md',
      trunk: 'main',
      concurrency: '5',
    };
    const result = await orchestrateCommandWithDeps(options, deps);

    assert.equal(result.state.spec_file, 'DESIGN.md');
    assert.equal(result.state.trunk_branch, 'main');
    assert.equal(result.state.concurrency_cap, 5);
  });

  it('respects --plan-only flag', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({ planOnly: true }, deps);

    assert.equal(result.state.plan_only, true);
  });

  it('parses --issues as comma-separated numbers', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({ issues: '42,43,44' }, deps);

    assert.deepStrictEqual(result.state.filter_issues, [42, 43, 44]);
  });

  it('stores --label and --repo filters', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({ label: 'aloop/auto', repo: 'owner/repo' }, deps);

    assert.equal(result.state.filter_label, 'aloop/auto');
    assert.equal(result.state.filter_repo, 'owner/repo');
  });

  it('throws on invalid concurrency value', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ concurrency: 'abc' }, deps),
      /Invalid concurrency value/,
    );
  });

  it('throws on zero concurrency', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ concurrency: '0' }, deps),
      /Invalid concurrency value/,
    );
  });

  it('throws on invalid issue number', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ issues: '42,abc' }, deps),
      /Invalid issue number/,
    );
  });

  it('persists state to orchestrator.json file', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    await orchestrateCommandWithDeps({}, deps);

    const stateFiles = Object.keys(mockDeps._writtenFiles).filter((p) => p.includes('orchestrator.json'));
    assert.equal(stateFiles.length, 1);

    const persisted = JSON.parse(mockDeps._writtenFiles[stateFiles[0]]);
    assert.equal(persisted.spec_file, 'SPEC.md');
    assert.equal(persisted.concurrency_cap, 3);
  });

  it('creates session directory', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _createdDirs: string[] };

    await orchestrateCommandWithDeps({}, deps);

    assert.ok(mockDeps._createdDirs.length > 0);
    assert.ok(mockDeps._createdDirs.some((d) => d.includes('orchestrator-')));
  });
});

describe('orchestrateCommand', () => {
  it('text output includes session dir, spec, trunk, concurrency', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({}, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('Session dir:'));
    assert.ok(allOutput.includes('orchestrator-'));
    assert.ok(allOutput.includes('Spec:'));
    assert.ok(allOutput.includes('SPEC.md'));
    assert.ok(allOutput.includes('Trunk:'));
    assert.ok(allOutput.includes('agent/trunk'));
    assert.ok(allOutput.includes('Concurrency:'));
    assert.ok(allOutput.includes('3'));
    assert.ok(allOutput.includes('Plan only:'));
    assert.ok(allOutput.includes('false'));
  });

  it('json output emits valid JSON with session_dir, state_file, state keys', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ output: 'json' }, createMockDeps());
    } finally {
      console.log = origLog;
    }

    assert.equal(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.ok('session_dir' in parsed);
    assert.ok('state_file' in parsed);
    assert.ok('state' in parsed);
    assert.equal(parsed.state.spec_file, 'SPEC.md');
  });

  it('text output shows filter_issues when set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ issues: '10,20' }, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('Filter:'));
    assert.ok(allOutput.includes('10, 20'));
  });

  it('text output omits filter_issues when not set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({}, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(!allOutput.includes('Filter:'));
  });

  it('text output shows filter_label when set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ label: 'aloop/auto' }, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('Label:'));
    assert.ok(allOutput.includes('aloop/auto'));
  });

  it('text output omits filter_label when not set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({}, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(!allOutput.includes('Label:'));
  });

  it('text output shows filter_repo when set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ repo: 'owner/repo' }, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('Repo:'));
    assert.ok(allOutput.includes('owner/repo'));
  });

  it('text output omits filter_repo when not set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({}, createMockDeps());
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(!allOutput.includes('Repo:'));
  });
});

// Helper to create plan issues
function planIssue(id: number, title: string, depends_on: number[] = [], file_hints?: string[]): DecompositionPlanIssue {
  return { id, title, body: `Body for ${title}`, depends_on, file_hints };
}

describe('validateDependencyGraph', () => {
  it('accepts valid graph with no dependencies', () => {
    const issues = [planIssue(1, 'A'), planIssue(2, 'B'), planIssue(3, 'C')];
    assert.doesNotThrow(() => validateDependencyGraph(issues));
  });

  it('accepts valid graph with linear chain', () => {
    const issues = [planIssue(1, 'A'), planIssue(2, 'B', [1]), planIssue(3, 'C', [2])];
    assert.doesNotThrow(() => validateDependencyGraph(issues));
  });

  it('accepts valid graph with diamond shape', () => {
    const issues = [
      planIssue(1, 'A'),
      planIssue(2, 'B', [1]),
      planIssue(3, 'C', [1]),
      planIssue(4, 'D', [2, 3]),
    ];
    assert.doesNotThrow(() => validateDependencyGraph(issues));
  });

  it('rejects duplicate IDs', () => {
    const issues = [planIssue(1, 'A'), planIssue(1, 'B')];
    assert.throws(() => validateDependencyGraph(issues), /Duplicate issue id: 1/);
  });

  it('rejects unknown dependency reference', () => {
    const issues = [planIssue(1, 'A', [99])];
    assert.throws(() => validateDependencyGraph(issues), /Issue 1 depends on unknown issue 99/);
  });

  it('rejects self-dependency', () => {
    const issues = [planIssue(1, 'A', [1])];
    assert.throws(() => validateDependencyGraph(issues), /Issue 1 depends on itself/);
  });

  it('rejects simple cycle (A->B->A)', () => {
    const issues = [planIssue(1, 'A', [2]), planIssue(2, 'B', [1])];
    assert.throws(() => validateDependencyGraph(issues), /cycle/);
  });

  it('rejects transitive cycle (A->B->C->A)', () => {
    const issues = [
      planIssue(1, 'A', [3]),
      planIssue(2, 'B', [1]),
      planIssue(3, 'C', [2]),
    ];
    assert.throws(() => validateDependencyGraph(issues), /cycle/);
  });
});

describe('assignWaves', () => {
  it('assigns wave 1 to independent issues', () => {
    const issues = [planIssue(1, 'A'), planIssue(2, 'B'), planIssue(3, 'C')];
    const waves = assignWaves(issues);
    assert.equal(waves.get(1), 1);
    assert.equal(waves.get(2), 1);
    assert.equal(waves.get(3), 1);
  });

  it('assigns sequential waves for linear chain', () => {
    const issues = [planIssue(1, 'A'), planIssue(2, 'B', [1]), planIssue(3, 'C', [2])];
    const waves = assignWaves(issues);
    assert.equal(waves.get(1), 1);
    assert.equal(waves.get(2), 2);
    assert.equal(waves.get(3), 3);
  });

  it('assigns waves for diamond dependency', () => {
    const issues = [
      planIssue(1, 'A'),
      planIssue(2, 'B', [1]),
      planIssue(3, 'C', [1]),
      planIssue(4, 'D', [2, 3]),
    ];
    const waves = assignWaves(issues);
    assert.equal(waves.get(1), 1);
    assert.equal(waves.get(2), 2);
    assert.equal(waves.get(3), 2);
    assert.equal(waves.get(4), 3);
  });

  it('handles mixed independent and dependent issues', () => {
    const issues = [
      planIssue(1, 'A'),
      planIssue(2, 'B'),
      planIssue(3, 'C', [1]),
      planIssue(4, 'D', [1, 2]),
    ];
    const waves = assignWaves(issues);
    assert.equal(waves.get(1), 1);
    assert.equal(waves.get(2), 1);
    assert.equal(waves.get(3), 2);
    assert.equal(waves.get(4), 2);
  });

  it('handles single issue', () => {
    const issues = [planIssue(1, 'A')];
    const waves = assignWaves(issues);
    assert.equal(waves.get(1), 1);
  });
});

describe('applyDecompositionPlan', () => {
  function baseState(): OrchestratorState {
    return {
      spec_file: 'SPEC.md',
      trunk_branch: 'agent/trunk',
      concurrency_cap: 3,
      current_wave: 0,
      plan_only: false,
      issues: [],
      completed_waves: [],
      filter_issues: null,
      filter_label: null,
      filter_repo: null,
      budget_cap: null,
      created_at: '2026-03-09T10:30:00.000Z',
      updated_at: '2026-03-09T10:30:00.000Z',
    };
  }

  function baseDeps(): OrchestrateDeps {
    return {
      existsSync: () => true,
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      now: () => new Date('2026-03-09T11:00:00Z'),
    };
  }

  it('creates issues with correct wave assignments (no GH executor)', async () => {
    const plan: DecompositionPlan = {
      issues: [
        planIssue(1, 'A'),
        planIssue(2, 'B', [1]),
        planIssue(3, 'C'),
      ],
    };
    const result = await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', null, baseDeps());

    assert.equal(result.issues.length, 3);
    assert.equal(result.issues[0].wave, 1);
    assert.equal(result.issues[0].number, 1); // placeholder
    assert.equal(result.issues[1].wave, 2);
    assert.equal(result.issues[2].wave, 1);
    assert.equal(result.current_wave, 1);
  });

  it('all issues start in pending state', async () => {
    const plan: DecompositionPlan = {
      issues: [planIssue(1, 'A'), planIssue(2, 'B')],
    };
    const result = await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', null, baseDeps());

    for (const issue of result.issues) {
      assert.equal(issue.state, 'pending');
      assert.equal(issue.child_session, null);
      assert.equal(issue.pr_number, null);
    }
  });

  it('maps depends_on to GH issue numbers when GH executor is provided', async () => {
    let nextNumber = 100;
    const deps: OrchestrateDeps = {
      ...baseDeps(),
      execGhIssueCreate: async () => nextNumber++,
    };
    const plan: DecompositionPlan = {
      issues: [planIssue(1, 'A'), planIssue(2, 'B', [1])],
    };
    const result = await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', 'owner/repo', deps);

    assert.equal(result.issues[0].number, 100);
    assert.equal(result.issues[1].number, 101);
    assert.deepStrictEqual(result.issues[1].depends_on, [100]);
  });

  it('calls execGhIssueCreate with correct labels (aloop/auto + wave)', async () => {
    const calls: { title: string; labels: string[] }[] = [];
    const deps: OrchestrateDeps = {
      ...baseDeps(),
      execGhIssueCreate: async (_repo, _sid, title, _body, labels) => {
        calls.push({ title, labels });
        return calls.length;
      },
    };
    const plan: DecompositionPlan = {
      issues: [planIssue(1, 'Wave1'), planIssue(2, 'Wave2', [1])],
    };
    await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', 'owner/repo', deps);

    assert.equal(calls.length, 2);
    assert.deepStrictEqual(calls[0].labels, ['aloop/auto', 'aloop/wave-1']);
    assert.deepStrictEqual(calls[1].labels, ['aloop/auto', 'aloop/wave-2']);
    assert.equal(calls[0].title, 'Wave1');
    assert.equal(calls[1].title, 'Wave2');
  });

  it('updates updated_at timestamp', async () => {
    const plan: DecompositionPlan = {
      issues: [planIssue(1, 'A')],
    };
    const result = await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', null, baseDeps());
    assert.equal(result.updated_at, '2026-03-09T11:00:00.000Z');
  });

  it('rejects invalid dependency graph', async () => {
    const plan: DecompositionPlan = {
      issues: [planIssue(1, 'A', [2]), planIssue(2, 'B', [1])],
    };
    await assert.rejects(
      () => applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', null, baseDeps()),
      /cycle/,
    );
  });

  it('uses plan IDs as placeholders when no repo is provided', async () => {
    const deps: OrchestrateDeps = {
      ...baseDeps(),
      execGhIssueCreate: async () => 999, // should NOT be called without repo
    };
    const plan: DecompositionPlan = {
      issues: [planIssue(5, 'A'), planIssue(10, 'B', [5])],
    };
    const result = await applyDecompositionPlan(plan, baseState(), '/sessions/orch-1', null, deps);

    assert.equal(result.issues[0].number, 5);
    assert.equal(result.issues[1].number, 10);
    assert.deepStrictEqual(result.issues[1].depends_on, [5]);
  });
});

describe('orchestrateCommandWithDeps with --plan', () => {
  const samplePlan = JSON.stringify({
    issues: [
      { id: 1, title: 'Task A', body: 'Do A', depends_on: [] },
      { id: 2, title: 'Task B', body: 'Do B', depends_on: [1] },
    ],
  });

  it('loads plan file and populates issues in state', async () => {
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
    });
    const result = await orchestrateCommandWithDeps({ plan: 'plan.json' }, deps);

    assert.equal(result.state.issues.length, 2);
    assert.equal(result.state.issues[0].title, 'Task A');
    assert.equal(result.state.issues[0].wave, 1);
    assert.equal(result.state.issues[1].title, 'Task B');
    assert.equal(result.state.issues[1].wave, 2);
    assert.equal(result.state.current_wave, 1);
  });

  it('persists issues in orchestrator.json', async () => {
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
    });
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    await orchestrateCommandWithDeps({ plan: 'plan.json' }, deps);

    const stateFiles = Object.keys(mockDeps._writtenFiles).filter((p) => p.includes('orchestrator.json'));
    const persisted = JSON.parse(mockDeps._writtenFiles[stateFiles[0]]);
    assert.equal(persisted.issues.length, 2);
    assert.equal(persisted.current_wave, 1);
  });

  it('throws when plan file does not exist', async () => {
    const deps = createMockDeps({ existsSync: () => false });
    await assert.rejects(
      () => orchestrateCommandWithDeps({ plan: 'missing.json' }, deps),
      /Plan file not found/,
    );
  });

  it('throws when plan file has invalid JSON', async () => {
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => '{ broken json',
    });
    await assert.rejects(
      () => orchestrateCommandWithDeps({ plan: 'bad.json' }, deps),
      /Invalid JSON in plan file/,
    );
  });

  it('throws when plan has empty issues array', async () => {
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => JSON.stringify({ issues: [] }),
    });
    await assert.rejects(
      () => orchestrateCommandWithDeps({ plan: 'empty.json' }, deps),
      /non-empty "issues" array/,
    );
  });

  it('calls execGhIssueCreate when repo is provided', async () => {
    const calls: string[] = [];
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
      execGhIssueCreate: async (_repo, _sid, title) => {
        calls.push(title);
        return 50 + calls.length;
      },
    });
    const result = await orchestrateCommandWithDeps({ plan: 'plan.json', repo: 'owner/repo' }, deps);

    assert.equal(calls.length, 2);
    assert.equal(result.state.issues[0].number, 51);
    assert.equal(result.state.issues[1].number, 52);
  });

  it('text output shows issue count and wave count', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
    });
    try {
      await orchestrateCommand({ plan: 'plan.json' }, deps);
    } finally {
      console.log = origLog;
    }

    const allOutput = logs.join('\n');
    assert.ok(allOutput.includes('Issues:'));
    assert.ok(allOutput.includes('2 (2 waves)'));
  });
});

describe('triage classification loop', () => {
  function triageComment(overrides: Partial<TriageComment> = {}): TriageComment {
    return {
      id: 1,
      author: 'pj',
      body: 'Please update the docs to include the new endpoint.',
      context: 'issue',
      author_association: 'COLLABORATOR',
      ...overrides,
    };
  }

  it('classifies explicit instructions as actionable', () => {
    const result = classifyTriageComment(triageComment());
    assert.equal(result.classification, 'actionable');
    assert.ok(result.confidence >= 0.7);
  });

  it('classifies direct questions as question', () => {
    const result = classifyTriageComment(triageComment({
      id: 2,
      body: 'Can you explain why this endpoint uses polling?',
    }));
    assert.equal(result.classification, 'question');
    assert.ok(result.confidence >= 0.7);
  });

  it('classifies low-signal acknowledgements as out_of_scope', () => {
    const result = classifyTriageComment(triageComment({ id: 3, body: 'Thanks!' }));
    assert.equal(result.classification, 'out_of_scope');
    assert.ok(result.confidence >= 0.7);
  });

  it('forces needs_clarification when confidence is below 0.7', () => {
    const result = classifyTriageComment(triageComment({
      id: 4,
      body: 'hmm maybe we should use websockets instead',
    }));
    assert.equal(result.classification, 'needs_clarification');
    assert.ok(result.confidence < 0.7);
    assert.ok(result.reasoning.includes('forcing needs_clarification'));
  });

  it('applyTriageConfidenceFloor keeps high-confidence classifications unchanged', () => {
    const result = applyTriageConfidenceFloor({
      comment_id: 5,
      classification: 'question',
      confidence: 0.8,
      reasoning: 'High confidence question.',
    });
    assert.equal(result.classification, 'question');
    assert.equal(result.confidence, 0.8);
  });

  it('runTriageClassificationLoop classifies all comments in a batch', () => {
    const results = runTriageClassificationLoop([
      triageComment({ id: 10, body: 'Please add pagination to this endpoint.' }),
      triageComment({ id: 11, body: 'What is the expected response shape?' }),
      triageComment({ id: 12, body: 'LGTM' }),
      triageComment({ id: 13, body: 'maybe adjust this?' }),
    ]);
    assert.equal(results.length, 4);
    assert.deepStrictEqual(
      results.map((r) => r.classification),
      ['actionable', 'question', 'out_of_scope', 'needs_clarification'],
    );
  });

  it('getUnprocessedTriageComments excludes processed comment IDs', () => {
    const issue = makeIssue({ processed_comment_ids: [11] });
    const comments = [
      triageComment({ id: 10, body: 'Please update API docs.' }),
      triageComment({ id: 11, body: 'Already triaged comment.' }),
      triageComment({ id: 12, body: 'Can we add examples?' }),
    ];
    const result = getUnprocessedTriageComments(issue, comments);
    assert.deepStrictEqual(result.map((c) => c.id), [10, 12]);
  });

  it('applyTriageResultsToIssue tracks processed IDs and blocks on clarification', async () => {
    const issue = makeIssue({
      number: 42,
      processed_comment_ids: [1],
      blocked_on_human: false,
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 1, body: 'old comment' }),
      triageComment({ id: 2, body: 'hmm maybe we should switch to polling?' }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:00:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'needs_clarification');
    assert.equal(entries[0].action_taken, 'post_reply_and_block');
    assert.equal(issue.blocked_on_human, true);
    assert.deepStrictEqual(issue.processed_comment_ids, [1, 2]);
    assert.equal(issue.triage_log?.length, 1);
    assert.equal(issue.last_comment_check, '2026-03-14T12:00:00.000Z');
    assert.equal(ghCalls.length, 2);
    assert.deepStrictEqual(
      ghCalls[0],
      ['issue', 'comment', '42', '--repo', 'owner/repo', '--body', `Thanks for the feedback, @pj.

I want to make sure we implement exactly what you intended. Could you clarify the requested change with concrete acceptance criteria?
---
*This comment was generated by aloop triage agent.*`],
    );
    assert.deepStrictEqual(
      ghCalls[1],
      ['issue', 'edit', '42', '--repo', 'owner/repo', '--add-label', 'aloop/blocked-on-human'],
    );
  });

  it('applyTriageResultsToIssue auto-unblocks on actionable human response', async () => {
    const issue = makeIssue({
      number: 43,
      blocked_on_human: true,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 20, body: 'Please switch to WebSockets for updates.' }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:05:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'actionable');
    assert.equal(entries[0].action_taken, 'unblock_and_steering');
    assert.equal(issue.blocked_on_human, false);
    assert.deepStrictEqual(issue.processed_comment_ids, [20]);
    assert.equal(ghCalls.length, 1);
    assert.deepStrictEqual(
      ghCalls[0],
      ['issue', 'edit', '43', '--repo', 'owner/repo', '--remove-label', 'aloop/blocked-on-human'],
    );
  });

  it('applyTriageResultsToIssue answers question comments without blocking', async () => {
    const issue = makeIssue({
      number: 44,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 21, body: 'What is the expected response shape?', author: 'alice' }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:06:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'question');
    assert.equal(entries[0].action_taken, 'question_answered');
    assert.equal(issue.blocked_on_human, false);
    assert.deepStrictEqual(issue.processed_comment_ids, [21]);
    assert.equal(ghCalls.length, 1);
    assert.deepStrictEqual(
      ghCalls[0],
      ['issue', 'comment', '44', '--repo', 'owner/repo', '--body', `Thanks for the question, @alice.

Based on the current issue context, this requires human clarification before implementation can proceed safely. Please provide specific direction and expected outcome.
---
*This comment was generated by aloop triage agent.*`],
    );
  });

  it('applyTriageResultsToIssue skips agent-generated comments', async () => {
    const issue = makeIssue({
      number: 45,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({
        id: 22,
        author: 'aloop-bot[bot]',
        body: `I posted this already.

---
*This comment was generated by aloop triage agent.*`,
      }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:07:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);
    assert.deepStrictEqual(entries, []);
    assert.deepStrictEqual(issue.processed_comment_ids, [22]);
    assert.deepStrictEqual(issue.triage_log, []);
    assert.equal(ghCalls.length, 0);
  });

  it('applyTriageResultsToIssue skips and logs external comments', async () => {
    const issue = makeIssue({
      number: 46,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({
        id: 23,
        author: 'external-user',
        author_association: 'NONE',
        body: 'Drive-by feedback from non-collaborator',
      }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:08:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'out_of_scope');
    assert.equal(entries[0].action_taken, 'untriaged_external_comment');
    assert.deepStrictEqual(issue.processed_comment_ids, [23]);
    assert.equal(ghCalls.length, 0);
  });
});

// --- Dispatch engine tests ---

function makeIssue(overrides: Partial<OrchestratorIssue> = {}): OrchestratorIssue {
  return {
    number: 1,
    title: 'Test issue',
    wave: 1,
    state: 'pending',
    child_session: null,
    pr_number: null,
    depends_on: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: false,
    issues: [],
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-09T10:00:00.000Z',
    updated_at: '2026-03-09T10:00:00.000Z',
    ...overrides,
  };
}

describe('getDispatchableIssues', () => {
  it('returns pending issues from the current wave', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending' }),
        makeIssue({ number: 2, wave: 1, state: 'pending' }),
        makeIssue({ number: 3, wave: 2, state: 'pending' }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.equal(result.length, 2);
    assert.equal(result[0].number, 1);
    assert.equal(result[1].number, 2);
  });

  it('excludes in_progress and merged issues', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'in_progress' }),
        makeIssue({ number: 2, wave: 1, state: 'merged' }),
        makeIssue({ number: 3, wave: 1, state: 'pending' }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 3);
  });

  it('returns empty when current_wave is 0', () => {
    const state = makeState({ current_wave: 0, issues: [makeIssue()] });
    assert.deepStrictEqual(getDispatchableIssues(state), []);
  });

  it('returns empty when no issues exist', () => {
    const state = makeState({ current_wave: 1, issues: [] });
    assert.deepStrictEqual(getDispatchableIssues(state), []);
  });

  it('excludes issues with unmerged dependencies', () => {
    const state = makeState({
      current_wave: 2,
      issues: [
        makeIssue({ number: 10, wave: 1, state: 'merged' }),
        makeIssue({ number: 11, wave: 1, state: 'in_progress' }),
        makeIssue({ number: 20, wave: 2, state: 'pending', depends_on: [10] }),
        makeIssue({ number: 21, wave: 2, state: 'pending', depends_on: [11] }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 20);
  });

  it('includes issues whose dependencies are all merged', () => {
    const state = makeState({
      current_wave: 2,
      issues: [
        makeIssue({ number: 10, wave: 1, state: 'merged' }),
        makeIssue({ number: 11, wave: 1, state: 'merged' }),
        makeIssue({ number: 20, wave: 2, state: 'pending', depends_on: [10, 11] }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 20);
  });

  it('excludes issues blocked on human feedback', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending', blocked_on_human: true }),
        makeIssue({ number: 2, wave: 1, state: 'pending', blocked_on_human: false }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.deepStrictEqual(result.map((i) => i.number), [2]);
    assert.equal(shouldPauseForHumanFeedback(state.issues[0]), true);
    assert.equal(shouldPauseForHumanFeedback(state.issues[1]), false);
  });
});

describe('countActiveChildren', () => {
  it('counts issues in in_progress state', () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, state: 'in_progress' }),
        makeIssue({ number: 2, state: 'pending' }),
        makeIssue({ number: 3, state: 'in_progress' }),
        makeIssue({ number: 4, state: 'merged' }),
      ],
    });
    assert.equal(countActiveChildren(state), 2);
  });

  it('returns 0 when no issues are in progress', () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, state: 'pending' }),
        makeIssue({ number: 2, state: 'merged' }),
      ],
    });
    assert.equal(countActiveChildren(state), 0);
  });
});

describe('availableSlots', () => {
  it('returns concurrency_cap minus active children', () => {
    const state = makeState({
      concurrency_cap: 3,
      issues: [
        makeIssue({ number: 1, state: 'in_progress' }),
      ],
    });
    assert.equal(availableSlots(state), 2);
  });

  it('returns 0 when at capacity', () => {
    const state = makeState({
      concurrency_cap: 2,
      issues: [
        makeIssue({ number: 1, state: 'in_progress' }),
        makeIssue({ number: 2, state: 'in_progress' }),
      ],
    });
    assert.equal(availableSlots(state), 0);
  });

  it('never returns negative', () => {
    const state = makeState({
      concurrency_cap: 1,
      issues: [
        makeIssue({ number: 1, state: 'in_progress' }),
        makeIssue({ number: 2, state: 'in_progress' }),
      ],
    });
    assert.equal(availableSlots(state), 0);
  });
});

function createMockDispatchDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps & {
  _writtenFiles: Record<string, string>;
  _createdDirs: string[];
  _spawnSyncCalls: Array<{ command: string; args: string[] }>;
  _spawnCalls: Array<{ command: string; args: string[] }>;
} {
  const writtenFiles: Record<string, string> = {};
  const createdDirs: string[] = [];
  const spawnSyncCalls: Array<{ command: string; args: string[] }> = [];
  const spawnCalls: Array<{ command: string; args: string[] }> = [];

  const deps: DispatchDeps = {
    existsSync: () => false,
    readFile: async () => '',
    writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    mkdir: async (p: string) => { createdDirs.push(p); return undefined; },
    cp: async () => {},
    now: () => new Date('2026-03-09T12:00:00Z'),
    spawnSync: (command: string, args: string[]) => {
      spawnSyncCalls.push({ command, args });
      return { status: 0, stdout: '', stderr: '' };
    },
    spawn: (command: string, args: string[]) => {
      spawnCalls.push({ command, args });
      return { pid: 9999, unref: () => {} };
    },
    platform: 'linux',
    env: {},
    ...overrides,
  };

  return Object.assign(deps, {
    _writtenFiles: writtenFiles,
    _createdDirs: createdDirs,
    _spawnSyncCalls: spawnSyncCalls,
    _spawnCalls: spawnCalls,
  });
}

describe('launchChildLoop', () => {
  const issue = makeIssue({ number: 42, title: 'Add feature X' });

  it('creates session directory', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    assert.ok(deps._createdDirs.some((d) => d.includes('issue-42')));
  });

  it('creates worktree with correct branch name', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const gitCall = deps._spawnSyncCalls.find((c) => c.command === 'git');
    assert.ok(gitCall, 'git worktree add should be called');
    assert.ok(gitCall.args.includes('-b'));
    assert.ok(gitCall.args.includes('aloop/issue-42'));
  });

  it('seeds TODO.md in worktree', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const todoFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('TODO.md'));
    assert.ok(todoFile, 'TODO.md should be written');
    assert.ok(deps._writtenFiles[todoFile].includes('Issue #42'));
    assert.ok(deps._writtenFiles[todoFile].includes('Add feature X'));
  });

  it('writes config.json with child-loop role', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const configFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('config.json'));
    assert.ok(configFile, 'config.json should be written');
    const config = JSON.parse(deps._writtenFiles[configFile]);
    assert.equal(config.role, 'child-loop');
    assert.equal(config.assignedIssueNumber, 42);
    assert.deepStrictEqual(config.childCreatedPrNumbers, []);
  });

  it('writes meta.json with issue number and orchestrator reference', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const metaFiles = Object.keys(deps._writtenFiles).filter((p) => p.endsWith('meta.json'));
    // meta.json is written twice (before and after PID)
    assert.ok(metaFiles.length >= 1);
    const meta = JSON.parse(deps._writtenFiles[metaFiles[0]]);
    assert.equal(meta.issue_number, 42);
    assert.equal(meta.orchestrator_session, 'orch-1');
    assert.equal(meta.branch, 'aloop/issue-42');
  });

  it('writes status.json with starting state', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const statusFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('status.json'));
    assert.ok(statusFile);
    const status = JSON.parse(deps._writtenFiles[statusFile]);
    assert.equal(status.state, 'starting');
    assert.equal(status.mode, 'plan-build-review');
  });

  it('launches loop process and returns PID', async () => {
    const deps = createMockDispatchDeps();
    const result = await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    assert.equal(result.pid, 9999);
    assert.equal(result.issue_number, 42);
    assert.equal(result.branch, 'aloop/issue-42');
    assert.ok(result.session_id.includes('issue-42'));
  });

  it('registers session in active.json', async () => {
    const deps = createMockDispatchDeps();
    const result = await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const activeFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('active.json'));
    assert.ok(activeFile);
    const active = JSON.parse(deps._writtenFiles[activeFile]);
    assert.ok(active[result.session_id]);
    assert.equal(active[result.session_id].pid, 9999);
    assert.equal(active[result.session_id].mode, 'plan-build-review');
  });

  it('throws when worktree creation fails', async () => {
    const deps = createMockDispatchDeps({
      spawnSync: () => ({ status: 1, stdout: '', stderr: 'branch already exists' }),
    });
    await assert.rejects(
      () => launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps),
      /Failed to create worktree for issue #42/,
    );
  });

  it('throws when spawn returns no PID', async () => {
    const deps = createMockDispatchDeps({
      spawn: () => ({ pid: undefined, unref: () => {} }),
    });
    await assert.rejects(
      () => launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps),
      /Failed to launch loop process for issue #42/,
    );
  });

  it('uses powershell on win32', async () => {
    const deps = createMockDispatchDeps({ platform: 'win32' });
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    assert.ok(deps._spawnCalls.some((c) => c.command === 'powershell'));
  });

  it('uses loop.sh on linux', async () => {
    const deps = createMockDispatchDeps({ platform: 'linux' });
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    assert.ok(deps._spawnCalls.some((c) => c.command.endsWith('loop.sh')));
  });
});

describe('dispatchChildLoops', () => {
  function stateWithIssues(issues: OrchestratorIssue[], cap = 3): OrchestratorState {
    return makeState({ concurrency_cap: cap, current_wave: 1, issues });
  }

  it('dispatches pending issues up to concurrency cap', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'pending' }),
      makeIssue({ number: 2, wave: 1, state: 'pending' }),
      makeIssue({ number: 3, wave: 1, state: 'pending' }),
      makeIssue({ number: 4, wave: 1, state: 'pending' }),
    ];
    const state = stateWithIssues(issues, 2);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 2);
    assert.deepStrictEqual(result.skipped, [3, 4]);
  });

  it('updates issue states to in_progress in persisted state', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'pending' }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.state.issues[0].state, 'in_progress');
    assert.ok(result.state.issues[0].child_session);
  });

  it('persists updated state to file', async () => {
    const issues = [makeIssue({ number: 1, wave: 1, state: 'pending' })];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    const persisted = JSON.parse(deps._writtenFiles['/state.json']);
    assert.equal(persisted.issues[0].state, 'in_progress');
    assert.equal(persisted.updated_at, '2026-03-09T12:00:00.000Z');
  });

  it('dispatches nothing when no slots are available', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'in_progress' }),
      makeIssue({ number: 2, wave: 1, state: 'in_progress' }),
      makeIssue({ number: 3, wave: 1, state: 'pending' }),
    ];
    const state = stateWithIssues(issues, 2);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 0);
    assert.deepStrictEqual(result.skipped, [3]);
  });

  it('dispatches nothing when all issues are already dispatched', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'in_progress' }),
      makeIssue({ number: 2, wave: 1, state: 'merged' }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 0);
    assert.deepStrictEqual(result.skipped, []);
  });

  it('each launched child has unique session_id and branch', async () => {
    const issues = [
      makeIssue({ number: 10, wave: 1, state: 'pending' }),
      makeIssue({ number: 20, wave: 1, state: 'pending' }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 2);
    assert.equal(result.launched[0].branch, 'aloop/issue-10');
    assert.equal(result.launched[1].branch, 'aloop/issue-20');
    assert.notEqual(result.launched[0].session_id, result.launched[1].session_id);
  });
});

// --- PR lifecycle gates tests ---

function createMockPrDeps(overrides: Partial<PrLifecycleDeps> = {}): PrLifecycleDeps & { logs: Record<string, unknown>[]; writtenFiles: Record<string, string> } {
  const logs: Record<string, unknown>[] = [];
  const writtenFiles: Record<string, string> = {};
  return {
    execGh: async () => ({ stdout: '', stderr: '' }),
    readFile: async () => '',
    writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    now: () => new Date('2026-03-09T12:00:00Z'),
    appendLog: (_dir: string, entry: Record<string, unknown>) => { logs.push(entry); },
    ...overrides,
    logs,
    writtenFiles,
  };
}

function makeOrchestratorState(issueOverrides: Partial<OrchestratorIssue>[] = []): OrchestratorState {
  const issues: OrchestratorIssue[] = issueOverrides.map((o, i) => ({
    number: 42 + i,
    title: `Issue ${42 + i}`,
    wave: 1,
    state: 'pr_open' as const,
    child_session: `session-${42 + i}`,
    pr_number: 100 + i,
    depends_on: [],
    ...o,
  }));
  return {
    spec_file: 'SPEC.md',
    trunk_branch: 'agent/trunk',
    concurrency_cap: 3,
    current_wave: 1,
    plan_only: false,
    issues,
    completed_waves: [],
    filter_issues: null,
    filter_label: null,
    filter_repo: null,
    budget_cap: null,
    created_at: '2026-03-09T10:00:00.000Z',
    updated_at: '2026-03-09T10:00:00.000Z',
  };
}

describe('checkPrGates', () => {
  it('returns pass when PR is mergeable and all CI checks pass', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('--json') && args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
            { name: 'lint', state: 'COMPLETED', conclusion: 'SUCCESS' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.all_passed, true);
    assert.equal(result.mergeable, true);
    assert.equal(result.gates.length, 2);
    assert.equal(result.gates[0].gate, 'merge_conflicts');
    assert.equal(result.gates[0].status, 'pass');
    assert.equal(result.gates[1].gate, 'ci_checks');
    assert.equal(result.gates[1].status, 'pass');
  });

  it('returns fail when PR has merge conflicts', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.mergeable, false);
    assert.equal(result.gates[0].status, 'fail');
    assert.ok(result.gates[0].detail.includes('DIRTY'));
  });

  it('returns pending when CI checks are still running', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'IN_PROGRESS', conclusion: '' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.all_passed, false);
    assert.equal(result.gates[1].status, 'pending');
  });

  it('returns fail when CI checks have failures', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
            { name: 'lint', state: 'COMPLETED', conclusion: 'FAILURE' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.gates[1].status, 'fail');
    assert.ok(result.gates[1].detail.includes('lint'));
  });

  it('handles gh errors gracefully for mergeability', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          throw new Error('gh API error');
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.mergeable, false);
    assert.equal(result.gates[0].status, 'fail');
  });

  it('treats SKIPPED and NEUTRAL checks as passing', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'optional', state: 'COMPLETED', conclusion: 'SKIPPED' },
            { name: 'info', state: 'COMPLETED', conclusion: 'NEUTRAL' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.all_passed, true);
    assert.equal(result.gates[1].status, 'pass');
  });
});

describe('reviewPrDiff', () => {
  it('auto-approves when no agent reviewer configured', async () => {
    const deps = createMockPrDeps({
      execGh: async () => ({ stdout: 'diff --git a/file.ts b/file.ts\n+hello', stderr: '' }),
    });
    const result = await reviewPrDiff(100, 'owner/repo', deps);
    assert.equal(result.verdict, 'approve');
    assert.ok(result.summary.includes('Auto-approved'));
  });

  it('delegates to agent reviewer when configured', async () => {
    const deps = createMockPrDeps({
      execGh: async () => ({ stdout: 'diff content', stderr: '' }),
      invokeAgentReview: async (prNum, _repo, diff) => ({
        pr_number: prNum,
        verdict: 'request-changes',
        summary: `Review of diff (${diff.length} chars): needs fixes`,
      }),
    });
    const result = await reviewPrDiff(100, 'owner/repo', deps);
    assert.equal(result.verdict, 'request-changes');
    assert.ok(result.summary.includes('needs fixes'));
  });

  it('flags for human when diff fetch fails', async () => {
    const deps = createMockPrDeps({
      execGh: async () => { throw new Error('Not found'); },
    });
    const result = await reviewPrDiff(100, 'owner/repo', deps);
    assert.equal(result.verdict, 'flag-for-human');
    assert.ok(result.summary.includes('Failed to fetch PR diff'));
  });
});

describe('mergePr', () => {
  it('returns merged true on success', async () => {
    const deps = createMockPrDeps({
      execGh: async () => ({ stdout: 'Merged', stderr: '' }),
    });
    const result = await mergePr(100, 'owner/repo', deps);
    assert.equal(result.merged, true);
    assert.equal(result.pr_number, 100);
  });

  it('returns merged false with error on failure', async () => {
    const deps = createMockPrDeps({
      execGh: async () => { throw new Error('Merge conflict'); },
    });
    const result = await mergePr(100, 'owner/repo', deps);
    assert.equal(result.merged, false);
    assert.ok(result.error?.includes('Merge conflict'));
  });
});

describe('requestRebase', () => {
  it('posts comment on the issue', async () => {
    const calls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => { calls.push(args); return { stdout: '', stderr: '' }; },
    });
    const issue: OrchestratorIssue = { number: 42, title: 'Test', wave: 1, state: 'pr_open', child_session: 's1', pr_number: 100, depends_on: [] };
    await requestRebase(issue, 'owner/repo', 'agent/trunk', 1, deps);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('issue'));
    assert.ok(calls[0].includes('comment'));
    assert.ok(calls[0].includes('42'));
  });
});

describe('flagForHuman', () => {
  it('comments and labels the issue', async () => {
    const calls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => { calls.push(args); return { stdout: '', stderr: '' }; },
    });
    const issue: OrchestratorIssue = { number: 42, title: 'Test', wave: 1, state: 'pr_open', child_session: 's1', pr_number: 100, depends_on: [] };
    await flagForHuman(issue, 'owner/repo', 'test reason', deps);
    assert.equal(calls.length, 2);
    // First call: comment
    assert.ok(calls[0].includes('comment'));
    // Second call: add label
    assert.ok(calls[1].includes('--add-label'));
    assert.ok(calls[1].includes('aloop/blocked-on-human'));
  });
});

describe('processPrLifecycle', () => {
  it('merges PR when all gates pass and review approves', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const ghCalls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => {
        ghCalls.push(args);
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
          ]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff content', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'merged');
    assert.equal(state.issues[0].state, 'merged');
    assert.ok(deps.logs.some((l) => l.event === 'pr_merged'));
  });

  it('returns gates_pending when CI is still running', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'IN_PROGRESS', conclusion: '' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'gates_pending');
  });

  it('requests rebase on first merge conflict', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'rebase_requested');
    assert.ok(result.detail.includes('attempt 1/2'));
    assert.equal(state.issues[0].rebase_attempts, 1);
    assert.ok(deps.logs.some((l) => l.event === 'pr_rebase_requested'));
  });

  it('flags for human after 2 rebase attempts', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open', rebase_attempts: 2 }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'CONFLICTING' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'flagged_for_human');
    assert.equal(state.issues[0].state, 'failed');
    assert.ok(deps.logs.some((l) => l.event === 'pr_flagged_for_human'));
  });

  it('rejects PR when agent review requests changes', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'request-changes' as const,
        summary: 'Missing test coverage',
      }),
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'rejected');
    assert.equal(result.review?.verdict, 'request-changes');
  });

  it('flags for human when agent review flags', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'flag-for-human' as const,
        summary: 'Security concern',
      }),
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'flagged_for_human');
  });

  it('returns gates_failed when no pr_number on issue', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: null, state: 'pr_open' }]);
    const deps = createMockPrDeps();
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'gates_failed');
    assert.ok(result.detail.includes('No PR number'));
  });

  it('comments on issue when CI gates fail', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const ghCalls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => {
        ghCalls.push(args);
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([
            { name: 'build', state: 'COMPLETED', conclusion: 'FAILURE' },
          ]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'gates_failed');
    // Should have posted a comment about the failure
    const commentCall = ghCalls.find((c) => c.includes('comment') && c.includes('42'));
    assert.ok(commentCall);
    assert.ok(deps.logs.some((l) => l.event === 'pr_gates_failed'));
  });

  it('handles merge failure after approval', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    let mergeAttempted = false;
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff', stderr: '' };
        }
        if (args.includes('merge')) {
          mergeAttempted = true;
          throw new Error('Race condition conflict');
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(mergeAttempted, true);
    assert.equal(result.action, 'gates_failed');
    assert.ok(result.detail.includes('Race condition'));
    assert.ok(deps.logs.some((l) => l.event === 'pr_merge_failed'));
  });

  it('closes issue after successful merge', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const ghCalls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => {
        ghCalls.push(args);
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    const closeCall = ghCalls.find((c) => c.includes('close') && c.includes('42'));
    assert.ok(closeCall, 'Should have closed the issue');
  });
});

describe('isWaveComplete', () => {
  it('returns true when all issues in wave are merged', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 1, state: 'merged' },
      { number: 3, wave: 2, state: 'pending' },
    ]);
    assert.equal(isWaveComplete(state, 1), true);
    assert.equal(isWaveComplete(state, 2), false);
  });

  it('returns true when all issues are merged or failed', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 1, state: 'failed' },
    ]);
    assert.equal(isWaveComplete(state, 1), true);
  });

  it('returns false when some issues are still in progress', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 1, state: 'in_progress' },
    ]);
    assert.equal(isWaveComplete(state, 1), false);
  });

  it('returns false for empty wave', () => {
    const state = makeOrchestratorState([{ number: 1, wave: 2, state: 'merged' }]);
    assert.equal(isWaveComplete(state, 1), false);
  });
});

describe('advanceWave', () => {
  it('advances to next wave when current is complete', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 2, state: 'pending' },
    ]);
    state.current_wave = 1;
    const advanced = advanceWave(state);
    assert.equal(advanced, true);
    assert.equal(state.current_wave, 2);
    assert.deepStrictEqual(state.completed_waves, [1]);
  });

  it('returns false when current wave is not complete', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 1, state: 'in_progress' },
    ]);
    state.current_wave = 1;
    assert.equal(advanceWave(state), false);
  });

  it('returns false when current_wave is 0', () => {
    const state = makeOrchestratorState([]);
    state.current_wave = 0;
    assert.equal(advanceWave(state), false);
  });

  it('returns false when on last wave (all complete)', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
    ]);
    state.current_wave = 1;
    assert.equal(advanceWave(state), false);
    assert.deepStrictEqual(state.completed_waves, [1]);
  });

  it('does not duplicate completed_waves entries', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 2, state: 'pending' },
    ]);
    state.current_wave = 1;
    state.completed_waves = [1];
    advanceWave(state);
    assert.deepStrictEqual(state.completed_waves, [1]);
  });
});

// --- Budget & final report tests ---

import path from 'node:path';

function createMockBudgetDeps(files: Record<string, string> = {}): BudgetDeps {
  // Normalize all keys to OS path format for cross-platform compatibility
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    normalized[path.normalize(k)] = v;
  }
  return {
    readFile: async (p: string) => {
      const np = path.normalize(p);
      if (np in normalized) return normalized[np];
      throw new Error(`File not found: ${p}`);
    },
    existsSync: (p: string) => path.normalize(p) in normalized,
  };
}

describe('parseChildSessionCost', () => {
  it('returns zero cost when log.jsonl does not exist', async () => {
    const deps = createMockBudgetDeps();
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 0);
    assert.equal(result.estimated_cost_usd, 0);
    assert.deepStrictEqual(result.providers, {});
    assert.equal(result.session_id, 'child-1');
    assert.equal(result.issue_number, 42);
  });

  it('counts iteration_complete events and tracks providers', async () => {
    const logLines = [
      JSON.stringify({ event: 'session_start', timestamp: '2026-03-09T10:00:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-09T10:05:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude', timestamp: '2026-03-09T10:10:00Z' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'copilot', timestamp: '2026-03-09T10:15:00Z' }),
      JSON.stringify({ event: 'steering_detected', timestamp: '2026-03-09T10:16:00Z' }),
    ].join('\n');

    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 3);
    assert.deepStrictEqual(result.providers, { claude: 2, copilot: 1 });
    assert.equal(result.estimated_cost_usd, 1.5);
  });

  it('handles malformed log lines gracefully', async () => {
    const logLines = [
      'not json at all',
      JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
      '{ broken',
    ].join('\n');

    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 1);
    assert.deepStrictEqual(result.providers, { claude: 1 });
  });

  it('uses "unknown" provider when provider field is missing', async () => {
    const logLines = JSON.stringify({ event: 'iteration_complete' });
    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 1);
    assert.deepStrictEqual(result.providers, { unknown: 1 });
  });
});

describe('aggregateChildCosts', () => {
  it('aggregates costs from multiple children', async () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged', child_session: 'child-1' },
      { number: 2, wave: 1, state: 'in_progress', child_session: 'child-2' },
      { number: 3, wave: 2, state: 'pending', child_session: null },
    ]);

    const deps = createMockBudgetDeps({
      '/home/.aloop/sessions/child-1/log.jsonl': [
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
      ].join('\n'),
      '/home/.aloop/sessions/child-2/log.jsonl': [
        JSON.stringify({ event: 'iteration_complete', provider: 'copilot' }),
      ].join('\n'),
    });

    const result = await aggregateChildCosts(state, '/home/.aloop', deps);
    assert.equal(result.children.length, 2);
    assert.equal(result.total_estimated_cost_usd, 1.5);
    assert.equal(result.budget_exceeded, false);
    assert.equal(result.budget_approaching, false);
  });

  it('detects budget approaching at 80% threshold', async () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged', child_session: 'child-1' },
    ]);
    state.budget_cap = 1.0;

    const deps = createMockBudgetDeps({
      '/home/.aloop/sessions/child-1/log.jsonl': [
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
      ].join('\n'),
    });

    const result = await aggregateChildCosts(state, '/home/.aloop', deps);
    // 2 iterations * $0.50 = $1.00, cap = $1.00 → exceeded
    assert.equal(result.budget_exceeded, true);
    assert.equal(result.budget_approaching, false);
  });

  it('detects budget approaching but not exceeded', async () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged', child_session: 'child-1' },
    ]);
    state.budget_cap = 1.10;

    const deps = createMockBudgetDeps({
      '/home/.aloop/sessions/child-1/log.jsonl': [
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
        JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
      ].join('\n'),
    });

    const result = await aggregateChildCosts(state, '/home/.aloop', deps);
    // 2 * $0.50 = $1.00, cap = $1.10, 80% = $0.88 → approaching
    assert.equal(result.budget_exceeded, false);
    assert.equal(result.budget_approaching, true);
  });

  it('returns no budget flags when cap is null', async () => {
    const state = makeOrchestratorState([]);
    state.budget_cap = null;
    const deps = createMockBudgetDeps();
    const result = await aggregateChildCosts(state, '/home/.aloop', deps);
    assert.equal(result.budget_exceeded, false);
    assert.equal(result.budget_approaching, false);
  });
});

describe('shouldPauseForBudget', () => {
  it('returns false when budget is not set', () => {
    const budget: BudgetSummary = {
      budget_cap: null, total_estimated_cost_usd: 100, children: [],
      budget_exceeded: false, budget_approaching: false,
    };
    assert.equal(shouldPauseForBudget(budget), false);
  });

  it('returns true when budget is exceeded', () => {
    const budget: BudgetSummary = {
      budget_cap: 5.0, total_estimated_cost_usd: 6.0, children: [],
      budget_exceeded: true, budget_approaching: false,
    };
    assert.equal(shouldPauseForBudget(budget), true);
  });

  it('returns true when budget is approaching', () => {
    const budget: BudgetSummary = {
      budget_cap: 5.0, total_estimated_cost_usd: 4.5, children: [],
      budget_exceeded: false, budget_approaching: true,
    };
    assert.equal(shouldPauseForBudget(budget), true);
  });
});

describe('generateFinalReport', () => {
  it('generates correct summary from orchestrator state', () => {
    const state = makeOrchestratorState([
      { number: 1, wave: 1, state: 'merged' },
      { number: 2, wave: 1, state: 'failed' },
      { number: 3, wave: 2, state: 'pending' },
    ]);
    state.completed_waves = [1];

    const budget: BudgetSummary = {
      budget_cap: 10.0, total_estimated_cost_usd: 3.5,
      children: [
        { session_id: 'child-1', issue_number: 1, iterations: 5, providers: { claude: 3, copilot: 2 }, estimated_cost_usd: 2.5 },
        { session_id: 'child-2', issue_number: 2, iterations: 2, providers: { claude: 2 }, estimated_cost_usd: 1.0 },
      ],
      budget_exceeded: false, budget_approaching: false,
    };

    const report = generateFinalReport(state, '/sessions/orch-1', budget, new Date('2026-03-09T11:00:00Z'));

    assert.equal(report.issues_total, 3);
    assert.equal(report.issues_completed, 1);
    assert.equal(report.issues_failed, 1);
    assert.equal(report.issues_pending, 1);
    assert.equal(report.waves_total, 2);
    assert.equal(report.waves_completed, 1);
    assert.equal(report.duration_seconds, 3600);
    assert.equal(report.session_dir, '/sessions/orch-1');
    assert.equal(report.budget.total_estimated_cost_usd, 3.5);
  });
});

describe('formatFinalReportText', () => {
  it('formats report as human-readable text', () => {
    const budget: BudgetSummary = {
      budget_cap: 10.0, total_estimated_cost_usd: 3.0,
      children: [
        { session_id: 'c1', issue_number: 1, iterations: 4, providers: { claude: 3, copilot: 1 }, estimated_cost_usd: 2.0 },
        { session_id: 'c2', issue_number: 2, iterations: 2, providers: { claude: 2 }, estimated_cost_usd: 1.0 },
      ],
      budget_exceeded: false, budget_approaching: false,
    };

    const report = generateFinalReport(
      makeOrchestratorState([
        { number: 1, wave: 1, state: 'merged' },
        { number: 2, wave: 1, state: 'merged' },
      ]),
      '/sessions/orch-1',
      budget,
      new Date('2026-03-09T11:30:00Z'),
    );

    const text = formatFinalReportText(report);
    assert.ok(text.includes('=== Orchestrator Final Report ==='));
    assert.ok(text.includes('Total:       2'));
    assert.ok(text.includes('Completed:   2'));
    assert.ok(text.includes('Failed:      0'));
    assert.ok(text.includes('Cap:         $10.00'));
    assert.ok(text.includes('Estimated:   $3.00'));
    assert.ok(text.includes('Iterations:  6'));
    assert.ok(text.includes('claude: 5 iterations'));
    assert.ok(text.includes('copilot: 1 iterations'));
  });

  it('shows (none) when budget cap is null', () => {
    const budget: BudgetSummary = {
      budget_cap: null, total_estimated_cost_usd: 0, children: [],
      budget_exceeded: false, budget_approaching: false,
    };
    const report = generateFinalReport(
      makeOrchestratorState([]),
      '/sessions/orch-1',
      budget,
      new Date('2026-03-09T10:05:00Z'),
    );
    const text = formatFinalReportText(report);
    assert.ok(text.includes('Cap:         (none)'));
  });
});

describe('orchestrateCommandWithDeps budget option', () => {
  it('sets budget_cap from --budget option', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({ budget: '25.50' }, deps);
    assert.equal(result.state.budget_cap, 25.50);
  });

  it('defaults budget_cap to null when not provided', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps({}, deps);
    assert.equal(result.state.budget_cap, null);
  });

  it('throws on invalid budget value', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ budget: 'abc' }, deps),
      { message: /Invalid budget value/ },
    );
  });

  it('throws on zero budget value', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ budget: '0' }, deps),
      { message: /Invalid budget value/ },
    );
  });

  it('throws on negative budget value', async () => {
    const deps = createMockDeps();
    await assert.rejects(
      () => orchestrateCommandWithDeps({ budget: '-5' }, deps),
      { message: /Invalid budget value/ },
    );
  });
});
