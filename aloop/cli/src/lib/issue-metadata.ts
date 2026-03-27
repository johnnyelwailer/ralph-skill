/**
 * Shared metadata builders for GitHub issues and PRs.
 *
 * Ensures consistent "Aloop Metadata" sections in issue bodies and
 * rich PR descriptions with wave, complexity, labels, and verification info.
 */

export interface AloopMetadata {
  wave?: number;
  type?: string;
  files?: string[];
  complexity?: string;
  depends_on?: number[];
  child_session?: string | null;
  labels?: string[];
}

export interface PrBodyContext {
  issue_number: number;
  issue_title: string;
  wave?: number;
  complexity?: string;
  labels?: string[];
  child_session?: string | null;
  file_hints?: string[];
  commit_summary?: string;
  scope_summary?: string;
  verification_notes?: string;
}

/**
 * Builds the "## Aloop Metadata" markdown section from structured metadata.
 *
 * Only includes fields that have values. Returns empty string if no metadata.
 */
export function buildAloopMetadataSection(meta: AloopMetadata): string {
  const lines: string[] = [];

  if (meta.wave !== undefined) lines.push(`- Wave: ${meta.wave}`);
  if (meta.type) lines.push(`- Type: ${meta.type}`);
  if (meta.files && meta.files.length > 0) {
    const fileStr = meta.files.map(f => `\`${f}\``).join(', ');
    lines.push(`- Files: ${fileStr}`);
  }
  if (meta.complexity) lines.push(`- Complexity: ${meta.complexity}`);
  if (meta.depends_on && meta.depends_on.length > 0) {
    const depStr = meta.depends_on.map(d => `#${d}`).join(', ');
    lines.push(`- Dependencies: ${depStr}`);
  }
  if (meta.child_session) lines.push(`- Session: \`${meta.child_session}\``);
  if (meta.labels && meta.labels.length > 0) {
    lines.push(`- Labels: ${meta.labels.join(', ')}`);
  }

  if (lines.length === 0) return '';

  return `## Aloop Metadata\n${lines.join('\n')}`;
}

/**
 * Ensures an issue body contains an "Aloop Metadata" section.
 *
 * If the body already has `## Aloop Metadata`, it is replaced with the new section.
 * Otherwise the new section is appended at the end.
 */
export function ensureMetadataSection(body: string, meta: AloopMetadata): string {
  const section = buildAloopMetadataSection(meta);
  if (!section) return body;

  const marker = '## Aloop Metadata';
  const idx = body.indexOf(marker);
  if (idx !== -1) {
    // Replace existing metadata section — find next ## heading or end of string
    const afterMarker = idx + marker.length;
    const nextHeading = body.indexOf('\n## ', afterMarker);
    if (nextHeading !== -1) {
      return `${body.substring(0, idx)}${section}\n\n${body.substring(nextHeading + 1)}`;
    }
    return `${body.substring(0, idx)}${section}`;
  }

  // Append at end
  const trimmed = body.trimEnd();
  return `${trimmed}\n\n${section}`;
}

/**
 * Builds a rich PR body with structured metadata and verification section.
 *
 * Format:
 *   Closes #N
 *
 *   ## Scope
 *   <summary>
 *
 *   ## Aloop Metadata
 *   <wave, complexity, labels, files>
 *
 *   ## Verification
 *   <verification notes or default message>
 */
export function buildPrBody(ctx: PrBodyContext): string {
  const parts: string[] = [];

  parts.push(`Closes #${ctx.issue_number}`);

  if (ctx.scope_summary) {
    parts.push('');
    parts.push('## Scope');
    parts.push(ctx.scope_summary);
  }

  // Build metadata section
  const meta: AloopMetadata = {};
  if (ctx.wave !== undefined) meta.wave = ctx.wave;
  if (ctx.complexity) meta.complexity = ctx.complexity;
  if (ctx.labels && ctx.labels.length > 0) meta.labels = ctx.labels;
  if (ctx.file_hints && ctx.file_hints.length > 0) meta.files = ctx.file_hints;

  const metaSection = buildAloopMetadataSection(meta);
  if (metaSection) {
    parts.push('');
    parts.push(metaSection);
  }

  // Verification section
  parts.push('');
  parts.push('## Verification');
  if (ctx.verification_notes) {
    parts.push(ctx.verification_notes);
  } else {
    parts.push('Automated implementation by aloop child loop. Review the diff and tests for correctness.');
  }

  if (ctx.child_session) {
    parts.push('');
    parts.push(`Session: \`${ctx.child_session}\``);
  }

  return parts.join('\n');
}

/**
 * Builds issue body labels list from an OrchestratorIssue-like object.
 *
 * Returns the canonical label set for an issue based on its metadata.
 */
export function buildIssueLabels(opts: {
  wave?: number;
  is_epic?: boolean;
  is_sub_issue?: boolean;
  is_spec_question?: boolean;
  is_blocked?: boolean;
  is_auto_resolved?: boolean;
  component_labels?: string[];
}): string[] {
  const labels: string[] = ['aloop'];

  if (opts.wave !== undefined) {
    labels.push(`aloop/wave-${opts.wave}`, `wave/${opts.wave}`);
  }
  if (opts.is_epic) labels.push('aloop/epic');
  if (opts.is_sub_issue) labels.push('aloop/sub-issue');
  if (opts.is_spec_question) labels.push('aloop/spec-question');
  if (opts.is_blocked) labels.push('aloop/blocked-on-human');
  if (opts.is_auto_resolved) labels.push('aloop/auto-resolved');
  if (opts.component_labels) labels.push(...opts.component_labels);

  // Deduplicate
  return [...new Set(labels)];
}
