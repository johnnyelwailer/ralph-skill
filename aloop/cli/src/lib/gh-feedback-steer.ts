import * as fs from 'fs';
import * as path from 'path';
import { normalizeCiDetailForSignature } from './ci-utils.js';
import {
  ghLoopRuntime,
  getSessionDir,
  type GhWatchIssueEntry,
  type GhWatchCommandOptions,
} from './gh-state.js';
import {
  ghExecutor,
  collectNewFeedback,
  fetchPrReviewComments,
  fetchPrIssueComments,
  fetchPrCheckRuns,
  type PrCheckRun,
  type PrFeedback,
} from './gh-feedback-collect.js';

const GH_SAME_CI_FAILURE_LIMIT_DEFAULT = 3;

export function buildCiFailureSignature(failedChecks: PrCheckRun[]): string | null {
  if (failedChecks.length === 0) return null;
  const parts = failedChecks
    .map((check) => {
      const tail = (check.log ?? '').split('\n').slice(-20).join('\n');
      return `${check.name}|${normalizeCiDetailForSignature(tail)}`;
    })
    .sort();
  return parts.join('||');
}

export function buildCiFailureSummary(failedChecks: PrCheckRun[]): string {
  if (failedChecks.length === 0) return 'No CI failures detected.';
  const lines = failedChecks.map((check) => {
    const tail = (check.log ?? '').split('\n').slice(-8).map((l) => l.trim()).filter(Boolean).join(' | ');
    return `- ${check.name}${tail ? `: ${tail}` : ''}`;
  });
  return ['CI failures:', ...lines].join('\n');
}

export function hasFeedback(feedback: PrFeedback): boolean {
  return feedback.new_comments.length > 0 || feedback.new_issue_comments.length > 0 || feedback.failed_checks.length > 0;
}

export function buildFeedbackSteering(feedback: PrFeedback, prNumber: number): string {
  const parts: string[] = [
    '# PR Feedback — Automated Re-iteration',
    '',
    `PR #${prNumber} received feedback that requires fixes.`,
    '',
  ];
  if (feedback.new_comments.length > 0) {
    parts.push('## Review Comments', '');
    for (const comment of feedback.new_comments) {
      const author = comment.user?.login ?? 'unknown';
      const location = comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ''}` : '';
      parts.push(`### ${author}${location ? ` — \`${location}\`` : ''}`, '', comment.body.trim(), '');
    }
  }
  if (feedback.new_issue_comments.length > 0) {
    parts.push('## Mentions (@aloop)', '');
    for (const comment of feedback.new_issue_comments) {
      parts.push(`### @${comment.user?.login ?? 'unknown'} (comment)`, '', comment.body.trim(), '');
    }
  }
  if (feedback.failed_checks.length > 0) {
    parts.push('## CI Failures', '');
    for (const check of feedback.failed_checks) {
      parts.push(`- **${check.name}** failed${check.html_url ? ` ([view](${check.html_url}))` : ''}`);
      if (check.log) {
        parts.push('', '```');
        const logLines = check.log.split('\n');
        if (logLines.length > 200) { parts.push('... (truncated)', ...logLines.slice(-200)); }
        else { parts.push(check.log); }
        parts.push('```', '');
      }
    }
    parts.push('', 'Fix the CI failures above. Review the error logs and address root causes.', '');
  }
  parts.push('Address all feedback above, then commit and push.');
  return parts.join('\n');
}

export function markFeedbackProcessed(entry: GhWatchIssueEntry, feedback: PrFeedback): void {
  for (const comment of feedback.new_comments) {
    if (!entry.processed_comment_ids.includes(comment.id)) entry.processed_comment_ids.push(comment.id);
  }
  for (const comment of feedback.new_issue_comments) {
    if (!entry.processed_issue_comment_ids.includes(comment.id)) entry.processed_issue_comment_ids.push(comment.id);
  }
  for (const check of feedback.failed_checks) {
    if (!entry.processed_run_ids.includes(check.id)) entry.processed_run_ids.push(check.id);
  }
  entry.feedback_iteration += 1;
  entry.updated_at = new Date().toISOString();
}

