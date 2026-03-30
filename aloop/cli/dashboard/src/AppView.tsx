import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Square, Zap } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { StatusDot } from '@/components/shared/StatusDot';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import { Sidebar } from '@/components/layout/Sidebar';
export { Sidebar } from '@/components/layout/Sidebar';
import { Header, QACoverageBadge } from '@/components/layout/Header';
export { QACoverageBadge } from '@/components/layout/Header';
import { SessionDetail } from '@/components/session/SessionDetail';
export { slugify, DocContent } from '@/components/session/SessionDetail';
export {
  ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations,
} from '@/components/session/ActivityLog';
import {
  isRecord, str, numStr,
} from '@/lib/activityLogHelpers';
export {
  isRecord, str, numStr, SIGNIFICANT_EVENTS, parseLogLine,
  phaseDotColors, extractIterationUsage, IMAGE_EXT, isImageArtifact, artifactUrl,
  parseManifest, extractModelFromOutput,
} from '@/lib/activityLogHelpers';
import { useCost } from '@/hooks/useCost';
import { parseTodoProgress } from '../../src/lib/parseTodoProgress';
import { ResponsiveLayout, useResponsiveLayout } from '@/components/layout/ResponsiveLayout';

export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';

import {
  formatSecs, parseDurationSeconds,
} from './lib/format';
export {
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, parseDurationSeconds,
} from './lib/format';

// ── Types ──

import type {
  DashboardState, SessionSummary,
  ConnectionStatus,
} from './lib/types';
export type {
  SessionStatus, ArtifactManifest, DashboardState, SessionSummary,
  FileChange, LogEntry, ArtifactEntry, ManifestPayload,
  QACoverageFeature, QACoverageViewData, CostSessionResponse,
  ConnectionStatus, IterationUsage,
} from './lib/types';

// ── Helpers ──

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



// ── Average iteration duration from log ──

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

function latestQaCoverageRefreshSignal(log: string): string | null {
  if (!log) return null;
  const lines = log.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (!isRecord(entry)) continue;
      const event = str(entry, ['event', 'type']);
      const phase = str(entry, ['phase', 'mode']).toLowerCase();
      if (event !== 'iteration_complete' || phase !== 'qa') continue;
      const timestamp = str(entry, ['timestamp', 'ts', 'time', 'created_at']);
      const iterationRaw = entry.iteration;
      const iteration = typeof iterationRaw === 'number' ? String(iterationRaw)
        : typeof iterationRaw === 'string' ? iterationRaw : '';
      return `${timestamp}|${iteration}|${line}`;
    } catch {
      // Skip non-JSON lines in log stream.
    }
  }
  return null;
}

// ── Provider health derived from log ──

