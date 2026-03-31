import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isRecord, str, numStr } from '@/lib/activityLogHelpers';
import { toSession } from '@/lib/sessionHelpers';
import { computeAvgDuration } from '@/lib/logHelpers';
import { deriveProviderHealth } from '@/lib/deriveProviderHealth';
import { useCost } from '@/hooks/useCost';
import { useSSEConnection } from '@/hooks/useSSEConnection';
import { parseTodoProgress } from '../../../src/lib/parseTodoProgress';
import type { DashboardState, SessionSummary, ConnectionStatus } from '@/lib/types';

export interface UseDashboardStateResult {
  // Raw state
  state: DashboardState | null;
  loading: boolean;
  loadError: string | null;
  connectionStatus: ConnectionStatus;
  qaCoverageRefreshKey: string;

  // Sessions
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  selectSession: (id: string | null) => void;

  // Derived state
  statusRecord: Record<string, unknown> | null;
  currentPhase: string;
  currentState: string;
  currentIteration: string;
  currentIterationNum: number | null;
  providerName: string;
  modelName: string;
  stuckCount: number;
  isRunning: boolean;
  startedAt: string;
  iterationStartedAt: string;
  maxIterations: number | null;
  avgDuration: string;
  todoContent: string;
  tasksCompleted: number;
  tasksTotal: number;
  progressPercent: number;
  providerHealth: ReturnType<typeof deriveProviderHealth>;
  currentSessionName: string;

  // Budget
  sessionCost: number;
  totalCost: number | null;
  budgetCap: number | null;
  budgetUsedPercent: number | null;
  costLoading: boolean;
  costError: string | null;
  budgetWarnings: number[];
  budgetPauseThreshold: number | null;

  // Steer
  steerInstruction: string;
  setSteerInstruction: (v: string) => void;
  steerSubmitting: boolean;
  handleSteer: () => void;

  // Stop
  stopSubmitting: boolean;
  handleStop: (force: boolean) => void;

  // Resume
  resumeSubmitting: boolean;
  handleResume: () => void;

  // Activity
  activePanel: 'docs' | 'activity';
  setActivePanel: (p: 'docs' | 'activity') => void;
  activityCollapsed: boolean;
  setActivityCollapsed: (v: boolean) => void;

  // Command palette
  commandOpen: boolean;
  setCommandOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}

