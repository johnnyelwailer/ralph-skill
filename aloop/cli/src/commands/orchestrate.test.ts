import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import {
  orchestrateCommand,
  orchestrateCommandWithDeps,
  validateDependencyGraph,
  assignWaves,
  applyDecompositionPlan,
  getDispatchableIssues,
  countActiveChildren,
  availableSlots,
  hasFileOwnershipConflict,
  filterByFileOwnership,
  filterByHostCapabilities,
  launchChildLoop,
  dispatchChildLoops,
  checkPrGates,
  reviewPrDiff,
  mergePr,
  flagForHuman,
  processPrLifecycle,
  applyTriageConfidenceFloor,
  classifyTriageComment,
  runTriageClassificationLoop,
  runTriageMonitorCycle,
  shouldPauseForHumanFeedback,
  getUnprocessedTriageComments,
  applyTriageResultsToIssue,
  classifySpecQuestionRisk,
  resolveSpecQuestionAction,
  resolveSpecQuestionIssues,
  resolveOrchestratorAutonomyLevel,
  isWaveComplete,
  advanceWave,
  parseChildSessionCost,
  aggregateChildCosts,
  shouldPauseForBudget,
  generateFinalReport,
  formatFinalReportText,
  validateDoR,
   applyEstimateResults,
   queueEstimateForIssues,
   classifyGapRisk,
   resolveRefinementBudgetAction,
   REFINEMENT_BUDGET_CAP,
  createEpicDecompositionRequest,
  queueEpicDecomposition,
  createSubDecompositionRequests,
  queueSubDecompositionForIssues,
  applySubDecompositionResults,
  createGapAnalysisRequests,
  queueGapAnalysisForIssues,
  runOrchestratorScanPass,
  runOrchestratorScanLoop,
  monitorChildSessions,
  isHousekeepingCommit,
  detectSpecChanges,
  resolveSpecFiles,
  loadMergedSpecContent,
  queueReplanForSpecChange,
  applyReplanActions,
  applySpecBackfill,
  queueSpecConsistencyCheck,
  runSpecChangeReplan,
  processQueuedPrompts,
  createTrunkToMainPr,
  resolveAutoMerge,
  detectChangeRequestLabel,
  type EstimateResult,
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
  type ScanLoopDeps,
  type ScanPassResult,
  type ScanLoopResult,
  type SubDecompositionResult,
  type ReplanAction,
  type ReplanResult,
  type SpecChangeDetection,
} from './orchestrate.js';

function createMockDeps(overrides: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const writtenFiles: Record<string, string> = {};
  const createdDirs: string[] = [];

  return {
    existsSync: (p: string) => p.includes('SPEC.md'),
    readFile: async (path: string) => writtenFiles[path] ?? '',
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
    assert.ok(result.prompts_dir.includes('/prompts'));
    assert.ok(result.queue_dir.includes('/queue'));
    assert.ok(result.requests_dir.includes('/requests'));
    assert.ok(result.loop_plan_file.includes('loop-plan.json'));
    assert.ok(result.session_dir.includes('orchestrator-20260309-103000'));
  });

  it('writes orchestrator loop heartbeat artifacts', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    await orchestrateCommandWithDeps({}, deps);

    const loopPlanPath = Object.keys(mockDeps._writtenFiles).find((p) => p.endsWith('/loop-plan.json'));
    assert.ok(loopPlanPath, 'loop-plan.json should be written');
    const loopPlan = JSON.parse(mockDeps._writtenFiles[loopPlanPath!]);
    assert.deepStrictEqual(loopPlan.cycle, ['PROMPT_orch_scan.md']);
    assert.equal(loopPlan.cyclePosition, 0);
    assert.equal(loopPlan.iteration, 1);
    assert.equal(loopPlan.version, 1);

    const orchPromptPath = Object.keys(mockDeps._writtenFiles).find((p) => p.endsWith('/prompts/PROMPT_orch_scan.md'));
    assert.ok(orchPromptPath, 'PROMPT_orch_scan.md should be written');
    assert.match(mockDeps._writtenFiles[orchPromptPath!], /agent:\s+orch_scan/);
    assert.match(mockDeps._writtenFiles[orchPromptPath!], /Orchestrator Scan \(Heartbeat\)/);
  });

  it('writes estimation prompt template for DoR checks', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    await orchestrateCommandWithDeps({}, deps);

    const estimatePromptPath = Object.keys(mockDeps._writtenFiles).find((p) => p.endsWith('/prompts/PROMPT_orch_estimate.md'));
    assert.ok(estimatePromptPath, 'PROMPT_orch_estimate.md should be written');
    assert.match(mockDeps._writtenFiles[estimatePromptPath!], /Orchestrator Estimation Agent/);
  });

  it('respects --spec, --trunk, --concurrency options', async () => {
    const deps = createMockDeps({ existsSync: () => true });
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

  it('creates session directories for orchestrator loop runtime', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _createdDirs: string[] };

    await orchestrateCommandWithDeps({}, deps);

    assert.ok(mockDeps._createdDirs.some((d) => d.includes('orchestrator-')), 'session dir should be created');
    assert.ok(mockDeps._createdDirs.some((d) => d.endsWith('/prompts')), 'prompts dir should be created');
    assert.ok(mockDeps._createdDirs.some((d) => d.endsWith('/queue')), 'queue dir should be created');
    assert.ok(mockDeps._createdDirs.some((d) => d.endsWith('/requests')), 'requests dir should be created');
  });

  it('runs triage monitor cycle when repo and gh executor are available', async () => {
    const samplePlan = JSON.stringify({
      issues: [
        { id: 1, title: 'Task A', body: 'Do A', depends_on: [] },
      ],
    });
    const ghCalls: string[][] = [];
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
      execGh: async (args) => {
        ghCalls.push(args);
        if (args[0] === 'issue-comments') {
          return {
            stdout: JSON.stringify({
              comments: [
                {
                  id: 201,
                  body: 'Please add tests for this behavior.',
                  author: 'pj',
                  author_association: 'COLLABORATOR',
                  issue_url: 'https://api.github.com/repos/owner/repo/issues/1',
                },
              ],
            }),
            stderr: '',
          };
        }
        if (args[0] === 'pr-comments') {
          return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });

    const result = await orchestrateCommandWithDeps({ plan: 'plan.json', repo: 'owner/repo' }, deps);

    assert.equal(result.state.issues.length, 1);
    assert.deepStrictEqual(result.state.issues[0].processed_comment_ids, [201]);
    assert.equal(result.state.issues[0].triage_log?.length, 1);
    assert.equal(result.state.issues[0].triage_log?.[0]?.classification, 'actionable');
    assert.equal(result.state.issues[0].triage_log?.[0]?.action_taken, 'steering_deferred');
    assert.deepStrictEqual(
      result.state.issues[0].pending_steering_comments?.map((comment) => comment.id),
      [201],
    );
    assert.equal(result.state.issues[0].last_comment_check, '2026-03-09T10:30:00.000Z');
    assert.equal(ghCalls.length, 2);
    assert.deepStrictEqual(
      ghCalls[0],
      ['issue-comments', '--session', 'orchestrator-20260309-103000', '--since', '2026-03-09T10:30:00.000Z', '--role', 'orchestrator'],
    );
    assert.deepStrictEqual(
      ghCalls[1],
      ['pr-comments', '--session', 'orchestrator-20260309-103000', '--since', '2026-03-09T10:30:00.000Z', '--role', 'orchestrator'],
    );
  });
});

describe('orchestrateCommand', () => {
  it('text output includes session dir, spec, trunk, concurrency', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ planOnly: true }, createMockDeps());
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
    assert.ok(allOutput.includes('true'));
  });

  it('json output emits valid JSON with orchestrator loop artifacts', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ output: 'json', planOnly: true }, createMockDeps());
    } finally {
      console.log = origLog;
    }

    assert.equal(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.ok('session_dir' in parsed);
    assert.ok('prompts_dir' in parsed);
    assert.ok('queue_dir' in parsed);
    assert.ok('requests_dir' in parsed);
    assert.ok('loop_plan_file' in parsed);
    assert.ok('state_file' in parsed);
    assert.ok('state' in parsed);
    assert.equal(parsed.state.spec_file, 'SPEC.md');
  });

  it('text output shows filter_issues when set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      await orchestrateCommand({ issues: '10,20', planOnly: true }, createMockDeps());
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
      await orchestrateCommand({ planOnly: true }, createMockDeps());
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
      await orchestrateCommand({ label: 'aloop/auto', planOnly: true }, createMockDeps());
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
      await orchestrateCommand({ planOnly: true }, createMockDeps());
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
      await orchestrateCommand({ repo: 'owner/repo', planOnly: true }, createMockDeps());
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
      await orchestrateCommand({ planOnly: true }, createMockDeps());
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

describe('detectChangeRequestLabel', () => {
  it('returns true for aloop/change-request label as object', () => {
    assert.equal(detectChangeRequestLabel([{ name: 'aloop/change-request' }]), true);
  });

  it('returns true for aloop/change-request label as string', () => {
    assert.equal(detectChangeRequestLabel(['aloop/auto', 'aloop/change-request']), true);
  });

  it('returns false when label is absent', () => {
    assert.equal(detectChangeRequestLabel([{ name: 'aloop/auto' }, { name: 'aloop/epic' }]), false);
  });

  it('returns false for empty array', () => {
    assert.equal(detectChangeRequestLabel([]), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(detectChangeRequestLabel(null), false);
    assert.equal(detectChangeRequestLabel(undefined), false);
  });

  it('returns false when label name is null', () => {
    assert.equal(detectChangeRequestLabel([{ name: null }]), false);
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
      assert.equal(issue.status, 'Needs decomposition');
      assert.equal(issue.dor_validated, false);
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

  it('calls execGhIssueCreate with correct labels (aloop + wave)', async () => {
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
    assert.deepStrictEqual(calls[0].labels, ['aloop', 'aloop/wave-1']);
    assert.deepStrictEqual(calls[1].labels, ['aloop', 'aloop/wave-2']);
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

  it('queues sub-decomposition for epics in Needs decomposition status', async () => {
    const deps = createMockDeps({
      existsSync: () => true,
      readFile: async () => samplePlan,
    });
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    await orchestrateCommandWithDeps({ plan: 'plan.json' }, deps);

    // Epics start at Needs decomposition — sub-decomposition should be queued
    const queueFiles = Object.keys(mockDeps._writtenFiles).filter((p) => p.includes('/queue/sub-decompose-issue-'));
    assert.equal(queueFiles.length, 2, 'Should write sub-decompose queue prompts for each epic');
    const queueContent = mockDeps._writtenFiles[queueFiles[0]];
    assert.match(queueContent, /orch_estimate/, 'Queue override should reference orch_estimate agent');
  });

  it('applies estimate-results.json when present', async () => {
    const estimateResults: EstimateResult[] = [
      { issue_number: 1, dor_passed: true, complexity_tier: 'S', iteration_estimate: 3, confidence: 'high' },
      { issue_number: 2, dor_passed: false, gaps: ['Missing tests'] },
    ];
    const deps = createMockDeps({
      existsSync: (p: string) => {
        if (typeof p === 'string' && p.endsWith('estimate-results.json')) return true;
        return true;
      },
      readFile: async (p: string) => {
        if (typeof p === 'string' && p.endsWith('estimate-results.json')) return JSON.stringify(estimateResults);
        return samplePlan;
      },
    });
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };

    const result = await orchestrateCommandWithDeps({ plan: 'plan.json' }, deps);

    const issue1 = result.state.issues.find((i) => i.number === 1);
    const issue2 = result.state.issues.find((i) => i.number === 2);
    // Issue 1 already had number 1 in state from applyDecompositionPlan — check by wave/order
    // The first issue from samplePlan will get number 1
    assert.ok(issue1, 'Issue 1 should exist');
    assert.ok(issue2, 'Issue 2 should exist');
    assert.equal(issue1!.dor_validated, true);
    assert.equal(issue1!.status, 'Ready');
    assert.equal(issue2!.dor_validated, false);
    assert.equal(issue2!.status, 'Needs decomposition');
  });

  it('throws when spec file does not exist', async () => {
    const deps = createMockDeps({ existsSync: () => false });
    await assert.rejects(
      () => orchestrateCommandWithDeps({ spec: 'NONEXISTENT.md' }, deps),
      /No spec files found matching/,
    );
  });

  it('throws when default SPEC.md does not exist', async () => {
    const deps = createMockDeps({ existsSync: () => false });
    await assert.rejects(
      () => orchestrateCommandWithDeps({}, deps),
      /No spec files found matching/,
    );
  });

  it('throws when plan file does not exist', async () => {
    const deps = createMockDeps({ existsSync: (p: string) => p.includes('SPEC.md') });
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
      existsSync: (p: string) => p.includes('SPEC.md') || p.endsWith('plan.json'),
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
      await orchestrateCommand({ plan: 'plan.json', planOnly: true }, deps);
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
      child_session: 'proj-issue-43-20260314-120000',
    });
    const comments = [
      triageComment({ id: 20, body: 'Please switch to WebSockets for updates.' }),
    ];
    const ghCalls: string[][] = [];
    const writtenFiles: Record<string, string> = {};
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-triage-'));
    const aloopRoot = path.join(tempDir, '.aloop');
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:05:00.000Z'),
      writeFile: async (p, data) => { 
        await mkdir(path.dirname(p), { recursive: true });
        writtenFiles[p] = data; 
      },
      aloopRoot,
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

    const expectedPath = path.join(aloopRoot, 'sessions/proj-issue-43-20260314-120000/worktree/STEERING.md');
    assert.ok(writtenFiles[expectedPath], 'unblock_and_steering should also write STEERING.md');
    assert.ok(writtenFiles[expectedPath].includes('WebSockets'), 'steering content includes comment body');
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

  it('applyTriageResultsToIssue records triaged_no_action for out_of_scope collaborator comments', async () => {
    const issue = makeIssue({
      number: 47,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 30, body: 'Thanks!', author: 'alice', author_association: 'COLLABORATOR' }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:10:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'out_of_scope');
    assert.equal(entries[0].action_taken, 'triaged_no_action');
    assert.equal(entries[0].author, 'alice');
    assert.equal(issue.blocked_on_human, false);
    assert.deepStrictEqual(issue.processed_comment_ids, [30]);
    assert.equal(ghCalls.length, 0, 'out_of_scope should not trigger any GH calls');
  });

  it('applyTriageResultsToIssue injects steering without unblocking for actionable when not blocked', async () => {
    const issue = makeIssue({
      number: 48,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
      child_session: 'proj-issue-48-20260314-120000',
    });
    const comments = [
      triageComment({ id: 31, body: 'Please implement pagination for this endpoint.' }),
    ];
    const ghCalls: string[][] = [];
    const writtenFiles: Record<string, string> = {};
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-triage-'));
    const aloopRoot = path.join(tempDir, '.aloop');
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:11:00.000Z'),
      writeFile: async (p, data) => { 
        await mkdir(path.dirname(p), { recursive: true });
        writtenFiles[p] = data; 
      },
      aloopRoot,
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'actionable');
    assert.equal(entries[0].action_taken, 'steering_injected');
    assert.equal(issue.blocked_on_human, false);
    assert.deepStrictEqual(issue.processed_comment_ids, [31]);
    assert.equal(ghCalls.length, 0, 'steering_injected should not call GH when not blocked');

    const expectedPath = path.join(aloopRoot, 'sessions/proj-issue-48-20260314-120000/worktree/STEERING.md');
    assert.ok(writtenFiles[expectedPath], 'should write STEERING.md to child worktree');
    assert.ok(writtenFiles[expectedPath].includes('Please implement pagination'), 'steering content includes comment body');
    assert.ok(writtenFiles[expectedPath].includes('#48'), 'steering content references issue number');
  });

  it('applyTriageResultsToIssue defers actionable steering when child_session is missing', async () => {
    const issue = makeIssue({
      number: 58,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
      child_session: null,
    });
    const comments = [
      triageComment({ id: 60, body: 'Please add integration coverage for this flow.', author: 'alice' }),
    ];
    const ghCalls: string[][] = [];
    const writtenFiles: Record<string, string> = {};
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-triage-'));
    const aloopRoot = path.join(tempDir, '.aloop');
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:18:00.000Z'),
      writeFile: async (p, data) => { 
        await mkdir(path.dirname(p), { recursive: true });
        writtenFiles[p] = data; 
      },
      aloopRoot,
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].classification, 'actionable');
    assert.equal(entries[0].action_taken, 'steering_deferred');
    assert.deepStrictEqual(issue.processed_comment_ids, [60]);
    assert.deepStrictEqual(issue.pending_steering_comments?.map((comment) => comment.id), [60]);
    assert.equal(ghCalls.length, 0, 'steering_deferred should not call GH when issue is not blocked');
    assert.deepStrictEqual(Object.keys(writtenFiles), [], 'steering_deferred should not write STEERING.md without child_session');
  });

  it('applyTriageResultsToIssue flushes deferred steering when child_session becomes available', async () => {
    const issue = makeIssue({
      number: 59,
      child_session: 'proj-issue-59-20260314-120000',
      processed_comment_ids: [61],
      triage_log: [],
      pending_steering_comments: [
        triageComment({
          id: 61,
          author: 'alice',
          body: 'Please keep polling interval configurable.',
        }),
      ],
    });
    const writtenFiles: Record<string, string> = {};
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aloop-triage-'));
    const aloopRoot = path.join(tempDir, '.aloop');
    const deps: TriageDeps = {
      execGh: async () => ({ stdout: '', stderr: '' }),
      now: () => new Date('2026-03-14T12:19:00.000Z'),
      writeFile: async (p, data) => { 
        await mkdir(path.dirname(p), { recursive: true });
        writtenFiles[p] = data; 
      },
      aloopRoot,
    };

    const entries = await applyTriageResultsToIssue(issue, [], 'owner/repo', deps);

    assert.deepStrictEqual(entries, []);
    assert.deepStrictEqual(issue.pending_steering_comments, []);
    const expectedPath = path.join(aloopRoot, 'sessions/proj-issue-59-20260314-120000/worktree/STEERING.md');
    assert.ok(writtenFiles[expectedPath], 'should write deferred steering once child_session exists');
    assert.ok(writtenFiles[expectedPath].includes('configurable'), 'deferred steering content should be preserved');
  });

  it('applyTriageResultsToIssue propagates execGh errors on needs_clarification comment post', async () => {
    const issue = makeIssue({
      number: 49,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 32, body: 'hmm maybe we should rethink this approach?' }),
    ];
    const deps: TriageDeps = {
      execGh: async () => {
        throw new Error('gh CLI rate limited');
      },
      now: () => new Date('2026-03-14T12:12:00.000Z'),
    };

    await assert.rejects(
      () => applyTriageResultsToIssue(issue, comments, 'owner/repo', deps),
      (err: Error) => {
        assert.ok(err.message.includes('gh CLI rate limited'));
        return true;
      },
    );
  });

  it('applyTriageResultsToIssue propagates execGh errors on label add', async () => {
    const issue = makeIssue({
      number: 50,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 33, body: 'hmm not sure about this direction' }),
    ];
    let callCount = 0;
    const deps: TriageDeps = {
      execGh: async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('label add failed');
        }
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:13:00.000Z'),
    };

    await assert.rejects(
      () => applyTriageResultsToIssue(issue, comments, 'owner/repo', deps),
      (err: Error) => {
        assert.ok(err.message.includes('label add failed'));
        return true;
      },
    );
  });

  it('applyTriageResultsToIssue propagates execGh errors on question reply', async () => {
    const issue = makeIssue({
      number: 51,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 34, body: 'What is the deployment process?', author: 'bob' }),
    ];
    const deps: TriageDeps = {
      execGh: async () => {
        throw new Error('comment post forbidden');
      },
      now: () => new Date('2026-03-14T12:14:00.000Z'),
    };

    await assert.rejects(
      () => applyTriageResultsToIssue(issue, comments, 'owner/repo', deps),
      (err: Error) => {
        assert.ok(err.message.includes('comment post forbidden'));
        return true;
      },
    );
  });

  it('applyTriageResultsToIssue handles mixed classifications in a single batch', async () => {
    const issue = makeIssue({
      number: 52,
      blocked_on_human: false,
      processed_comment_ids: [],
      triage_log: [],
    });
    const comments = [
      triageComment({ id: 40, body: 'LGTM', author: 'alice' }),
      triageComment({ id: 41, body: 'Please add retry logic for flaky requests.', author: 'bob' }),
      triageComment({ id: 42, body: 'What error codes does this return?', author: 'carol' }),
      triageComment({ id: 43, body: 'hmm maybe we should rethink this?', author: 'dave' }),
      triageComment({
        id: 44,
        author: 'aloop-bot[bot]',
        body: 'Auto-reply.\n---\n*This comment was generated by aloop triage agent.*',
      }),
      triageComment({ id: 45, author: 'random', author_association: 'NONE', body: 'Drive-by comment.' }),
    ];
    const ghCalls: string[][] = [];
    const deps: TriageDeps = {
      execGh: async (args) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
      now: () => new Date('2026-03-14T12:15:00.000Z'),
    };

    const entries = await applyTriageResultsToIssue(issue, comments, 'owner/repo', deps);

    // Agent comment (id 44) is skipped entirely — no entry
    // External comment (id 45) logged as untriaged_external_comment
    // Remaining 4 collaborator comments produce entries
    assert.equal(entries.length, 5);

    assert.equal(entries[0].comment_id, 40);
    assert.equal(entries[0].classification, 'out_of_scope');
    assert.equal(entries[0].action_taken, 'triaged_no_action');

    assert.equal(entries[1].comment_id, 41);
    assert.equal(entries[1].classification, 'actionable');
    assert.equal(entries[1].action_taken, 'steering_deferred');

    assert.equal(entries[2].comment_id, 42);
    assert.equal(entries[2].classification, 'question');
    assert.equal(entries[2].action_taken, 'question_answered');

    assert.equal(entries[3].comment_id, 43);
    assert.equal(entries[3].classification, 'needs_clarification');
    assert.equal(entries[3].action_taken, 'post_reply_and_block');

    assert.equal(entries[4].comment_id, 45);
    assert.equal(entries[4].action_taken, 'untriaged_external_comment');

    // Verify all non-agent IDs processed
    assert.deepStrictEqual(issue.processed_comment_ids, [40, 41, 42, 43, 44, 45]);
    assert.equal(issue.blocked_on_human, true);
    assert.deepStrictEqual(issue.pending_steering_comments?.map((comment) => comment.id), [41]);
    assert.equal(issue.triage_log?.length, 5);
    assert.equal(issue.last_comment_check, '2026-03-14T12:15:00.000Z');

    // Exact GH calls: question reply, needs_clarification reply + label add = 3 calls
    assert.equal(ghCalls.length, 3);
    assert.deepStrictEqual(
      ghCalls[0],
      ['issue', 'comment', '52', '--repo', 'owner/repo', '--body', `Thanks for the question, @carol.\n\nBased on the current issue context, this requires human clarification before implementation can proceed safely. Please provide specific direction and expected outcome.\n---\n*This comment was generated by aloop triage agent.*`],
    );
    assert.deepStrictEqual(
      ghCalls[1],
      ['issue', 'comment', '52', '--repo', 'owner/repo', '--body', `Thanks for the feedback, @dave.\n\nI want to make sure we implement exactly what you intended. Could you clarify the requested change with concrete acceptance criteria?\n---\n*This comment was generated by aloop triage agent.*`],
    );
    assert.deepStrictEqual(
      ghCalls[2],
      ['issue', 'edit', '52', '--repo', 'owner/repo', '--add-label', 'aloop/blocked-on-human'],
    );
  });
});

