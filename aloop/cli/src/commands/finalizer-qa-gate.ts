import { existsSync } from 'node:fs';
import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

interface FinalizerQaGateResult {
  passed: boolean;
  reason: string;
  message: string;
  qa_total: number;
  qa_untested: number;
  qa_fail: number;
}

async function appendPlanTaskIfMissing(planFile: string, taskText: string): Promise<void> {
  if (!taskText.trim() || !existsSync(planFile)) return;
  const content = await readFile(planFile, 'utf8').catch(() => '');
  if (content.includes(taskText)) return;
  await appendFile(planFile, `\n- [ ] ${taskText}`, 'utf8');
}

export async function runFinalizerQaGate(workDir: string): Promise<FinalizerQaGateResult> {
  const coverageFile = path.join(workDir, 'QA_COVERAGE.md');
  const planFile = path.join(workDir, 'TODO.md');

  if (!existsSync(coverageFile)) {
    return {
      passed: true,
      reason: 'qa_coverage_missing',
      message: 'QA_COVERAGE.md is missing — skipping enforcement',
      qa_total: 0,
      qa_untested: 0,
      qa_fail: 0,
    };
  }

  const lines = (await readFile(coverageFile, 'utf8').catch(() => '')).split('\n');
  let total = 0;
  let untested = 0;
  let fail = 0;
  const failFeatures: string[] = [];

  for (const line of lines) {
    if (!line.match(/^\|/)) continue;
    const cols = line.split('|');
    if (cols.length < 5) continue;
    const feature = cols[1].trim();
    // Status is the 4th content column (index 4 after leading empty from split)
    // Table format: | Feature | Last Tested | Commit | Result | Notes |
    const status = cols[4].trim().toUpperCase();
    if (!feature || feature === 'Feature') continue;
    if (!['PASS', 'FAIL', 'UNTESTED'].includes(status)) continue;
    total++;
    if (status === 'UNTESTED') untested++;
    if (status === 'FAIL') {
      fail++;
      failFeatures.push(feature);
    }
  }

  if (total <= 0) {
    await appendPlanTaskIfMissing(
      planFile,
      '[qa/P1] [finalizer-qa-gate] Fix QA_COVERAGE.md table format so finalizer can enforce coverage',
    );
    return {
      passed: false,
      reason: 'qa_coverage_unparseable',
      message: 'QA_COVERAGE.md did not contain parseable PASS/FAIL/UNTESTED rows',
      qa_total: 0,
      qa_untested: 0,
      qa_fail: 0,
    };
  }

  const untestedPct = Math.floor((untested * 100) / total);
  let blocked = false;

  if (fail > 0) {
    blocked = true;
    for (const f of failFeatures) {
      await appendPlanTaskIfMissing(
        planFile,
        `[qa/P1] [finalizer-qa-gate] Resolve FAIL coverage item: ${f}`,
      );
    }
  }

  if (untestedPct > 30) {
    blocked = true;
    await appendPlanTaskIfMissing(
      planFile,
      `[qa/P1] [finalizer-qa-gate] Reduce UNTESTED QA coverage to <=30% (currently ${untested}/${total}, ${untestedPct}%)`,
    );
  }

  if (blocked) {
    return {
      passed: false,
      reason: 'qa_coverage_blocked',
      message: `QA coverage gate blocked exit (UNTESTED=${untested}/${total}, FAIL=${fail})`,
      qa_total: total,
      qa_untested: untested,
      qa_fail: fail,
    };
  }

  return {
    passed: true,
    reason: 'qa_coverage_pass',
    message: `QA coverage gate passed (UNTESTED=${untested}/${total}, FAIL=${fail})`,
    qa_total: total,
    qa_untested: untested,
    qa_fail: fail,
  };
}

export async function finalizerQaGateCommand(options: { workDir: string }): Promise<void> {
  const result = await runFinalizerQaGate(options.workDir);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.passed ? 0 : 1;
}
