import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFinalizerQaGate } from './finalizer-qa-gate.js';

describe('runFinalizerQaGate', () => {
  let workDir: string;

  before(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'qa-gate-test-'));
  });

  after(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('passes when QA_COVERAGE.md is missing', async () => {
    const result = await runFinalizerQaGate(workDir);
    assert.equal(result.passed, true);
    assert.equal(result.reason, 'qa_coverage_missing');
    assert.equal(result.qa_total, 0);
  });

  it('fails when QA_COVERAGE.md has no parseable rows', async () => {
    await writeFile(path.join(workDir, 'QA_COVERAGE.md'), '# No table here\n', 'utf8');
    await writeFile(path.join(workDir, 'TODO.md'), '# Tasks\n', 'utf8');
    const result = await runFinalizerQaGate(workDir);
    assert.equal(result.passed, false);
    assert.equal(result.reason, 'qa_coverage_unparseable');
    const todo = await readFile(path.join(workDir, 'TODO.md'), 'utf8');
    assert.ok(todo.includes('[finalizer-qa-gate] Fix QA_COVERAGE.md table format'));
  });

  it('passes when all rows are PASS', async () => {
    // Format: | Feature | Last Tested | Commit | Result | Notes |
    await writeFile(
      path.join(workDir, 'QA_COVERAGE.md'),
      '| Feature | Last Tested | Commit | Result | Notes |\n| --- | --- | --- | --- | --- |\n| Foo | 2026-01-01 | abc | PASS | ok |\n| Bar | 2026-01-01 | abc | PASS | ok |\n',
      'utf8',
    );
    const result = await runFinalizerQaGate(workDir);
    assert.equal(result.passed, true);
    assert.equal(result.reason, 'qa_coverage_pass');
    assert.equal(result.qa_total, 2);
    assert.equal(result.qa_untested, 0);
    assert.equal(result.qa_fail, 0);
  });

  it('fails when FAIL rows exist and appends tasks', async () => {
    await writeFile(path.join(workDir, 'TODO.md'), '# Tasks\n', 'utf8');
    await writeFile(
      path.join(workDir, 'QA_COVERAGE.md'),
      '| Feature | Last Tested | Commit | Result | Notes |\n| --- | --- | --- | --- | --- |\n| Auth | 2026-01-01 | abc | FAIL | broken |\n| Foo | 2026-01-01 | abc | PASS | ok |\n',
      'utf8',
    );
    const result = await runFinalizerQaGate(workDir);
    assert.equal(result.passed, false);
    assert.equal(result.reason, 'qa_coverage_blocked');
    assert.equal(result.qa_fail, 1);
    const todo = await readFile(path.join(workDir, 'TODO.md'), 'utf8');
    assert.ok(todo.includes('Resolve FAIL coverage item: Auth'));
  });

  it('fails when UNTESTED percentage exceeds 30% and appends task', async () => {
    await writeFile(path.join(workDir, 'TODO.md'), '# Tasks\n', 'utf8');
    await writeFile(
      path.join(workDir, 'QA_COVERAGE.md'),
      '| Feature | Last Tested | Commit | Result | Notes |\n| --- | --- | --- | --- | --- |\n| A | 2026-01-01 | abc | PASS | ok |\n| B | - | - | UNTESTED | - |\n| C | - | - | UNTESTED | - |\n',
      'utf8',
    );
    const result = await runFinalizerQaGate(workDir);
    assert.equal(result.passed, false);
    assert.equal(result.qa_untested, 2);
    assert.equal(result.qa_total, 3);
    const todo = await readFile(path.join(workDir, 'TODO.md'), 'utf8');
    assert.ok(todo.includes('Reduce UNTESTED QA coverage'));
  });

  it('does not duplicate tasks when appending', async () => {
    const existingTask =
      '[qa/P1] [finalizer-qa-gate] Fix QA_COVERAGE.md table format so finalizer can enforce coverage';
    await writeFile(path.join(workDir, 'TODO.md'), `# Tasks\n- [ ] ${existingTask}\n`, 'utf8');
    await writeFile(path.join(workDir, 'QA_COVERAGE.md'), '# No table\n', 'utf8');
    await runFinalizerQaGate(workDir);
    const todo = await readFile(path.join(workDir, 'TODO.md'), 'utf8');
    const count = (todo.match(/Fix QA_COVERAGE\.md table format/g) ?? []).length;
    assert.equal(count, 1);
  });
});