describe('runTriageMonitorCycle', () => {
  it('polls issue and PR comments per issue and applies triage to matching records', async () => {
    const state = makeState({
      created_at: '2026-03-14T10:00:00.000Z',
      updated_at: '2026-03-14T10:00:00.000Z',
      issues: [
        makeIssue({
          number: 42,
          pr_number: 77,
          blocked_on_human: false,
          processed_comment_ids: [],
          triage_log: [],
          last_comment_check: '2026-03-14T11:00:00.000Z',
        }),
        makeIssue({
          number: 43,
          pr_number: null,
          blocked_on_human: false,
          processed_comment_ids: [],
          triage_log: [],
        }),
      ],
    });

    const ghCalls: string[][] = [];
    const deps: Pick<OrchestrateDeps, 'execGh' | 'now'> = {
      execGh: async (args) => {
        ghCalls.push(args);
        if (args[0] === 'issue-comments') {
          return {
            stdout: JSON.stringify({
              comments: [
                {
                  id: 501,
                  body: 'Please update docs and tests.',
                  user: { login: 'pj' },
                  author_association: 'COLLABORATOR',
                  issue_url: 'https://api.github.com/repos/owner/repo/issues/42',
                },
                {
                  id: 999,
                  body: 'Not for this issue',
                  user: { login: 'pj' },
                  author_association: 'COLLABORATOR',
                  issue_url: 'https://api.github.com/repos/owner/repo/issues/99',
                },
              ],
            }),
            stderr: '',
          };
        }
        return {
          stdout: JSON.stringify({
            comments: [
              {
                id: 502,
                body: 'Can we simplify this API?',
                user: { login: 'alice' },
                author_association: 'COLLABORATOR',
                pull_request_url: 'https://api.github.com/repos/owner/repo/pulls/77',
              },
            ],
          }),
          stderr: '',
        };
      },
      now: () => new Date('2026-03-14T12:00:00.000Z'),
    };

    const result = await runTriageMonitorCycle(state, 'orchestrator-20260314-120000', 'owner/repo', deps);

    assert.equal(result.processed_issues, 2);
    assert.equal(result.triaged_entries, 2);
    assert.equal(state.issues[0].processed_comment_ids?.length, 2);
    assert.ok(state.issues[0].processed_comment_ids?.includes(501));
    assert.ok(state.issues[0].processed_comment_ids?.includes(502));
    assert.equal(state.issues[1].processed_comment_ids?.length, 0);
    assert.equal(state.issues[0].last_comment_check, '2026-03-14T12:00:00.000Z');
    assert.equal(state.issues[1].last_comment_check, '2026-03-14T12:00:00.000Z');
    assert.equal(state.updated_at, '2026-03-14T12:00:00.000Z');
    assert.equal(ghCalls.length, 5);
    assert.ok(ghCalls.some((call) => JSON.stringify(call) === JSON.stringify(
      ['issue-comments', '--session', 'orchestrator-20260314-120000', '--since', '2026-03-14T11:00:00.000Z', '--role', 'orchestrator'],
    )));
    assert.ok(ghCalls.some((call) => JSON.stringify(call) === JSON.stringify(
      ['issue-comments', '--session', 'orchestrator-20260314-120000', '--since', '2026-03-14T10:00:00.000Z', '--role', 'orchestrator'],
    )));
  });

  it('returns no-op result when gh executor is not provided', async () => {
    const state = makeState({
      issues: [makeIssue({ number: 42, triage_log: [], processed_comment_ids: [] })],
    });

    const result = await runTriageMonitorCycle(
      state,
      'orchestrator-20260314-120000',
      'owner/repo',
      { now: () => new Date('2026-03-14T12:00:00.000Z') },
    );

    assert.deepStrictEqual(result, { processed_issues: 0, triaged_entries: 0 });
    assert.equal(state.issues[0].last_comment_check, undefined);
  });
});

// --- Dispatch engine tests ---

function makeIssue(overrides: Partial<OrchestratorIssue> = {}): OrchestratorIssue {
  return {
    number: 1,
    title: 'Test issue',
    body: '## Acceptance Criteria\n- [ ] Scenario is testable\n\n## Approach\nImplementation details are documented for dispatch readiness.',
    sandbox: 'container',
    requires: [],
    wave: 1,
    state: 'pending',
    child_session: null,
    pr_number: null,
    depends_on: [],
    dor_validated: true,
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

  it('excludes issues that fail Definition of Ready validation', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({
          number: 1,
          wave: 1,
          state: 'pending',
          dor_validated: false,
          body: 'Approach only, missing testable acceptance criteria.',
        }),
        makeIssue({
          number: 2,
          wave: 1,
          state: 'pending',
        }),
      ],
    });
    assert.equal(validateDoR(state.issues[0]).passed, false);
    const result = getDispatchableIssues(state);
    assert.deepStrictEqual(result.map((i) => i.number), [2]);
  });

  it('excludes issues that have not passed DoR validation', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending', dor_validated: false }),
        makeIssue({ number: 2, wave: 1, state: 'pending', dor_validated: true }),
      ],
    });
    const result = getDispatchableIssues(state);
    assert.deepStrictEqual(result.map((i) => i.number), [2]);
  });
});

describe('hasFileOwnershipConflict', () => {
  it('returns false when candidate has no file hints', () => {
    const candidate = makeIssue({ number: 1 });
    const active = [makeIssue({ number: 2, state: 'in_progress', file_hints: ['src/a.ts'] })];
    assert.equal(hasFileOwnershipConflict(candidate, active), false);
  });

  it('returns false when no active issues have file hints', () => {
    const candidate = makeIssue({ number: 1, file_hints: ['src/a.ts'] });
    const active = [makeIssue({ number: 2, state: 'in_progress' })];
    assert.equal(hasFileOwnershipConflict(candidate, active), false);
  });

  it('returns true when file hints overlap', () => {
    const candidate = makeIssue({ number: 1, file_hints: ['src/a.ts', 'src/b.ts'] });
    const active = [makeIssue({ number: 2, state: 'in_progress', file_hints: ['src/b.ts', 'src/c.ts'] })];
    assert.equal(hasFileOwnershipConflict(candidate, active), true);
  });

  it('returns false when file hints do not overlap', () => {
    const candidate = makeIssue({ number: 1, file_hints: ['src/a.ts'] });
    const active = [makeIssue({ number: 2, state: 'in_progress', file_hints: ['src/b.ts'] })];
    assert.equal(hasFileOwnershipConflict(candidate, active), false);
  });
});

describe('filterByFileOwnership', () => {
  it('excludes issues with overlapping file hints against in_progress issues', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'in_progress', file_hints: ['src/a.ts'] }),
        makeIssue({ number: 2, wave: 1, state: 'pending', file_hints: ['src/a.ts'] }),
        makeIssue({ number: 3, wave: 1, state: 'pending', file_hints: ['src/b.ts'] }),
      ],
    });
    const candidates = [state.issues[1], state.issues[2]];
    const result = filterByFileOwnership(candidates, state);
    assert.deepStrictEqual(result.map((i) => i.number), [3]);
  });

  it('excludes issues with overlapping file hints against earlier batch selections', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending', file_hints: ['src/shared.ts'] }),
        makeIssue({ number: 2, wave: 1, state: 'pending', file_hints: ['src/shared.ts'] }),
        makeIssue({ number: 3, wave: 1, state: 'pending', file_hints: ['src/other.ts'] }),
      ],
    });
    const candidates = state.issues;
    const result = filterByFileOwnership(candidates, state);
    // Issue 1 selected first, issue 2 conflicts with it, issue 3 is fine
    assert.deepStrictEqual(result.map((i) => i.number), [1, 3]);
  });

  it('passes all candidates through when no file hints exist', () => {
    const state = makeState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending' }),
        makeIssue({ number: 2, wave: 1, state: 'pending' }),
      ],
    });
    const result = filterByFileOwnership(state.issues, state);
    assert.equal(result.length, 2);
  });
});

describe('filterByHostCapabilities', () => {
  it('keeps issues when all requires labels are satisfied', () => {
    const candidates = [
      makeIssue({ number: 1, requires: ['linux'] }),
      makeIssue({ number: 2, requires: ['network-access'] }),
      makeIssue({ number: 3, requires: [] }),
    ];
    const result = filterByHostCapabilities(candidates, {
      platform: 'linux',
      spawnSync: () => ({ status: 1, stdout: '', stderr: '' }),
      env: {},
    });

    assert.deepStrictEqual(result.eligible.map((i) => i.number), [1, 2, 3]);
    assert.equal(result.blocked.length, 0);
  });

  it('blocks issues with missing host capabilities', () => {
    const candidates = [
      makeIssue({ number: 1, requires: ['windows'] }),
      makeIssue({ number: 2, requires: ['gpu'] }),
      makeIssue({ number: 3, requires: ['linux'] }),
    ];
    const result = filterByHostCapabilities(candidates, {
      platform: 'linux',
      spawnSync: () => ({ status: 1, stdout: '', stderr: '' }),
      env: {},
    });

    assert.deepStrictEqual(result.eligible.map((i) => i.number), [3]);
    assert.deepStrictEqual(result.blocked.map((b) => b.issue.number), [1, 2]);
    assert.deepStrictEqual(result.blocked[0].missing, ['windows']);
    assert.deepStrictEqual(result.blocked[1].missing, ['gpu']);
  });
});

