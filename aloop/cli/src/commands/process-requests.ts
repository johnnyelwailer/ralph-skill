import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, unlink, writeFile, mkdir, cp, stat, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveHomeDir } from './session.js';
import {
  runOrchestratorScanPass,
  applyDecompositionPlan,
  type ScanLoopDeps,
  type OrchestratorState,
  type OrchestratorIssue,
  type DecompositionPlan,
} from './orchestrate.js';
import { processCrResultFiles, type CrResultDeps } from './cr-pipeline.js';
export type { CrResultDeps };
export { processCrResultFiles };
import { EtagCache } from '../lib/github-monitor.js';
import { deriveComponentLabels } from '../lib/labels.js';
import { buildPrBody, ensureMetadataSection, buildIssueLabels } from '../lib/issue-metadata.js';

// --- Orchestrator event system (data-driven from pipeline.yml) ---

interface OrchestratorEvent {
  agent: string;
  prompt: string;
  batch: number;
  filter: Record<string, unknown>;
  resultPattern: string;
}

function loadOrchestratorEvents(pipelineYmlPath: string): OrchestratorEvent[] {
  if (!existsSync(pipelineYmlPath)) return [];
  try {
    const content = readFileSync(pipelineYmlPath, 'utf8');
    // Minimal YAML parser for orchestrator_events section
    const eventsMatch = content.match(/^orchestrator_events:\s*\n((?:[\s#].*\n?)*)/m);
    if (!eventsMatch) return [];

    const events: OrchestratorEvent[] = [];
    const lines = eventsMatch[1].split('\n');
    let current: Partial<OrchestratorEvent> | null = null;
    let inFilter = false;
    let filter: Record<string, unknown> = {};

    for (const line of lines) {
      const trimmed = line.replace(/#.*$/, '').trimEnd();
      if (!trimmed || trimmed.match(/^\s*$/)) continue;

      const indent = line.search(/\S/);
      // Top-level event name (2-space indent)
      const stripped = trimmed.trim();
      if (indent === 2 && stripped.endsWith(':') && !stripped.slice(0, -1).includes(' ')) {
        if (current?.agent && current?.prompt) {
          events.push({ ...current, filter, resultPattern: current.resultPattern ?? '' } as OrchestratorEvent);
        }
        current = { agent: stripped.replace(':', '') };
        filter = {};
        inFilter = false;
        continue;
      }

      const kvMatch = trimmed.match(/^\s+(\w+):\s*(.+)$/);
      if (!kvMatch) {
        if (trimmed.match(/^\s+filter:\s*$/)) { inFilter = true; continue; }
        continue;
      }
      const [, key, rawVal] = kvMatch;
      const val = rawVal.replace(/^["']|["']$/g, '').trim();

      if (inFilter && indent >= 6) {
        filter[key] = val === 'true' ? true : val === 'false' ? false : val;
      } else {
        inFilter = false;
        if (current) {
          if (key === 'prompt') current.prompt = val;
          else if (key === 'batch') current.batch = Number(val);
          else if (key === 'result_pattern') current.resultPattern = val;
        }
      }
    }
    if (current?.agent && current?.prompt) {
      events.push({ ...current, filter, resultPattern: current.resultPattern ?? '' } as OrchestratorEvent);
    }
    return events;
  } catch {
    return [];
  }
}

function buildQueuePrompt(agent: string, issue: any, promptContent: string, outputPath: string): string {
  return [
    '---',
    `agent: ${agent}`,
    `reasoning: high`,
    '---',
    '',
    promptContent,
    '',
    `## Issue #${issue.number}: ${issue.title}`,
    '',
    issue.body ?? '(no body)',
    '',
    `**Wave:** ${issue.wave}`,
    `**Dependencies:** ${issue.depends_on?.length > 0 ? issue.depends_on.map((d: number) => `#${d}`).join(', ') : 'none'}`,
    '',
    `## Output — REQUIRED`,
    '',
    `Write your result as a JSON file using the Write tool:`,
    '',
    `**Path:** \`${outputPath}\``,
    '',
    `Create the \`.aloop/output/\` directory if it does not exist.`,
    `Without this file, the pipeline cannot continue.`,
  ].join('\n');
}

export interface ProcessRequestsOptions {
  sessionDir: string;
  homeDir?: string;
  output?: string;
}

interface ReviewCommentLike {
  author?: { login?: string | null } | null;
  createdAt?: string | null;
  body?: string | null;
}

export function formatReviewCommentHistory(comments: ReviewCommentLike[]): string {
  const blocks: string[] = [];
  for (const comment of comments) {
    const body = (comment.body ?? '').trim();
    if (!body) continue;
    const author = comment.author?.login ?? 'unknown';
    const createdAt = comment.createdAt ?? '';
    const heading = createdAt ? `### @${author} at ${createdAt}` : `### @${author}`;
    blocks.push(`${heading}\n\n${body}`);
  }
  if (blocks.length === 0) return '';
  return `${blocks.join('\n\n---\n\n')}\n`;
}

export async function getDirectorySizeBytes(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(fullPath);
      continue;
    }
    if (entry.isFile()) {
      total += (await stat(fullPath)).size;
    }
  }
  return total;
}

export async function pruneLargeV8CacheDir(dir: string, thresholdBytes: number): Promise<{ sizeBytes: number; pruned: boolean }> {
  if (!existsSync(dir)) return { sizeBytes: 0, pruned: false };
  const sizeBytes = await getDirectorySizeBytes(dir);
  if (sizeBytes < thresholdBytes) return { sizeBytes, pruned: false };
  await rm(dir, { recursive: true, force: true });
  return { sizeBytes, pruned: true };
}

export interface SyncMasterToTrunkDeps {
  spawnSync: typeof import('node:child_process').spawnSync;
}

/**
 * Phase 2b: Forward-merge master → agent/trunk (pick up human changes).
 *
 * Three cases:
 * 1. Fast-forward: origin/master is a linear descendant of origin/<trunk> →
 *    git push origin origin/master:refs/heads/<trunk> (no --force)
 * 2. Diverged: branches have each moved forward → tmp worktree merge + push
 * 3. Trunk ahead or equal: merge-base == master HEAD → no-op
 */
export function syncMasterToTrunk(
  projectRoot: string,
  aloopRoot: string,
  trunkBranch: string,
  deps: SyncMasterToTrunkDeps,
): void {
  const { spawnSync } = deps;
  try {
    const fetchR = spawnSync('git', ['-C', projectRoot, 'fetch', 'origin', 'master', trunkBranch], { encoding: 'utf8', timeout: 30000 });
    if (fetchR.status !== 0) throw new Error('fetch failed');
    const mergeBase = spawnSync('git', ['-C', projectRoot, 'merge-base', `origin/master`, `origin/${trunkBranch}`], { encoding: 'utf8', timeout: 10000 });
    const masterHead = spawnSync('git', ['-C', projectRoot, 'rev-parse', 'origin/master'], { encoding: 'utf8', timeout: 10000 });
    const mbSha = mergeBase.stdout?.trim();
    const mhSha = masterHead.stdout?.trim();
    if (mbSha && mhSha && mbSha.length >= 7 && mhSha.length >= 7 && mbSha !== mhSha) {
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
}

export interface ChildBranchSyncDeps {
  existsSync: (p: string) => boolean;
  readFile: (p: string, enc: BufferEncoding) => Promise<string>;
  writeFile: (p: string, data: string, enc: BufferEncoding) => Promise<void>;
  mkdir: (p: string, o?: { recursive?: boolean }) => Promise<void>;
  spawnSync: (cmd: string, args: string[], opts?: Record<string, unknown>) => { status: number | null; stdout: string; stderr: string };
}

export async function syncChildBranches(
  issues: OrchestratorIssue[],
  trunkBranch: string,
  aloopRoot: string,
  deps: ChildBranchSyncDeps,
): Promise<boolean> {
  let stateChanged = false;
  for (const issue of issues) {
    if (!issue.child_session) continue;
    if (issue.state !== 'in_progress' && issue.state !== 'pr_open') continue;
    const childDir = path.join(aloopRoot, 'sessions', issue.child_session);
    const childWorktree = path.join(childDir, 'worktree');
    if (!deps.existsSync(childWorktree)) continue;

    // Fetch and check if diverged
    const fetchResult = deps.spawnSync('git', ['-C', childWorktree, 'fetch', 'origin', trunkBranch], { encoding: 'utf8', timeout: 30000 });
    if (fetchResult.status !== 0) continue;

    const mergeBase = deps.spawnSync('git', ['-C', childWorktree, 'merge-base', 'HEAD', `origin/${trunkBranch}`], { encoding: 'utf8', timeout: 10000 });
    const remoteHead = deps.spawnSync('git', ['-C', childWorktree, 'rev-parse', `origin/${trunkBranch}`], { encoding: 'utf8', timeout: 10000 });
    const mbSha = mergeBase.stdout?.trim();
    const rhSha = remoteHead.stdout?.trim();
    if (!mbSha || !rhSha || mbSha.length < 7 || rhSha.length < 7) continue;
    if (mbSha === rhSha) continue; // Up to date

    // Commit any dirty files and remove working artifacts before rebase
    const statusResult = deps.spawnSync('git', ['-C', childWorktree, 'status', '--porcelain'], { encoding: 'utf8' });
    if (statusResult.stdout?.trim()) {
      for (const art of ['TODO.md', 'STEERING.md', 'QA_COVERAGE.md', 'QA_LOG.md', 'REVIEW_LOG.md']) {
        deps.spawnSync('git', ['-C', childWorktree, 'rm', '-f', '--cached', art], { encoding: 'utf8' });
      }
      deps.spawnSync('git', ['-C', childWorktree, 'add', '-A'], { encoding: 'utf8' });
      deps.spawnSync('git', ['-C', childWorktree, 'commit', '--allow-empty', '-m', 'chore: save work-in-progress before rebase'], { encoding: 'utf8' });
    }

    // Try rebase
    const rebaseResult = deps.spawnSync('git', ['-C', childWorktree, 'rebase', `origin/${trunkBranch}`], { encoding: 'utf8' });
    if (rebaseResult.status === 0) {
      deps.spawnSync('git', ['-C', childWorktree, 'push', 'origin', 'HEAD', '--force-with-lease'], { encoding: 'utf8' });
      console.log(`[process-requests] Synced #${issue.number} with ${trunkBranch}`);
    } else {
      // Conflict — abort rebase, queue merge agent
      deps.spawnSync('git', ['-C', childWorktree, 'rebase', '--abort'], { encoding: 'utf8' });
      const mergeQueueFile = path.join(childDir, 'queue', '000-merge-conflict.md');
      if (!deps.existsSync(mergeQueueFile)) {
        const mergePromptPath = path.join(childDir, 'prompts', 'PROMPT_merge.md');
        const mergePrompt = deps.existsSync(mergePromptPath) ? await deps.readFile(mergePromptPath, 'utf8') : '# Merge Conflict Resolution';
        await deps.mkdir(path.join(childDir, 'queue'), { recursive: true });
        await deps.writeFile(mergeQueueFile, `---\nagent: merge\nreasoning: high\n---\n\n${mergePrompt}\n\n## Conflict\n\nRebase onto \`origin/${trunkBranch}\` failed.\nRun \`git fetch origin ${trunkBranch} && git rebase origin/${trunkBranch}\`, resolve conflicts, then \`git rebase --continue && git push origin HEAD --force-with-lease\`.\n`, 'utf8');
        console.log(`[process-requests] Merge conflict on #${issue.number} — queued merge agent`);
        // Trigger child restart so it processes the queued merge agent
        (issue as any).needs_redispatch = true;
        stateChanged = true;
      }
    }
  }
  return stateChanged;
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

  // execGh must be defined early — used by refine/estimate result handlers
  const execGh = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    const r = spawnSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 30000 });
    if (r.status === null && r.signal) throw new Error(`gh timed out (${r.signal})`);
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

  // ── Phase 0: Bridge agent output → requests ──
  // Agents write to worktree/.aloop/output/ (inside their sandbox).
  // Runtime moves files to session_dir/requests/ for processing.
  const agentOutputDir = path.join(sessionDir, 'worktree', '.aloop', 'output');
  if (existsSync(agentOutputDir)) {
    try {
      const outputFiles = await readdir(agentOutputDir);
      for (const file of outputFiles.filter(f => f.endsWith('.json'))) {
        const src = path.join(agentOutputDir, file);
        const dest = path.join(requestsDir, file);
        const content = await readFile(src, 'utf8');
        await writeFile(dest, content, 'utf8');
        await unlink(src);
        console.log(`[process-requests] Bridged agent output: ${file}`);
      }
    } catch { /* best-effort */ }
  }

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
          const subBodyBase = `Part of #${parentNum}: ${parent.title}\n\n${sub.body ?? ''}`;
          const subBody = ensureMetadataSection(subBodyBase, {
            wave: parent.wave,
            type: 'sub-issue',
            files: sub.file_hints ?? [],
            depends_on: sub.depends_on ?? [],
          });
          const subLabels = buildIssueLabels({
            wave: parent.wave,
            is_sub_issue: true,
            component_labels: deriveComponentLabels(sub.file_hints ?? []),
          });
          const ghNumber = repo ? await createGhIssue(repo, subTitle, subBody, subLabels, requestsDir) : nextNum++;
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

  // 1c. Refine results → update GH issue body and mark refined
  for (const file of allFiles.filter(f => f.match(/^refine-result-\d+\.json$/))) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const issue = state.issues.find((i: any) => i.number === result.issue_number);
      if (issue && result.updated_body && repo) {
        // Update GH issue body via temp file (body can be large)
        try {
          const bodyFile = path.join(requestsDir, `_body-${issue.number}.md`);
          await writeFile(bodyFile, result.updated_body, 'utf8');
          await execGh(['issue', 'edit', String(issue.number), '--repo', repo, '--body-file', bodyFile]);
          await unlink(bodyFile).catch(() => {});
          issue.body = result.updated_body;
          (issue as any).refined = true;
          stateChanged = true;
          console.log(`[process-requests] Refined #${issue.number} — updated body with constraints`);
        } catch (e) {
          console.warn(`[process-requests] Failed to update GH issue #${issue.number}: ${e}`);
        }
      }
      await archiveRequestFile(requestsDir, filePath);
    } catch { /* skip malformed */ }
  }

  // 1d. CR analysis results → apply spec changes (autonomous) or block (non-autonomous)
  const crFiles = allFiles.filter(f => f.match(/^cr-analysis-result-\d+\.json$/))
    .map(f => path.join(requestsDir, f));
  if (crFiles.length > 0) {
    const crChanged = await processCrResultFiles(crFiles, state.issues, state.autonomy_level ?? 'balanced', projectRoot, repo, state.trunk_branch ?? 'agent/trunk', requestsDir, {
      existsSync, readFile: (p, e) => readFile(p, e), writeFile: (p, d, e) => writeFile(p, d, e),
      unlink: (p) => unlink(p).catch(() => {}),
      execGh,
      execGit: (args) => { spawnSync('git', args, { encoding: 'utf8' }); },
      archiveFile: (rDir, fp) => archiveRequestFile(rDir, fp),
    });
    if (crChanged) stateChanged = true;
  }

  // 1e. Estimate results → apply to state (per-issue files)
  for (const file of allFiles.filter(f => f.match(/^estimate-result-\d+\.json$/))) {
    const filePath = path.join(requestsDir, file);
    try {
      const result = JSON.parse(await readFile(filePath, 'utf8'));
      const issueNum = result.issue_number ?? result.issue ?? Number(file.match(/\d+/)?.[0]);
      const issue = state.issues.find((i: any) => i.number === issueNum);
      if (issue) {
        const dorPassed = result.dor_passed ?? result.definition_of_ready?.passes ?? true;
        issue.dor_validated = dorPassed;
        (issue as any).complexity_tier = result.complexity_tier;
        (issue as any).iteration_estimate = result.iteration_estimate ?? result.estimated_child_loop_iterations;
        if (dorPassed) issue.status = 'Ready';
        stateChanged = true;
        console.log(`[process-requests] Issue #${issueNum}: ${dorPassed ? 'Ready' : 'needs work'}`);
      }
      await archiveRequestFile(requestsDir, filePath);
    } catch { /* skip malformed */ }
  }

  // 1d. Queue refine prompts for "Needs refinement" issues that haven't been refined yet
  //     Then queue estimate prompts for refined issues that need DoR validation
  {
    const queueDir = path.join(sessionDir, 'queue');
    const queueFiles = existsSync(queueDir) ? await readdir(queueDir) : [];
    const pendingQueue = new Set(
      queueFiles
        .filter(f => f.startsWith('refine-issue-') || f.startsWith('estimate-issue-') || f.startsWith('sub_decompose-issue-'))
        .map(f => Number(f.replace(/^(refine|estimate|sub_decompose)-issue-/, '').replace('.md', ''))),
    );
    const pendingResults = new Set(
      allFiles
        .filter(f => f.match(/^(refine|estimate|sub-decomposition)-result-\d+\.json$/))
        .map(f => Number(f.replace(/^(refine|estimate|sub-decomposition)-result-/, '').replace('.json', ''))),
    );

    // Process orchestrator events from pipeline.yml
    const pipelineYmlPath = path.join(sessionDir, 'worktree', '.aloop', 'pipeline.yml');
    const orchEvents = loadOrchestratorEvents(pipelineYmlPath);
    for (const event of orchEvents) {
      const matching = state.issues.filter((i: any) => {
        if (i.refinement_budget_exceeded) return false;
        if (pendingQueue.has(i.number) || pendingResults.has(i.number)) return false;
        for (const [key, val] of Object.entries(event.filter)) {
          const actual = (i as any)[key];
          // Treat undefined as false for boolean filters
          const normalized = actual === undefined && typeof val === 'boolean' ? false : actual;
          if (normalized !== val) return false;
        }
        return true;
      });
      if (matching.length === 0) continue;

      const promptPath = path.join(sessionDir, 'prompts', event.prompt);
      if (!existsSync(promptPath)) continue;
      const promptContent = await readFile(promptPath, 'utf8');

      const batch = matching.slice(0, event.batch);
      for (const issue of batch) {
        const resultFile = event.resultPattern.replace('{issue_number}', String(issue.number));
        const outputPath = `.aloop/output/${resultFile}`;
        const queueContent = buildQueuePrompt(event.agent, issue, promptContent, outputPath);
        const queueFile = `${event.agent}-issue-${issue.number}.md`;
        await writeFile(path.join(queueDir, queueFile), queueContent, 'utf8');
      }
      console.log(`[process-requests] Queued ${batch.length} ${event.agent} prompts (${matching.length} total matching)`);
    }
  }

  // ── Phase 2: Create GH issues for state entries with number=0 ──
  if (repo) {
    for (const issue of state.issues.filter((i: any) => i.number === 0)) {
      const isEpic = !(issue as any).parent_issue;
      const labels = buildIssueLabels({
        wave: issue.wave,
        is_epic: isEpic,
        is_sub_issue: !isEpic,
        component_labels: deriveComponentLabels(issue.file_hints ?? []),
      });
      const bodyWithMeta = ensureMetadataSection(issue.body ?? '', {
        wave: issue.wave,
        type: isEpic ? 'epic' : 'sub-issue',
        files: issue.file_hints ?? [],
      });
      const ghNum = await createGhIssue(repo, issue.title, bodyWithMeta, labels, requestsDir);
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
  syncMasterToTrunk(projectRoot, aloopRoot, trunkBranch, { spawnSync });

  // ── Phase 2c: Sync child branches with base branch ──
  {
    const childSyncChanged = await syncChildBranches(state.issues, trunkBranch, aloopRoot, {
      existsSync: (p: string) => existsSync(p),
      readFile: (p: string, e: BufferEncoding) => readFile(p, e),
      writeFile: (p: string, d: string, e: BufferEncoding) => writeFile(p, d, e),
      mkdir: (p: string, o?: { recursive?: boolean }) => mkdir(p, o).then(() => undefined),
      spawnSync: (cmd: string, a: string[], o?: Record<string, unknown>) => {
        const r = spawnSync(cmd, a, o as any);
        return { status: r.status, stdout: r.stdout?.toString() ?? '', stderr: r.stderr?.toString() ?? '' };
      },
    });
    if (childSyncChanged) stateChanged = true;
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
            if (childStatus.state === 'completed') {
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

              // Create PR — use PR_DESCRIPTION.md from child worktree if present, else build rich body
              const prDescriptionFile = path.join(childWorktree, 'PR_DESCRIPTION.md');
              const wave = issue.wave ?? 1;
              const componentLabels = deriveComponentLabels(issue.file_hints ?? []);
              const prLabels = buildIssueLabels({ wave, component_labels: componentLabels });
              const richPrBody = buildPrBody({
                issue_number: issue.number,
                issue_title: issue.title,
                wave,
                labels: prLabels,
                child_session: issue.child_session,
                file_hints: issue.file_hints ?? [],
                scope_summary: (issue.body ?? '').split('\n').slice(0, 3).join(' ').substring(0, 200),
              });
              let prBody = richPrBody;
              if (existsSync(prDescriptionFile)) {
                try {
                  const agentBody = await readFile(prDescriptionFile, 'utf8');
                  // If agent provided a PR description, use it but ensure it has Closes reference
                  prBody = agentBody.includes(`Closes #${issue.number}`) ? agentBody : `${agentBody}\n\nCloses #${issue.number}`;
                } catch { /* use rich body */ }
              }
              const prArgs = [
                'pr', 'create',
                '--repo', repo,
                '--title', `#${issue.number}: ${issue.title}`,
                '--body', prBody,
                '--head', branch,
                '--base', trunkBranch,
              ];
              for (const label of prLabels) {
                prArgs.push('--label', label);
              }
              const prResult = spawnSync('gh', prArgs, { encoding: 'utf8' });

              if (prResult.status === 0 && prResult.stdout) {
                const urlMatch = prResult.stdout.match(/\/pull\/(\d+)/);
                const prNum = urlMatch ? parseInt(urlMatch[1], 10) : 0;
                if (prNum > 0) {
                  issue.pr_number = prNum;
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

  // ── Phase 2d: Detect dead children — reset to Ready if PID is gone ──
  for (const issue of state.issues) {
    if (issue.state !== 'in_progress') continue;
    if (!issue.child_session) {
      // No child session but in_progress — stale preloaded state
      issue.state = 'pending';
      issue.status = 'Ready';
      stateChanged = true;
      continue;
    }
    const childPid = (issue as any).child_pid;
    if (childPid && !existsSync(`/proc/${childPid}`)) {
      // PID dead — check child status.json for completion
      const childStatusFile = path.join(aloopRoot, 'sessions', issue.child_session, 'status.json');
      let childState = 'unknown';
      if (existsSync(childStatusFile)) {
        try {
          const cs = JSON.parse(await readFile(childStatusFile, 'utf8'));
          childState = cs.state ?? 'unknown';
        } catch { /* fall through */ }
      }

      if (issue.pr_number) {
        // Has PR — transition to review regardless of child state
        issue.state = 'pr_open';
        issue.status = 'In review';
        issue.child_session = null;
        (issue as any).child_pid = null;
        stateChanged = true;
        console.log(`[process-requests] Dead child for #${issue.number} (${childState}) — has PR #${issue.pr_number}, moved to pr_open`);
      } else if (childState === 'completed' || childState === 'stopped') {
        // No PR but child finished — reset for fresh dispatch
        issue.state = 'pending';
        issue.status = 'Ready';
        issue.child_session = null;
        (issue as any).child_pid = null;
        stateChanged = true;
        console.log(`[process-requests] Dead child for #${issue.number} (${childState}) — no PR, reset to Ready`);
      } else {
        // Dead with unknown status — reset to Ready
        issue.state = 'pending';
        issue.status = 'Ready';
        issue.child_session = null;
        (issue as any).child_pid = null;
        stateChanged = true;
        console.log(`[process-requests] Dead child for #${issue.number} (${childState}) — reset to Ready`);
      }
    }
  }

  // ── Phase 2d.2: Recover failed issues that have a viable path forward ──
  for (const issue of state.issues) {
    if (issue.state !== 'failed') continue;
    // Don't recover issues deliberately closed by scan agent
    if (issue.status === 'Done') continue;
    const hasOpenPr = issue.pr_number != null;
    const wantsRedispatch = (issue as any).needs_redispatch === true;

    if (wantsRedispatch) {
      // Has review feedback — move to pr_open so lifecycle picks it up for redispatch
      if (hasOpenPr) {
        issue.state = 'pr_open';
        issue.status = 'In review';
      } else {
        // No PR but wants redispatch — reset to pending for fresh dispatch
        issue.state = 'pending';
        issue.status = 'Ready';
        issue.child_session = null;
        (issue as any).child_pid = null;
        (issue as any).needs_redispatch = false;
      }
      stateChanged = true;
      console.log(`[process-requests] Recovered failed #${issue.number} (needs_redispatch) → ${issue.state}`);
    } else if (hasOpenPr) {
      // Has open PR — move back to pr_open so the PR lifecycle can re-evaluate
      // Clear stale child session if the child is dead
      if (issue.child_session) {
        const childPid = (issue as any).child_pid;
        if (!childPid || !existsSync(`/proc/${childPid}`)) {
          issue.child_session = null;
          (issue as any).child_pid = null;
        }
      }
      issue.state = 'pr_open';
      issue.status = 'In review';
      (issue as any).rebase_attempts = 0;
      stateChanged = true;
      console.log(`[process-requests] Recovered failed #${issue.number} (has open PR #${issue.pr_number}) → pr_open`);
    } else {
      // No PR (may or may not have child session) — reset to pending for fresh attempt.
      // Clear dead child session if present.
      const childPid = (issue as any).child_pid;
      if (issue.child_session && (!childPid || !existsSync(`/proc/${childPid}`))) {
        issue.child_session = null;
        (issue as any).child_pid = null;
      }
      if (!issue.child_session) {
        issue.state = 'pending';
        issue.status = 'Ready';
        (issue as any).rebase_attempts = 0;
        (issue as any).ci_failure_retries = 0;
        stateChanged = true;
        console.log(`[process-requests] Recovered failed #${issue.number} (no PR) → pending`);
      }
    }
  }

  // ── Phase 2e: Cleanup worktrees + V8 cache for fully completed children ──
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

  // HACK: Periodic /tmp V8 cache cleanup — provider CLIs (claude, opencode) create
  // V8 code cache .so files in /tmp that can fill the tmpfs (13GB+ observed).
  // This is a blunt workaround. Needs research into:
  //   - Can we set NODE_COMPILE_CACHE for provider CLIs too? (they ignore env vars?)
  //   - Is there a provider-specific config to disable/redirect their cache?
  //   - Should we use a dedicated tmpdir mount with size limits instead?
  // See: https://github.com/johnnyelwailer/ralph-skill/issues/164
  if (Math.random() < 0.1) {
    try {
      const findResult = spawnSync('find', ['/tmp', '-maxdepth', '2', '-name', '.da*.so', '-mmin', '+60', '-delete'], {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
      });
      if (findResult.status === 0) {
        console.log('[process-requests] Cleaned stale V8 cache files from /tmp (HACK — see #164)');
      }
    } catch { /* best-effort */ }
  }

  // ── Phase 2f: Sync issue statuses to GH project ──
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
          let added = 0;
          for (const issue of state.issues) {
            if (!issue.number) continue;
            let item = itemMap.get(issue.number);

            // Add missing issues to the project (max 10 per pass to avoid API rate limits)
            if (!item) {
              if (added >= 10) continue;
              const repoNodeResult = spawnSync('gh', ['api', 'graphql', '-f', `query={ repository(owner: "${repo.split('/')[0]}", name: "${repo.split('/')[1]}") { issue(number: ${issue.number}) { id } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
              if (repoNodeResult.status !== 0) continue;
              const issueNodeId = JSON.parse(repoNodeResult.stdout)?.data?.repository?.issue?.id;
              if (!issueNodeId) continue;
              const addResult = spawnSync('gh', ['api', 'graphql', '-f', `query=mutation { addProjectV2ItemById(input: { projectId: "${projectId}" contentId: "${issueNodeId}" }) { item { id } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
              if (addResult.status !== 0) continue;
              const newItemId = JSON.parse(addResult.stdout)?.data?.addProjectV2ItemById?.item?.id;
              if (!newItemId) continue;
              item = { id: newItemId, status: '' };
              added++;
            }

            const targetStatus = (issue.status ?? '').toLowerCase();
            if (item.status.toLowerCase() === targetStatus) continue;
            const optionId = optionIds.get(targetStatus);
            if (!optionId) continue;
            spawnSync('gh', ['api', 'graphql', '-f', `query=mutation { updateProjectV2ItemFieldValue(input: { projectId: "${projectId}" itemId: "${item.id}" fieldId: "${statusFieldId}" value: { singleSelectOptionId: "${optionId}" } }) { projectV2Item { id } } }`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            synced++;
          }
          if (added > 0) console.log(`[process-requests] Added ${added} issues to GH project`);
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
  const reviewPendingUpdates = new Map<number, number>();
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

  // execGh already defined earlier (before result handlers)

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
        // Check for result file — the ONLY source of truth for review verdicts.
        // No fallback regex extraction. If the file doesn't exist, the review
        // agent hasn't run yet — return pending and let the queue do its job.
        const resultFile = path.join(requestsDir, `review-result-${prNumber}.json`);
        const agentOutputFile = path.join(sessionDir, 'worktree', '.aloop', 'output', `review-result-${prNumber}.json`);
        const actualResultFile = existsSync(resultFile) ? resultFile : existsSync(agentOutputFile) ? agentOutputFile : null;
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

        // Queue review prompt if not already queued
        const queueFile = path.join(sessionDir, 'queue', `000-review-${prNumber}.md`);
        const legacyQueueFile = path.join(sessionDir, 'queue', `review-${prNumber}.md`);
        if (!existsSync(queueFile) && !existsSync(legacyQueueFile)) {
          const reviewPath = path.join(promptsDir, 'PROMPT_orch_review.md');
          if (existsSync(reviewPath)) {
            const prompt = await readFile(reviewPath, 'utf8');
            await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
            const outputInstr = `\n\n## Output — CRITICAL\n\nYou MUST use the Write tool to create this file:\n\n**Path:** \`.aloop/output/review-result-${prNumber}.json\`\n\n(This is relative to your working directory. Create the \`.aloop/output/\` directory if needed.)\n\n**Content (valid JSON):**\n\`\`\`json\n{"pr_number": ${prNumber}, "verdict": "approve", "summary": "one line reason"}\n\`\`\`\n\nValid verdicts: \`approve\`, \`request-changes\`, \`flag-for-human\`\n\n**Without this file, the pipeline is stuck. Do NOT just print the verdict — WRITE THE FILE.**\n`;

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
        // Track pending cycles — retry → troubleshoot → escalate
        // Note: we write to reviewPendingUpdates map (not state) because
        // runOrchestratorScanPass has its own state copy that would overwrite ours
        const prevCount = reviewPendingUpdates.get(prNumber) ?? 0;
        const pendingCount = prevCount + 1;
        reviewPendingUpdates.set(prNumber, pendingCount);
        {

          // 1-3: retry (move to back of queue — other PRs get a chance)
          // 4-5: troubleshoot agent investigates
          // 6+: escalate to human
          if (pendingCount === 4) {
            const troubleshootFile = path.join(sessionDir, 'queue', `000-troubleshoot-review-${prNumber}.md`);
            if (!existsSync(troubleshootFile)) {
              await mkdir(path.join(sessionDir, 'queue'), { recursive: true });
              await writeFile(troubleshootFile, `---\nagent: troubleshoot\nreasoning: high\n---\n\n# Troubleshoot: PR #${prNumber} Review Stuck\n\nThe review for PR #${prNumber} has returned "pending" ${pendingCount} times. The verdict extraction is failing.\n\n## Investigate\n1. Check if review-result-${prNumber}.json exists anywhere in the session\n2. Check recent agent output for verdict text mentioning PR #${prNumber}\n3. If verdict exists but wasn't parsed, write it to the correct location\n4. If no verdict was produced, determine why the review agent didn't generate one\n`, 'utf8');
            }
          }
          if (pendingCount > 10) {
            return { pr_number: prNumber, verdict: 'flag-for-human', summary: `Review stuck pending after ${pendingCount} attempts (troubleshoot agent failed) — needs manual review.` };
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

  // Re-read state after scan pass (scan pass writes its own copy)
  // and apply any pending review tracking from the invokeAgentReview closure
  if (reviewPendingUpdates.size > 0) {
    try {
      const postScanState: OrchestratorState = JSON.parse(await readFile(stateFile, 'utf8'));
      let changed = false;
      for (const [prNum, count] of reviewPendingUpdates) {
        const issue = postScanState.issues.find((i: any) => i.pr_number === prNum);
        if (issue) {
          (issue as any).review_pending_count = count;
          changed = true;
        }
      }
      if (changed) {
        await writeFile(stateFile, `${JSON.stringify(postScanState, null, 2)}\n`, 'utf8');
      }
    } catch { /* best-effort */ }
  }

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

