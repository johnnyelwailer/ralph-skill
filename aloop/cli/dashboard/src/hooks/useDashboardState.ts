import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isRecord, str, numStr } from '@/lib/activityLogHelpers';
import { toSession } from '@/lib/sessionHelpers';
import { computeAvgDuration, latestQaCoverageRefreshSignal } from '@/lib/logHelpers';
import { deriveProviderHealth } from '@/lib/deriveProviderHealth';
import { useCost } from '@/hooks/useCost';
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
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('session'));
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'docs' | 'activity'>('docs');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [qaCoverageRefreshKey, setQaCoverageRefreshKey] = useState('');
  const prevPhaseRef = useRef<string>('');
  const latestQaSignalRef = useRef<string | null>(null);
  const [resumeSubmitting, setResumeSubmitting] = useState(false);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    setLoading(true);
    setLoadError(null);
    latestQaSignalRef.current = null;
    setQaCoverageRefreshKey('');
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('session', id); else url.searchParams.delete('session');
    window.history.replaceState(null, '', url.toString());
  }, []);

  // SSE + initial fetch
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;
    let stateListener: ((evt: Event) => void) | null = null;
    let heartbeatListener: (() => void) | null = null;
    let openListener: (() => void) | null = null;
    let errorListener: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    const sp = selectedSessionId ? `?session=${encodeURIComponent(selectedSessionId)}` : '';

    async function load() {
      try {
        const r = await fetch(`/api/state${sp}`, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!cancelled) {
          const payload = await r.json() as DashboardState;
          setState(payload);
          latestQaSignalRef.current = latestQaCoverageRefreshSignal(payload.log);
        }
      } catch (e) { if (!cancelled) setLoadError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    }

    function cleanupEventSource() {
      if (!eventSource) return;
      if (stateListener) eventSource.removeEventListener('state', stateListener);
      if (heartbeatListener) eventSource.removeEventListener('heartbeat', heartbeatListener);
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.close();
      eventSource = null;
      stateListener = null;
      heartbeatListener = null;
      openListener = null;
      errorListener = null;
    }

    function connectSSE() {
      if (cancelled) return;
      setConnectionStatus('connecting');
      eventSource = new EventSource(`/events${sp}`);
      stateListener = (evt: Event) => {
        try {
          const payload = JSON.parse((evt as MessageEvent<string>).data) as DashboardState;
          setState(payload);
          const nextQaSignal = latestQaCoverageRefreshSignal(payload.log);
          if (nextQaSignal && nextQaSignal !== latestQaSignalRef.current) {
            latestQaSignalRef.current = nextQaSignal;
            setQaCoverageRefreshKey(nextQaSignal);
          }
          setLoadError(null); setConnectionStatus('connected'); reconnectDelay = 1000;
        } catch (e) { setLoadError((e as Error).message); }
      };
      heartbeatListener = () => { setConnectionStatus('connected'); };
      openListener = () => { setConnectionStatus('connected'); reconnectDelay = 1000; };
      errorListener = () => {
        setConnectionStatus('disconnected');
        cleanupEventSource();
        if (!cancelled) { reconnectTimer = setTimeout(connectSSE, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); }
      };
      eventSource.addEventListener('state', stateListener);
      eventSource.addEventListener('heartbeat', heartbeatListener);
      eventSource.onopen = openListener;
      eventSource.onerror = errorListener;
    }

    load().catch(() => undefined);
    connectSSE();
    return () => {
      cancelled = true;
      controller.abort();
      cleanupEventSource();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [selectedSessionId]);

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
