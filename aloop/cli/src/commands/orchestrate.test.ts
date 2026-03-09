import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateCommand, orchestrateCommandWithDeps, type OrchestrateCommandOptions, type OrchestrateDeps } from './orchestrate.js';

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
    assert.ok(allOutput.includes('Issues:'));
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
    assert.ok(!allOutput.includes('Issues:'));
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