describe('validateDoR', () => {
  it('passes when acceptance criteria, approach, and content are present', () => {
    const issue = makeIssue({
      title: 'Add login form',
      body: '## Approach\n\nUse react-hook-form with zod validation.\n\n## Acceptance Criteria\n- [ ] Form renders with email and password fields\n- [ ] Validation errors display inline\n\nImplementation details: Set up form state management and integrate with the auth API endpoint.',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, true);
    assert.deepStrictEqual(result.gaps, []);
  });

  it('fails when acceptance criteria are missing', () => {
    const issue = makeIssue({
      title: 'Add login form',
      body: '## Approach\n\nUse react-hook-form with zod validation. Implement form state management and integrate with the auth API endpoint for authentication flow.',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, false);
    assert.ok(result.gaps.some((g) => g.includes('acceptance criteria')));
  });

  it('fails when spec-question blocker is referenced', () => {
    const issue = makeIssue({
      title: 'Add login form',
      body: '## Approach\n\nUse react-hook-form. Blocked by aloop/spec-question regarding auth method.\n\n## Acceptance Criteria\n- [ ] Form renders with email field',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, false);
    assert.ok(result.gaps.some((g) => g.includes('spec-question')));
  });

  it('fails when planner approach is missing', () => {
    const issue = makeIssue({
      title: 'Add login form',
      body: '## Acceptance Criteria\n- [ ] Form renders with email field',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, false);
    assert.ok(result.gaps.some((g) => g.includes('planner approach')));
  });

  it('detects acceptance criteria via checkbox patterns', () => {
    const issue = makeIssue({
      title: 'Fix bug',
      body: 'Fix the null pointer exception.\n\nAcceptance Criteria:\n- [ ] Crash is prevented for null input.\n\nImplementation approach: add a null check before dereferencing the input parameter.',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, true);
  });

  it('fails with multiple gaps when criteria are broadly missing', () => {
    const issue = makeIssue({
      title: 'Todo',
      body: 'Something',
    });
    const result = validateDoR(issue);
    assert.equal(result.passed, false);
    assert.ok(result.gaps.length >= 2);
  });
});

describe('applyEstimateResults', () => {
  it('sets dor_validated and transitions status to Ready when DoR passes', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false }),
        makeIssue({ number: 2, wave: 1, status: 'Needs refinement', dor_validated: false }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: true, complexity_tier: 'M', iteration_estimate: 5, confidence: 'high' },
      { issue_number: 2, dor_passed: true, complexity_tier: 'S', iteration_estimate: 2, confidence: 'high' },
    ];
    const outcome = await applyEstimateResults(state, results);
    assert.deepStrictEqual(outcome.updated, [1, 2]);
    assert.deepStrictEqual(outcome.blocked, []);
    assert.equal(state.issues[0].dor_validated, true);
    assert.equal(state.issues[0].status, 'Ready');
    assert.equal(state.issues[1].dor_validated, true);
    assert.equal(state.issues[1].status, 'Ready');
  });

  it('keeps status at Needs refinement when DoR fails', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Missing acceptance criteria', 'No approach defined'] },
    ];
    const outcome = await applyEstimateResults(state, results);
    assert.deepStrictEqual(outcome.updated, []);
    assert.deepStrictEqual(outcome.blocked, [1]);
    assert.equal(state.issues[0].dor_validated, false);
    assert.equal(state.issues[0].status, 'Needs refinement');
  });

  it('skips results for unknown issue numbers', async () => {
    const state = makeState({
      issues: [makeIssue({ number: 1, wave: 1 })],
    });
    const results: EstimateResult[] = [
      { issue_number: 999, dor_passed: true },
    ];
    const outcome = await applyEstimateResults(state, results);
    assert.deepStrictEqual(outcome.updated, []);
    assert.deepStrictEqual(outcome.blocked, []);
  });

  it('creates spec-question issues for DoR gaps when execGhIssueCreate is provided', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 5, wave: 1, status: 'Needs refinement', dor_validated: false }),
      ],
    });
    const createdIssues: Array<{ title: string; body: string; labels: string[] }> = [];
    const mockExecGhIssueCreate = async (_repo: string, _sid: string, title: string, body: string, labels: string[]) => {
      createdIssues.push({ title, body, labels });
      return 100 + createdIssues.length;
    };
    const results: EstimateResult[] = [
      { issue_number: 5, dor_passed: false, gaps: ['Missing acceptance criteria'] },
    ];
    await applyEstimateResults(state, results, {
      execGhIssueCreate: mockExecGhIssueCreate,
      repo: 'owner/repo',
      sessionId: 'orch-1',
    });
    assert.equal(createdIssues.length, 1);
    assert.match(createdIssues[0].title, /spec-question.*#5.*Missing acceptance criteria/);
    assert.deepStrictEqual(createdIssues[0].labels, ['aloop/spec-question']);
  });

  it('handles mixed pass/fail results', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false }),
        makeIssue({ number: 2, wave: 1, status: 'Needs refinement', dor_validated: false }),
        makeIssue({ number: 3, wave: 1, status: 'Needs refinement', dor_validated: false }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: true },
      { issue_number: 2, dor_passed: false, gaps: ['No approach'] },
      { issue_number: 3, dor_passed: true },
    ];
    const outcome = await applyEstimateResults(state, results);
    assert.deepStrictEqual(outcome.updated, [1, 3]);
    assert.deepStrictEqual(outcome.blocked, [2]);
    assert.equal(state.issues[0].status, 'Ready');
    assert.equal(state.issues[1].status, 'Needs refinement');
    assert.equal(state.issues[2].status, 'Ready');
  });

  it('does not transition status when issue is not in Needs refinement', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'In progress', dor_validated: false }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: true },
    ];
    await applyEstimateResults(state, results);
    assert.equal(state.issues[0].dor_validated, true);
    assert.equal(state.issues[0].status, 'In progress');
  });

  it('increments refinement_count on DoR failure', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 2 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Missing criteria'] },
    ];
    await applyEstimateResults(state, results);
    assert.equal(state.issues[0].refinement_count, 3);
    assert.equal(state.issues[0].status, 'Needs refinement');
  });

  it('initializes refinement_count from 0 on first failure', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['No approach'] },
    ];
    await applyEstimateResults(state, results);
    assert.equal(state.issues[0].refinement_count, 1);
  });

  it('auto-resolves when refinement budget exceeded in autonomous mode', async () => {
    const logs: Record<string, unknown>[] = [];
    const state = makeState({
      autonomy_level: 'autonomous',
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 4 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Minor gap'] },
    ];
    const outcome = await applyEstimateResults(state, results, {
      appendLog: (_dir, entry) => logs.push(entry),
      sessionDir: '/sessions/orch-1',
      now: () => new Date('2026-03-14T12:00:00Z'),
    });
    assert.equal(state.issues[0].refinement_count, 5);
    assert.equal(state.issues[0].refinement_budget_exceeded, true);
    assert.equal(state.issues[0].status, 'Ready');
    assert.equal(state.issues[0].dor_validated, true);
    assert.deepStrictEqual(outcome.budgetExceeded, [1]);
    assert.deepStrictEqual(outcome.updated, [1]);
    assert.ok(logs.some((l) => l.event === 'refinement_budget_auto_resolved'));
  });

  it('blocks when refinement budget exceeded in cautious mode', async () => {
    const logs: Record<string, unknown>[] = [];
    const state = makeState({
      autonomy_level: 'cautious',
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 4 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Missing criteria'] },
    ];
    const outcome = await applyEstimateResults(state, results, {
      appendLog: (_dir, entry) => logs.push(entry),
      sessionDir: '/sessions/orch-1',
      now: () => new Date('2026-03-14T12:00:00Z'),
    });
    assert.equal(state.issues[0].refinement_count, 5);
    assert.equal(state.issues[0].refinement_budget_exceeded, true);
    assert.equal(state.issues[0].status, 'Blocked');
    assert.equal(state.issues[0].dor_validated, false);
    assert.deepStrictEqual(outcome.budgetExceeded, [1]);
    assert.deepStrictEqual(outcome.blocked, [1]);
    assert.ok(logs.some((l) => l.event === 'refinement_budget_exceeded'));
  });

  it('auto-resolves low-risk gaps in balanced mode at budget cap', async () => {
    const state = makeState({
      autonomy_level: 'balanced',
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 4 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Minor wording issue'] },
    ];
    const outcome = await applyEstimateResults(state, results, {
      appendLog: () => {},
      sessionDir: '/sessions/orch-1',
      now: () => new Date('2026-03-14T12:00:00Z'),
    });
    assert.equal(state.issues[0].status, 'Ready');
    assert.equal(state.issues[0].dor_validated, true);
    assert.deepStrictEqual(outcome.updated, [1]);
  });

  it('blocks high-risk gaps in balanced mode at budget cap', async () => {
    const state = makeState({
      autonomy_level: 'balanced',
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 4 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Security vulnerability in auth flow'] },
    ];
    const outcome = await applyEstimateResults(state, results, {
      appendLog: () => {},
      sessionDir: '/sessions/orch-1',
      now: () => new Date('2026-03-14T12:00:00Z'),
    });
    assert.equal(state.issues[0].status, 'Blocked');
    assert.deepStrictEqual(outcome.blocked, [1]);
  });

  it('does not apply budget cap when refinement_count is below threshold', async () => {
    const state = makeState({
      autonomy_level: 'cautious',
      issues: [
        makeIssue({ number: 1, wave: 1, status: 'Needs refinement', dor_validated: false, refinement_count: 3 }),
      ],
    });
    const results: EstimateResult[] = [
      { issue_number: 1, dor_passed: false, gaps: ['Missing criteria'] },
    ];
    const outcome = await applyEstimateResults(state, results);
    assert.equal(state.issues[0].refinement_count, 4);
    assert.equal(state.issues[0].refinement_budget_exceeded, undefined);
    assert.equal(state.issues[0].status, 'Needs refinement');
    assert.deepStrictEqual(outcome.budgetExceeded, []);
  });
});

describe('classifyGapRisk', () => {
  it('returns low for empty gaps', () => {
    assert.equal(classifyGapRisk([]), 'low');
    assert.equal(classifyGapRisk(undefined), 'low');
  });

  it('returns high for security-related gaps', () => {
    assert.equal(classifyGapRisk(['Security issue in authentication']), 'high');
  });

  it('returns high for data loss gaps', () => {
    assert.equal(classifyGapRisk(['Risk of data loss during migration']), 'high');
  });

  it('returns medium for many gaps', () => {
    assert.equal(classifyGapRisk(['Gap 1', 'Gap 2', 'Gap 3', 'Gap 4']), 'medium');
  });

  it('returns low for few non-critical gaps', () => {
    assert.equal(classifyGapRisk(['Minor wording issue']), 'low');
  });
});

describe('resolveRefinementBudgetAction', () => {
  it('always auto-resolves in autonomous mode', () => {
    assert.equal(resolveRefinementBudgetAction('autonomous', 'low'), true);
    assert.equal(resolveRefinementBudgetAction('autonomous', 'medium'), true);
    assert.equal(resolveRefinementBudgetAction('autonomous', 'high'), true);
  });

  it('auto-resolves only low-risk in balanced mode', () => {
    assert.equal(resolveRefinementBudgetAction('balanced', 'low'), true);
    assert.equal(resolveRefinementBudgetAction('balanced', 'medium'), false);
    assert.equal(resolveRefinementBudgetAction('balanced', 'high'), false);
  });

  it('never auto-resolves in cautious mode', () => {
    assert.equal(resolveRefinementBudgetAction('cautious', 'low'), false);
    assert.equal(resolveRefinementBudgetAction('cautious', 'medium'), false);
    assert.equal(resolveRefinementBudgetAction('cautious', 'high'), false);
  });
});

describe('queueEstimateForIssues', () => {
  it('writes queue override files for unvalidated refinement issues', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({ number: 1, status: 'Needs refinement', dor_validated: false }),
      makeIssue({ number: 2, status: 'Ready', dor_validated: true }),
      makeIssue({ number: 3, status: 'Needs refinement', dor_validated: false }),
    ];
    const count = await queueEstimateForIssues(issues, '/queue', '# Estimate prompt', mockDeps);
    assert.equal(count, 2);
    assert.ok(writtenFiles['/queue/estimate-issue-1.md']);
    assert.ok(writtenFiles['/queue/estimate-issue-3.md']);
    assert.ok(!writtenFiles['/queue/estimate-issue-2.md']);
  });

  it('returns 0 when no issues need estimation', async () => {
    const mockDeps = {
      writeFile: async () => {},
    };
    const issues = [
      makeIssue({ number: 1, status: 'Ready', dor_validated: true }),
    ];
    const count = await queueEstimateForIssues(issues, '/queue', '# Estimate prompt', mockDeps);
    assert.equal(count, 0);
  });

  it('includes issue context in the queue override content', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({
        number: 42,
        title: 'Add auth flow',
        body: '## Approach\nUse OAuth2.\n## Acceptance Criteria\n- [ ] Login works',
        status: 'Needs refinement',
        dor_validated: false,
        wave: 2,
        depends_on: [10, 11],
      }),
    ];
    const count = await queueEstimateForIssues(issues, '/queue', '# Estimation Agent', mockDeps);
    assert.equal(count, 1);
    const content = writtenFiles['/queue/estimate-issue-42.md'];
    assert.match(content, /Issue #42: Add auth flow/);
    assert.match(content, /OAuth2/);
    assert.match(content, /Wave.*2/);
    assert.match(content, /#10.*#11/);
    assert.match(content, /orch_estimate/);
    assert.match(content, /# Estimation Agent/);
  });

  it('includes frontmatter with agent and issue_number', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({ number: 7, status: 'Needs refinement', dor_validated: false }),
    ];
    await queueEstimateForIssues(issues, '/queue', '# Prompt', mockDeps);
    const content = writtenFiles['/queue/estimate-issue-7.md'];
    assert.match(content, /^---/);
    assert.match(content, /"agent": "orch_estimate"/);
    assert.match(content, /"issue_number": 7/);
  });

  it('skips issues that have exceeded refinement budget', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({ number: 1, status: 'Needs refinement', dor_validated: false, refinement_budget_exceeded: true }),
      makeIssue({ number: 2, status: 'Needs refinement', dor_validated: false }),
    ];
    const count = await queueEstimateForIssues(issues, '/queue', '# Prompt', mockDeps);
    assert.equal(count, 1);
    assert.ok(!writtenFiles['/queue/estimate-issue-1.md']);
    assert.ok(writtenFiles['/queue/estimate-issue-2.md']);
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

  it('seeds SPEC.md from issue body in worktree', async () => {
    const issueWithBody = makeIssue({ number: 42, title: 'Add feature X', body: '## Requirements\n\n- Support login\n- Handle errors' });
    const deps = createMockDispatchDeps();
    await launchChildLoop(issueWithBody, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const specFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('/worktree/SPEC.md'));
    assert.ok(specFile, 'SPEC.md should be written to child worktree');
    assert.ok(deps._writtenFiles[specFile].includes('Issue #42'));
    assert.ok(deps._writtenFiles[specFile].includes('Support login'));
  });

  it('does not seed SPEC.md when issue has no body', async () => {
    const issueNoBody = makeIssue({ number: 42, title: 'Add feature X', body: undefined });
    const deps = createMockDispatchDeps();
    await launchChildLoop(issueNoBody, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const specFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('/worktree/SPEC.md'));
    assert.equal(specFile, undefined, 'SPEC.md should not be written when issue body is empty');
  });

  it('compiles loop-plan.json for child session', async () => {
    const deps = createMockDispatchDeps();
    await launchChildLoop(issue, '/sessions/orch-1', '/project', 'myapp', '/project/.aloop/prompts', '/home/.aloop', deps);
    const planFile = Object.keys(deps._writtenFiles).find((p) => p.endsWith('loop-plan.json'));
    assert.ok(planFile, 'loop-plan.json should be written for child session');
    const plan = JSON.parse(deps._writtenFiles[planFile]);
    assert.ok(Array.isArray(plan.cycle), 'loop-plan.json should have a cycle array');
    assert.equal(plan.cyclePosition, 0);
    assert.equal(plan.iteration, 1);
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

  it('skips issues with file ownership conflicts against in-progress issues', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'in_progress', file_hints: ['src/shared.ts'] }),
      makeIssue({ number: 2, wave: 1, state: 'pending', file_hints: ['src/shared.ts'] }),
      makeIssue({ number: 3, wave: 1, state: 'pending', file_hints: ['src/other.ts'] }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 1);
    assert.equal(result.launched[0].issue_number, 3);
    assert.ok(result.skipped.includes(2));
  });

  it('skips issues with file ownership conflicts within same dispatch batch', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'pending', file_hints: ['src/shared.ts'] }),
      makeIssue({ number: 2, wave: 1, state: 'pending', file_hints: ['src/shared.ts'] }),
      makeIssue({ number: 3, wave: 1, state: 'pending', file_hints: ['src/other.ts'] }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 2);
    assert.equal(result.launched[0].issue_number, 1);
    assert.equal(result.launched[1].issue_number, 3);
    assert.ok(result.skipped.includes(2));
  });

  it('skips issues with unsatisfied host requirements', async () => {
    const issues = [
      makeIssue({ number: 1, wave: 1, state: 'pending', requires: ['windows'] }),
      makeIssue({ number: 2, wave: 1, state: 'pending', requires: ['linux'] }),
    ];
    const state = stateWithIssues(issues);
    const deps = createMockDispatchDeps({
      platform: 'linux',
      readFile: async () => JSON.stringify(state),
    });

    const result = await dispatchChildLoops('/state.json', '/sessions/orch-1', '/project', 'myapp', '/prompts', '/home/.aloop', deps);
    assert.equal(result.launched.length, 1);
    assert.equal(result.launched[0].issue_number, 2);
    assert.ok(result.skipped.includes(1));
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

  it('returns pending when workflows exist but checks are not yet reported', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args[0] === 'api' && args[1]?.includes('/actions/workflows')) {
          return { stdout: '2', stderr: '' };
        }
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.all_passed, false);
    assert.equal(result.gates[1].status, 'pending');
    assert.match(result.gates[1].detail, /no check runs/i);
  });

  it('fails CI gate when workflows exist and check query errors', async () => {
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args[0] === 'api' && args[1]?.includes('/actions/workflows')) {
          return { stdout: '1', stderr: '' };
        }
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          throw new Error('checks api unavailable');
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await checkPrGates(100, 'owner/repo', deps);
    assert.equal(result.all_passed, false);
    assert.equal(result.gates[1].status, 'fail');
    assert.match(result.gates[1].detail, /failed to query ci checks/i);
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
    assert.equal(state.issues[0].status, 'Done');
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
    assert.ok(result.detail.includes('attempt 1'));
    assert.equal(state.issues[0].rebase_attempts, 1);
    assert.ok((state.issues[0] as any).needs_redispatch === true);
    assert.ok((state.issues[0] as any).needs_rebase === true);
    assert.ok(deps.logs.some((l) => l.event === 'pr_rebase_dispatched'));
  });

  it('still dispatches rebase agent after multiple attempts', async () => {
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
    assert.equal(result.action, 'rebase_requested');
    assert.equal(state.issues[0].rebase_attempts, 3);
    assert.ok((state.issues[0] as any).needs_redispatch === true);
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

  it('stores individual review comments with IDs for builder redispatch', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const ghCalls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => {
        ghCalls.push(args);
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) {
          return { stdout: 'diff', stderr: '' };
        }
        if (args[0] === 'api' && args[1] === 'repos/owner/repo/pulls/100/reviews') {
          return { stdout: JSON.stringify({ id: 777 }), stderr: '' };
        }
        if (args[0] === 'api' && args[1] === 'repos/owner/repo/pulls/100/comments?per_page=100') {
          return {
            stdout: JSON.stringify([
              {
                id: 9001,
                pull_request_review_id: 777,
                path: 'src/example.ts',
                line: 42,
                body: 'Use a guard clause',
              },
            ]),
            stderr: '',
          };
        }
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'request-changes' as const,
        summary: 'Please fix inline comments',
        comments: [
          {
            path: 'src/example.ts',
            line: 42,
            body: 'Use a guard clause',
          },
        ],
      }),
    });

    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);

    assert.equal(result.action, 'rejected');
    assert.equal(state.issues[0].needs_redispatch, true);
    assert.equal(state.issues[0].review_feedback, 'Please fix inline comments');
    assert.deepStrictEqual(state.issues[0].pending_review_comments, [
      {
        id: 9001,
        path: 'src/example.ts',
        line: 42,
        body: 'Use a guard clause',
      },
    ]);
    const reviewCreateCall = ghCalls.find((call) => call[0] === 'api' && call[1] === 'repos/owner/repo/pulls/100/reviews');
    assert.ok(reviewCreateCall, 'Should create a formal PR review');
    assert.ok(reviewCreateCall?.includes('--method') && reviewCreateCall?.includes('POST'));
    assert.ok(reviewCreateCall?.includes('-f') && reviewCreateCall?.includes('event=REQUEST_CHANGES'));
    const legacyPrCommentCall = ghCalls.find((call) => call[0] === 'pr' && call[1] === 'comment');
    assert.equal(legacyPrCommentCall, undefined, 'Should not use gh pr comment for review feedback');
  });

  it('uses injected adapter when posting request-changes review', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const createdReviews: Array<{ prNumber: number; opts: { body: string; event: string; comments: unknown[] } }> = [];
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
        if (args[0] === 'api' && args[1] === 'repos/owner/repo/pulls/100/comments?per_page=100') {
          return { stdout: JSON.stringify([]), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'request-changes' as const,
        summary: 'Address inline feedback',
        comments: [
          { path: 'src/example.ts', line: 5, body: 'Use explicit type' },
        ],
      }),
      adapter: {
        createReview: async (prNum, opts) => {
          createdReviews.push({ prNumber: prNum, opts: { ...opts } });
          return { review_id: 123 };
        },
      },
    });

    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);

    assert.equal(result.action, 'rejected');
    assert.equal(createdReviews.length, 1);
    assert.equal(createdReviews[0].prNumber, 100);
    assert.equal(createdReviews[0].opts.event, 'REQUEST_CHANGES');
    assert.match(createdReviews[0].opts.body, /Address inline feedback/);
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

  it('returns review_pending when agent review returns pending verdict', async () => {
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
        verdict: 'pending' as const,
        summary: 'Review queued',
      }),
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'review_pending');
    assert.equal(result.review?.verdict, 'pending');
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

  it('closes PR and resets issue when same CI failure persists across attempts', async () => {
    const state = makeOrchestratorState([
      {
        number: 42,
        pr_number: 100,
        state: 'pr_open',
        ci_failure_signature: 'failed checks: build',
        ci_failure_retries: 2,
      },
    ]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args[0] === 'api' && args[1]?.includes('/actions/workflows')) {
          return { stdout: '1', stderr: '' };
        }
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('statusCheckRollup')) {
          return { stdout: JSON.stringify({ statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: 'FAILURE' }] }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'closed_for_retry');
    assert.equal(state.issues[0].state, 'pending');
    assert.equal(state.issues[0].status, 'Ready');
    assert.equal(state.issues[0].ci_failure_retries, 0);
    assert.ok(deps.logs.some((l) => l.event === 'pr_closed_ci_failure'));
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

  it('increments redispatch_failures when review requests changes', async () => {
    const state = makeOrchestratorState([{ number: 42, pr_number: 100, state: 'pr_open' }]);
    const deps = createMockPrDeps({
      execGh: async (args) => {
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) return { stdout: 'diff', stderr: '' };
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'request-changes' as const,
        summary: 'Needs more tests',
      }),
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'rejected');
    assert.equal(state.issues[0].redispatch_failures, 1);
    assert.equal((state.issues[0] as any).needs_redispatch, true);
    assert.equal(state.issues[0].redispatch_paused, undefined);
  });

  it('escalates with comment and aloop/needs-human label after 3 failed redispatches', async () => {
    const state = makeOrchestratorState([{
      number: 42, pr_number: 100, state: 'pr_open', redispatch_failures: 2,
    }]);
    const ghCalls: string[][] = [];
    const deps = createMockPrDeps({
      execGh: async (args) => {
        ghCalls.push(args);
        if (args.includes('mergeable,mergeStateStatus')) {
          return { stdout: JSON.stringify({ mergeable: 'MERGEABLE' }), stderr: '' };
        }
        if (args.includes('checks')) {
          return { stdout: JSON.stringify([{ name: 'ci', state: 'COMPLETED', conclusion: 'SUCCESS' }]), stderr: '' };
        }
        if (args.includes('diff')) return { stdout: 'diff', stderr: '' };
        return { stdout: '', stderr: '' };
      },
      invokeAgentReview: async (prNum) => ({
        pr_number: prNum,
        verdict: 'request-changes' as const,
        summary: 'Still missing tests',
      }),
    });
    const result = await processPrLifecycle(state.issues[0], state, '/state.json', '/session', 'owner/repo', deps);
    assert.equal(result.action, 'rejected');
    assert.equal(state.issues[0].redispatch_failures, 3);
    assert.equal(state.issues[0].redispatch_paused, true);
    assert.equal((state.issues[0] as any).needs_redispatch, undefined);
    // Should have posted a comment on the issue
    const issueComment = ghCalls.find((c) => c.includes('issue') && c.includes('comment') && c.includes('42'));
    assert.ok(issueComment, 'Should post comment on issue');
    // Should have added aloop/needs-human label
    const labelCall = ghCalls.find((c) => c.includes('edit') && c.includes('aloop/needs-human'));
    assert.ok(labelCall, 'Should add aloop/needs-human label');
    // Should log redispatch_escalated event
    assert.ok(deps.logs.some((l) => l.event === 'redispatch_escalated'));
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

  it('accumulates real cost_usd and token data from iteration events', async () => {
    const logLines = [
      JSON.stringify({ event: 'iteration_complete', provider: 'opencode', tokens_input: 15200, tokens_output: 3400, tokens_cache_read: 48000, cost_usd: 0.0034 }),
      JSON.stringify({ event: 'iteration_complete', provider: 'opencode', tokens_input: 8000, tokens_output: 2000, tokens_cache_read: 0, cost_usd: 0.0018 }),
    ].join('\n');

    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 2);
    assert.equal(result.tokens_input, 23200);
    assert.equal(result.tokens_output, 5400);
    assert.equal(result.tokens_cache_read, 48000);
    assert.strictEqual(result.real_cost_usd! > 0.005, true);
    // estimated_cost_usd uses real cost (no fallback iterations)
    assert.strictEqual(result.estimated_cost_usd, result.real_cost_usd);
  });

  it('mixes real cost with estimated cost for iterations without usage data', async () => {
    const logLines = [
      JSON.stringify({ event: 'iteration_complete', provider: 'opencode', tokens_input: 10000, tokens_output: 2000, tokens_cache_read: 5000, cost_usd: 0.005 }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude' }), // no usage data
    ].join('\n');

    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.iterations, 2);
    assert.equal(result.tokens_input, 10000);
    assert.equal(result.tokens_output, 2000);
    assert.strictEqual(result.real_cost_usd, 0.005);
    // estimated = real cost + 1 iteration * $0.50 default
    assert.strictEqual(result.estimated_cost_usd, 0.505);
  });

  it('handles cost_usd as string (from bash write_log_entry)', async () => {
    const logLines = JSON.stringify({ event: 'iteration_complete', provider: 'opencode', tokens_input: '5000', tokens_output: '1000', tokens_cache_read: '0', cost_usd: '0.002' });
    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.tokens_input, 5000);
    assert.equal(result.tokens_output, 1000);
    assert.strictEqual(result.real_cost_usd, 0.002);
  });

  it('omits usage fields when no iteration has cost data', async () => {
    const logLines = JSON.stringify({ event: 'iteration_complete', provider: 'claude' });
    const deps = createMockBudgetDeps({ '/sessions/child-1/log.jsonl': logLines });
    const result = await parseChildSessionCost('/sessions/child-1', 'child-1', 42, deps);
    assert.equal(result.tokens_input, undefined);
    assert.equal(result.tokens_output, undefined);
    assert.equal(result.tokens_cache_read, undefined);
    assert.equal(result.real_cost_usd, undefined);
    assert.equal(result.estimated_cost_usd, 0.5);
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

  it('includes token usage section when real cost data is available', () => {
    const budget: BudgetSummary = {
      budget_cap: 10.0, total_estimated_cost_usd: 0.0052,
      children: [
        { session_id: 'c1', issue_number: 1, iterations: 2, providers: { opencode: 2 }, estimated_cost_usd: 0.0052, tokens_input: 23200, tokens_output: 5400, tokens_cache_read: 48000, real_cost_usd: 0.0052 },
      ],
      budget_exceeded: false, budget_approaching: false,
    };

    const report = generateFinalReport(
      makeOrchestratorState([{ number: 1, wave: 1, state: 'merged' }]),
      '/sessions/orch-1',
      budget,
      new Date('2026-03-09T11:30:00Z'),
    );

    const text = formatFinalReportText(report);
    assert.ok(text.includes('--- Token Usage (from providers with usage data) ---'));
    assert.ok(text.includes('Input:'));
    assert.ok(text.includes('Output:'));
    assert.ok(text.includes('Cache read:'));
    assert.ok(text.includes('Real cost:'));
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

describe('createGapAnalysisRequests', () => {
  it('writes product and architecture analyst request files for Needs analysis issues', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
      now: () => new Date('2026-03-15T12:00:00Z'),
    };
    const issues = [
      makeIssue({ number: 1, status: 'Needs analysis', title: 'Auth epic', body: 'Implement auth' }),
      makeIssue({ number: 2, status: 'Ready' }),
      makeIssue({ number: 3, status: 'Needs analysis', title: 'CMS epic', body: 'Implement CMS' }),
    ];
    const result = await createGapAnalysisRequests(issues, '/requests', mockDeps);
    assert.deepStrictEqual(result, { product: true, architecture: true });
    assert.ok(writtenFiles['/requests/product-analyst-review.json']);
    assert.ok(writtenFiles['/requests/architecture-analyst-review.json']);

    const productReq = JSON.parse(writtenFiles['/requests/product-analyst-review.json']);
    assert.equal(productReq.type, 'product_analyst_review');
    assert.equal(productReq.prompt_template, 'PROMPT_orch_product_analyst.md');
    assert.equal(productReq.targets.length, 2);
    assert.equal(productReq.targets[0].issue_number, 1);
    assert.equal(productReq.targets[1].issue_number, 3);

    const archReq = JSON.parse(writtenFiles['/requests/architecture-analyst-review.json']);
    assert.equal(archReq.type, 'architecture_analyst_review');
    assert.equal(archReq.prompt_template, 'PROMPT_orch_arch_analyst.md');
    assert.equal(archReq.targets.length, 2);
  });

  it('returns false flags when no issues need analysis', async () => {
    const mockDeps = {
      writeFile: async () => {},
      now: () => new Date('2026-03-15T12:00:00Z'),
    };
    const issues = [
      makeIssue({ number: 1, status: 'Ready' }),
    ];
    const result = await createGapAnalysisRequests(issues, '/requests', mockDeps);
    assert.deepStrictEqual(result, { product: false, architecture: false });
  });
});

describe('queueGapAnalysisForIssues', () => {
  it('queues product and architecture analyst prompts for Needs analysis issues', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({ number: 10, status: 'Needs analysis', title: 'Auth', body: 'Implement auth', wave: 1 }),
      makeIssue({ number: 20, status: 'Ready' }),
    ];
    const count = await queueGapAnalysisForIssues(
      issues, '/queue', '# Product Prompt', '# Arch Prompt', '# Spec content here', mockDeps,
    );
    assert.equal(count, 1);
    assert.ok(writtenFiles['/queue/gap-analysis-product.md']);
    assert.ok(writtenFiles['/queue/gap-analysis-architecture.md']);

    const productContent = writtenFiles['/queue/gap-analysis-product.md'];
    assert.match(productContent, /orch_product_analyst/);
    assert.match(productContent, /# Product Prompt/);
    assert.match(productContent, /# Spec content here/);
    assert.match(productContent, /Issue #10: Auth/);
    assert.match(productContent, /Implement auth/);

    const archContent = writtenFiles['/queue/gap-analysis-architecture.md'];
    assert.match(archContent, /orch_arch_analyst/);
    assert.match(archContent, /# Arch Prompt/);
    assert.match(archContent, /# Spec content here/);
  });

  it('returns 0 when no issues need analysis', async () => {
    const mockDeps = {
      writeFile: async () => {},
    };
    const issues = [
      makeIssue({ number: 1, status: 'Needs decomposition' }),
    ];
    const count = await queueGapAnalysisForIssues(
      issues, '/queue', '# P', '# A', '# S', mockDeps,
    );
    assert.equal(count, 0);
  });

  it('includes xhigh reasoning in frontmatter', async () => {
    const writtenFiles: Record<string, string> = {};
    const mockDeps = {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    };
    const issues = [
      makeIssue({ number: 5, status: 'Needs analysis' }),
    ];
    await queueGapAnalysisForIssues(issues, '/queue', '# P', '# A', '# S', mockDeps);
    const content = writtenFiles['/queue/gap-analysis-product.md'];
    assert.match(content, /^---/);
    assert.match(content, /"reasoning": "xhigh"/);
  });
});

describe('epic and sub-issue decomposition helpers', () => {
  it('writes epic decomposition request file', async () => {
    const writtenFiles: Record<string, string> = {};
    await createEpicDecompositionRequest('SPEC.md', '/requests', {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
      now: () => new Date('2026-03-15T12:00:00Z'),
    });

    assert.ok(writtenFiles['/requests/epic-decomposition.json']);
    const request = JSON.parse(writtenFiles['/requests/epic-decomposition.json']);
    assert.equal(request.type, 'epic_decomposition');
    assert.equal(request.prompt_template, 'PROMPT_orch_decompose.md');
    assert.equal(request.spec_file, 'SPEC.md');
  });

  it('queues epic decomposition prompt with orch_decompose frontmatter', async () => {
    const writtenFiles: Record<string, string> = {};
    await queueEpicDecomposition(
      'SPEC.md',
      '# Spec body',
      '/queue',
      '# Decompose prompt',
      { writeFile: async (p: string, data: string) => { writtenFiles[p] = data; } },
    );

    const content = writtenFiles['/queue/decompose-epics.md'];
    assert.ok(content);
    assert.match(content, /orch_decompose/);
    assert.match(content, /# Decompose prompt/);
    assert.match(content, /# Spec body/);
  });

  it('writes sub-issue decomposition request for Needs decomposition targets only', async () => {
    const writtenFiles: Record<string, string> = {};
    const issues = [
      makeIssue({ number: 10, status: 'Needs decomposition', title: 'Epic A', file_hints: ['src/a.ts'] }),
      makeIssue({ number: 20, status: 'Ready', title: 'Other' }),
    ];
    const count = await createSubDecompositionRequests(issues, '/requests', {
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
      now: () => new Date('2026-03-15T12:00:00Z'),
    });

    assert.equal(count, 1);
    const request = JSON.parse(writtenFiles['/requests/sub-issue-decomposition.json']);
    assert.equal(request.type, 'sub_issue_decomposition');
    assert.equal(request.prompt_template, 'PROMPT_orch_sub_decompose.md');
    assert.equal(request.targets.length, 1);
    assert.equal(request.targets[0].issue_number, 10);
    assert.deepStrictEqual(request.targets[0].file_hints, ['src/a.ts']);
  });

  it('queues per-issue sub decomposition prompts', async () => {
    const writtenFiles: Record<string, string> = {};
    const issues = [
      makeIssue({ number: 11, status: 'Needs decomposition', title: 'Epic B', wave: 2, depends_on: [5] }),
      makeIssue({ number: 12, status: 'Needs decomposition', title: 'Epic C', wave: 2, depends_on: [] }),
    ];
    const count = await queueSubDecompositionForIssues(
      issues,
      '/queue',
      '# Sub-decompose prompt',
      { writeFile: async (p: string, data: string) => { writtenFiles[p] = data; } },
    );

    assert.equal(count, 2);
    assert.ok(writtenFiles['/queue/sub-decompose-issue-11.md']);
    assert.ok(writtenFiles['/queue/sub-decompose-issue-12.md']);
    assert.match(writtenFiles['/queue/sub-decompose-issue-11.md'], /orch_sub_decompose/);
    assert.match(writtenFiles['/queue/sub-decompose-issue-11.md'], /# Sub-decompose prompt/);
  });

  it('applies sub decomposition results by transitioning to Needs refinement', () => {
    const state = makeState({
      updated_at: '2026-03-15T10:00:00.000Z',
      issues: [
        makeIssue({ number: 21, status: 'Needs decomposition', dor_validated: true, body: 'old body' }),
        makeIssue({ number: 22, status: 'Ready', dor_validated: true }),
      ],
    });
    const results: SubDecompositionResult[] = [
      {
        parent_issue_number: 21,
        refined_body: 'new body',
        file_hints: ['src/new.ts'],
      },
    ];

    const updated = applySubDecompositionResults(state, results, new Date('2026-03-15T13:00:00.000Z'));
    assert.equal(updated.issues[0].status, 'Needs refinement');
    assert.equal(updated.issues[0].dor_validated, false);
    assert.equal(updated.issues[0].body, 'new body');
    assert.deepStrictEqual(updated.issues[0].file_hints, ['src/new.ts']);
    assert.equal(updated.updated_at, '2026-03-15T13:00:00.000Z');
    assert.equal(updated.issues[1].status, 'Ready');
  });
});

describe('orchestrateCommandWithDeps gap analysis integration', () => {
  it('queues epic decomposition bootstrap when no plan/issues exist', async () => {
    const deps = createMockDeps();
    const mockDeps = deps as OrchestrateDeps & { _writtenFiles: Record<string, string> };
    await orchestrateCommandWithDeps({}, deps);

    const requestPath = Object.keys(mockDeps._writtenFiles).find((p) => p.endsWith('/requests/epic-decomposition.json'));
    const queuePath = Object.keys(mockDeps._writtenFiles).find((p) => p.endsWith('/queue/decompose-epics.md'));
    assert.ok(requestPath, 'epic decomposition request should be written');
    assert.ok(queuePath, 'epic decomposition queue prompt should be written');
  });

  it('creates gap analysis requests when issues have Needs analysis status', async () => {
    const writtenFiles: Record<string, string> = {};
    const deps = createMockDeps({
      existsSync: (p: string) => p.includes('SPEC.md') || p.endsWith('plan.json'),
      readFile: async (p: string) => {
        if (p.endsWith('plan.json')) {
          return JSON.stringify({
            issues: [
              { id: 1, title: 'Epic A', body: 'Build A', depends_on: [] },
            ],
          });
        }
        return '';
      },
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    });
    const result = await orchestrateCommandWithDeps(
      { plan: 'plan.json' },
      deps,
    );

    // After plan application with no repo, issues get 'Needs analysis' status (default pending state)
    // The gap analysis should only trigger for 'Needs analysis' status issues
    // Check that the orchestrator state was written
    assert.ok(result.state_file.includes('orchestrator.json'));
  });

  it('writes decomposition and analyst prompt files to prompts dir', async () => {
    const writtenFiles: Record<string, string> = {};
    const deps = createMockDeps({
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    });
    await orchestrateCommandWithDeps({}, deps);

    const promptPaths = Object.keys(writtenFiles);
    assert.ok(promptPaths.some((p) => p.includes('PROMPT_orch_decompose.md')));
    assert.ok(promptPaths.some((p) => p.includes('PROMPT_orch_sub_decompose.md')));
    assert.ok(promptPaths.some((p) => p.includes('PROMPT_orch_product_analyst.md')));
    assert.ok(promptPaths.some((p) => p.includes('PROMPT_orch_arch_analyst.md')));
  });
});

describe('autonomy level resolution', () => {
  it('uses explicit autonomy option when provided', async () => {
    const level = await resolveOrchestratorAutonomyLevel(
      { autonomyLevel: 'autonomous', projectRoot: '/project' },
      '/home/test',
      {
        existsSync: () => false,
        readFile: async () => '',
      },
    );
    assert.equal(level, 'autonomous');
  });

  it('reads autonomy level from project config when option missing', async () => {
    const level = await resolveOrchestratorAutonomyLevel(
      { projectRoot: '/project' },
      '/home/test',
      {
        existsSync: () => true,
        readFile: async () => "autonomy_level: 'cautious'\n",
      },
    );
    assert.equal(level, 'cautious');
  });

  it('falls back to balanced for invalid config autonomy', async () => {
    const level = await resolveOrchestratorAutonomyLevel(
      { projectRoot: '/project' },
      '/home/test',
      {
        existsSync: () => true,
        readFile: async () => "autonomy_level: 'invalid'\n",
      },
    );
    assert.equal(level, 'balanced');
  });
});

describe('spec-question resolver autonomy behavior', () => {
  it('maps risk tiers to autonomy action matrix', () => {
    assert.equal(resolveSpecQuestionAction('cautious', 'low'), 'wait_for_user');
    assert.equal(resolveSpecQuestionAction('balanced', 'low'), 'auto_resolve');
    assert.equal(resolveSpecQuestionAction('balanced', 'medium'), 'wait_for_user');
    assert.equal(resolveSpecQuestionAction('autonomous', 'high'), 'auto_resolve');
  });

  it('classifies risk from issue content', () => {
    assert.equal(
      classifySpecQuestionRisk({ title: 'Decide API contract field names', body: '' }),
      'medium',
    );
    assert.equal(
      classifySpecQuestionRisk({ title: 'Security model for data retention', body: '' }),
      'high',
    );
    assert.equal(
      classifySpecQuestionRisk({ title: 'Rename button text', body: '' }),
      'low',
    );
  });

  it('auto-resolves low-risk questions in balanced mode', async () => {
    const ghCalls: string[][] = [];
    const stats = await resolveSpecQuestionIssues(
      { autonomy_level: 'balanced' } as OrchestratorState,
      'owner/repo',
      '/session',
      {
        execGh: async (args: string[]) => {
          ghCalls.push(args);
          if (args[0] === 'issue' && args[1] === 'list') {
            return {
              stdout: JSON.stringify([
                { number: 12, title: 'Naming convention for status enum', body: 'Minor naming only', labels: [{ name: 'aloop/spec-question' }] },
              ]),
              stderr: '',
            };
          }
          return { stdout: '', stderr: '' };
        },
        appendLog: () => undefined,
        now: () => new Date('2026-03-15T12:00:00.000Z'),
      },
    );
    assert.equal(stats.processed, 1);
    assert.equal(stats.autoResolved, 1);
    assert.ok(ghCalls.some((call) => call[0] === 'issue' && call[1] === 'close' && call[2] === '12'));
  });

  it('treats reopened auto-resolved issue as user override and blocks', async () => {
    const ghCalls: string[][] = [];
    const stats = await resolveSpecQuestionIssues(
      { autonomy_level: 'autonomous' } as OrchestratorState,
      'owner/repo',
      '/session',
      {
        execGh: async (args: string[]) => {
          ghCalls.push(args);
          if (args[0] === 'issue' && args[1] === 'list') {
            return {
              stdout: JSON.stringify([
                {
                  number: 99,
                  title: 'Reopened question',
                  body: 'User reopened this issue',
                  labels: [{ name: 'aloop/spec-question' }, { name: 'aloop/auto-resolved' }],
                },
              ]),
              stderr: '',
            };
          }
          return { stdout: '', stderr: '' };
        },
        appendLog: () => undefined,
        now: () => new Date('2026-03-15T12:00:00.000Z'),
      },
    );
    assert.equal(stats.userOverrides, 1);
    assert.ok(
      ghCalls.some((call) => call[0] === 'issue' && call[1] === 'edit' && call.includes('aloop/blocked-on-human')),
    );
  });
});

// --- Orchestrator scan loop tests ---

function createMockScanDeps(overrides: Partial<ScanLoopDeps> = {}): ScanLoopDeps & {
  logEntries: Record<string, unknown>[];
  files: Record<string, string>;
} {
  const logEntries: Record<string, unknown>[] = [];
  const files: Record<string, string> = {};

  const deps: ScanLoopDeps = {
    existsSync: (p: string) => p in files,
    readFile: async (p: string) => {
      if (p in files) return files[p];
      throw new Error(`File not found: ${p}`);
    },
    writeFile: async (p: string, data: string) => { files[p] = data; },
    now: () => new Date('2026-03-15T12:00:00Z'),
    appendLog: (_dir: string, entry: Record<string, unknown>) => { logEntries.push(entry); },
    ...overrides,
  };

  return Object.assign(deps, { logEntries, files });
}

function makeScanState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
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
    created_at: '2026-03-15T10:00:00.000Z',
    updated_at: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('runOrchestratorScanPass', () => {
  it('runs a scan pass with no issues and marks allDone as false', async () => {
    const state = makeScanState({ issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.iteration, 1);
    assert.equal(result.allDone, false);
    assert.equal(result.dispatched, 0);
    assert.equal(result.triage.processed_issues, 0);
    assert.equal(result.specConsistencyProcessed, false);
  });

  it('processes spec-consistency-results.json and removes it', async () => {
    const state = makeScanState({ issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    // Provide a mock consistency result
    deps.files['/session/requests/spec-consistency-results.json'] = JSON.stringify({
      type: 'spec_consistency_check',
      timestamp: '2026-03-18T00:00:00.000Z',
      sections_checked: ['1.0'],
      issues_found: [
        { severity: 'must_fix', section: '1.0', description: 'desc', fix_applied: 'fix' }
      ],
      changes_made: true,
      files_modified: ['SPEC.md']
    });

    let unlinkedPath = '';
    deps.unlink = async (p: string) => {
      unlinkedPath = p;
      delete deps.files[p];
    };

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.specConsistencyProcessed, true);
    assert.ok(unlinkedPath.includes('spec-consistency-results.json'));
    assert.equal(deps.files['/session/requests/spec-consistency-results.json'], undefined);

    // Exact-value assertions for log payload fields
    const consistencyLog = deps.logEntries.find((e) => e.event === 'spec_consistency_processed');
    assert.ok(consistencyLog, 'should log spec_consistency_processed event');
    assert.equal(consistencyLog.changes_made, true);
    assert.equal(consistencyLog.issues_found, 1);
    assert.deepEqual(consistencyLog.files_modified, ['SPEC.md']);
    assert.equal(consistencyLog.iteration, 1);
  });

  it('logs spec_consistency_parse_error for invalid JSON and cleans up the file', async () => {
    const state = makeScanState({ issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/session/requests/spec-consistency-results.json'] = 'not valid json {{{';

    let unlinkedPath = '';
    deps.unlink = async (p: string) => {
      unlinkedPath = p;
      delete deps.files[p];
    };

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 2, deps,
    );

    assert.equal(result.specConsistencyProcessed, false);
    const parseErrorLog = deps.logEntries.find((e) => e.event === 'spec_consistency_parse_error');
    assert.ok(parseErrorLog, 'should log spec_consistency_parse_error event');
    assert.equal(parseErrorLog.iteration, 2);
    assert.ok(unlinkedPath.includes('spec-consistency-results.json'), 'should attempt to clean up invalid file');
    assert.equal(deps.files['/session/requests/spec-consistency-results.json'], undefined, 'invalid file should be removed');
  });

  it('gracefully handles cleanup failure after spec_consistency_parse_error', async () => {
    const state = makeScanState({ issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/session/requests/spec-consistency-results.json'] = 'not valid json {{{';

    // Make unlink throw on the consistency file
    deps.unlink = async (p: string) => {
      if (p.includes('spec-consistency-results.json')) {
        throw new Error('EACCES: permission denied');
      }
      delete deps.files[p];
    };

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 3, deps,
    );

    // Should not throw; parse_error is logged and scan pass completes
    assert.equal(result.specConsistencyProcessed, false);
    const parseErrorLog = deps.logEntries.find((e) => e.event === 'spec_consistency_parse_error');
    assert.ok(parseErrorLog, 'should still log parse_error even when cleanup fails');
    assert.equal(parseErrorLog.iteration, 3);
  });

  it('marks allDone when all issues are merged', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'merged' }),
        makeIssue({ number: 2, wave: 1, state: 'merged' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.allDone, true);
  });

  it('marks allDone when all issues are merged or failed', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'merged' }),
        makeIssue({ number: 2, wave: 1, state: 'failed' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.allDone, true);
  });

  it('dispatches pending issues when dispatchDeps are provided', async () => {
    const state = makeScanState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 10, wave: 1, state: 'pending' }),
        makeIssue({ number: 20, wave: 1, state: 'pending' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const dispatchDeps = createMockDispatchDeps();
    deps.dispatchDeps = dispatchDeps;

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.dispatched, 2);
    // State should be updated in written files
    const writtenState = JSON.parse(deps.files['/state.json']);
    assert.equal(writtenState.issues[0].state, 'in_progress');
    assert.equal(writtenState.issues[1].state, 'in_progress');
  });

  it('respects concurrency cap during dispatch', async () => {
    const state = makeScanState({
      concurrency_cap: 1,
      current_wave: 1,
      issues: [
        makeIssue({ number: 10, wave: 1, state: 'pending' }),
        makeIssue({ number: 20, wave: 1, state: 'pending' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    deps.dispatchDeps = createMockDispatchDeps();

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.dispatched, 1);
  });

  it('does not dispatch when plan_only is true', async () => {
    const state = makeScanState({
      plan_only: true,
      current_wave: 1,
      issues: [
        makeIssue({ number: 10, wave: 1, state: 'pending' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    deps.dispatchDeps = createMockDispatchDeps();

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.dispatched, 0);
  });

  it('detects budget exceeded when budget cap is set', async () => {
    const state = makeScanState({
      budget_cap: 0.5,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'merged', child_session: 'child-1' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/home/.aloop/sessions/child-1/log.jsonl'] = [
      JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
      JSON.stringify({ event: 'iteration_complete', provider: 'claude' }),
    ].join('\n');

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    // 2 iterations * $0.50 = $1.00, cap = $0.50 → exceeded
    assert.equal(result.budgetExceeded, true);
  });

  it('sets shouldStop when signalStop returns true', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'in_progress' })],
    });
    const deps = createMockScanDeps({
      signalStop: () => true,
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.shouldStop, true);
  });

  it('advances wave when current wave is complete', async () => {
    const state = makeScanState({
      current_wave: 1,
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'merged' }),
        makeIssue({ number: 2, wave: 2, state: 'pending' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.waveAdvanced, true);
  });

  it('redispatches child with individual review comments and IDs', async () => {
    const state = makeScanState({
      issues: [
        {
          number: 42,
          title: 'Issue 42',
          wave: 1,
          state: 'pr_open',
          status: 'In review',
          child_session: 'session-42',
          pr_number: 100,
          depends_on: [],
          needs_redispatch: true,
          review_feedback: 'Two fixes needed',
          pending_review_comments: [
            {
              id: 1234,
              path: 'src/example.ts',
              line: 10,
              body: 'Rename this variable',
            },
          ],
        },
      ],
    });
    const deps = createMockScanDeps({
      aloopRoot: '/home/.aloop',
      dispatchDeps: {
        existsSync: () => true,
        readFile: async () => '',
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        cp: async () => undefined,
        now: () => new Date('2026-03-15T12:00:00Z'),
        spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
        spawn: () => ({ pid: 999, unref: () => undefined }),
        platform: 'linux',
        env: {},
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/home/.aloop/sessions/session-42/worktree'] = '';
    deps.files['/home/.aloop/bin/loop.sh'] = '';

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    const steeringPath = Object.keys(deps.files).find((filePath) =>
      filePath.endsWith('/queue/000-review-fixes.md')
    );
    assert.ok(steeringPath, 'should write redispatch steering file');
    const steeringContent = deps.files[steeringPath as string];
    assert.match(steeringContent, /Comment ID: 1234/);
    assert.match(steeringContent, /src\/example\.ts:10/);

    const persisted = JSON.parse(deps.files['/state.json']) as OrchestratorState;
    assert.equal(persisted.issues[0].needs_redispatch, false);
    assert.equal(persisted.issues[0].pending_review_comments, undefined);
    assert.deepStrictEqual(persisted.issues[0].resolving_comment_ids, [1234]);
  });

  it('resolves each pending review thread when redispatched child exits', async () => {
    const resolved: number[] = [];
    const state = makeScanState({
      issues: [
        makeIssue({
          number: 10,
          wave: 1,
          state: 'in_progress',
          status: 'In progress',
          child_session: 'session-mon',
          pr_number: 77,
          resolving_comment_ids: [101, 202],
        }),
      ],
    });

    const deps = createMockScanDeps({
      aloopRoot: '/home/.aloop',
      adapter: {
        resolveThread: async (_prNumber: number, commentId: number) => {
          resolved.push(commentId);
        },
      },
      execGh: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('branches/agent/trunk')) return { stdout: 'agent/trunk', stderr: '' };
        if (key.includes('pr create')) return { stdout: 'https://github.com/owner/repo/pull/50', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/home/.aloop/sessions/session-mon/status.json'] = JSON.stringify({
      iteration: 3,
      phase: 'build',
      provider: 'copilot',
      stuck_count: 0,
      state: 'exited',
      updated_at: '2026-03-15T11:00:00.000Z',
    });
    deps.files['/home/.aloop/sessions/session-mon/meta.json'] = JSON.stringify({
      branch: 'aloop/issue-10',
      project_root: '/project',
    });
    deps.files['/project/.git'] = '';

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    assert.deepStrictEqual(resolved, [101, 202]);
    const persisted = JSON.parse(deps.files['/state.json']) as OrchestratorState;
    assert.equal(persisted.issues[0].resolving_comment_ids, undefined);
  });

  it('continues resolving remaining threads when one resolveThread call fails', async () => {
    const resolved: number[] = [];
    const state = makeScanState({
      issues: [
        makeIssue({
          number: 10,
          wave: 1,
          state: 'in_progress',
          status: 'In progress',
          child_session: 'session-mon',
          pr_number: 88,
          resolving_comment_ids: [101, 202, 303],
        }),
      ],
    });

    const deps = createMockScanDeps({
      aloopRoot: '/home/.aloop',
      adapter: {
        resolveThread: async (_prNumber: number, commentId: number) => {
          if (commentId === 202) throw new Error('resolver failed');
          resolved.push(commentId);
        },
      },
      execGh: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('branches/agent/trunk')) return { stdout: 'agent/trunk', stderr: '' };
        if (key.includes('pr create')) return { stdout: 'https://github.com/owner/repo/pull/51', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/home/.aloop/sessions/session-mon/status.json'] = JSON.stringify({
      iteration: 4,
      phase: 'build',
      provider: 'copilot',
      stuck_count: 0,
      state: 'exited',
      updated_at: '2026-03-15T11:05:00.000Z',
    });
    deps.files['/home/.aloop/sessions/session-mon/meta.json'] = JSON.stringify({
      branch: 'aloop/issue-10',
      project_root: '/project',
    });
    deps.files['/project/.git'] = '';

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    assert.deepStrictEqual(resolved, [101, 303]);
    assert.ok(deps.logEntries.some((entry) =>
      entry.event === 'review_thread_resolve_failed'
      && entry.issue_number === 10
      && entry.comment_id === 202
    ));
    const persisted = JSON.parse(deps.files['/state.json']) as OrchestratorState;
    assert.equal(persisted.issues[0].resolving_comment_ids, undefined);
  });

  it('persists state after scan pass', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 3, deps,
    );

    assert.ok(deps.files['/state.json']);
    const written = JSON.parse(deps.files['/state.json']);
    assert.equal(written.updated_at, '2026-03-15T12:00:00.000Z');
  });

  it('logs scan_pass_complete event', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 5, deps,
    );

    const completeEvent = deps.logEntries.find((e) => e.event === 'scan_pass_complete');
    assert.ok(completeEvent);
    assert.equal(completeEvent.iteration, 5);
    assert.equal(completeEvent.all_done, true);
  });

  it('runs triage when repo and execGh are available', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 42, wave: 1, state: 'pending' })],
    });
    const deps = createMockScanDeps({
      execGh: async (args) => {
        if (args[0] === 'issue-comments') return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
        if (args[0] === 'pr-comments') return { stdout: JSON.stringify({ comments: [] }), stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    assert.equal(result.triage.processed_issues, 1);
  });

  it('monitors in-progress child sessions when execGh and aloopRoot are available', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({
          number: 10,
          wave: 1,
          state: 'in_progress',
          child_session: 'session-mon',
        }),
      ],
    });

    const deps = createMockScanDeps({
      aloopRoot: '/home/.aloop',
      execGh: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('branches/agent/trunk')) return { stdout: 'agent/trunk', stderr: '' };
        if (key.includes('pr create')) return { stdout: 'https://github.com/owner/repo/pull/50', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/home/.aloop/sessions/session-mon/status.json'] = JSON.stringify({
      iteration: 5,
      phase: 'build',
      provider: 'claude',
      stuck_count: 0,
      state: 'exited',
      updated_at: '2026-03-15T12:00:00Z',
    });
    deps.files['/home/.aloop/sessions/session-mon/meta.json'] = JSON.stringify({
      branch: 'aloop/issue-10',
    });

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    assert.ok(result.childMonitoring);
    assert.equal(result.childMonitoring!.monitored, 1);
    assert.equal(result.childMonitoring!.prs_created, 1);

    // Issue state should be updated to pr_open
    const writtenState = JSON.parse(deps.files['/state.json']);
    assert.equal(writtenState.issues[0].state, 'pr_open');
    assert.equal(writtenState.issues[0].pr_number, 50);
  });

  it('does not monitor when execGh is not available', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({
          number: 10,
          wave: 1,
          state: 'in_progress',
          child_session: 'session-mon',
        }),
      ],
    });

    const deps = createMockScanDeps({ aloopRoot: '/home/.aloop' });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    assert.equal(result.childMonitoring, null);
  });

  it('does not redispatch issues with redispatch_paused set', async () => {
    const issue = makeIssue({ number: 5, wave: 1, state: 'pr_open', pr_number: 99 });
    (issue as any).needs_redispatch = true;
    (issue as any).redispatch_paused = true;
    (issue as any).review_feedback = 'Still needs work';
    const state = makeScanState({ issues: [issue] });
    const deps = createMockScanDeps({ aloopRoot: '/home/.aloop' });
    deps.files['/state.json'] = JSON.stringify(state);
    const dispatchDeps = createMockDispatchDeps();
    deps.dispatchDeps = dispatchDeps;
    deps.execGh = async (args) => {
      if (args.includes('labels')) return { stdout: JSON.stringify({ labels: [{ name: 'aloop/needs-human' }] }), stderr: '' };
      return { stdout: '', stderr: '' };
    };

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    // Should not have spawned any child process
    assert.equal(dispatchDeps._spawnCalls.length, 0, 'Paused issue should not be redispatched');
    const writtenState = JSON.parse(deps.files['/state.json']);
    assert.equal(writtenState.issues[0].redispatch_paused, true, 'redispatch_paused should remain true');
  });

  it('resumes redispatch when aloop/needs-human label is removed', async () => {
    const issue = makeIssue({ number: 7, wave: 1, state: 'pr_open', pr_number: 88 });
    (issue as any).redispatch_paused = true;
    (issue as any).redispatch_failures = 3;
    const state = makeScanState({ issues: [issue] });
    const deps = createMockScanDeps({ aloopRoot: '/home/.aloop' });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.execGh = async (args) => {
      // Label has been removed — return empty labels
      if (args.includes('labels')) return { stdout: JSON.stringify({ labels: [] }), stderr: '' };
      return { stdout: '', stderr: '' };
    };

    await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 1, deps,
    );

    const writtenState = JSON.parse(deps.files['/state.json']);
    assert.equal(writtenState.issues[0].redispatch_paused, false, 'redispatch_paused should be reset');
    assert.equal(writtenState.issues[0].redispatch_failures, 0, 'redispatch_failures should be reset');
    assert.equal(writtenState.issues[0].needs_redispatch, true, 'needs_redispatch should be set for next pass');
    // Should log redispatch_resumed event
    const resumedLog = deps.logEntries.find((e) => e.event === 'redispatch_resumed');
    assert.ok(resumedLog, 'Should log redispatch_resumed event');
    assert.equal(resumedLog.issue_number, 7);
  });

  it('writes 000-rebase-conflict.md with agent:merge and clears needs_rebase on redispatch when needs_rebase is true', async () => {
    const tmpAloopRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-test-'));
    try {
      const issue = makeIssue({ number: 42, wave: 1, state: 'pr_open', pr_number: 100 });
      (issue as any).needs_redispatch = true;
      (issue as any).needs_rebase = true;
      const state = makeScanState({ trunk_branch: 'agent/trunk', issues: [issue] });
      const deps = createMockScanDeps({ aloopRoot: tmpAloopRoot });
      deps.files['/state.json'] = JSON.stringify(state);
      const dispatchDeps = createMockDispatchDeps();
      deps.dispatchDeps = dispatchDeps;

      await runOrchestratorScanPass(
        '/state.json', '/session', '/project', 'myapp', '/prompts', tmpAloopRoot,
        null, 1, deps,
      );

      // Find the queue file written by the scan pass
      const queueKey = Object.keys(deps.files).find((k) => k.endsWith('000-rebase-conflict.md'));
      assert.ok(queueKey, '000-rebase-conflict.md should be written');
      assert.match(deps.files[queueKey!], /agent: merge/, 'frontmatter should specify merge agent');
      assert.match(deps.files[queueKey!], /PR #100/, 'should reference the PR number');

      const writtenState = JSON.parse(deps.files['/state.json']);
      assert.equal(writtenState.issues[0].needs_rebase, false, 'needs_rebase should be cleared to false');
      assert.equal(writtenState.issues[0].needs_redispatch, false, 'needs_redispatch should be cleared');
    } finally {
      await rm(tmpAloopRoot, { recursive: true, force: true });
    }
  });

  it('writes 000-review-fixes.md with agent:build on redispatch when needs_rebase is false (regression guard)', async () => {
    const tmpAloopRoot = await mkdtemp(path.join(os.tmpdir(), 'aloop-test-'));
    try {
      const issue = makeIssue({ number: 43, wave: 1, state: 'pr_open', pr_number: 200 });
      (issue as any).needs_redispatch = true;
      (issue as any).review_feedback = 'Fix the type errors in src/foo.ts';
      const state = makeScanState({ issues: [issue] });
      const deps = createMockScanDeps({ aloopRoot: tmpAloopRoot });
      deps.files['/state.json'] = JSON.stringify(state);
      const dispatchDeps = createMockDispatchDeps();
      deps.dispatchDeps = dispatchDeps;

      await runOrchestratorScanPass(
        '/state.json', '/session', '/project', 'myapp', '/prompts', tmpAloopRoot,
        null, 1, deps,
      );

      const queueKey = Object.keys(deps.files).find((k) => k.endsWith('000-review-fixes.md'));
      assert.ok(queueKey, '000-review-fixes.md should be written');
      assert.match(deps.files[queueKey!], /agent: build/, 'frontmatter should specify build agent');
      assert.match(deps.files[queueKey!], /Fix the type errors/, 'should contain review feedback');

      const writtenState = JSON.parse(deps.files['/state.json']);
      assert.equal(writtenState.issues[0].needs_redispatch, false, 'needs_redispatch should be cleared');
      assert.equal(writtenState.issues[0].review_feedback, undefined, 'review_feedback should be cleared');
    } finally {
      await rm(tmpAloopRoot, { recursive: true, force: true });
    }
  });
});

describe('runOrchestratorScanLoop', () => {
  it('returns immediately with plan_only reason when state is plan-only', async () => {
    const state = makeScanState({ plan_only: true, issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1000, 10, deps,
    );

    assert.equal(result.reason, 'plan_only');
    assert.equal(result.iterations, 0);
  });

  it('runs until all issues are done', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'in_progress' }),
      ],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);
    // Track reads to override state on the second scan pass
    // Read 1: initial check in runOrchestratorScanLoop (before loop)
    // Read 2: scan pass 1
    // Read 3: scan pass 2 → override to merged
    let totalReads = 0;
    const origReadFile = deps.readFile;
    deps.readFile = async (p: string, enc: BufferEncoding) => {
      const content = await origReadFile(p, enc);
      if (p === '/state.json') {
        totalReads++;
        if (totalReads >= 3) {
          const s = JSON.parse(content);
          s.issues[0].state = 'merged';
          return JSON.stringify(s);
        }
      }
      return content;
    };

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 100, 5, deps,
    );

    assert.equal(result.reason, 'all_done');
    assert.equal(result.iterations, 2);
  });

  it('stops at max iterations', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'in_progress' })],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 100, 3, deps,
    );

    assert.equal(result.reason, 'max_iterations');
    assert.equal(result.iterations, 3);
  });

  it('stops when signalStop is triggered', async () => {
    let stopAfter = 2;
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'in_progress' })],
    });
    const deps = createMockScanDeps({
      signalStop: () => {
        stopAfter--;
        return stopAfter <= 0;
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 100, 10, deps,
    );

    assert.equal(result.reason, 'stopped');
    assert.equal(result.iterations, 2);
  });

  it('calls sleep between iterations', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'in_progress' })],
    });
    const sleepCalls: number[] = [];
    const deps = createMockScanDeps({
      sleep: async (ms: number) => { sleepCalls.push(ms); },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 5000, 3, deps,
    );

    // Should sleep between iteration 1→2 and 2→3 (not after iteration 3 since it's the last)
    assert.equal(sleepCalls.length, 2);
    assert.ok(sleepCalls.every((ms) => ms === 5000));
  });

  it('logs scan_loop_complete on finish', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 100, 5, deps,
    );

    const completeEvent = deps.logEntries.find((e) => e.event === 'scan_loop_complete');
    assert.ok(completeEvent);
    assert.equal(completeEvent.reason, 'all_done');
  });
});

