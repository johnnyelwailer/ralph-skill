import path from 'node:path';

export interface ProofArtifact {
  type: string;
  path: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface ProofManifest {
  iteration: number;
  phase?: string;
  provider?: string;
  timestamp?: string;
  summary?: string;
  artifacts: ProofArtifact[];
  skipped?: Array<{ task: string; reason: string }>;
  baselines_updated?: string[];
}

export interface ProofArtifactsDeps {
  existsSync: (p: string) => boolean;
  readFile: (p: string, enc: BufferEncoding) => Promise<string>;
  readdir: (p: string) => Promise<string[]>;
}

export interface ProofArtifactsResult {
  manifest: ProofManifest;
  iterDir: string;  // full path to the iter-N directory
  childDir: string; // full path to the child session directory
}

export interface ProofAttachDeps extends ProofArtifactsDeps {
  spawnSync: (cmd: string, args: string[], opts?: Record<string, unknown>) => { status: number | null; stdout: string; stderr: string };
  mkdir: (p: string, opts?: { recursive?: boolean }) => Promise<void>;
  cp: (src: string, dest: string, opts?: Record<string, unknown>) => Promise<void>;
}

/**
 * Scans childDir/artifacts/iter-* for proof-manifest.json files.
 * Returns the most recent iteration with a non-empty artifacts array.
 * Falls back to the most recent manifest if all artifacts arrays are empty.
 * Returns null if no manifests exist.
 */
export async function readLatestProofManifest(
  childDir: string,
  deps: ProofArtifactsDeps,
): Promise<ProofArtifactsResult | null> {
  const artifactsDir = path.join(childDir, 'artifacts');
  if (!deps.existsSync(artifactsDir)) return null;

  let entries: string[];
  try {
    entries = await deps.readdir(artifactsDir);
  } catch {
    return null;
  }

  // Find iter-N directories, sorted by N descending (most recent first)
  const iterDirs = entries
    .filter(e => /^iter-\d+$/.test(e))
    .sort((a, b) => {
      const na = parseInt(a.replace('iter-', ''), 10);
      const nb = parseInt(b.replace('iter-', ''), 10);
      return nb - na;
    });

  if (iterDirs.length === 0) return null;

  let fallback: ProofArtifactsResult | null = null;

  for (const iterDir of iterDirs) {
    const manifestPath = path.join(artifactsDir, iterDir, 'proof-manifest.json');
    if (!deps.existsSync(manifestPath)) continue;

    try {
      const content = await deps.readFile(manifestPath, 'utf8');
      const manifest: ProofManifest = JSON.parse(content);
      const fullIterDir = path.join(artifactsDir, iterDir);

      if (!fallback) {
        fallback = { manifest, iterDir: fullIterDir, childDir };
      }

      if (manifest.artifacts && manifest.artifacts.length > 0) {
        return { manifest, iterDir: fullIterDir, childDir };
      }
    } catch {
      continue;
    }
  }

  return fallback;
}

/**
 * Builds the ## Proof Artifacts markdown section from a manifest result.
 * Returns an empty string if the result is null (no manifest found).
 */
export function buildProofArtifactsSection(result: ProofArtifactsResult | null): string {
  if (!result) return '';

  const { manifest, iterDir, childDir } = result;
  const lines: string[] = ['## Proof Artifacts'];

  if (manifest.summary) {
    lines.push('', manifest.summary);
  }

  if (!manifest.artifacts || manifest.artifacts.length === 0) {
    const skipReasons = manifest.skipped?.map(s => s.reason).join('; ') ?? 'no reason given';
    lines.push('', `Proof skipped: ${skipReasons}`);
    return lines.join('\n') + '\n';
  }

  lines.push('');
  for (const artifact of manifest.artifacts) {
    const relPath = path.relative(childDir, path.join(iterDir, artifact.path));
    lines.push(`- **${artifact.type}**: ${artifact.description}`);
    lines.push(`  - Path: \`${relPath}\``);
  }

  return lines.join('\n') + '\n';
}

/**
 * Copies screenshot proof artifacts from the child session into the git worktree
 * under a .proof/ directory and commits them. This makes artifacts viewable inline
 * on GitHub PRs via relative image paths.
 *
 * Returns an empty string if no manifest/artifacts exist, or the proof markdown
 * section with embedded images referencing committed .proof/ paths.
 */
export async function commitProofArtifacts(
  childDir: string,
  worktree: string,
  deps: ProofAttachDeps,
): Promise<string> {
  const result = await readLatestProofManifest(childDir, deps);
  if (!result) return '';
  const { manifest, iterDir } = result;
  if (!manifest.artifacts || manifest.artifacts.length === 0) return '';

  const screenshots = manifest.artifacts.filter(a => a.type === 'screenshot');
  if (screenshots.length === 0) return buildPrProofBody(result);

  // Copy screenshots into the worktree under .proof/
  const proofDir = path.join(worktree, '.proof');
  await deps.mkdir(proofDir, { recursive: true });
  for (const artifact of screenshots) {
    const src = path.join(iterDir, artifact.path);
    const basename = path.basename(artifact.path);
    if (deps.existsSync(src)) {
      await deps.cp(src, path.join(proofDir, basename), {});
    }
  }

  // Commit proof artifacts to the branch
  deps.spawnSync('git', ['-C', worktree, 'add', '.proof'], { encoding: 'utf8' });
  const statusResult = deps.spawnSync('git', ['-C', worktree, 'status', '--porcelain', '--', '.proof'], { encoding: 'utf8' });
  if (statusResult.stdout?.trim()) {
    deps.spawnSync('git', ['-C', worktree, 'commit', '-m', 'chore: add proof artifacts'], { encoding: 'utf8' });
  }

  // Build proof section with embedded images
  return buildPrProofBody(result);
}

/**
 * Builds the PR body markdown section for proof artifacts with inline images.
 * Screenshots use relative paths (.proof/<basename>) that GitHub renders from the branch.
 * Non-screenshot artifacts are listed by description only (no local paths).
 */
export function buildPrProofBody(result: ProofArtifactsResult | null): string {
  if (!result) return '';

  const { manifest } = result;
  const lines: string[] = ['## Proof Artifacts'];

  if (manifest.summary) {
    lines.push('', manifest.summary);
  }

  if (!manifest.artifacts || manifest.artifacts.length === 0) {
    const skipReasons = manifest.skipped?.map(s => s.reason).join('; ') ?? 'no reason given';
    lines.push('', `Proof skipped: ${skipReasons}`);
    return lines.join('\n') + '\n';
  }

  lines.push('');
  for (const artifact of manifest.artifacts) {
    if (artifact.type === 'screenshot') {
      const basename = path.basename(artifact.path);
      lines.push(`- **${artifact.type}**: ${artifact.description}`);
      lines.push(`  ![](.proof/${basename})`);
    } else {
      lines.push(`- **${artifact.type}**: ${artifact.description}`);
    }
  }

  return lines.join('\n') + '\n';
}
