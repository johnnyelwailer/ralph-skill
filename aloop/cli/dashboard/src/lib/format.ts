// ── Types ──

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

export function formatTime(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
}

export function formatTimeShort(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ts; }
}

export function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatDuration(raw: string): string {
  const match = raw.match(/^(\d+)s$/);
  if (!match) return raw;
  return formatSecs(parseInt(match[1], 10));
}

export function formatDateKey(ts: string): string {
  if (!ts) return 'Unknown';
  try { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Unknown'; }
}

export function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ''; }
}