describe('resolveAutoMerge', () => {
  it('returns false by default', async () => {
    const deps = { existsSync: () => false, readFile: async () => '' };
    const result = await resolveAutoMerge({}, '/home', deps);
    assert.equal(result, false);
  });

  it('returns true when CLI flag is set', async () => {
    const deps = { existsSync: () => false, readFile: async () => '' };
    const result = await resolveAutoMerge({ autoMerge: true }, '/home', deps);
    assert.equal(result, true);
  });

  it('reads auto_merge_to_main from config.yml', async () => {
    const deps = {
      existsSync: () => true,
      readFile: async () => 'auto_merge_to_main: true\nmode: orchestrator\n',
    };
    const result = await resolveAutoMerge({}, '/home', deps);
    assert.equal(result, true);
  });

  it('returns false when config says false', async () => {
    const deps = {
      existsSync: () => true,
      readFile: async () => 'auto_merge_to_main: false\n',
    };
    const result = await resolveAutoMerge({}, '/home', deps);
    assert.equal(result, false);
  });

  it('CLI flag overrides config', async () => {
    const deps = {
      existsSync: () => true,
      readFile: async () => 'auto_merge_to_main: true\n',
    };
    const result = await resolveAutoMerge({ autoMerge: false }, '/home', deps);
    assert.equal(result, false);
  });
});