export function useDashboardState(): UseDashboardStateResult {
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('session'));
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'docs' | 'activity'>('docs');
  const [resumeSubmitting, setResumeSubmitting] = useState(false);
  const prevPhaseRef = useRef<string>('');

  const { state, loading, loadError, connectionStatus, qaCoverageRefreshKey } = useSSEConnection(selectedSessionId);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('session', id); else url.searchParams.delete('session');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const sessions = useMemo<SessionSummary[]>(() => {
    if (!state) return [{ id: 'current', name: 'Current', projectName: 'Unknown', status: 'unknown', phase: '', elapsed: '--', iterations: '--', isActive: false, branch: '', startedAt: '', endedAt: '', pid: '', provider: '', workDir: '', stuckCount: 0 }];
    const active = (state.activeSessions ?? []).filter(isRecord).map((e, i) => toSession(e, `active-${i}`, true));
    const recent = (state.recentSessions ?? []).filter(isRecord).slice(-10).reverse().map((e, i) => toSession(e, `recent-${i}`, false));
    const combined = [...active, ...recent];
    if (combined.length > 0) return combined;
    if (isRecord(state.status)) return [toSession(state.status, state.workdir, true)];
    return [{ id: 'current', name: state.workdir, projectName: 'Unknown', status: 'unknown', phase: '', elapsed: '--', iterations: '--', isActive: false, branch: '', startedAt: '', endedAt: '', pid: '', provider: '', workDir: '', stuckCount: 0 }];
  }, [state]);

  const statusRecord = isRecord(state?.status) ? state.status : null;
  const currentPhase = statusRecord ? str(statusRecord, ['mode', 'phase']) : '';
  const currentState = statusRecord ? str(statusRecord, ['state', 'status'], 'unknown') : 'unknown';
  const currentIteration = statusRecord ? numStr(statusRecord, ['iteration', 'iterations']) : '--';
  const currentIterationNum = statusRecord ? (typeof statusRecord.iteration === 'number' ? statusRecord.iteration : null) : null;
  const providerName = statusRecord ? str(statusRecord, ['provider', 'current_provider']) : '';
  const modelName = statusRecord ? str(statusRecord, ['model', 'current_model']) : '';
  const stuckCount = statusRecord && typeof statusRecord.stuck_count === 'number' ? statusRecord.stuck_count : 0;
  const isRunning = currentState === 'running';
  const startedAt = statusRecord ? str(statusRecord, ['started_at', 'startedAt']) : '';
  const iterationStartedAt = statusRecord ? str(statusRecord, ['iteration_started_at']) : '';
  const metaRecord = isRecord(state?.meta) ? state.meta : null;
  const maxIterations = metaRecord && typeof metaRecord.max_iterations === 'number' ? metaRecord.max_iterations : null;
  const avgDuration = useMemo(() => computeAvgDuration(state?.log ?? ''), [state?.log]);
  const {
    sessionCost,
    totalCost,
    budgetCap,
    budgetUsedPercent,
    isLoading: costLoading,
    error: costError,
  } = useCost({ log: state?.log ?? '', meta: metaRecord });

  const budgetWarnings = useMemo(() => {
    if (!metaRecord) return [] as number[];
    const raw = metaRecord.budget_warnings;
    if (!Array.isArray(raw)) return [] as number[];
    return raw
      .map((value) => (typeof value === 'number' ? value : (typeof value === 'string' ? Number.parseFloat(value) : NaN)))
      .filter((value): value is number => Number.isFinite(value) && value > 0);
  }, [metaRecord]);

  const budgetPauseThreshold = useMemo(() => {
    if (!metaRecord) return null;
    const raw = metaRecord.budget_pause_threshold;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [metaRecord]);

  // Phase change toast
  useEffect(() => {
    if (currentPhase && prevPhaseRef.current && currentPhase !== prevPhaseRef.current) {
      toast(`Phase: ${prevPhaseRef.current} \u2192 ${currentPhase}`, { description: `Iteration ${currentIteration}` });
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, currentIteration]);

  const todoContent = state?.docs?.['TODO.md'] ?? '';
  const { completed: tasksCompleted, total: tasksTotal } = useMemo(() => parseTodoProgress(todoContent), [todoContent]);
  const progressPercent = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  const configuredProviders = useMemo(() => {
    if (!metaRecord) return undefined;
    const list = metaRecord.enabled_providers ?? metaRecord.round_robin_order;
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : undefined;
  }, [metaRecord]);
  const providerHealth = useMemo(() => deriveProviderHealth(state?.log ?? '', configuredProviders), [state?.log, configuredProviders]);

  const currentSession = sessions.find((s) => selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId);
  const currentSessionName = currentSession?.name ?? 'No session';

  const handleSteer = useCallback(async () => {
    if (!steerInstruction.trim() || steerSubmitting) return;
    setSteerSubmitting(true);
    try {
      const r = await fetch('/api/steer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: steerInstruction.trim() }) });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      setSteerInstruction(''); toast.success('Steering instruction queued.');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSteerSubmitting(false); }
  }, [steerInstruction, steerSubmitting]);

  const handleStop = useCallback(async (force: boolean) => {
    if (stopSubmitting) return;
    setStopSubmitting(true);
    try {
      const r = await fetch('/api/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(force ? { force: true } : {}) });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      const p = await r.json() as { signal?: string };
      toast.info(`Stop requested (${p.signal ?? 'SIGTERM'}).`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setStopSubmitting(false); }
  }, [stopSubmitting]);

  const handleResume = useCallback(async () => {
    if (resumeSubmitting) return;
    setResumeSubmitting(true);
    try {
      const r = await fetch('/api/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!r.ok) { const p = await r.json() as { error?: string }; throw new Error(p.error ?? `HTTP ${r.status}`); }
      const p = await r.json() as { pid?: number };
      toast.success(`Loop resumed (PID ${p.pid}).`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setResumeSubmitting(false); }
  }, [resumeSubmitting]);

  return {
    state, loading, loadError, connectionStatus, qaCoverageRefreshKey,
    sessions, selectedSessionId, selectSession,
    statusRecord, currentPhase, currentState, currentIteration, currentIterationNum,
    providerName, modelName, stuckCount, isRunning, startedAt, iterationStartedAt,
    maxIterations, avgDuration, todoContent, tasksCompleted, tasksTotal, progressPercent,
    providerHealth, currentSessionName,
    sessionCost, totalCost, budgetCap, budgetUsedPercent, costLoading, costError,
    budgetWarnings, budgetPauseThreshold,
    steerInstruction, setSteerInstruction, steerSubmitting, handleSteer,
    stopSubmitting, handleStop,
    resumeSubmitting, handleResume,
    activePanel, setActivePanel, activityCollapsed, setActivityCollapsed,
    commandOpen, setCommandOpen,
  };
}
