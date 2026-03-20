import { existsSync } from 'node:fs';
import { readFile, readdir, unlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import {
  runOrchestratorScanPass,
  applyDecompositionPlan,
  applySubDecompositionResults,
  queueEstimateForIssues,
  queueSubDecompositionForIssues,
  type ScanLoopDeps,
  type OrchestratorState,
  type DecompositionPlan,
  type SubDecompositionResult,
} from './orchestrate.js';
import { EtagCache } from '../lib/github-monitor.js';

export interface ProcessRequestsOptions {
  sessionDir: string;
  homeDir?: string;
  output?: string;
}

export async function processRequestsCommand(options: ProcessRequestsOptions): Promise<void> {
  const sessionDir = path.resolve(options.sessionDir);
  const homeDir = resolveHomeDir(options.homeDir);
  const aloopRoot = path.join(homeDir, '.aloop');

  const stateFile = path.join(sessionDir, 'orchestrator.json');
  if (!existsSync(stateFile)) {
    // Not an orchestrator session — nothing to do
    return;
  }

  let state: OrchestratorState = JSON.parse(await readFile(stateFile, 'utf8'));
  const metaFile = path.join(sessionDir, 'meta.json');
  const meta = existsSync(metaFile) ? JSON.parse(await readFile(metaFile, 'utf8')) : {};
  const projectRoot = meta.project_root ?? process.cwd();
  const sessionId = path.basename(sessionDir);
  const promptsDir = path.join(sessionDir, 'prompts');
  const requestsDir = path.join(sessionDir, 'requests');
  const repo = state.filter_repo ?? null;

  // Apply decomposition results if present (produced by decompose agent between iterations)
  let stateChanged = false;
  const epicResultsFile = path.join(requestsDir, 'epic-decomposition-results.json');
  if (existsSync(epicResultsFile) && state.issues.length === 0) {
    try {
      const rawPlan = JSON.parse(await readFile(epicResultsFile, 'utf8'));
      const rawIssues = rawPlan.issues ?? (Array.isArray(rawPlan) ? rawPlan : []);
      // Normalize: ensure each issue has id and depends_on fields
      const normalizedIssues = rawIssues.map((issue: any, idx: number) => ({
        id: issue.id ?? idx + 1,
        title: issue.title ?? `Epic ${idx + 1}`,
        body: issue.body ?? '',
        depends_on: issue.depends_on ?? issue.dependencies ?? [],
        file_hints: issue.file_hints,
      }));
      if (normalizedIssues.length > 0) {
        const planObj: DecompositionPlan = { issues: normalizedIssues };
        state = await applyDecompositionPlan(planObj, state, sessionDir, repo, {
          existsSync,
          readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
          writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
          mkdir: (p: string, opts?: { recursive?: boolean }) => mkdir(p, opts).then(() => undefined),
          now: () => new Date(),
        });
        stateChanged = true;
        console.log(`[process-requests] Applied epic decomposition: ${state.issues.length} issues`);
      }
      // Archive the results file
      const processedDir = path.join(requestsDir, 'processed');
      await mkdir(processedDir, { recursive: true });
      await writeFile(
        path.join(processedDir, 'epic-decomposition-results.json'),
        await readFile(epicResultsFile, 'utf8'),
        'utf8',
      );
      await unlink(epicResultsFile);
    } catch (e) {
      console.error(`[process-requests] Failed to apply decomposition: ${e}`);
    }
  }

  // Apply sub-decomposition results if present
  const subResultsFile = path.join(requestsDir, 'sub-decomposition-results.json');
  if (existsSync(subResultsFile)) {
    try {
      const subResults: SubDecompositionResult[] = JSON.parse(await readFile(subResultsFile, 'utf8'));
      applySubDecompositionResults(state, subResults, new Date());
      stateChanged = true;
      await unlink(subResultsFile);
    } catch {
      // Malformed — skip
    }
  }

  // Advance pipeline: queue prompts based on issue status
  const queueDir = path.join(sessionDir, 'queue');

  // Issues needing sub-decomposition → queue sub-decompose prompts
  const decompTargets = state.issues.filter((i: any) => i.status === 'Needs decomposition');
  if (decompTargets.length > 0) {
    const subDecomposePromptFile = path.join(promptsDir, 'PROMPT_orch_sub_decompose.md');
    if (existsSync(subDecomposePromptFile)) {
      const subDecomposePrompt = await readFile(subDecomposePromptFile, 'utf8');
      await queueSubDecompositionForIssues(state.issues, queueDir, subDecomposePrompt, { writeFile: (p: string, d: string, e: BufferEncoding) => writeFile(p, d, e) });
      console.log(`[process-requests] Queued sub-decomposition for ${decompTargets.length} issues`);
      stateChanged = true;
    }
  }

  // Issues needing refinement → queue estimate/readiness prompts
  const refineTargets = state.issues.filter((i: any) => i.status === 'Needs refinement' && !i.dor_validated);
  if (refineTargets.length > 0) {
    const estimatePromptFile = path.join(promptsDir, 'PROMPT_orch_estimate.md');
    if (existsSync(estimatePromptFile)) {
      const estimatePrompt = await readFile(estimatePromptFile, 'utf8');
      await queueEstimateForIssues(state.issues, queueDir, estimatePrompt, {
        writeFile: (p: string, d: string, e: BufferEncoding) => writeFile(p, d, e),
      });
      console.log(`[process-requests] Queued estimation for ${refineTargets.length} issues`);
      stateChanged = true;
    }
  }

  // Apply estimate results if present
  const estimateResultsFile = path.join(requestsDir, 'estimate-results.json');
  if (existsSync(estimateResultsFile)) {
    try {
      const results = JSON.parse(await readFile(estimateResultsFile, 'utf8'));
      for (const r of results) {
        const issue = state.issues.find((i: any) => i.number === r.issue_number);
        if (issue && r.dor_passed) {
          issue.dor_validated = true;
          issue.status = 'Ready';
        }
      }
      stateChanged = true;
      await unlink(estimateResultsFile);
      console.log(`[process-requests] Applied estimate results`);
    } catch {
      // Malformed — skip
    }
  }

  if (stateChanged) {
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  // Read current iteration from loop-plan.json
  const loopPlanFile = path.join(sessionDir, 'loop-plan.json');
  let iteration = 1;
  if (existsSync(loopPlanFile)) {
    try {
      const plan = JSON.parse(await readFile(loopPlanFile, 'utf8'));
      iteration = plan.iteration ?? 1;
    } catch {
      // ignore
    }
  }

  // Log helper
  const logFile = path.join(sessionDir, 'log.jsonl');
  const appendLog = async (_dir: string, entry: Record<string, unknown>) => {
    let existing = '';
    try {
      if (existsSync(logFile)) {
        existing = await readFile(logFile, 'utf8');
      }
    } catch {
      // File doesn't exist yet
    }
    await writeFile(logFile, `${existing}${JSON.stringify(entry)}\n`, 'utf8');
  };

  // Load ETag cache
  const aloopCacheDir = path.join(aloopRoot, '.cache');
  const etagCache = new EtagCache(aloopCacheDir);
  await etagCache.load();

  // execGh helper — calls aloop gh CLI
  const execGh = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    const { spawnSync } = await import('node:child_process');
    const aloopBin = process.env.ALOOP_BIN ?? 'aloop';
    const result = spawnSync(aloopBin, ['gh', ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  };

  // Build scan deps
  const scanDeps: ScanLoopDeps = {
    existsSync,
    readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
    writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
    readdir: (p: string) => readdir(p),
    unlink: (p: string) => unlink(p),
    now: () => new Date(),
    execGh,
    appendLog,
    etagCache,
    aloopRoot,
    prLifecycleDeps: {
      execGh,
      readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
      writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
      now: () => new Date(),
      appendLog: (dir: string, entry: Record<string, unknown>) => {
        appendLog(dir, entry);
      },
      invokeAgentReview: async (prNumber: number, _repo: string, diff: string) => {
        const resultFile = path.join(requestsDir, `review-result-${prNumber}.json`);
        if (existsSync(resultFile)) {
          try {
            const content = await readFile(resultFile, 'utf8');
            const result = JSON.parse(content);
            await unlink(resultFile);
            return result;
          } catch (e) {
            return {
              pr_number: prNumber,
              verdict: 'flag-for-human',
              summary: `Failed to parse review result: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
        }

        const queueDir = path.join(sessionDir, 'queue');
        const queueFile = path.join(queueDir, `review-${prNumber}.md`);
        if (!existsSync(queueFile)) {
          const reviewPromptPath = path.join(promptsDir, 'PROMPT_orch_review.md');
          if (existsSync(reviewPromptPath)) {
            const reviewPrompt = await readFile(reviewPromptPath, 'utf8');
            await mkdir(queueDir, { recursive: true });
            await writeFile(queueFile, `---\nagent: orch_review\npr_number: ${prNumber}\n---\n\n${reviewPrompt}\n\n## PR Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8');
          }
        }

        return {
          pr_number: prNumber,
          verdict: 'pending',
          summary: 'Review queued and waiting for agent execution.',
        };
      },
    },
  };

  // Run one scan pass
  const result = await runOrchestratorScanPass(
    stateFile,
    sessionDir,
    projectRoot,
    sessionId,
    promptsDir,
    aloopRoot,
    repo,
    iteration,
    scanDeps,
  );

  // Save ETag cache
  await etagCache.save();

  // Report
  const outputMode = options.output ?? 'text';
  if (outputMode === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const parts: string[] = [];
    if (result.dispatched > 0) parts.push(`dispatched: ${result.dispatched}`);
    if (result.queueProcessed > 0) parts.push(`queue: ${result.queueProcessed}`);
    if (result.triage.triaged_entries > 0) parts.push(`triaged: ${result.triage.triaged_entries}`);
    if (result.prLifecycles.length > 0) parts.push(`PRs: ${result.prLifecycles.length}`);
    if (result.allDone) parts.push('ALL DONE');
    if (parts.length > 0) {
      console.log(`[process-requests] ${parts.join(', ')}`);
    }
  }
}