describe('createTrunkToMainPr', () => {
  it('creates a PR from trunk to main and returns PR number', async () => {
    const logEntries: Record<string, unknown>[] = [];
    const ghCalls: string[][] = [];
    const state = makeScanState({
      auto_merge_to_main: true,
      issues: [
        makeIssue({ number: 1, state: 'merged' }),
        makeIssue({ number: 2, state: 'merged' }),
      ],
    });
    const deps = {
      execGh: async (args: string[]) => {
        ghCalls.push(args);
        return { stdout: 'https://github.com/owner/repo/pull/99\n', stderr: '' };
      },
      appendLog: (_dir: string, entry: Record<string, unknown>) => { logEntries.push(entry); },
    };

    const result = await createTrunkToMainPr(state, 'owner/repo', deps, '/session');
    assert.equal(result, 99);
    assert.ok(ghCalls[0].includes('--base'));
    assert.ok(ghCalls[0].includes('main'));
    assert.ok(ghCalls[0].includes('--head'));
    assert.ok(ghCalls[0].includes('agent/trunk'));
    const logEvent = logEntries.find((e) => e.event === 'trunk_to_main_pr_created');
    assert.ok(logEvent);
    assert.equal(logEvent.pr_number, 99);
  });

  it('returns existing PR number when creation fails but PR exists', async () => {
    const logEntries: Record<string, unknown>[] = [];
    let callCount = 0;
    const state = makeScanState({
      auto_merge_to_main: true,
      issues: [makeIssue({ number: 1, state: 'merged' })],
    });
    const deps = {
      execGh: async (args: string[]) => {
        callCount++;
        if (callCount === 1) throw new Error('PR already exists');
        return { stdout: '55\n', stderr: '' };
      },
      appendLog: (_dir: string, entry: Record<string, unknown>) => { logEntries.push(entry); },
    };

    const result = await createTrunkToMainPr(state, 'owner/repo', deps, '/session');
    assert.equal(result, 55);
    const logEvent = logEntries.find((e) => e.event === 'trunk_to_main_pr_exists');
    assert.ok(logEvent);
  });

  it('returns null when PR creation and listing both fail', async () => {
    const logEntries: Record<string, unknown>[] = [];
    const state = makeScanState({
      auto_merge_to_main: true,
      issues: [makeIssue({ number: 1, state: 'merged' })],
    });
    const deps = {
      execGh: async () => { throw new Error('network error'); },
      appendLog: (_dir: string, entry: Record<string, unknown>) => { logEntries.push(entry); },
    };

    const result = await createTrunkToMainPr(state, 'owner/repo', deps, '/session');
    assert.equal(result, null);
    const logEvent = logEntries.find((e) => e.event === 'trunk_to_main_pr_failed');
    assert.ok(logEvent);
  });

  it('includes failed issue count in PR body', async () => {
    const ghCalls: string[][] = [];
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, state: 'merged' }),
        makeIssue({ number: 2, state: 'failed' }),
      ],
    });
    const deps = {
      execGh: async (args: string[]) => {
        ghCalls.push(args);
        return { stdout: 'https://github.com/owner/repo/pull/10\n', stderr: '' };
      },
      appendLog: () => {},
    };

    await createTrunkToMainPr(state, 'owner/repo', deps, '/session');
    const bodyIdx = ghCalls[0].indexOf('--body') + 1;
    const body = ghCalls[0][bodyIdx];
    assert.ok(body.includes('Failed: 1'));
    assert.ok(body.includes('Merged: 1'));
  });
});

