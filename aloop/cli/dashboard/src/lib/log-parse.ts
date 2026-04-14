import { stripAnsi } from './ansi';
import { formatDateKey, formatSecs } from './formatters';
import type { ArtifactEntry, ArtifactManifest, FileChange, IterationUsage, LogEntry, ManifestPayload } from './log-types';

// ── Helpers ──

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(source: Record<string, unknown>, keys: string[], fb = ''): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return fb;
}

export function numStr(source: Record<string, unknown>, keys: string[], fb = '--'): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fb;
}

export const SIGNIFICANT_EVENTS = new Set([
  'iteration_complete', 'iteration_error', 'provider_cooldown', 'provider_recovered',
  'review_verdict_read', 'review_verdict_missing', 'session_start', 'session_end', 'session_restart',
  'queue_override_applied', 'queue_override_error',
]);

export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let rawObj: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(trimmed);
    if (isRecord(obj)) rawObj = obj;
  } catch { /* plain text */ }

  if (rawObj) {
    const event = str(rawObj, ['event', 'type', 'action'], '');
    const isSignificant = SIGNIFICANT_EVENTS.has(event);
    const ts = str(rawObj, ['timestamp', 'ts', 'time', 'created_at']);
    const phase = str(rawObj, ['phase', 'mode']);
    const provider = str(rawObj, ['provider']);
    const model = str(rawObj, ['model']);
    const duration = str(rawObj, ['duration', 'elapsed', 'took']);
    const message = str(rawObj, ['message', 'msg', 'detail', 'description', 'text'], event);
    const iterRaw = rawObj.iteration;
    const iteration = typeof iterRaw === 'number' ? iterRaw : (typeof iterRaw === 'string' ? parseInt(iterRaw, 10) || null : null);
    const commitHash = str(rawObj, ['commit', 'commit_hash', 'sha']);
    const isSuccess = event.includes('complete') || event.includes('success') || event.includes('approved') || event.includes('recovered');
    const isError = event.includes('error') || event.includes('fail') || event.includes('cooldown');

    let resultDetail = '';
    if (commitHash) resultDetail = commitHash.slice(0, 7);
    else if (event.includes('verdict')) resultDetail = str(rawObj, ['verdict']);
    else if (isError) resultDetail = str(rawObj, ['reason', 'error', 'exit_code'], 'error');

    const filesChanged: FileChange[] = [];
    const files = rawObj.files ?? rawObj.files_changed;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (isRecord(f)) {
          filesChanged.push({
            path: typeof f.path === 'string' ? f.path : typeof f.file === 'string' ? f.file : '?',
            type: (typeof f.status === 'string' ? f.status[0]?.toUpperCase() : 'M') as FileChange['type'],
            additions: typeof f.additions === 'number' ? f.additions : 0,
            deletions: typeof f.deletions === 'number' ? f.deletions : 0,
          });
        }
      }
    }

    return { timestamp: ts, phase, event, provider, model, duration, message: stripAnsi(message), raw: trimmed, rawObj, iteration, dateKey: formatDateKey(ts), isSuccess, isError, commitHash, resultDetail, filesChanged, isSignificant };
  }

  // Plain text lines (provider stderr, stack traces) are not significant — hide from activity view
  return { timestamp: '', phase: '', event: '', provider: '', model: '', duration: '', message: stripAnsi(trimmed), raw: trimmed, rawObj: null, iteration: null, dateKey: 'Log', isSuccess: false, isError: false, commitHash: '', resultDetail: '', filesChanged: [], isSignificant: false };
}

/** Extract token/cost usage from a log entry's rawObj. Returns null if no usage data. */
export function extractIterationUsage(rawObj: Record<string, unknown> | null): IterationUsage | null {
  if (!rawObj) return null;
  const costVal = typeof rawObj.cost_usd === 'number' ? rawObj.cost_usd
    : typeof rawObj.cost_usd === 'string' ? parseFloat(rawObj.cost_usd as string) : NaN;
  if (isNaN(costVal) || costVal <= 0) return null;
  return {
    tokens_input: Number(rawObj.tokens_input) || 0,
    tokens_output: Number(rawObj.tokens_output) || 0,
    tokens_cache_read: Number(rawObj.tokens_cache_read) || 0,
    cost_usd: costVal,
  };
}

export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

export function isImageArtifact(a: ArtifactEntry) {
  const ext = a.path.includes('.') ? a.path.slice(a.path.lastIndexOf('.')).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || a.type === 'screenshot' || a.type === 'visual_diff';
}

export function artifactUrl(iter: number, file: string) { return `/api/artifacts/${iter}/${encodeURIComponent(file)}`; }

export function parseManifest(am: ArtifactManifest): ManifestPayload | null {
  const m = am.manifest;
  if (!isRecord(m) && !am.outputHeader) return null;
  const manifest = isRecord(m) ? m : null;
  return {
    iteration: am.iteration,
    phase: manifest && typeof manifest.phase === 'string' ? manifest.phase : 'proof',
    summary: manifest && typeof manifest.summary === 'string' ? manifest.summary : '',
    artifacts: manifest && Array.isArray(manifest.artifacts) ? (manifest.artifacts as unknown[]).filter(isRecord).map((a) => ({
      type: typeof a.type === 'string' ? a.type : 'unknown',
      path: typeof a.path === 'string' ? a.path : '',
      description: typeof a.description === 'string' ? a.description : '',
      metadata: isRecord(a.metadata) ? {
        baseline: typeof a.metadata.baseline === 'string' ? a.metadata.baseline : undefined,
        diff_percentage: typeof a.metadata.diff_percentage === 'number' ? a.metadata.diff_percentage : undefined,
      } : undefined,
    })) : [],
    outputHeader: am.outputHeader,
  };
}

/** Extract model from opencode output header like "> build · openrouter/hunter-alpha" */
export function extractModelFromOutput(header?: string): string {
  if (!header) return '';
  const match = header.match(/^>\s*\w+\s*·\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

export function parseDurationSeconds(raw: string): number | null {
  if (!raw) return null;
  const msMatch = raw.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) return parseFloat(msMatch[1]) / 1000;
  const sMatch = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) return parseFloat(sMatch[1]);
  const mixedMatch = raw.match(/^(\d+)m\s*(\d+(?:\.\d+)?)s$/);
  if (mixedMatch) return parseInt(mixedMatch[1], 10) * 60 + parseFloat(mixedMatch[2]);
  const plainMatch = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plainMatch) return parseFloat(plainMatch[1]);
  return null;
}

export function computeAvgDuration(log: string): string {
  if (!log) return '';
  let totalSec = 0;
  let count = 0;
  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      if (event !== 'iteration_complete') continue;
      const dur = str(obj, ['duration', 'elapsed', 'took']);
      const secs = parseDurationSeconds(dur);
      if (secs !== null && secs > 0) {
        totalSec += secs;
        count++;
      }
    } catch { /* skip */ }
  }
  if (count === 0) return '';
  return formatSecs(totalSec / count);
}
