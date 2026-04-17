import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveComponentLabels } from './labels.js';

describe('deriveComponentLabels', () => {
  it('maps dashboard paths to component/dashboard', () => {
    const result = deriveComponentLabels(['aloop/cli/dashboard/src/App.tsx']);
    assert.ok(result.includes('component/dashboard'));
  });

  it('maps loop.sh to component/loop', () => {
    const result = deriveComponentLabels(['aloop/bin/loop.sh']);
    assert.ok(result.includes('component/loop'));
  });

  it('maps loop.ps1 to component/loop', () => {
    const result = deriveComponentLabels(['aloop/bin/loop.ps1']);
    assert.ok(result.includes('component/loop'));
  });

  it('maps orchestrate paths to component/orchestrator', () => {
    const result = deriveComponentLabels(['aloop/cli/src/commands/orchestrate.ts']);
    assert.ok(result.includes('component/orchestrator'));
  });

  it('maps generic cli/ paths to component/cli', () => {
    const result = deriveComponentLabels(['aloop/cli/src/lib/plan.ts']);
    assert.ok(result.includes('component/cli'));
  });

  it('returns unique labels for multiple file hints', () => {
    const result = deriveComponentLabels([
      'aloop/cli/src/commands/orchestrate.ts',
      'aloop/bin/loop.sh',
      'aloop/cli/dashboard/src/App.tsx',
    ]);
    assert.ok(result.includes('component/orchestrator'));
    assert.ok(result.includes('component/loop'));
    assert.ok(result.includes('component/dashboard'));
    assert.equal(result.length, 3);
  });

  it('deduplicates labels when multiple files match same component', () => {
    const result = deriveComponentLabels([
      'aloop/cli/src/commands/orchestrate.ts',
      'aloop/cli/src/commands/orchestrate.test.ts',
    ]);
    assert.equal(result.filter(l => l === 'component/orchestrator').length, 1);
  });

  it('returns empty array for unknown paths', () => {
    const result = deriveComponentLabels(['some/random/file.txt']);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array for empty input', () => {
    const result = deriveComponentLabels([]);
    assert.deepStrictEqual(result, []);
  });

  it('uses first-match-wins ordering (dashboard before cli)', () => {
    // dashboard path also contains 'cli/' but should match dashboard first
    const result = deriveComponentLabels(['aloop/cli/dashboard/src/App.tsx']);
    assert.ok(result.includes('component/dashboard'));
    assert.ok(!result.includes('component/cli'));
  });

  it('handles mixed known and unknown paths', () => {
    const result = deriveComponentLabels([
      'aloop/bin/loop.sh',
      'some/random/file.txt',
      'aloop/cli/src/commands/start.ts',
    ]);
    assert.ok(result.includes('component/loop'));
    assert.ok(result.includes('component/cli'));
    assert.equal(result.length, 2);
  });
});