describe('runOrchestratorScanLoop auto-merge', () => {
  it('creates trunk-to-main PR when all_done and auto_merge_to_main is set', async () => {
    const state = makeScanState({
      auto_merge_to_main: true,
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const ghCalls: string[][] = [];
    const deps = createMockScanDeps({
      execGh: async (args: string[]) => {
        ghCalls.push(args);
        return { stdout: 'https://github.com/owner/repo/pull/77\n', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 100, 5, deps,
    );

    assert.equal(result.reason, 'all_done');
    assert.equal(result.finalState.trunk_pr_number, 77);
    // Verify gh pr create was called with --base main
    const prCreateCall = ghCalls.find((c) => c.includes('pr') && c.includes('create'));
    assert.ok(prCreateCall);
    assert.ok(prCreateCall.includes('main'));
  });

  it('does not create trunk-to-main PR when auto_merge_to_main is not set', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const ghCalls: string[][] = [];
    const deps = createMockScanDeps({
      execGh: async (args: string[]) => {
        ghCalls.push(args);
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanLoop(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      'owner/repo', 100, 5, deps,
    );

    assert.equal(result.reason, 'all_done');
    assert.equal(result.finalState.trunk_pr_number, undefined);
    const prCreateCall = ghCalls.find((c) => c.includes('pr') && c.includes('create'));
    assert.equal(prCreateCall, undefined);
  });
});

describe('orchestrateCommandWithDeps initialization', () => {
  it('initializes session with plan and returns result with aloopRoot and projectRoot', async () => {
    const samplePlan = JSON.stringify({
      issues: [
        { id: 1, title: 'Task A', body: 'Do A', depends_on: [] },
      ],
    });
    const writtenFiles: Record<string, string> = {};
    const deps = createMockDeps({
      existsSync: (p: string) => p.includes('SPEC.md') || p in writtenFiles || p.endsWith('plan.json') || p.endsWith('estimate-results.json'),
      readFile: async (p: string) => {
        if (p in writtenFiles) return writtenFiles[p];
        if (p.endsWith('plan.json')) return samplePlan;
        if (p.endsWith('estimate-results.json')) return JSON.stringify([
          { issue_number: 1, dor_passed: true },
        ]);
        return '';
      },
      writeFile: async (p: string, data: string) => { writtenFiles[p] = data; },
    });

    const result = await orchestrateCommandWithDeps(
      { plan: 'plan.json' },
      deps,
    );

    assert.ok(result.aloopRoot);
    assert.ok(result.projectRoot);
    assert.ok(result.state.issues.length > 0);
  });

  it('returns result without issues when no plan provided', async () => {
    const deps = createMockDeps();
    const result = await orchestrateCommandWithDeps(
      {},
      deps,
    );

    // Epic decomposition is queued but no issues yet
    assert.ok(result.session_dir);
    assert.ok(result.aloopRoot);
  });
});

// --- monitorChildSessions tests ---

function createMockMonitorDeps(overrides: {
  files?: Record<string, string>;
  ghResponses?: Record<string, string>;
} = {}) {
  const logEntries: Array<Record<string, unknown>> = [];
  const ghCalls: string[][] = [];
  const files = overrides.files ?? {};
  const ghResponses = overrides.ghResponses ?? {};

  const deps = {
    existsSync: (p: string) => p in files,
    readFile: async (p: string) => {
      if (p in files) return files[p];
      throw new Error(`ENOENT: ${p}`);
    },
    writeFile: async () => {},
    execGh: async (args: string[]) => {
      ghCalls.push(args);
      const key = args.join(' ');
      for (const [pattern, response] of Object.entries(ghResponses)) {
        if (key.includes(pattern)) return { stdout: response, stderr: '' };
      }
      throw new Error(`gh not mocked for: ${key}`);
    },
    now: () => new Date('2026-03-15T12:00:00Z'),
    appendLog: (_sessionDir: string, entry: Record<string, unknown>) => {
      logEntries.push(entry);
    },
    aloopRoot: '/home/.aloop',
  };

  return { deps, logEntries, files, ghCalls };
}

describe('monitorChildSessions', () => {
  it('creates PR for exited child and updates state to pr_open', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 1,
          state: 'in_progress',
          child_session: 'session-abc',
          title: 'Add feature X',
        }),
      ],
    });

    const files: Record<string, string> = {
      '/home/.aloop/sessions/session-abc/status.json': JSON.stringify({
        iteration: 5,
        phase: 'build',
        provider: 'claude',
        stuck_count: 0,
        state: 'exited',
        updated_at: '2026-03-15T12:00:00Z',
      }),
      '/home/.aloop/sessions/session-abc/meta.json': JSON.stringify({
        branch: 'aloop/issue-1',
        project_root: '/project',
      }),
    };

    const { deps, logEntries, ghCalls } = createMockMonitorDeps({
      files,
      ghResponses: {
        'branches/agent/trunk': 'agent/trunk',
        'pr create': 'https://github.com/owner/repo/pull/42',
        'api graphql': JSON.stringify({
          data: {
            repository: {
              issue: {
                projectItems: {
                  nodes: [
                    {
                      id: 'ITEM_1',
                      project: { id: 'PVT_project_1' },
                      fieldValues: {
                        nodes: [
                          {
                            field: {
                              id: 'PVTSSF_status_1',
                              name: 'Status',
                              options: [
                                { id: 'OPT_in_review', name: 'In review' },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
        'project item-edit': '',
      },
    });

    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.monitored, 1);
    assert.equal(result.prs_created, 1);
    assert.equal(result.failed, 0);

    // State should be updated
    assert.equal(state.issues[0].state, 'pr_open');
    assert.equal(state.issues[0].pr_number, 42);
    assert.equal(state.issues[0].status, 'In review');

    // Log should contain child_pr_created
    assert.ok(logEntries.some((e) => e.event === 'child_pr_created'));
    assert.ok(
      ghCalls.some((call) => call[0] === 'project' && call[1] === 'item-edit'),
      'expected project status sync call',
    );
  });

  it('marks stopped child as failed', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 2,
          state: 'in_progress',
          child_session: 'session-def',
        }),
      ],
    });

    const files: Record<string, string> = {
      '/home/.aloop/sessions/session-def/status.json': JSON.stringify({
        iteration: 10,
        phase: 'build',
        provider: 'codex',
        stuck_count: 3,
        state: 'stopped',
        updated_at: '2026-03-15T12:00:00Z',
      }),
    };

    const { deps, logEntries } = createMockMonitorDeps({ files });
    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.monitored, 1);
    assert.equal(result.failed, 1);
    assert.equal(state.issues[0].state, 'failed');
    assert.equal(state.issues[0].status, 'Blocked');
    assert.ok(logEntries.some((e) => e.event === 'child_failed'));
  });

  it('keeps running child as in_progress', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 3,
          state: 'in_progress',
          child_session: 'session-ghi',
        }),
      ],
    });

    const files: Record<string, string> = {
      '/home/.aloop/sessions/session-ghi/status.json': JSON.stringify({
        iteration: 2,
        phase: 'build',
        provider: 'gemini',
        stuck_count: 0,
        state: 'running',
        updated_at: '2026-03-15T12:00:00Z',
      }),
    };

    const { deps } = createMockMonitorDeps({ files });
    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.monitored, 1);
    assert.equal(result.still_running, 1);
    assert.equal(state.issues[0].state, 'in_progress');
  });

  it('logs stuck warning when stuck_count >= 2', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 4,
          state: 'in_progress',
          child_session: 'session-stuck',
        }),
      ],
    });

    const files: Record<string, string> = {
      '/home/.aloop/sessions/session-stuck/status.json': JSON.stringify({
        iteration: 8,
        phase: 'review',
        provider: 'claude',
        stuck_count: 3,
        state: 'running',
        updated_at: '2026-03-15T12:00:00Z',
      }),
    };

    const { deps, logEntries } = createMockMonitorDeps({ files });
    await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.ok(logEntries.some((e) => e.event === 'child_stuck_warning'));
  });

  it('handles missing status.json gracefully', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 5,
          state: 'in_progress',
          child_session: 'session-missing',
        }),
      ],
    });

    const { deps } = createMockMonitorDeps({});
    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.monitored, 1);
    assert.equal(result.errors, 1);
    assert.equal(result.entries[0].action, 'status_unreadable');
  });

  it('falls back to existing PR when pr create fails', async () => {
    const state = makeState({
      issues: [
        makeIssue({
          number: 6,
          state: 'in_progress',
          child_session: 'session-existing',
          title: 'Existing PR task',
        }),
      ],
    });

    const files: Record<string, string> = {
      '/home/.aloop/sessions/session-existing/status.json': JSON.stringify({
        iteration: 3,
        phase: 'build',
        provider: 'claude',
        stuck_count: 0,
        state: 'exited',
        updated_at: '2026-03-15T12:00:00Z',
      }),
      '/home/.aloop/sessions/session-existing/meta.json': JSON.stringify({
        branch: 'aloop/issue-6',
      }),
    };

    const { deps, logEntries } = createMockMonitorDeps({
      files,
      ghResponses: {
        'branches/agent/trunk': 'agent/trunk',
        'pr list': '99',
      },
    });

    // Make pr create fail
    const origExecGh = deps.execGh;
    deps.execGh = async (args: string[]) => {
      if (args.includes('create')) throw new Error('PR already exists');
      return origExecGh(args);
    };

    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.prs_created, 1);
    assert.equal(state.issues[0].pr_number, 99);
    assert.ok(logEntries.some((e) => e.event === 'child_pr_created'));
  });

  it('skips issues without child_session', async () => {
    const state = makeState({
      issues: [
        makeIssue({ number: 7, state: 'pending', child_session: null }),
        makeIssue({ number: 8, state: 'in_progress', child_session: null }),
      ],
    });

    const { deps } = createMockMonitorDeps({});
    const result = await monitorChildSessions(state, '/session', 'owner/repo', deps);

    assert.equal(result.monitored, 0);
  });
});

