import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  orchestrateCommand,
  orchestrateCommandWithDeps,
  validateDependencyGraph,
  assignWaves,
  applyDecompositionPlan,
  type OrchestrateCommandOptions,
  type OrchestrateDeps,
  type DecompositionPlanIssue,
  type DecompositionPlan,
  type OrchestratorState,
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
