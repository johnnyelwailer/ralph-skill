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
  const ghProjectNumber = (state as any).gh_project_number ?? meta.gh_project_number ?? null;
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
          const subTitle = sub.title;
          const subBody = `Part of #${parentNum}: ${parent.title}\n\n${sub.body ?? ''}`;
          const ghNumber = repo ? await createGhIssue(repo, subTitle, subBody, ['aloop/auto'], requestsDir) : nextNum++;
          state.issues.push({
            number: ghNumber || nextNum++,
            title: subTitle, body: subBody, file_hints: sub.file_hints ?? [],
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

  // ── Phase 2b: Forward-merge master → agent/trunk (pick up human changes) ──
  const trunkBranch = state.trunk_branch ?? 'agent/trunk';
  try {
    spawnSync('git', ['-C', projectRoot, 'fetch', 'origin', 'master', trunkBranch], { encoding: 'utf8' });
    const mergeBase = spawnSync('git', ['-C', projectRoot, 'merge-base', `origin/master`, `origin/${trunkBranch}`], { encoding: 'utf8' });
    const masterHead = spawnSync('git', ['-C', projectRoot, 'rev-parse', 'origin/master'], { encoding: 'utf8' });
    if (mergeBase.stdout?.trim() !== masterHead.stdout?.trim()) {
      // master has commits that trunk doesn't — forward merge
      const mergeResult = spawnSync('git', ['-C', projectRoot, 'push', 'origin', `origin/master:refs/heads/${trunkBranch}`], { encoding: 'utf8' });
      if (mergeResult.status !== 0) {
        // Can't fast-forward — need a real merge via worktree
        const tmpMerge = path.join(aloopRoot, 'tmp-trunk-merge');
        spawnSync('git', ['-C', projectRoot, 'worktree', 'add', tmpMerge, trunkBranch], { encoding: 'utf8' });
        const result = spawnSync('git', ['-C', tmpMerge, 'merge', 'origin/master', '--no-edit', '-m', 'Merge master into agent/trunk'], { encoding: 'utf8' });
        if (result.status === 0) {
          spawnSync('git', ['-C', tmpMerge, 'push', 'origin', 'HEAD'], { encoding: 'utf8' });
          console.log(`[process-requests] Forward-merged master → ${trunkBranch}`);
        } else {
          spawnSync('git', ['-C', tmpMerge, 'merge', '--abort'], { encoding: 'utf8' });
        }
        spawnSync('git', ['-C', projectRoot, 'worktree', 'remove', '--force', tmpMerge], { encoding: 'utf8' });
        spawnSync('git', ['-C', projectRoot, 'worktree', 'prune'], { encoding: 'utf8' });
      } else {
        console.log(`[process-requests] Fast-forwarded ${trunkBranch} to master`);
      }
    }
  } catch { /* best effort */ }

  // ── Phase 2c: Sync child branches with base branch ──
  for (const issue of state.issues) {
    if (!issue.child_session) continue;
    if (issue.state !== 'in_progress' && issue.state !== 'pr_open') continue;
    const childDir = path.join(aloopRoot, 'sessions', issue.child_session);
    const childWorktree = path.join(childDir, 'worktree');
    if (!existsSync(childWorktree)) continue;

    // Fetch and check if diverged
    const fetchResult = spawnSync('git', ['-C', childWorktree, 'fetch', 'origin', trunkBranch], { encoding: 'utf8' });
    if (fetchResult.status !== 0) continue;

    const mergeBase = spawnSync('git', ['-C', childWorktree, 'merge-base', 'HEAD', `origin/${trunkBranch}`], { encoding: 'utf8' });
    const remoteHead = spawnSync('git', ['-C', childWorktree, 'rev-parse', `origin/${trunkBranch}`], { encoding: 'utf8' });
    if (mergeBase.stdout?.trim() === remoteHead.stdout?.trim()) continue; // Up to date

    // Commit any dirty files and remove working artifacts before rebase
    const statusResult = spawnSync('git', ['-C', childWorktree, 'status', '--porcelain'], { encoding: 'utf8' });
    if (statusResult.stdout?.trim()) {
      // Untrack working artifacts from git (keep on disk — child still needs them)
      for (const art of ['TODO.md', 'STEERING.md', 'QA_COVERAGE.md', 'QA_LOG.md', 'REVIEW_LOG.md']) {
        spawnSync('git', ['-C', childWorktree, 'rm', '-f', '--cached', art], { encoding: 'utf8' });
      }
      spawnSync('git', ['-C', childWorktree, 'add', '-A'], { encoding: 'utf8' });
      spawnSync('git', ['-C', childWorktree, 'commit', '--allow-empty', '-m', 'chore: save work-in-progress before rebase'], { encoding: 'utf8' });
    }

    // Try rebase
    const rebaseResult = spawnSync('git', ['-C', childWorktree, 'rebase', `origin/${trunkBranch}`], { encoding: 'utf8' });
    if (rebaseResult.status === 0) {
      spawnSync('git', ['-C', childWorktree, 'push', 'origin', 'HEAD', '--force-with-lease'], { encoding: 'utf8' });
      console.log(`[process-requests] Synced #${issue.number} with ${trunkBranch}`);
    } else {
      // Conflict — abort rebase, queue merge agent
      spawnSync('git', ['-C', childWorktree, 'rebase', '--abort'], { encoding: 'utf8' });
      const mergeQueueFile = path.join(childDir, 'queue', '000-merge-conflict.md');
      if (!existsSync(mergeQueueFile)) {
        const mergePromptPath = path.join(childDir, 'prompts', 'PROMPT_merge.md');
        const mergePrompt = existsSync(mergePromptPath) ? await readFile(mergePromptPath, 'utf8') : '# Merge Conflict Resolution';
        await mkdir(path.join(childDir, 'queue'), { recursive: true });
        await writeFile(mergeQueueFile, `---\nagent: merge\nreasoning: high\n---\n\n${mergePrompt}\n\n## Conflict\n\nRebase onto \`origin/${trunkBranch}\` failed.\nRun \`git fetch origin ${trunkBranch} && git rebase origin/${trunkBranch}\`, resolve conflicts, then \`git rebase --continue && git push origin HEAD --force-with-lease\`.\n`, 'utf8');
        console.log(`[process-requests] Merge conflict on #${issue.number} — queued merge agent`);
      }
    }
  }

  // ── Phase 2c: Create PRs for completed children ──
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
                '--title', `#${issue.number}: ${issue.title}`,
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

  // ── Phase 2d: Cleanup worktrees + V8 cache for fully completed children ──
  try {
    for (const issue of state.issues) {
      if ((issue.state === 'merged' || issue.state === 'failed') && issue.child_session) {
        const childDir = path.join(aloopRoot, 'sessions', issue.child_session);
        const childWorktree = path.join(childDir, 'worktree');
        const childV8Cache = path.join(childDir, '.v8-cache');
        if (existsSync(childWorktree)) {
          spawnSync('git', ['-C', projectRoot, 'worktree', 'remove', '--force', childWorktree], { encoding: 'utf8' });
          spawnSync('git', ['-C', projectRoot, 'worktree', 'prune'], { encoding: 'utf8' });
          console.log(`[process-requests] Cleaned worktree for completed #${issue.number}`);
        }
        if (existsSync(childV8Cache)) {
          spawnSync('rm', ['-rf', childV8Cache], { encoding: 'utf8' });
        }
      }
    }
  } catch { /* cleanup is best-effort */ }

  // ── Phase 2e: Sync issue statuses to GH project ──
  if (repo && stateChanged && ghProjectNumber) {
    try {
      // Get project items and their current statuses
      const projResult = spawnSync('gh', ['api', 'graphql', '-f', `query={ user(login: "${repo.split('/')[0]}") { projectV2(number: ${ghProjectNumber}) { id items(first: 100) { nodes { id content { ... on Issue { number } } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (projResult.status === 0) {
        const projData = JSON.parse(projResult.stdout);
        const projV2 = projData?.data?.user?.projectV2 ?? {};
        const items = projV2?.items?.nodes ?? [];
        const itemMap = new Map<number, { id: string; status: string }>();
        for (const item of items) {
          const num = item?.content?.number;
          const status = item?.fieldValueByName?.name ?? '';
          if (num) itemMap.set(num, { id: item.id, status });
        }

        // Fetch status field options dynamically (never hardcode IDs)
        const fieldResult = spawnSync('gh', ['api', 'graphql', '-f', `query={ user(login: "${repo.split('/')[0]}") { projectV2(number: ${ghProjectNumber}) { field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (fieldResult.status !== 0) throw new Error('field query failed');
        const fieldData = JSON.parse(fieldResult.stdout);
        const statusField = fieldData?.data?.user?.projectV2?.field ?? {};
        const statusFieldId = statusField.id;
        const projectId = projV2.id ?? projData?.data?.user?.projectV2?.id;
        const optionIds = new Map<string, string>();
        for (const opt of statusField.options ?? []) {
          optionIds.set(opt.name.toLowerCase(), opt.id);
        }

        if (statusFieldId && projectId) {
          let synced = 0;
          for (const issue of state.issues) {
            const item = itemMap.get(issue.number);
            if (!item) continue;
            const targetStatus = (issue.status ?? '').toLowerCase();
            if (item.status.toLowerCase() === targetStatus) continue;
            const optionId = optionIds.get(targetStatus);
            if (!optionId) continue;
            spawnSync('gh', ['api', 'graphql', '-f', `query=mutation { updateProjectV2ItemFieldValue(input: { projectId: "${projectId}" itemId: "${item.id}" fieldId: "${statusFieldId}" value: { singleSelectOptionId: "${optionId}" } }) { projectV2Item { id } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            synced++;
          }
          if (synced > 0) console.log(`[process-requests] Synced ${synced} issue statuses to GH project`);
        }
      }
    } catch { /* best-effort */ }
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
        // 1. Check for result files (agent wrote verdict)
        const resultFile = path.join(requestsDir, `review-result-${prNumber}.json`);
        const worktreeResultFile = path.join(sessionDir, 'worktree', 'requests', `review-result-${prNumber}.json`);
        const actualResultFile = existsSync(resultFile) ? resultFile : existsSync(worktreeResultFile) ? worktreeResultFile : null;
        if (actualResultFile) {
          try {
            const content = await readFile(actualResultFile, 'utf8');
            const parsed = JSON.parse(content);
            await unlink(actualResultFile);
            return parsed;
          } catch (e) {
            return { pr_number: prNumber, verdict: 'flag-for-human', summary: `Parse error: ${e}` };
          }
        }

        // 2. Fallback: scan per-iteration output for verdict text
        const artifactsDir = path.join(sessionDir, 'artifacts');
        if (existsSync(artifactsDir)) {
          try {
            const iterDirs = await readdir(artifactsDir);
            const sorted = iterDirs.filter(d => d.startsWith('iter-')).sort().reverse().slice(0, 3);
            for (const iterDir of sorted) {
              const outputFile = path.join(artifactsDir, iterDir, 'output.txt');
              if (!existsSync(outputFile)) continue;
              const output = await readFile(outputFile, 'utf8');
              if (!output.includes(String(prNumber)) && !output.includes(`PR #${prNumber}`)) continue;
              const verdictMatch = output.match(/\*\*(?:Review\s+)?[Vv]erdict[:\s]+(approve|request-changes|flag-for-human)\*\*/i)
                ?? output.match(/(?:review\s+)?verdict[:\s]+"?(approve|request-changes|flag-for-human)"?/i)
                ?? (output.match(new RegExp(`PR\\s*#?${prNumber}.*review\\s+approved`, 'i')) ? [null, 'approve'] as unknown as RegExpMatchArray : null)
                ?? (output.match(new RegExp(`merge-pr-${prNumber}`, 'i')) ? [null, 'approve'] as unknown as RegExpMatchArray : null);
              if (verdictMatch) {
                const verdict = verdictMatch[1].toLowerCase();
                const summaryMatch = output.match(/(?:summary|reason|feedback|issues?)[:\s]+([^\n]{10,300})/i);
                const summary = summaryMatch ? summaryMatch[1].trim() : `Agent verdict: ${verdict}`;
                return { pr_number: prNumber, verdict, summary };
              }
            }
          } catch { /* ignore */ }
        }

        // 2b. Also check raw log (last 10KB) — scan agent may produce verdict inline
        const rawLogFile = path.join(sessionDir, 'log.jsonl.raw');
        if (existsSync(rawLogFile)) {
          try {
            const rawLog = await readFile(rawLogFile, 'utf8');
            const recent = rawLog.slice(-10000);
            if (recent.includes(String(prNumber)) || recent.includes(`PR #${prNumber}`)) {
              const verdictMatch = recent.match(new RegExp(`PR\\s*#?${prNumber}[^\\n]*(?:review\\s+)?verdict[:\\s]+(approve|request-changes|flag-for-human)`, 'i'))
                ?? recent.match(new RegExp(`\\*\\*(?:Review\\s+)?[Vv]erdict[:\\s]+(approve|request-changes|flag-for-human)\\*\\*[^\\n]*PR\\s*#?${prNumber}`, 'i'))
                ?? recent.match(new RegExp(`\\*\\*(?:Review\\s+)?[Vv]erdict[:\\s]+(approve|request-changes|flag-for-human)\\*\\*.*?${prNumber}`, 'is'))
                ?? (recent.match(new RegExp(`PR\\s*#?${prNumber}.*review\\s+approved`, 'i')) ? [null, 'approve'] as unknown as RegExpMatchArray : null);
              if (verdictMatch && verdictMatch[1]) {
                const verdict = verdictMatch[1].toLowerCase();
                return { pr_number: prNumber, verdict, summary: `Verdict from scan agent output` };
              }
            }
          } catch { /* ignore */ }
        }

        // 2c. Last resort: queue a verdict extraction prompt for the agent
        // The scan agent produced review text but we couldn't parse the verdict — ask an agent to extract it
        const rawLogFile2 = path.join(sessionDir, 'log.jsonl.raw');
        if (existsSync(rawLogFile2)) {
          try {
            const rawLog = await readFile(rawLogFile2, 'utf8');
            const recent = rawLog.slice(-8000);
            // Only if the raw log mentions this PR
            if (recent.includes(String(prNumber)) || recent.includes(`PR #${prNumber}`)) {
              const extractQueueFile = path.join(sessionDir, 'queue', `000-extract-verdict-${prNumber}.md`);
              if (!existsSync(extractQueueFile)) {
                const resultPath = path.join(requestsDir, `review-result-${prNumber}.json`);
                await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
                await writeFile(extractQueueFile, `---\nagent: verdict_extract\nreasoning: low\n---\n\n# Extract Review Verdict\n\nRead the following agent output and extract the review verdict for PR #${prNumber}.\n\nWrite the result to \`${resultPath}\` as JSON:\n\`{"pr_number": ${prNumber}, "verdict": "approve"|"request-changes"|"flag-for-human", "summary": "one line summary"}\`\n\nIf no clear verdict is found for this specific PR, write: \`{"pr_number": ${prNumber}, "verdict": "pending", "summary": "No verdict found in output"}\`\n\n## Recent Agent Output\n\n\`\`\`\n${recent.slice(-4000)}\n\`\`\`\n`, 'utf8');
              }
            }
          } catch { /* ignore */ }
        }

        // 3. Check if PR head commit has already been reviewed (prevent spam)
        const stateIssue = state.issues.find((i: any) => i.pr_number === prNumber);
        if (stateIssue && repo) {
          try {
            const headResult = spawnSync('gh', ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'headRefOid'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            if (headResult.status === 0) {
              const headSha = JSON.parse(headResult.stdout).headRefOid;
              if (headSha && (stateIssue as any).last_reviewed_sha === headSha) {
                return { pr_number: prNumber, verdict: 'pending', summary: 'Already reviewed this commit, waiting for new push.' };
              }
              // Store SHA — will be saved after verdict
              (stateIssue as any).last_reviewed_sha = headSha;
            }
          } catch { /* ignore */ }
        }

        // 4. Queue review prompt with PR comments history
        const queueFile = path.join(sessionDir, 'queue', `000-review-${prNumber}.md`);
        const legacyQueueFile = path.join(sessionDir, 'queue', `review-${prNumber}.md`);
        if (!existsSync(queueFile) && !existsSync(legacyQueueFile)) {
          const reviewPath = path.join(promptsDir, 'PROMPT_orch_review.md');
          if (existsSync(reviewPath)) {
            const prompt = await readFile(reviewPath, 'utf8');
            await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
            const resultPath = path.join(requestsDir, `review-result-${prNumber}.json`);
            const outputInstr = `\n\n## Output\n\nWrite your verdict to \`${resultPath}\` as JSON: \`{"pr_number": ${prNumber}, "verdict": "approve"|"request-changes"|"flag-for-human", "summary": "..."}\`\n\nIMPORTANT: Use the EXACT absolute path above.\n`;

            // Fetch existing PR comments for context
            let commentHistory = '';
            if (repo) {
              try {
                const commentsResult = spawnSync('gh', ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'comments', '--jq', '.comments[].body'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                if (commentsResult.status === 0 && commentsResult.stdout?.trim()) {
                  commentHistory = `\n\n## Previous Review Comments\n\nThe following comments have already been posted on this PR. Do NOT repeat the same feedback. Only comment on NEW issues or acknowledge fixes.\n\n${commentsResult.stdout.trim()}\n`;
                }
              } catch { /* ignore */ }
            }

            await writeFile(queueFile, `---\nagent: orch_review\npr_number: ${prNumber}\n---\n\n${prompt}\n${outputInstr}${commentHistory}\n## PR Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8');
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
