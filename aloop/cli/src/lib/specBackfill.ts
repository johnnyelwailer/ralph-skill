import * as path from 'node:path';

export interface SpecBackfillDeps {
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (filePath: string, data: string, encoding: BufferEncoding) => Promise<void>;
  execGit?: (args: string[], cwd?: string) => Promise<{ stdout: string; stderr: string }>;
}

export interface SpecBackfillOptions {
  specFile: string;
  section: string;
  content: string;
  sessionId: string;
  iteration: number;
  projectRoot: string;
  deps: SpecBackfillDeps;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function writeSpecBackfill(opts: SpecBackfillOptions): Promise<boolean> {
  const { specFile, section, content, sessionId, iteration, projectRoot, deps } = opts;
  const specPath = path.resolve(projectRoot, specFile);
  try {
    const existingContent = await deps.readFile(specPath, 'utf8');

    // Match any heading level (h1-h6)
    const sectionPattern = new RegExp(`^#{1,6}\\s+${escapeRegex(section)}.*$`, 'm');
    const match = existingContent.match(sectionPattern);

    let updatedContent: string;
    if (match && match.index !== undefined) {
      // Replace content between matched header and next header (or end)
      const lines = existingContent.split('\n');
      const startIdx = lines.findIndex(l => l.match(sectionPattern));
      let endIdx = lines.findIndex((l, i) => i > startIdx && /^#{1,6}\s+/.test(l));
      if (endIdx === -1) endIdx = lines.length;
      lines.splice(startIdx + 1, endIdx - startIdx - 1, '', content, '');
      updatedContent = lines.join('\n');
    } else {
      // Section not found — append at end
      updatedContent = existingContent + '\n\n## ' + section + '\n\n' + content + '\n';
    }

    await deps.writeFile(specPath, updatedContent, 'utf8');

    // Commit with provenance trailers
    if (deps.execGit) {
      await deps.execGit(['add', specFile], projectRoot);
      const commitMsg = [
        `docs: backfill spec section "${section}"`,
        '',
        `Aloop-Agent: spec-backfill`,
        `Aloop-Iteration: ${iteration}`,
        `Aloop-Session: ${sessionId}`,
      ].join('\n');
      await deps.execGit(['commit', '-m', commitMsg, '--allow-empty'], projectRoot);
    }

    return true;
  } catch {
    return false;
  }
}