export async function checkAndApplyPrFeedback(
  entry: GhWatchIssueEntry,
  options: GhWatchCommandOptions,
): Promise<boolean> {
  if (!entry.repo || !entry.pr_number || !entry.session_id) return false;
  if (entry.status !== 'completed') return false;
  if (entry.feedback_iteration >= entry.max_feedback_iterations) return false;

  let reviewComments, issueComments, checkRuns;
  try {
    [reviewComments, issueComments, checkRuns] = await Promise.all([
      fetchPrReviewComments(entry.repo, entry.pr_number),
      fetchPrIssueComments(entry.repo, entry.pr_number),
      fetchPrCheckRuns(entry.repo, entry.pr_number),
    ]);
  } catch {
    return false;
  }

  const feedback = collectNewFeedback(entry, reviewComments, issueComments, checkRuns);
  const ciSignature = buildCiFailureSignature(feedback.failed_checks);
  if (ciSignature) {
    const maxRetries = options.maxCiRetries !== undefined
      ? (typeof options.maxCiRetries === 'number' ? options.maxCiRetries : parseInt(String(options.maxCiRetries), 10))
      : GH_SAME_CI_FAILURE_LIMIT_DEFAULT;
    const nextSameFailureCount = entry.last_ci_failure_signature === ciSignature
      ? (entry.same_ci_failure_count ?? 0) + 1
      : 1;
    entry.last_ci_failure_signature = ciSignature;
    entry.last_ci_failure_summary = buildCiFailureSummary(feedback.failed_checks);
    entry.same_ci_failure_count = nextSameFailureCount;
    if (nextSameFailureCount >= maxRetries) {
      markFeedbackProcessed(entry, feedback);
      entry.status = 'stopped';
      entry.completion_state = 'persistent_ci_failure';
      entry.updated_at = new Date().toISOString();
      const summary = [
        `Auto re-iteration halted for #${entry.issue_number}.`,
        `Same CI failure persisted for ${nextSameFailureCount} consecutive attempts.`,
        entry.last_ci_failure_summary,
        'Please investigate manually and update the branch before resuming.',
      ].join('\n\n');
      try {
        await ghExecutor.exec(['issue', 'comment', String(entry.issue_number), '--repo', entry.repo, '--body', summary]);
      } catch {
        // best-effort
      }
      try {
        await ghExecutor.exec(['issue', 'edit', String(entry.issue_number), '--add-label', 'aloop/needs-human', '--repo', entry.repo]);
      } catch {
        // best-effort
      }
      return false;
    }
  } else {
    entry.last_ci_failure_signature = null;
    entry.last_ci_failure_summary = null;
    entry.same_ci_failure_count = 0;
  }

  if (!hasFeedback(feedback)) {
    let updated = false;
    for (const c of reviewComments) {
      if (!entry.processed_comment_ids.includes(c.id)) { entry.processed_comment_ids.push(c.id); updated = true; }
    }
    for (const c of issueComments) {
      if (!entry.processed_issue_comment_ids.includes(c.id)) { entry.processed_issue_comment_ids.push(c.id); updated = true; }
    }
    if (updated) entry.updated_at = new Date().toISOString();
    return false;
  }

  const sessionDir = getSessionDir(options.homeDir, entry.session_id);
  const worktreePath = path.join(sessionDir, 'worktree');
  const steeringPath = path.join(worktreePath, 'STEERING.md');
  fs.mkdirSync(path.dirname(steeringPath), { recursive: true });
  fs.writeFileSync(steeringPath, buildFeedbackSteering(feedback, entry.pr_number), 'utf8');

  try {
    await ghLoopRuntime.startIssue({
      issue: entry.issue_number,
      repo: entry.repo,
      homeDir: options.homeDir,
      projectRoot: worktreePath,
      provider: options.provider,
      max: options.max,
      output: 'json',
    });
  } catch {
    return false;
  }

  markFeedbackProcessed(entry, feedback);
  entry.status = 'running';
  return true;
}
