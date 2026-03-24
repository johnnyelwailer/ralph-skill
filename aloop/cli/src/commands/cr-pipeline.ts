import path from 'node:path';
import type { OrchestratorIssue } from './orchestrate.js';

export interface CrResultDeps {
  existsSync: (p: string) => boolean;
  readFile: (p: string, enc: BufferEncoding) => Promise<string>;
  writeFile: (p: string, data: string, enc: BufferEncoding) => Promise<void>;
  unlink: (p: string) => Promise<void>;
  execGh: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
  execGit: (args: string[]) => void;
  archiveFile: (requestsDir: string, filePath: string) => Promise<void>;
}

export async function processCrResultFiles(
  crFiles: string[],
  issues: OrchestratorIssue[],
  autonomyLevel: string,
  projectRoot: string,
  repo: string | null,
  trunkBranch: string,
  requestsDir: string,
  deps: CrResultDeps,
): Promise<boolean> {
  let stateChanged = false;
  for (const filePath of crFiles) {
    try {
      const result = JSON.parse(await deps.readFile(filePath, 'utf8'));
      const issue = issues.find((i) => i.number === result.issue_number);
      if (issue && Array.isArray(result.spec_changes) && result.spec_changes.length > 0) {
        if (autonomyLevel === 'autonomous') {
          for (const change of result.spec_changes) {
            const specFilePath = path.join(projectRoot, change.file);
            try {
              const existing = deps.existsSync(specFilePath) ? await deps.readFile(specFilePath, 'utf8') : '';
              let updated: string;
              if (change.action === 'add') {
                updated = existing + (existing.endsWith('\n') ? '' : '\n') + change.content + '\n';
              } else if (change.action === 'modify' && change.section) {
                const sectionPattern = new RegExp(`(##[#]* ${change.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n)([\s\S]*?)(?=\n##[#]* |$)`, 'm');
                updated = sectionPattern.test(existing) ? existing.replace(sectionPattern, `$1${change.content}\n`) : existing;
              } else if (change.action === 'remove' && change.section) {
                const removePattern = new RegExp(`##[#]* ${change.section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n[\s\S]*?(?=\n##[#]* |$)`, 'm');
                updated = removePattern.test(existing) ? existing.replace(removePattern, '') : existing;
              } else {
                updated = existing;
              }
              if (updated !== existing) {
                await deps.writeFile(specFilePath, updated, 'utf8');
              }
            } catch (e) {
              console.warn(`[process-requests] CR #${issue.number}: failed to apply change to ${change.file}: ${e}`);
            }
          }
          deps.execGit(['-C', projectRoot, 'add', '-A']);
          deps.execGit(['-C', projectRoot, 'commit', '-m', `feat: apply CR spec changes for issue #${issue.number} — ${result.summary ?? 'spec update'}`]);
          deps.execGit(['-C', projectRoot, 'push', 'origin', `HEAD:${trunkBranch}`]);
          (issue as any).cr_spec_updated = true;
          stateChanged = true;
          console.log(`[process-requests] CR #${issue.number}: spec updated and committed`);
        } else {
          if (repo) {
            const diffLines = result.spec_changes.map((c: any) =>
              `### ${c.action.toUpperCase()} in \`${c.file}\` — section "${c.section ?? 'n/a'}"\n\n${c.content}\n\n**Rationale:** ${c.rationale ?? '(none)'}`,
            ).join('\n\n---\n\n');
            const commentBody = `**CR Spec Analysis for #${issue.number}**\n\nProposed spec changes requiring human approval:\n\n${diffLines}\n\nApprove these changes to unblock the issue. Once applied, remove the \`aloop/blocked-on-human\` label.`;
            const commentFile = path.join(requestsDir, `_cr-comment-${issue.number}.md`);
            await deps.writeFile(commentFile, commentBody, 'utf8');
            await deps.execGh(['issue', 'comment', String(issue.number), '--repo', repo, '--body-file', commentFile]);
            await deps.unlink(commentFile);
            await deps.execGh(['issue', 'edit', String(issue.number), '--repo', repo, '--add-label', 'aloop/blocked-on-human']);
          }
          (issue as any).blocked_on_human = true;
          stateChanged = true;
          console.log(`[process-requests] CR #${issue.number}: blocked on human — spec changes posted as comment`);
        }
      }
      await deps.archiveFile(requestsDir, filePath);
    } catch (e) {
      console.error(`[process-requests] Failed to apply CR analysis result: ${e}`);
    }
  }
  return stateChanged;
}