// --- Spec change detection and replan tests ---

describe('isHousekeepingCommit', () => {
  it('returns true for spec-consistency agent commits', () => {
    assert.equal(isHousekeepingCommit('docs: fix cross-ref\n\nAloop-Agent: spec-consistency\nAloop-Iteration: 5'), true);
  });

  it('returns true for spec-backfill agent commits', () => {
    assert.equal(isHousekeepingCommit('docs: backfill\n\nAloop-Agent: spec-backfill'), true);
  });

  it('returns true for guard agent commits', () => {
    assert.equal(isHousekeepingCommit('Aloop-Agent: guard'), true);
  });

  it('returns true for loop-health-supervisor agent commits', () => {
    assert.equal(isHousekeepingCommit('Aloop-Agent: loop-health-supervisor'), true);
  });

  it('returns false for build agent commits', () => {
    assert.equal(isHousekeepingCommit('feat: add feature\n\nAloop-Agent: build\nAloop-Iteration: 3'), false);
  });

  it('returns false for commits without provenance trailers', () => {
    assert.equal(isHousekeepingCommit('feat: human edit'), false);
  });

  it('returns false for empty commit messages', () => {
    assert.equal(isHousekeepingCommit(''), false);
  });
});

describe('resolveSpecFiles', () => {
  it('resolves a single literal file path', () => {
    const result = resolveSpecFiles('SPEC.md', '/project', {
      existsSync: () => true,
    });
    assert.deepStrictEqual(result, ['/project/SPEC.md']);
  });

  it('resolves space-separated literal paths', () => {
    const result = resolveSpecFiles('SPEC.md docs/spec2.md', '/project', {
      existsSync: () => true,
    });
    assert.deepStrictEqual(result, ['/project/SPEC.md', '/project/docs/spec2.md']);
  });

  it('resolves glob pattern specs/*.md', () => {
    const result = resolveSpecFiles('SPEC.md specs/*.md', '/project', {
      existsSync: (p: string) => true,
      readdirSync: (dir: string) => {
        if (dir === '/project/specs') return ['admin.md', 'auth.md', 'posts.md', 'README.txt'];
        return [];
      },
    });
    assert.deepStrictEqual(result, [
      '/project/SPEC.md',
      '/project/specs/admin.md',
      '/project/specs/auth.md',
      '/project/specs/posts.md',
    ]);
  });

  it('deduplicates files appearing in both literal and glob', () => {
    const result = resolveSpecFiles('specs/auth.md specs/*.md', '/project', {
      existsSync: () => true,
      readdirSync: () => ['auth.md', 'posts.md'],
    });
    assert.deepStrictEqual(result, [
      '/project/specs/auth.md',
      '/project/specs/posts.md',
    ]);
  });

  it('skips glob when directory does not exist', () => {
    const result = resolveSpecFiles('SPEC.md specs/*.md', '/project', {
      existsSync: (p: string) => p === '/project/SPEC.md' || p.endsWith('SPEC.md'),
      readdirSync: () => { throw new Error('ENOENT'); },
    });
    // specs/ doesn't exist, so only SPEC.md is returned
    assert.deepStrictEqual(result, ['/project/SPEC.md']);
  });

  it('returns empty array when no patterns match', () => {
    const result = resolveSpecFiles('nonexistent/*.md', '/project', {
      existsSync: () => false,
    });
    assert.deepStrictEqual(result, []);
  });

  it('handles comma-separated input', () => {
    const result = resolveSpecFiles('SPEC.md,docs/extra.md', '/project', {
      existsSync: () => true,
    });
    assert.deepStrictEqual(result, ['/project/SPEC.md', '/project/docs/extra.md']);
  });
});

describe('loadMergedSpecContent', () => {
  it('returns empty string for no files', async () => {
    const result = await loadMergedSpecContent([], {
      existsSync: () => true,
      readFile: async () => '',
    });
    assert.equal(result, '');
  });

  it('returns single file content directly without header', async () => {
    const result = await loadMergedSpecContent(['/project/SPEC.md'], {
      existsSync: () => true,
      readFile: async () => '# My Spec\n\nContent here.',
    });
    assert.equal(result, '# My Spec\n\nContent here.');
  });

  it('merges multiple files with headers and separators', async () => {
    const files: Record<string, string> = {
      '/project/SPEC.md': '# Master Spec',
      '/project/specs/auth.md': '# Auth Slice',
      '/project/specs/posts.md': '# Posts Slice',
    };
    const result = await loadMergedSpecContent(Object.keys(files), {
      existsSync: (p: string) => p in files,
      readFile: async (p: string) => files[p],
    });
    assert.ok(result.includes('<!-- spec: SPEC.md -->'));
    assert.ok(result.includes('# Master Spec'));
    assert.ok(result.includes('<!-- spec: auth.md -->'));
    assert.ok(result.includes('# Auth Slice'));
    assert.ok(result.includes('<!-- spec: posts.md -->'));
    assert.ok(result.includes('# Posts Slice'));
    assert.ok(result.includes('---'));
  });

  it('skips nonexistent files in merge', async () => {
    const result = await loadMergedSpecContent(
      ['/project/SPEC.md', '/project/specs/missing.md'],
      {
        existsSync: (p: string) => p === '/project/SPEC.md',
        readFile: async () => '# Spec',
      },
    );
    // Only one existing file → no headers, direct content
    assert.equal(result, '# Spec');
  });
});

describe('orchestrateCommandWithDeps multi-file spec', () => {
  it('resolves multiple spec files and stores them in state', async () => {
    const writtenFiles: Record<string, string> = {};
    const deps = createMockDeps({
      existsSync: (p: string) => {
        // SPEC.md exists; specs/ directory exists with auth.md
        if (p.endsWith('SPEC.md')) return true;
        if (p.endsWith('/specs')) return true;
        return false;
      },
      readdirSync: (dir: string) => {
        if (dir.endsWith('/specs') || dir.endsWith(path.sep + 'specs')) return ['auth.md', 'posts.md'];
        return [];
      },
      readFile: async (p: string) => {
        if (writtenFiles[p]) return writtenFiles[p];
        return '';
      },
      writeFile: async (p: string, data: string) => {
        writtenFiles[p] = data;
      },
    });

    const result = await orchestrateCommandWithDeps(
      { spec: 'SPEC.md specs/*.md' },
      deps,
    );

    assert.equal(result.state.spec_file, 'SPEC.md');
    assert.ok(result.state.spec_files);
    assert.ok(result.state.spec_files.length >= 1);
    assert.ok(result.state.spec_files.includes('SPEC.md'));
  });

  it('throws when no spec files match', async () => {
    const deps = createMockDeps({
      existsSync: () => false,
      readdirSync: () => [],
    });

    await assert.rejects(
      () => orchestrateCommandWithDeps({ spec: 'nonexistent.md' }, deps),
      { message: /No spec files found matching/ },
    );
  });

  it('includes merged spec content in decomposition queue', async () => {
    const writtenFiles: Record<string, string> = {};
    const fileContents: Record<string, string> = {};

    // Pre-populate spec content
    const cwd = process.cwd();
    const specPath = path.resolve(cwd, 'SPEC.md');
    const authPath = path.resolve(cwd, 'specs', 'auth.md');
    fileContents[specPath] = '# Master Spec\n\nArchitecture here.';
    fileContents[authPath] = '# Auth Slice\n\nLogin and registration.';

    const deps = createMockDeps({
      existsSync: (p: string) => {
        if (p === specPath || p === authPath) return true;
        if (p.endsWith('/specs') || p.endsWith(path.sep + 'specs')) return true;
        return false;
      },
      readdirSync: (dir: string) => {
        const specsDir = path.resolve(cwd, 'specs');
        if (dir === specsDir) return ['auth.md'];
        return [];
      },
      readFile: async (p: string) => {
        if (fileContents[p]) return fileContents[p];
        if (writtenFiles[p]) return writtenFiles[p];
        return '';
      },
      writeFile: async (p: string, data: string) => {
        writtenFiles[p] = data;
      },
    });

    await orchestrateCommandWithDeps({ spec: 'SPEC.md specs/*.md' }, deps);

    // Find the decompose queue file
    const decomposeFile = Object.keys(writtenFiles).find((k) => k.includes('decompose-epics.md'));
    assert.ok(decomposeFile, 'decompose-epics.md should be queued');
    const content = writtenFiles[decomposeFile];
    assert.ok(content.includes('Master Spec'), 'should include master spec content');
    assert.ok(content.includes('Auth Slice'), 'should include auth slice content');
    assert.ok(content.includes('<!-- spec: SPEC.md -->'), 'should include spec file header for master');
    assert.ok(content.includes('<!-- spec: auth.md -->'), 'should include spec file header for auth');
  });
});

describe('detectSpecChanges', () => {
  function makeExecGit(responses: Record<string, { stdout: string; stderr: string }>) {
    return async (args: string[]) => {
      const key = args.join(' ');
      for (const [pattern, response] of Object.entries(responses)) {
        if (key.includes(pattern)) return response;
      }
      return { stdout: '', stderr: '' };
    };
  }

  it('returns unchanged when no previous commit is recorded', async () => {
    const state = makeScanState({ spec_last_commit: undefined });
    const execGit = makeExecGit({
      'rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
    });

    const result = await detectSpecChanges(state, '/project', execGit);

    assert.equal(result.changed, false);
    assert.equal(result.new_commit, 'abc123');
  });

  it('returns unchanged when HEAD has not moved', async () => {
    const state = makeScanState({ spec_last_commit: 'abc123' });
    const execGit = makeExecGit({
      'rev-parse HEAD': { stdout: 'abc123\n', stderr: '' },
    });

    const result = await detectSpecChanges(state, '/project', execGit);

    assert.equal(result.changed, false);
  });

  it('returns unchanged when diff is empty', async () => {
    const state = makeScanState({ spec_last_commit: 'old123' });
    const execGit = makeExecGit({
      'rev-parse HEAD': { stdout: 'new456\n', stderr: '' },
      'log -1': { stdout: 'feat: unrelated change', stderr: '' },
      'diff old123..new456': { stdout: '', stderr: '' },
    });

    const result = await detectSpecChanges(state, '/project', execGit);

    assert.equal(result.changed, false);
  });

  it('detects spec changes and returns diff', async () => {
    const state = makeScanState({ spec_last_commit: 'old123' });
    const execGit = makeExecGit({
      'rev-parse HEAD': { stdout: 'new456\n', stderr: '' },
      'log -1': { stdout: 'docs: update requirements', stderr: '' },
      'diff old123..new456 --': { stdout: '--- a/SPEC.md\n+++ b/SPEC.md\n@@ -1 +1 @@\n-old\n+new', stderr: '' },
      '--name-only': { stdout: 'SPEC.md\n', stderr: '' },
    });

    const result = await detectSpecChanges(state, '/project', execGit);

    assert.equal(result.changed, true);
    assert.ok(result.diff.includes('+new'));
    assert.deepEqual(result.changed_files, ['SPEC.md']);
    assert.equal(result.new_commit, 'new456');
  });

  it('skips housekeeping commits (loop prevention)', async () => {
    const state = makeScanState({ spec_last_commit: 'old123' });
    const execGit = makeExecGit({
      'rev-parse HEAD': { stdout: 'new456\n', stderr: '' },
      'log -1': { stdout: 'docs: fix cross-ref\n\nAloop-Agent: spec-consistency', stderr: '' },
    });

    const result = await detectSpecChanges(state, '/project', execGit);

    assert.equal(result.changed, false);
    assert.equal(result.new_commit, 'new456');
  });
});

