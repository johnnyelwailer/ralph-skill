// ── Shared types and type guards ──

export type SessionStatus = Record<string, unknown>;

export interface ArtifactManifest { iteration: number; manifest: unknown; outputHeader?: string }

export interface DashboardState {
  sessionDir: string;
  workdir: string;
  runtimeDir: string;
  updatedAt: string;
  status: SessionStatus | null;
  log: string;
  docs: Record<string, string>;
  activeSessions: unknown[];
  recentSessions: unknown[];
  artifacts: ArtifactManifest[];
  repoUrl: string | null;
  meta: Record<string, unknown> | null;
}

export interface SessionSummary {
  id: string;
  name: string;
  projectName: string;
  status: string;
  phase: string;
  elapsed: string;
  iterations: string;
  isActive: boolean;
  branch: string;
  startedAt: string;
  endedAt: string;
  pid: string;
  provider: string;
  workDir: string;
  stuckCount: number;
}

export interface LogEntry {
  timestamp: string;
  phase: string;
  event: string;
  provider: string;
  model: string;
  duration: string;
  message: string;
  raw: string;
  rawObj: Record<string, unknown> | null;
  iteration: number | null;
  dateKey: string;
  isSuccess: boolean;
  isError: boolean;
  commitHash: string;
  resultDetail: string;
  filesChanged: FileChange[];
  isSignificant: boolean;
}

export interface FileChange {
  path: string;
  type: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
}

export interface ArtifactEntry {
  type: string;
  path: string;
  description: string;
  metadata?: { baseline?: string; diff_percentage?: number };
}

export interface ManifestPayload {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: ArtifactEntry[];
  outputHeader?: string;
}

export interface ProviderHealth {
  name: string;
  status: 'healthy' | 'cooldown' | 'failed' | 'unknown';
  lastEvent: string;
  reason?: string;
  consecutiveFailures?: number;
  cooldownUntil?: string;
}

export interface QACoverageFeature {
  feature: string;
  component: string;
  last_tested: string;
  commit: string;
  status: 'PASS' | 'FAIL' | 'UNTESTED';
  criteria_met: string;
  notes: string;
}

export interface QACoverageViewData {
  percentage: number | null;
  available: boolean;
  features: QACoverageFeature[];
}

export interface IterationUsage {
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  cost_usd: number;
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

// ── Type guards and helpers ──

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

export function toSession(source: Record<string, unknown>, fallback: string, isActive: boolean): SessionSummary {
  return {
    id: str(source, ['session_id', 'id'], fallback),
    name: str(source, ['session_id', 'name', 'session_name'], fallback),
    projectName: str(source, ['project_name'], '') || (() => {
      const root = str(source, ['project_root'], '');
      if (root) { const parts = root.replace(/[\\/]+$/, '').split(/[\\/]/); return parts[parts.length - 1] || root; }
      return fallback.split('-').slice(0, -1).join('-') || fallback;
    })(),
    status: str(source, ['state', 'status'], 'unknown'),
    phase: str(source, ['phase', 'mode'], ''),
    elapsed: str(source, ['elapsed', 'elapsed_time', 'duration'], '--'),
    iterations: numStr(source, ['iteration', 'iterations']),
    isActive,
    branch: str(source, ['branch'], ''),
    startedAt: str(source, ['started_at'], ''),
    endedAt: str(source, ['ended_at'], ''),
    pid: numStr(source, ['pid'], ''),
    provider: str(source, ['provider'], ''),
    workDir: str(source, ['work_dir'], ''),
    stuckCount: typeof source.stuck_count === 'number' ? source.stuck_count : 0,
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

export function parseQACoveragePayload(payload: unknown): QACoverageViewData {
  if (!isRecord(payload)) return { percentage: null, available: false, features: [] };
  const available = typeof payload.available === 'boolean' ? payload.available : true;
  const percentValue = typeof payload.coverage_percent === 'number'
    ? payload.coverage_percent
    : (typeof payload.percentage === 'number' ? payload.percentage : null);
  const features = Array.isArray(payload.features)
    ? payload.features
      .filter((f): f is Record<string, unknown> => isRecord(f))
      .map((f): QACoverageFeature => {
        const rawStatus = typeof f.status === 'string' ? f.status.toUpperCase() : 'UNTESTED';
        const status: QACoverageFeature['status'] = rawStatus === 'PASS' || rawStatus === 'FAIL' ? rawStatus : 'UNTESTED';
        return {
          feature: typeof f.feature === 'string' ? f.feature : '',
          component: typeof f.component === 'string' ? f.component : '',
          last_tested: typeof f.last_tested === 'string' ? f.last_tested : '',
          commit: typeof f.commit === 'string' ? f.commit : '',
          status,
          criteria_met: typeof f.criteria_met === 'string' ? f.criteria_met : '',
          notes: typeof f.notes === 'string' ? f.notes : '',
        };
      })
    : [];

  return { percentage: percentValue, available, features };
}
