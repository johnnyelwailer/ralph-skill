import { existsSync } from 'node:fs';
import { readFile, readdir, unlink, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
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
        // Create GitHub issues if repo is configured
        const execGhIssueCreate = repo
          ? async (repoName: string, sid: string, title: string, body: string, labels: string[]): Promise<number> => {
              const bodyFile = path.join(requestsDir, `gh-issue-body-${Date.now()}.md`);
              await writeFile(bodyFile, body, 'utf8');
              try {
                const result = spawnSync('gh', ['issue', 'create', '--repo', repoName, '--title', title, '--body-file', bodyFile, ...labels.flatMap(l => ['--label', l])], { encoding: 'utf8' });
                if (result.status === 0 && result.stdout) {
                  const match = result.stdout.match(/(\d+)\s*$/);
                  if (match) return parseInt(match[1], 10);
                  const urlMatch = result.stdout.match(/\/issues\/(\d+)/);
                  if (urlMatch) return parseInt(urlMatch[1], 10);
                }
                console.error(`[process-requests] gh issue create failed: ${result.stderr?.trim()}`);
                return 0;
              } finally {
                try { await unlink(bodyFile); } catch {}
              }
            }
          : undefined;

        state = await applyDecompositionPlan(planObj, state, sessionDir, repo, {
          existsSync,
          readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
          writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
          mkdir: (p: string, opts?: { recursive?: boolean }) => mkdir(p, opts).then(() => undefined),
          now: () => new Date(),
          execGhIssueCreate,
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

  // Apply per-issue sub-decomposition results
  const currentRequestFiles = existsSync(requestsDir) ? await readdir(requestsDir) : [];
  const subDecompFiles = currentRequestFiles.filter(f => f.match(/^sub-decomposition-result-\d+\.json$/));
  for (const file of subDecompFiles) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const parentNum = result.issue_number ?? result.parent_issue_number;
      const parent = state.issues.find((i: any) => i.number === parentNum);
      const subIssues = result.sub_issues ?? [];

      if (parent && subIssues.length > 0) {
        // Create sub-issues as new entries in state + on GitHub
        let nextNum = Math.max(0, ...state.issues.map((i: any) => i.number ?? 0)) + 1;
        for (const sub of subIssues) {
          const subBody = sub.body ?? `Sub-issue of #${parentNum}: ${parent.title}`;
          let ghNumber = 0;

          if (repo) {
            const bodyFile = path.join(requestsDir, `gh-sub-issue-body-${Date.now()}.md`);
            await writeFile(bodyFile, subBody, 'utf8');
            const ghResult = spawnSync('gh', [
              'issue', 'create', '--repo', repo,
              '--title', sub.title,
              '--body-file', bodyFile,
              '--label', 'aloop/auto',
            ], { encoding: 'utf8' });
            try { await unlink(bodyFile); } catch {}
            if (ghResult.status === 0 && ghResult.stdout) {
              const urlMatch = ghResult.stdout.match(/\/issues\/(\d+)/);
              ghNumber = urlMatch ? parseInt(urlMatch[1], 10) : nextNum++;
            } else {
              ghNumber = nextNum++;
            }
          } else {
            ghNumber = nextNum++;
          }

          state.issues.push({
            number: ghNumber,
            title: sub.title,
            body: subBody,
            file_hints: sub.file_hints ?? [],
            wave: parent.wave,
            state: 'pending',
            status: 'Needs refinement',
            child_session: null,
            pr_number: null,
            depends_on: (sub.depends_on ?? []).map((d: number) => d),
            blocked_on_human: false,
            processed_comment_ids: [],
            dor_validated: false,
            parent_issue: parentNum,
          } as any);
          console.log(`[process-requests] Created sub-issue #${ghNumber}: ${sub.title.substring(0, 50)}`);
        }

        // Mark parent as decomposed (no longer dispatchable itself)
        parent.status = 'Needs refinement';
        (parent as any).decomposed = true;
        stateChanged = true;
      }

      // Archive
      const processedDir = path.join(requestsDir, 'processed');
      await mkdir(processedDir, { recursive: true });
      await writeFile(path.join(processedDir, file), await readFile(filePath, 'utf8'), 'utf8');
      await unlink(filePath);
    } catch (e) {
      console.error(`[process-requests] Failed to apply sub-decomposition: ${e}`);
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

  // Apply estimate results — one file per issue: estimate-result-{N}.json
  const requestFiles = existsSync(requestsDir) ? await readdir(requestsDir) : [];
  const estimateFiles = requestFiles.filter(f => f.match(/^estimate-result-\d+\.json$/));
  for (const file of estimateFiles) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const issueNum = result.issue_number;
      const issue = state.issues.find((i: any) => i.number === issueNum);
      if (issue) {
        issue.dor_validated = result.dor_passed ?? true;
        (issue as any).complexity_tier = result.complexity_tier;
        (issue as any).iteration_estimate = result.iteration_estimate;
        if (result.dor_passed) {
          issue.status = 'Ready';
        }
        stateChanged = true;
        console.log(`[process-requests] Issue #${issueNum}: ${result.dor_passed ? 'Ready' : 'needs work'} (${result.complexity_tier})`);
      }
      // Archive
      const processedDir = path.join(requestsDir, 'processed');
      await mkdir(processedDir, { recursive: true });
      await writeFile(path.join(processedDir, file), await readFile(filePath, 'utf8'), 'utf8');
      await unlink(filePath);
    } catch {
      // Malformed — skip
    }
  }

  // Also handle legacy single estimate-results.json (array format)
  const legacyEstimateFile = path.join(requestsDir, 'estimate-results.json');
  if (existsSync(legacyEstimateFile)) {
    try {
      const results = JSON.parse(await readFile(legacyEstimateFile, 'utf8'));
      for (const r of (Array.isArray(results) ? results : [])) {
        const issue = state.issues.find((i: any) => i.number === r.issue_number);
        if (issue && r.dor_passed) {
          issue.dor_validated = true;
          issue.status = 'Ready';
          stateChanged = true;
        }
      }
      await unlink(legacyEstimateFile);
    } catch {
      // Malformed — skip
    }
  }

  // Create GitHub issues for any issues that don't have GH numbers yet
  if (repo && state.issues.length > 0) {
    const needsGh = state.issues.filter((i: any) => !(i as any).gh_number && i.number === 0);
    if (needsGh.length > 0) {
      let nextLocalNumber = Math.max(0, ...state.issues.map((i: any) => i.number ?? 0)) + 1;
      for (const issue of needsGh) {
        try {
          const bodyFile = path.join(requestsDir, `gh-issue-body-${Date.now()}.md`);
          const body = issue.body ?? `## ${issue.title}\n\nNo description provided.`;
          await writeFile(bodyFile, body, 'utf8');
          const labels = ['aloop/epic', 'aloop/auto'];
          const result = spawnSync('gh', [
            'issue', 'create',
            '--repo', repo,
            '--title', issue.title,
            '--body-file', bodyFile,
            ...labels.flatMap((l: string) => ['--label', l]),
          ], { encoding: 'utf8' });

          try { await unlink(bodyFile); } catch {}

          if (result.status === 0 && result.stdout) {
            const urlMatch = result.stdout.match(/\/issues\/(\d+)/);
            const ghNumber = urlMatch ? parseInt(urlMatch[1], 10) : 0;
            if (ghNumber > 0) {
              (issue as any).gh_number = ghNumber;
              issue.number = ghNumber;
              stateChanged = true;
              console.log(`[process-requests] Created GH issue #${ghNumber}: ${issue.title.substring(0, 50)}`);
            }
          } else {
            // Assign local number so we don't retry every pass
            if (issue.number === 0) {
              issue.number = nextLocalNumber++;
              stateChanged = true;
            }
            console.error(`[process-requests] gh issue create failed: ${result.stderr?.trim()}`);
          }
        } catch (e) {
          console.error(`[process-requests] Failed to create GH issue: ${e}`);
        }
      }
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
    dispatchDeps: {
      existsSync,
      readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
      writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
      mkdir: (p: string, opts?: { recursive?: boolean }) => mkdir(p, opts).then(() => undefined),
      cp: (src: string, dest: string, opts?: { recursive?: boolean }) => cp(src, dest, opts),
      now: () => new Date(),
      spawnSync: (cmd: string, args: string[], opts?: Record<string, unknown>) => {
        const r = spawnSync(cmd, args, opts as any);
        return { status: r.status, stdout: r.stdout?.toString() ?? '', stderr: r.stderr?.toString() ?? '' };
      },
      spawn: (cmd: string, args: string[], opts?: Record<string, unknown>) => {
        const child = spawn(cmd, args, opts as any);
        return { pid: child.pid, unref: () => child.unref() };
      },
      platform: process.platform,
      env: process.env as Record<string, string | undefined>,
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
