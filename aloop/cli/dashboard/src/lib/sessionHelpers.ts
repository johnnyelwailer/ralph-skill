import type { SessionSummary } from './types';
import { str, numStr } from './activityLogHelpers';

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
