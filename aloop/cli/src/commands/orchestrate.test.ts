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
  type OrchestrateCommandOptions,
  type OrchestrateDeps,
  type DispatchDeps,
  type DecompositionPlanIssue,
  type DecompositionPlan,
  type OrchestratorState,
  type OrchestratorIssue,
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