describe('applyReplanActions', () => {
  it('creates a new issue from create_issue action', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 5, wave: 1 })],
    });

    const actions: ReplanAction[] = [
      { action: 'create_issue', title: 'New task', body: 'New body', deps: [5] },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 1);
    assert.equal(state.issues.length, 2);
    assert.equal(state.issues[1].number, 6);
    assert.equal(state.issues[1].title, 'New task');
    assert.equal(state.issues[1].state, 'pending');
    assert.deepEqual(state.issues[1].depends_on, [5]);
  });

  it('updates an existing issue body and title', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 10, title: 'Old title', body: 'Old body' })],
    });

    const actions: ReplanAction[] = [
      { action: 'update_issue', number: 10, title: 'New title', new_body: 'New body' },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 1);
    assert.equal(state.issues[0].title, 'New title');
    assert.equal(state.issues[0].body, 'New body');
  });

  it('closes a pending issue by marking it as failed', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 3, state: 'pending' })],
    });

    const actions: ReplanAction[] = [
      { action: 'close_issue', number: 3, reason: 'No longer needed' },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 1);
    assert.equal(state.issues[0].state, 'failed');
    assert.equal(state.issues[0].status, 'Done');
  });

  it('does not close an in_progress issue', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 3, state: 'in_progress' })],
    });

    const actions: ReplanAction[] = [
      { action: 'close_issue', number: 3 },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 0);
    assert.equal(state.issues[0].state, 'in_progress');
  });

  it('reprioritizes an issue to a new wave', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 7, wave: 2 })],
    });

    const actions: ReplanAction[] = [
      { action: 'reprioritize', number: 7, new_wave: 1 },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 1);
    assert.equal(state.issues[0].wave, 1);
  });

  it('steers a child session via pending_steering_comments', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 5, state: 'in_progress', child_session: 'child-1' })],
    });

    const actions: ReplanAction[] = [
      { action: 'steer_child', number: 5, instruction: 'Change approach to use REST API' },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 1);
    assert.equal(state.issues[0].pending_steering_comments?.length, 1);
    assert.equal(state.issues[0].pending_steering_comments?.[0].body, 'Change approach to use REST API');
  });

  it('skips steer_child when issue has no child_session', () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 5, state: 'pending', child_session: null })],
    });

    const actions: ReplanAction[] = [
      { action: 'steer_child', number: 5, instruction: 'Do something' },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 0);
  });

  it('skips actions with missing required fields', () => {
    const state = makeScanState({ issues: [makeIssue({ number: 1 })] });

    const actions: ReplanAction[] = [
      { action: 'create_issue' }, // missing title
      { action: 'update_issue' }, // missing number
      { action: 'close_issue' }, // missing number
      { action: 'reprioritize', number: 1 }, // missing new_wave
      { action: 'steer_child' }, // missing number
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 0);
  });

  it('applies multiple actions in sequence', () => {
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, wave: 1, state: 'pending' }),
        makeIssue({ number: 2, wave: 2, state: 'pending' }),
      ],
    });

    const actions: ReplanAction[] = [
      { action: 'create_issue', title: 'New task', body: 'Body' },
      { action: 'update_issue', number: 1, new_body: 'Updated body' },
      { action: 'reprioritize', number: 2, new_wave: 1 },
    ];

    const applied = applyReplanActions(state, actions);

    assert.equal(applied, 3);
    assert.equal(state.issues.length, 3);
    assert.equal(state.issues[0].body, 'Updated body');
    assert.equal(state.issues[1].wave, 1);
  });
});

describe('queueReplanForSpecChange', () => {
  it('writes replan queue file with diff context', async () => {
    const state = makeScanState({
      issues: [
        makeIssue({ number: 1, title: 'Task A', state: 'in_progress', status: 'In progress' }),
        makeIssue({ number: 2, title: 'Task B', state: 'pending', status: 'Ready' }),
      ],
    });

    const files: Record<string, string> = {};
    await queueReplanForSpecChange(
      '--- a/SPEC.md\n+++ b/SPEC.md\n@@ -1 +1 @@\n-old\n+new',
      ['SPEC.md'],
      state,
      '/queue',
      '# Replan Prompt\n\nReplan instructions here.',
      { writeFile: async (p, d) => { files[p] = d; } },
    );

    const content = files['/queue/replan-spec-change.md'];
    assert.ok(content);
    assert.ok(content.includes('orch_replan'));
    assert.ok(content.includes('spec_change'));
    assert.ok(content.includes('+new'));
    assert.ok(content.includes('#1'));
    assert.ok(content.includes('#2'));
    assert.ok(content.includes('Replan Prompt'));
  });
});

describe('queueSpecConsistencyCheck', () => {
  it('writes consistency check queue file', async () => {
    const state = makeScanState({
      issues: [makeIssue({ number: 1, title: 'Task A', state: 'pending' })],
    });

    const files: Record<string, string> = {};
    await queueSpecConsistencyCheck(
      ['SPEC.md'],
      '--- a/SPEC.md\n+++ b/SPEC.md',
      state,
      '/queue',
      '# Consistency Agent\n\nCheck spec.',
      { writeFile: async (p, d) => { files[p] = d; } },
    );

    const content = files['/queue/spec-consistency-check.md'];
    assert.ok(content);
    assert.ok(content.includes('orch_spec_consistency'));
    assert.ok(content.includes('SPEC.md'));
    assert.ok(content.includes('Consistency Agent'));
  });
});

describe('processQueuedPrompts', () => {
  it('returns zero when queue dir does not exist', async () => {
    const deps = createMockScanDeps();
    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);
    assert.equal(result.processed, 0);
    assert.deepEqual(result.files, []);
  });

  it('processes the oldest .md file from queue directory using readdir', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = ''; // directory marker
    deps.files['/session/queue/replan-spec-change.md'] = '# Replan prompt content';
    deps.readdir = async () => ['replan-spec-change.md'];

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 3, deps);

    assert.equal(result.processed, 1);
    assert.deepEqual(result.files, ['replan-spec-change.md']);
    // Should create a pending request file
    const requestContent = deps.files['/session/requests/replan-spec-change-pending.json'];
    assert.ok(requestContent);
    const request = JSON.parse(requestContent);
    assert.equal(request.type, 'queued_prompt');
    assert.equal(request.source_file, 'replan-spec-change.md');
    assert.equal(request.iteration, 3);
    assert.ok(request.prompt_content.includes('Replan prompt content'));
    // Queue file should be emptied (consumed)
    assert.equal(deps.files['/session/queue/replan-spec-change.md'], '');
    // Should log the processing
    assert.ok(deps.logEntries.some((e) => e.event === 'queue_prompt_processed'));
  });

  it('processes only one file per pass when multiple are queued', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = ''; // directory marker
    deps.files['/session/queue/a-first.md'] = '# First';
    deps.files['/session/queue/b-second.md'] = '# Second';
    deps.readdir = async () => ['b-second.md', 'a-first.md'];

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 1);
    assert.deepEqual(result.files, ['a-first.md']); // Sorted, oldest first
  });

  it('falls back to known filenames when readdir is not available', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = ''; // directory marker
    deps.files['/session/queue/gap-analysis-product.md'] = '# Gap analysis';

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 1);
    assert.deepEqual(result.files, ['gap-analysis-product.md']);
  });

  it('skips non-.md files', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = ''; // directory marker
    deps.files['/session/queue/notes.txt'] = 'not a prompt';
    deps.readdir = async () => ['notes.txt'];

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 0);
  });

  it('logs error when queue file read fails', async () => {
    const files: Record<string, string> = {
      '/session/queue': '',
      '/session/queue/broken.md': 'exists',
    };
    const logEntries: Record<string, unknown>[] = [];
    const deps: ScanLoopDeps & { logEntries: Record<string, unknown>[]; files: Record<string, string> } = {
      existsSync: (p: string) => p in files,
      readFile: async (p: string) => {
        if (p.includes('queue/') && p.endsWith('.md')) throw new Error('read failed');
        if (p in files) return files[p];
        throw new Error(`File not found: ${p}`);
      },
      writeFile: async (p: string, data: string) => { files[p] = data; },
      now: () => new Date('2026-03-15T12:00:00Z'),
      appendLog: (_dir: string, entry: Record<string, unknown>) => { logEntries.push(entry); },
      readdir: async () => ['broken.md'],
      logEntries,
      files,
    };

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 0);
    assert.ok(logEntries.some((e) => e.event === 'queue_prompt_error'));
  });

  it('uses sessionDir as work-dir for spec-consistency-check.md (path alignment regression)', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = '';
    deps.files['/session/queue/spec-consistency-check.md'] = '# Consistency check prompt';
    deps.readdir = async () => ['spec-consistency-check.md'];

    let spawnArgs: Record<string, unknown> | null = null;
    deps.dispatchDeps = {
      existsSync: () => false,
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      cp: async () => {},
      now: () => new Date('2026-03-15T12:00:00Z'),
      spawnSync: () => ({ status: 0, stdout: '', stderr: '' }) as any,
      spawn: (_cmd: string, _args: string[], options?: Record<string, unknown>) => {
        spawnArgs = options ?? {};
        return { unref: () => {} } as any;
      },
      platform: 'linux',
      env: {},
    };
    deps.aloopRoot = '/home/.aloop';

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 1);
    assert.ok(spawnArgs, 'spawn should have been called');
    assert.equal((spawnArgs as Record<string, unknown>).cwd, '/session', 'spec-consistency agent should use sessionDir as cwd');
  });

  it('uses projectRoot as work-dir for non-consistency queue files', async () => {
    const deps = createMockScanDeps();
    deps.files['/session/queue'] = '';
    deps.files['/session/queue/decompose-epics.md'] = '# Decompose epics prompt';
    deps.readdir = async () => ['decompose-epics.md'];

    let spawnArgs: Record<string, unknown> | null = null;
    deps.dispatchDeps = {
      existsSync: () => false,
      readFile: async () => '',
      writeFile: async () => {},
      mkdir: async () => undefined,
      cp: async () => {},
      now: () => new Date('2026-03-15T12:00:00Z'),
      spawnSync: () => ({ status: 0, stdout: '', stderr: '' }) as any,
      spawn: (_cmd: string, _args: string[], options?: Record<string, unknown>) => {
        spawnArgs = options ?? {};
        return { unref: () => {} } as any;
      },
      platform: 'linux',
      env: {},
    };
    deps.aloopRoot = '/home/.aloop';

    const result = await processQueuedPrompts('/session', '/project', '/home/.aloop', 1, deps);

    assert.equal(result.processed, 1);
    assert.ok(spawnArgs, 'spawn should have been called');
    assert.equal((spawnArgs as Record<string, unknown>).cwd, '/project', 'non-consistency agents should use projectRoot as cwd');
  });
});

describe('applySpecBackfill', () => {
  it('inserts content after matching section header', async () => {
    const files: Record<string, string> = {
      '/project/SPEC.md': '# Spec\n\n## Requirements\n\nExisting content.\n\n## Design\n\nDesign stuff.',
    };
    const gitCalls: string[][] = [];

    const result = await applySpecBackfill(
      'SPEC.md', 'Requirements', 'New resolved content.',
      'orch-session-1', 5, '/project',
      {
        readFile: async (p) => files[p] ?? '',
        writeFile: async (p, d) => { files[p] = d; },
        execGit: async (args) => { gitCalls.push(args); return { stdout: '', stderr: '' }; },
      },
    );

    assert.equal(result, true);
    assert.ok(files['/project/SPEC.md'].includes('New resolved content.'));
    assert.ok(files['/project/SPEC.md'].includes('## Requirements'));
    // Verify provenance in commit
    assert.ok(gitCalls.some((args) => args.includes('commit')));
    const commitArgs = gitCalls.find((args) => args.includes('commit'));
    assert.ok(commitArgs);
    const commitMsg = commitArgs![commitArgs!.indexOf('-m') + 1];
    assert.ok(commitMsg.includes('Aloop-Agent: spec-backfill'));
  });

  it('appends new section when section header not found', async () => {
    const files: Record<string, string> = {
      '/project/SPEC.md': '# Spec\n\nSome content.',
    };

    const result = await applySpecBackfill(
      'SPEC.md', 'New Section', 'Backfilled content.',
      'orch-session-1', 3, '/project',
      {
        readFile: async (p) => files[p] ?? '',
        writeFile: async (p, d) => { files[p] = d; },
      },
    );

    assert.equal(result, true);
    assert.ok(files['/project/SPEC.md'].includes('## New Section'));
    assert.ok(files['/project/SPEC.md'].includes('Backfilled content.'));
  });

  it('returns false on read error', async () => {
    const result = await applySpecBackfill(
      'SPEC.md', 'Section', 'Content.',
      'orch-session-1', 1, '/project',
      {
        readFile: async () => { throw new Error('not found'); },
        writeFile: async () => {},
      },
    );

    assert.equal(result, false);
  });
});

describe('runSpecChangeReplan', () => {
  it('returns no-op result when execGit is not provided', async () => {
    const state = makeScanState();
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runSpecChangeReplan(state, '/state.json', '/session', '/project', 1, deps);

    assert.equal(result.spec_changed, false);
    assert.equal(result.diff_queued, false);
  });

  it('detects spec changes and queues replan + consistency prompts', async () => {
    const state = makeScanState({ spec_last_commit: 'old123' });
    const deps = createMockScanDeps({
      execGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('rev-parse')) return { stdout: 'new456\n', stderr: '' };
        if (key.includes('log -1')) return { stdout: 'docs: user edit', stderr: '' };
        if (key.includes('--name-only')) return { stdout: 'SPEC.md\n', stderr: '' };
        if (key.includes('diff')) return { stdout: '-old\n+new', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runSpecChangeReplan(state, '/state.json', '/session', '/project', 1, deps);

    assert.equal(result.spec_changed, true);
    assert.equal(result.diff_queued, true);
    assert.equal(state.spec_last_commit, 'new456');
    // Check queue files were written
    assert.ok(deps.files['/session/queue/replan-spec-change.md']);
    assert.ok(deps.files['/session/queue/spec-consistency-check.md']);
  });

  it('applies pending replan results from requests/', async () => {
    const replanResult: ReplanResult = {
      type: 'orchestrator_replan',
      trigger: 'spec_change',
      timestamp: '2026-03-15T12:00:00Z',
      actions: [
        { action: 'create_issue', title: 'New from replan', body: 'Body' },
        { action: 'reprioritize', number: 1, new_wave: 2 },
      ],
      gap_analysis_needed: true,
      affected_sections: ['Section 3'],
    };

    const state = makeScanState({
      spec_last_commit: 'old123',
      issues: [makeIssue({ number: 1, wave: 1 })],
    });
    const deps = createMockScanDeps({
      execGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('rev-parse')) return { stdout: 'new456\n', stderr: '' };
        if (key.includes('log -1')) return { stdout: 'docs: user edit', stderr: '' };
        if (key.includes('--name-only')) return { stdout: 'SPEC.md\n', stderr: '' };
        if (key.includes('diff')) return { stdout: '-old\n+new', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/session/requests/replan-spec-change-results.json'] = JSON.stringify(replanResult);

    const result = await runSpecChangeReplan(state, '/state.json', '/session', '/project', 1, deps);

    assert.equal(result.actions_applied, 2);
    assert.equal(result.gap_analysis_triggered, true);
    assert.equal(state.issues.length, 2);
    assert.equal(state.issues[0].wave, 2);
    assert.equal(state.issues[1].title, 'New from replan');
  });

  it('applies spec backfill entries from requests/', async () => {
    const backfillData = {
      entries: [
        { file: 'SPEC.md', section: 'Requirements', content: 'Resolved: use REST API.' },
      ],
    };

    const state = makeScanState({ spec_last_commit: 'old123' });
    const deps = createMockScanDeps({
      execGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('rev-parse')) return { stdout: 'new456\n', stderr: '' };
        if (key.includes('log -1')) return { stdout: 'docs: user edit', stderr: '' };
        if (key.includes('--name-only')) return { stdout: 'SPEC.md\n', stderr: '' };
        if (key.includes('diff')) return { stdout: '-old\n+new', stderr: '' };
        if (key.includes('add') || key.includes('commit')) return { stdout: '', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);
    deps.files['/session/requests/spec-backfill-results.json'] = JSON.stringify(backfillData);
    deps.files['/project/SPEC.md'] = '# Spec\n\n## Requirements\n\nExisting.\n';

    const result = await runSpecChangeReplan(state, '/state.json', '/session', '/project', 1, deps);

    assert.equal(result.backfill_applied, true);
    assert.ok(deps.files['/project/SPEC.md'].includes('Resolved: use REST API.'));
  });

  it('updates spec_last_commit even when no changes detected', async () => {
    const state = makeScanState({ spec_last_commit: 'old123' });
    const deps = createMockScanDeps({
      execGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('rev-parse')) return { stdout: 'new456\n', stderr: '' };
        if (key.includes('log -1')) return { stdout: 'feat: unrelated', stderr: '' };
        if (key.includes('diff')) return { stdout: '', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });

    const result = await runSpecChangeReplan(state, '/state.json', '/session', '/project', 1, deps);

    assert.equal(result.spec_changed, false);
    assert.equal(state.spec_last_commit, 'new456');
  });
});

describe('runOrchestratorScanPass with replan', () => {
  it('includes replan result in scan pass when execGit is provided', async () => {
    const state = makeScanState({
      spec_last_commit: 'old123',
      issues: [makeIssue({ number: 1, wave: 1, state: 'merged' })],
    });
    const deps = createMockScanDeps({
      execGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key.includes('rev-parse')) return { stdout: 'same123\n', stderr: '' };
        return { stdout: '', stderr: '' };
      },
    });
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    // Since HEAD didn't move relative to last commit, no spec change
    assert.ok(result.replan !== null);
    assert.equal(result.replan!.spec_changed, false);
  });

  it('replan is null when execGit is not provided', async () => {
    const state = makeScanState({ issues: [] });
    const deps = createMockScanDeps();
    deps.files['/state.json'] = JSON.stringify(state);

    const result = await runOrchestratorScanPass(
      '/state.json', '/session', '/project', 'myapp', '/prompts', '/home/.aloop',
      null, 1, deps,
    );

    assert.equal(result.replan, null);
  });
});
