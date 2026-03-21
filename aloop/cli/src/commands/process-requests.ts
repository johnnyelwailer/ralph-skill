import { existsSync } from 'node:fs';
import { readFile, readdir, unlink, writeFile, mkdir, cp } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import {
  runOrchestratorScanPass,
  applyDecompositionPlan,
  type ScanLoopDeps,
  type OrchestratorState,
  type DecompositionPlan,
} from './orchestrate.js';
import { EtagCache } from '../lib/github-monitor.js';

export interface ProcessRequestsOptions {
  sessionDir: string;
  homeDir?: string;
  output?: string;
}

/**
 * One-shot command called by loop.sh between iterations for orchestrator sessions.
 *
 * Phase 1: Apply agent-produced result files to orchestrator state
 *          (decomposition results, sub-decomposition results, estimate results)
 * Phase 2: Create GH issues for any issues with number === 0
 * Phase 3: Persist state
 * Phase 4: Run one orchestrator scan pass (delegates ALL orchestration logic
 *          to runOrchestratorScanPass — dispatch, triage, PR lifecycle, wave
 *          advancement, budget, child monitoring, etc.)
 */
export async function processRequestsCommand(options: ProcessRequestsOptions): Promise<void> {
  const sessionDir = path.resolve(options.sessionDir);
  const homeDir = resolveHomeDir(options.homeDir);
  const aloopRoot = path.join(homeDir, '.aloop');

  const stateFile = path.join(sessionDir, 'orchestrator.json');
  if (!existsSync(stateFile)) return;

  let state: OrchestratorState = JSON.parse(await readFile(stateFile, 'utf8'));
  const metaFile = path.join(sessionDir, 'meta.json');
  const meta = existsSync(metaFile) ? JSON.parse(await readFile(metaFile, 'utf8')) : {};
  const projectRoot = meta.project_root ?? process.cwd();
  const sessionId = path.basename(sessionDir);
  const promptsDir = path.join(sessionDir, 'prompts');
  const requestsDir = path.join(sessionDir, 'requests');
  const repo = state.filter_repo ?? null;
  let stateChanged = false;

  // ── Phase 1: Apply agent-produced result files ──

  // 1a. Epic decomposition results → apply to state
  const epicResultsFile = path.join(requestsDir, 'epic-decomposition-results.json');
  if (existsSync(epicResultsFile) && state.issues.length === 0) {
    try {
      const rawPlan = JSON.parse(await readFile(epicResultsFile, 'utf8'));
      const rawIssues = rawPlan.issues ?? (Array.isArray(rawPlan) ? rawPlan : []);
      const normalizedIssues = rawIssues.map((issue: any, idx: number) => ({
        id: issue.id ?? idx + 1,
        title: issue.title ?? `Epic ${idx + 1}`,
        body: issue.body ?? '',
        depends_on: issue.depends_on ?? issue.dependencies ?? [],
        file_hints: issue.file_hints,
      }));
      if (normalizedIssues.length > 0) {
        const ghIssueCreator = repo ? makeGhIssueCreator(requestsDir) : undefined;
        state = await applyDecompositionPlan(
          { issues: normalizedIssues } as DecompositionPlan,
          state, sessionDir, repo,
          { existsSync, readFile: (p: string, e: BufferEncoding) => readFile(p, e), writeFile: (p: string, d: string, e: BufferEncoding) => writeFile(p, d, e), mkdir: (p: string, o?: { recursive?: boolean }) => mkdir(p, o).then(() => undefined), now: () => new Date(), execGhIssueCreate: ghIssueCreator },
        );
        stateChanged = true;
        console.log(`[process-requests] Applied epic decomposition: ${state.issues.length} issues`);
      }
      await archiveRequestFile(requestsDir, epicResultsFile);
    } catch (e) {
      console.error(`[process-requests] Failed to apply decomposition: ${e}`);
    }
  }

  // 1b. Sub-decomposition results → create sub-issues in state + GH
  const allFiles = existsSync(requestsDir) ? await readdir(requestsDir) : [];
  for (const file of allFiles.filter(f => f.match(/^sub-decomposition-result-\d+\.json$/))) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const parentNum = result.issue_number ?? result.parent_issue_number;
      const parent = state.issues.find((i: any) => i.number === parentNum);
      const subIssues = result.sub_issues ?? [];
      if (parent && subIssues.length > 0) {
        let nextNum = Math.max(0, ...state.issues.map((i: any) => i.number ?? 0)) + 1;
        for (const sub of subIssues) {
          const ghNumber = repo ? await createGhIssue(repo, sub.title, sub.body ?? '', ['aloop/auto'], requestsDir) : nextNum++;
          state.issues.push({
            number: ghNumber || nextNum++,
            title: sub.title, body: sub.body ?? '', file_hints: sub.file_hints ?? [],
            wave: parent.wave, state: 'pending', status: 'Needs refinement',
            child_session: null, pr_number: null,
            depends_on: sub.depends_on ?? [], blocked_on_human: false,
            processed_comment_ids: [], dor_validated: false,
          } as any);
          console.log(`[process-requests] Created sub-issue #${ghNumber || nextNum - 1}: ${sub.title.substring(0, 50)}`);
        }
        parent.status = 'Needs refinement';
        (parent as any).decomposed = true;
        stateChanged = true;
        // Update parent with tasklist on GH
        if (repo && parentNum > 0) {
          await updateParentTasklist(repo, parentNum, state.issues, requestsDir);
        }
      }
      await archiveRequestFile(requestsDir, filePath);
    } catch (e) {
      console.error(`[process-requests] Failed to apply sub-decomposition: ${e}`);
    }
  }

  // 1c. Estimate results → apply to state (per-issue files)
  for (const file of allFiles.filter(f => f.match(/^estimate-result-\d+\.json$/))) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const issue = state.issues.find((i: any) => i.number === result.issue_number);
      if (issue) {
        issue.dor_validated = result.dor_passed ?? true;
        (issue as any).complexity_tier = result.complexity_tier;
        (issue as any).iteration_estimate = result.iteration_estimate;
        if (result.dor_passed) issue.status = 'Ready';
        stateChanged = true;
        console.log(`[process-requests] Issue #${result.issue_number}: ${result.dor_passed ? 'Ready' : 'needs work'}`);
      }
      await archiveRequestFile(requestsDir, filePath);
    } catch { /* skip malformed */ }
  }

  // ── Phase 2: Create GH issues for state entries with number=0 ──
  if (repo) {
    for (const issue of state.issues.filter((i: any) => i.number === 0)) {
      const labels = (issue as any).parent_issue ? ['aloop/auto'] : ['aloop/epic', 'aloop/auto'];
      const ghNum = await createGhIssue(repo, issue.title, issue.body ?? '', labels, requestsDir);
      if (ghNum > 0) {
        issue.number = ghNum;
        (issue as any).gh_number = ghNum;
        stateChanged = true;
        console.log(`[process-requests] Created GH issue #${ghNum}: ${issue.title.substring(0, 50)}`);
      }
    }
  }

  // ── Phase 2b: Create PRs for completed children ──
  if (repo) {
    for (const issue of state.issues) {
      if (!issue.child_session) continue;
      if (issue.pr_number) continue; // PR already exists
      if (issue.status === 'In progress' || issue.status === 'Ready') {
        // Check if child is completed
        const childDir = path.join(aloopRoot, 'sessions', issue.child_session);
        const childStatusFile = path.join(childDir, 'status.json');
        if (existsSync(childStatusFile)) {
          try {
            const childStatus = JSON.parse(await readFile(childStatusFile, 'utf8'));
            if (childStatus.state === 'completed' || childStatus.state === 'stopped') {
              const branch = `aloop/issue-${issue.number}`;
              const trunkBranch = state.trunk_branch ?? 'agent/trunk';
              const childWorktree = path.join(childDir, 'worktree');

              // Clean working artifacts from branch before PR
              const artifacts = ['TODO.md', 'STEERING.md', 'QA_COVERAGE.md', 'QA_LOG.md', 'REVIEW_LOG.md'];
              for (const art of artifacts) {
                spawnSync('git', ['-C', childWorktree, 'rm', '--cached', '--ignore-unmatch', art], { encoding: 'utf8' });
              }
              const rmStatus = spawnSync('git', ['-C', childWorktree, 'status', '--porcelain'], { encoding: 'utf8' });
              if (rmStatus.stdout?.trim()) {
                spawnSync('git', ['-C', childWorktree, 'commit', '-m', 'chore: remove working artifacts from PR'], { encoding: 'utf8' });
                spawnSync('git', ['-C', childWorktree, 'push', 'origin', 'HEAD'], { encoding: 'utf8' });
              }

              // Create PR
              const prResult = spawnSync('gh', [
                'pr', 'create',
                '--repo', repo,
                '--title', `${issue.title}`,
                '--body', `Closes #${issue.number}\n\nAutomated PR from child loop session \`${issue.child_session}\`.`,
                '--head', branch,
                '--base', trunkBranch,
              ], { encoding: 'utf8' });

              if (prResult.status === 0 && prResult.stdout) {
                const urlMatch = prResult.stdout.match(/\/pull\/(\d+)/);
                if (urlMatch) {
                  issue.pr_number = parseInt(urlMatch[1], 10);
                  issue.state = 'pr_open';
                  issue.status = 'In review';
                  stateChanged = true;
                  console.log(`[process-requests] Created PR #${issue.pr_number} for issue #${issue.number}`);
                }
              } else {
                const err = prResult.stderr?.trim() ?? '';
                // Don't spam — only log if it's not "no commits" or "already exists"
                if (!err.includes('already exists') && !err.includes('No commits')) {
                  console.error(`[process-requests] PR create failed for #${issue.number}: ${err.substring(0, 100)}`);
                }
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  // ── Phase 3: Persist state + clean active.json ──
  if (stateChanged) {
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  // Clean dead sessions from active.json
  const activePath = path.join(aloopRoot, 'active.json');
  if (existsSync(activePath)) {
    try {
      const active = JSON.parse(await readFile(activePath, 'utf8'));
      let cleaned = false;
      for (const [key, val] of Object.entries(active)) {
        const pid = (val as any)?.pid;
        if (pid && !existsSync(`/proc/${pid}`)) {
          delete active[key];
          cleaned = true;
        }
      }
      if (cleaned) {
        await writeFile(activePath, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
      }
    } catch { /* ignore */ }
  }

  // ── Phase 4: Run one orchestrator scan pass ──
  // This delegates ALL orchestration to the existing runOrchestratorScanPass:
  // triage, dispatch, child monitoring, PR lifecycle, wave advancement, budget, etc.

  const loopPlanFile = path.join(sessionDir, 'loop-plan.json');
  let iteration = 1;
  try {
    if (existsSync(loopPlanFile)) {
      iteration = JSON.parse(await readFile(loopPlanFile, 'utf8')).iteration ?? 1;
    }
  } catch { /* ignore */ }

  const logFile = path.join(sessionDir, 'log.jsonl');
  const appendLog = async (_dir: string, entry: Record<string, unknown>) => {
    const existing = existsSync(logFile) ? await readFile(logFile, 'utf8').catch(() => '') : '';
    await writeFile(logFile, `${existing}${JSON.stringify(entry)}\n`, 'utf8');
  };

  const etagCache = new EtagCache(path.join(aloopRoot, '.cache'));
  await etagCache.load();

  const execGh = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    // Call gh CLI directly (not aloop gh which is the request protocol handler)
    const r = spawnSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

  const execGit = async (args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> => {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd: cwd ?? projectRoot, stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

  const scanDeps: ScanLoopDeps = {
    existsSync,
    readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
    writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
    readdir: (p: string) => readdir(p),
    unlink: (p: string) => unlink(p),
    now: () => new Date(),
    execGh,
    execGit,
    appendLog,
    etagCache,
    aloopRoot,
    prLifecycleDeps: {
      execGh,
      readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
      writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
      now: () => new Date(),
      appendLog: (dir: string, entry: Record<string, unknown>) => { appendLog(dir, entry); },
      invokeAgentReview: async (prNumber: number, _repo: string, diff: string) => {
        const resultFile = path.join(requestsDir, `review-result-${prNumber}.json`);
        if (existsSync(resultFile)) {
          try {
            const content = await readFile(resultFile, 'utf8');
            const parsed = JSON.parse(content);
            await unlink(resultFile);
            return parsed;
          } catch (e) {
            return { pr_number: prNumber, verdict: 'flag-for-human', summary: `Parse error: ${e}` };
          }
        }
        // Prefix with 000- so reviews sort before estimates/sub-decompose
        const queueFile = path.join(sessionDir, 'queue', `000-review-${prNumber}.md`);
        const legacyQueueFile = path.join(sessionDir, 'queue', `review-${prNumber}.md`);
        if (!existsSync(queueFile) && !existsSync(legacyQueueFile)) {
          const reviewPath = path.join(promptsDir, 'PROMPT_orch_review.md');
          if (existsSync(reviewPath)) {
            const prompt = await readFile(reviewPath, 'utf8');
            await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
            await writeFile(queueFile, `---\nagent: orch_review\npr_number: ${prNumber}\n---\n\n${prompt}\n\n## PR Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8');
          }
        }
        return { pr_number: prNumber, verdict: 'pending', summary: 'Review queued.' };
      },
    },
    dispatchDeps: {
      existsSync,
      readFile: (p: string, enc: BufferEncoding) => readFile(p, enc),
      writeFile: (p: string, data: string, enc: BufferEncoding) => writeFile(p, data, enc),
      mkdir: (p: string, o?: { recursive?: boolean }) => mkdir(p, o).then(() => undefined),
      cp: (src: string, dest: string, o?: { recursive?: boolean }) => cp(src, dest, o),
      now: () => new Date(),
      spawnSync: (cmd: string, a: string[], o?: Record<string, unknown>) => {
        const r = spawnSync(cmd, a, o as any);
        return { status: r.status, stdout: r.stdout?.toString() ?? '', stderr: r.stderr?.toString() ?? '' };
      },
      spawn: (cmd: string, a: string[], o?: Record<string, unknown>) => {
        const child = spawn(cmd, a, o as any);
        return { pid: child.pid, unref: () => child.unref() };
      },
      platform: process.platform,
      env: process.env as Record<string, string | undefined>,
    },
  };

  const result = await runOrchestratorScanPass(
    stateFile, sessionDir, projectRoot, sessionId, promptsDir, aloopRoot, repo, iteration, scanDeps,
  );

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

// ── Helpers ──

async function archiveRequestFile(requestsDir: string, filePath: string): Promise<void> {
  const processedDir = path.join(requestsDir, 'processed');
  await mkdir(processedDir, { recursive: true });
  await writeFile(path.join(processedDir, path.basename(filePath)), await readFile(filePath, 'utf8'), 'utf8');
  await unlink(filePath);
}

async function createGhIssue(repo: string, title: string, body: string, labels: string[], requestsDir: string): Promise<number> {
  const bodyFile = path.join(requestsDir, `gh-issue-body-${Date.now()}.md`);
  await writeFile(bodyFile, body, 'utf8');
  try {
    const result = spawnSync('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body-file', bodyFile, ...labels.flatMap(l => ['--label', l])], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout) {
      const urlMatch = result.stdout.match(/\/issues\/(\d+)/);
      if (urlMatch) return parseInt(urlMatch[1], 10);
    }
    console.error(`[process-requests] gh issue create failed: ${result.stderr?.trim()}`);
    return 0;
  } finally {
    try { await unlink(bodyFile); } catch {}
  }
}

function makeGhIssueCreator(requestsDir: string) {
  return async (_repo: string, _sid: string, title: string, body: string, labels: string[]): Promise<number> => {
    return createGhIssue(_repo, title, body, labels, requestsDir);
  };
}

async function updateParentTasklist(repo: string, parentNum: number, issues: any[], requestsDir: string): Promise<void> {
  const subNums = issues.filter((i: any) => i.parent_issue === parentNum && i.number > 0).map((i: any) => i.number);
  if (subNums.length === 0) return;
  try {
    const viewResult = spawnSync('gh', ['issue', 'view', String(parentNum), '--repo', repo, '--json', 'body'], { encoding: 'utf8' });
    if (viewResult.status !== 0) return;
    const currentBody = JSON.parse(viewResult.stdout).body ?? '';
    if (currentBody.includes('[tasklist]')) return;
    const tasklist = `\n\`\`\`[tasklist]\n### Sub-issues\n${subNums.map((n: number) => `- [ ] #${n}`).join('\n')}\n\`\`\``;
    const bodyFile = path.join(requestsDir, `gh-parent-body-${Date.now()}.md`);
    await writeFile(bodyFile, currentBody + tasklist, 'utf8');
    spawnSync('gh', ['issue', 'edit', String(parentNum), '--repo', repo, '--body-file', bodyFile], { encoding: 'utf8' });
    try { await unlink(bodyFile); } catch {}
    console.log(`[process-requests] Updated epic #${parentNum} with ${subNums.length} sub-issue tasklist`);
  } catch { /* non-critical */ }
}