export function deriveProviderHealth(log: string, configuredProviders?: string[]): ProviderHealth[] {
  const providers = new Map<string, ProviderHealth>();

  // Seed configured providers as baseline with 'unknown' status
  if (configuredProviders) {
    for (const name of configuredProviders) {
      if (name) providers.set(name, { name, status: 'unknown', lastEvent: '' });
    }
  }

  for (const line of log.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (!isRecord(obj)) continue;
      const event = str(obj, ['event']);
      const provider = str(obj, ['provider']);
      const ts = str(obj, ['timestamp']);
      if (!provider) continue;

      if (event === 'provider_cooldown') {
        providers.set(provider, {
          name: provider,
          status: 'cooldown',
          lastEvent: ts,
          reason: str(obj, ['reason']),
          consecutiveFailures: typeof obj.consecutive_failures === 'number' ? obj.consecutive_failures : undefined,
          cooldownUntil: str(obj, ['cooldown_until']),
        });
      } else if (event === 'provider_recovered') {
        providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
      } else if (event === 'iteration_complete' || event === 'iteration_error') {
        if (!providers.has(provider) || providers.get(provider)!.status === 'unknown') {
          providers.set(provider, { name: provider, status: 'healthy', lastEvent: ts });
        } else {
          const existing = providers.get(provider)!;
          if (event === 'iteration_complete' && existing.status !== 'cooldown') {
            existing.status = 'healthy';
          }
          existing.lastEvent = ts;
        }
      }
    } catch { /* skip */ }
  }
  return Array.from(providers.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Command Palette ──

function CommandPalette({ open, onClose, sessions, onSelectSession, onStop }: {
  open: boolean; onClose: () => void; sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void; onStop: (force: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 animate-fade-in" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div className="w-full max-w-md rounded-lg border bg-popover shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput autoFocus placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { onClose(); onStop(false); }}>
                <Square className="h-4 w-4 mr-2" /> Stop session (graceful)
              </CommandItem>
              <CommandItem onSelect={() => { onClose(); onStop(true); }}>
                <Zap className="h-4 w-4 mr-2" /> Force stop (SIGKILL)
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Sessions">
              {sessions.map((s) => (
                <CommandItem key={s.id} onSelect={() => { onClose(); onSelectSession(s.id === 'current' ? null : s.id); }}>
                  <div className="flex items-center gap-2">
                    {s.isActive && s.status === 'running' && <StatusDot status="running" />}
                    <span>{s.name}</span>
                    {s.phase && <PhaseBadge phase={s.phase} small />}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}

// ── Main App ──

function AppInner() {
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
  const { isDesktop, isMobile, sidebarOpen, toggleSidebar, openSidebar, closeSidebar } = useResponsiveLayout();

  // Swipe-right gesture: open sidebar when swiping from left edge on mobile
  const SWIPE_EDGE_THRESHOLD_PX = 20;
  const SWIPE_MIN_DISTANCE_PX = 50;
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || touchStartXRef.current === null) return;
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX > SWIPE_EDGE_THRESHOLD_PX) return;
    const endX = e.changedTouches[0]?.clientX ?? 0;
    if (endX - startX >= SWIPE_MIN_DISTANCE_PX) {
      openSidebar();
    }
  }, [isMobile, openSidebar]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!isMobile) toggleSidebar(); }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCommandOpen((p) => !p); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar, isMobile]);

  // Mobile sidebar: Escape key closes drawer
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSidebar(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, closeSidebar]);

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
  const sessionName = currentSession?.name ?? 'No session';

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

  const [resumeSubmitting, setResumeSubmitting] = useState(false);
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

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar — visible at sm+ (640px); mobile uses the overlay drawer */}
        <div className="hidden sm:flex">
          <Sidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={selectSession}
            collapsed={isDesktop ? false : !sidebarOpen}
            onToggle={toggleSidebar}
            sessionCost={sessionCost}
            isDesktop={isDesktop}
          />
        </div>
        {/* Mobile/Tablet sidebar drawer */}
        {!isDesktop && sidebarOpen && (
          <div className="fixed inset-0 z-40 animate-fade-in" onClick={closeSidebar}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full w-64 max-w-[80vw] bg-background animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
              <Sidebar
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                onSelectSession={(id) => { selectSession(id); closeSidebar(); }}
                collapsed={false}
                onToggle={closeSidebar}
                sessionCost={sessionCost}
              />
            </div>
          </div>
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <Header sessionName={sessionName} isRunning={isRunning} currentState={currentState} currentPhase={currentPhase} currentIteration={currentIteration} providerName={providerName} modelName={modelName} tasksCompleted={tasksCompleted} tasksTotal={tasksTotal} progressPercent={progressPercent} updatedAt={state?.updatedAt ?? ''} loading={loading} loadError={loadError} connectionStatus={connectionStatus} onOpenCommand={() => setCommandOpen(true)} onOpenSwitcher={openSidebar} startedAt={startedAt} avgDuration={avgDuration} maxIterations={maxIterations} stuckCount={stuckCount} onToggleMobileMenu={toggleSidebar} selectedSessionId={selectedSessionId} qaCoverageRefreshKey={qaCoverageRefreshKey} sessionCost={sessionCost} totalCost={totalCost} budgetCap={budgetCap} budgetUsedPercent={budgetUsedPercent} costError={costError} costLoading={costLoading} budgetWarnings={budgetWarnings} budgetPauseThreshold={budgetPauseThreshold} />
          <SessionDetail
            docs={state?.docs ?? {}}
            log={state?.log ?? ''}
            artifacts={state?.artifacts ?? []}
            repoUrl={state?.repoUrl}
            providerHealth={providerHealth}
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            activityCollapsed={activityCollapsed}
            setActivityCollapsed={setActivityCollapsed}
            currentIterationNum={currentIterationNum}
            currentPhase={currentPhase}
            currentProvider={providerName}
            isRunning={isRunning}
            iterationStartedAt={iterationStartedAt}
            steerInstruction={steerInstruction}
            setSteerInstruction={setSteerInstruction}
            onSteer={() => void handleSteer()}
            steerSubmitting={steerSubmitting}
            onStop={(f) => void handleStop(f)}
            stopSubmitting={stopSubmitting}
            onResume={() => void handleResume()}
            resumeSubmitting={resumeSubmitting}
          />
        </div>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} sessions={sessions} onSelectSession={selectSession} onStop={(f) => void handleStop(f)} />
      <Toaster />
    </div>
  );
}

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <ResponsiveLayout>
        <AppInner />
      </ResponsiveLayout>
    </TooltipProvider>
  );
}
