import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type SessionStatus = Record<string, unknown>;

interface ArtifactManifest {
  iteration: number;
  manifest: unknown;
}

interface DashboardState {
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
}

interface SessionSummary {
  id: string;
  name: string;
  status: string;
  phase: string;
  elapsed: string;
  iterations: string;
  isActive: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return fallback;
}

function readNumberLike(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function toSessionSummary(source: Record<string, unknown>, fallbackName: string, isActive: boolean): SessionSummary {
  return {
    id: readString(source, ['session_id', 'id'], fallbackName),
    name: readString(source, ['project_name', 'name', 'session_name'], fallbackName),
    status: readString(source, ['state', 'status'], 'unknown'),
    phase: readString(source, ['mode', 'phase'], ''),
    elapsed: readString(source, ['elapsed', 'elapsed_time', 'duration'], '--'),
    iterations: readNumberLike(source, ['iteration', 'iterations'], '--'),
    isActive,
  };
}

// Phase colors per spec: plan=blue, build=amber, proof=purple, review=green
const phaseColors: Record<string, string> = {
  plan: 'bg-blue-500/20 text-blue-400',
  build: 'bg-amber-500/20 text-amber-400',
  proof: 'bg-purple-500/20 text-purple-400',
  review: 'bg-green-500/20 text-green-400',
};

const phaseBarColors: Record<string, string> = {
  plan: 'bg-blue-500',
  build: 'bg-amber-500',
  proof: 'bg-purple-500',
  review: 'bg-green-500',
};

function PhaseBadge({ phase }: { phase: string }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${colors}`}>
      {phase}
    </span>
  );
}

/** Parse TODO.md to count completed vs total tasks */
function parseTodoProgress(todoContent: string): { completed: number; total: number } {
  const taskPattern = /^[ \t]*- \[([ xX])\]/gm;
  let completed = 0;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = taskPattern.exec(todoContent)) !== null) {
    total++;
    if (match[1] !== ' ') completed++;
  }
  return { completed, total };
}

export function App() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerStatus, setSteerStatus] = useState<string | null>(null);
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopStatus, setStopStatus] = useState<string | null>(null);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionSwitcherOpen, setSessionSwitcherOpen] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    setLoading(true);
    setLoadError(null);
    setSessionSwitcherOpen(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;

    const sessionParam = selectedSessionId ? `?session=${encodeURIComponent(selectedSessionId)}` : '';

    async function loadInitialState() {
      try {
        const response = await fetch(`/api/state${sessionParam}`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const nextState = (await response.json()) as DashboardState;
        if (cancelled) return;
        setState(nextState);
      } catch (error) {
        if (cancelled) return;
        setLoadError((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialState().catch(() => undefined);

    eventSource = new EventSource(`/events${sessionParam}`);
    eventSource.addEventListener('state', (event) => {
      try {
        const messageEvent = event as MessageEvent<string>;
        const payload = JSON.parse(messageEvent.data) as DashboardState;
        setState(payload);
        setLoadError(null);
      } catch (error) {
        setLoadError((error as Error).message);
      }
    });
    eventSource.onerror = () => {
      setLoadError('Live update stream disconnected.');
    };

    return () => {
      cancelled = true;
      controller.abort();
      eventSource?.close();
    };
  }, [selectedSessionId]);

  const sessions = useMemo<SessionSummary[]>(() => {
    if (!state) {
      return [{
        id: 'current', name: 'Current workspace', status: 'unknown',
        phase: '', elapsed: '--', iterations: '--', isActive: false,
      }];
    }
    const active = (state.activeSessions ?? [])
      .filter(isRecord)
      .map((entry, index) => toSessionSummary(entry, `Active session ${index + 1}`, true));
    const recent = (state.recentSessions ?? [])
      .filter(isRecord)
      .slice(-5)
      .reverse()
      .map((entry, index) => toSessionSummary(entry, `Recent session ${index + 1}`, false));
    const combined = [...active, ...recent];
    if (combined.length > 0) return combined;
    if (isRecord(state.status)) return [toSessionSummary(state.status, state.workdir, true)];
    return [{
      id: 'current', name: state.workdir, status: 'unknown',
      phase: '', elapsed: '--', iterations: '--', isActive: false,
    }];
  }, [state]);

  const statusRecord = isRecord(state?.status) ? state.status : null;
  const currentPhase = statusRecord ? readString(statusRecord, ['mode', 'phase'], '') : '';
  const currentState = statusRecord ? readString(statusRecord, ['state', 'status'], 'unknown') : 'unknown';
  const currentIteration = statusRecord ? readNumberLike(statusRecord, ['iteration', 'iterations'], '--') : '--';
  const providerName = statusRecord ? readString(statusRecord, ['provider', 'current_provider'], '') : '';
  const isRunning = currentState === 'running';

  // Parse TODO.md for progress bar
  const todoContent = state?.docs?.['TODO.md'] ?? '';
  const { completed: tasksCompleted, total: tasksTotal } = useMemo(() => parseTodoProgress(todoContent), [todoContent]);
  const progressPercent = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  // Current session name
  const currentSession = sessions.find((s) =>
    selectedSessionId === null
      ? s.id === 'current' || sessions.indexOf(s) === 0
      : s.id === selectedSessionId,
  );
  const sessionName = currentSession?.name ?? 'No session';

  const handleSteer = useCallback(async () => {
    if (steerInstruction.trim().length === 0 || steerSubmitting) return;
    setSteerSubmitting(true);
    setSteerStatus(null);
    try {
      const response = await fetch('/api/steer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction: steerInstruction.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setSteerInstruction('');
      setSteerStatus('Steering instruction queued.');
    } catch (error) {
      setSteerStatus((error as Error).message);
    } finally {
      setSteerSubmitting(false);
    }
  }, [steerInstruction, steerSubmitting]);

  const handleStop = useCallback(async (force: boolean) => {
    if (stopSubmitting) return;
    setStopSubmitting(true);
    setStopStatus(null);
    try {
      const response = await fetch('/api/stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { signal?: string };
      setStopStatus(`Stop requested (${payload.signal ?? 'SIGTERM'}).`);
    } catch (error) {
      setStopStatus((error as Error).message);
    } finally {
      setStopSubmitting(false);
    }
  }, [stopSubmitting]);

  const phaseBarColor = phaseBarColors[currentPhase.toLowerCase()] ?? 'bg-muted-foreground';

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Header: session info + progress bar + phase indicator ── */}
      <header className="border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Session name + switcher */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
              onClick={() => setSessionSwitcherOpen(!sessionSwitcherOpen)}
            >
              {isRunning && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
              <span className="truncate max-w-[200px]">{sessionName}</span>
              <span className="text-muted-foreground text-xs">&#x25BE;</span>
            </button>
            {sessionSwitcherOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-md border bg-card shadow-lg">
                <div className="p-2 space-y-1 max-h-64 overflow-auto">
                  {sessions.map((session) => {
                    const isSelected = selectedSessionId === null
                      ? session.id === 'current' || sessions.indexOf(session) === 0
                      : session.id === selectedSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                          isSelected ? 'bg-accent font-medium' : ''
                        } ${!session.isActive ? 'opacity-60' : ''}`}
                        onClick={() => selectSession(session.id === 'current' ? null : session.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          {session.isActive && session.status === 'running' && (
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                          )}
                          <span className="truncate">{session.name}</span>
                          <PhaseBadge phase={session.phase} />
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {session.status} &middot; {session.elapsed} &middot; iter {session.iterations}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Iteration */}
          <span className="text-xs text-muted-foreground">
            iter {currentIteration}{tasksTotal > 0 ? `/${tasksTotal}` : ''}
          </span>

          {/* Progress bar */}
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${phaseBarColor}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
          </div>

          {/* Phase indicator */}
          <PhaseBadge phase={currentPhase} />

          {/* Provider */}
          {providerName && (
            <span className="text-xs text-muted-foreground">{providerName}</span>
          )}

          {/* Status */}
          <span className="text-xs text-muted-foreground">{currentState}</span>

          {/* Updated timestamp */}
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? 'Loading...' : state?.updatedAt ?? ''}
            {loadError ? ` • ${loadError}` : ''}
          </span>
        </div>
      </header>

      {/* ── Main content: TODO + Log side by side ── */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* Left column: TODO.md (live) */}
        <div className="flex flex-col gap-3 min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">TODO.md</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 px-4 pb-3">
              <TodoPanel content={todoContent} />
            </CardContent>
          </Card>

          {/* Other docs (collapsible) */}
          <DocsPanel
            docs={state?.docs ?? {}}
            expandedDoc={expandedDoc}
            onToggleDoc={setExpandedDoc}
          />
        </div>

        {/* Right column: Log + artifacts */}
        <div className="flex flex-col gap-3 min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Log</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 px-4 pb-3">
              <LogPanel log={state?.log ?? ''} artifacts={state?.artifacts ?? []} />
            </CardContent>
          </Card>
        </div>
      </main>

      {/* ── Footer: always-visible steer + stop ── */}
      <footer className="border-t px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex gap-2">
              <Textarea
                className="min-h-[36px] h-9 resize-none text-sm"
                placeholder="Steer: enter guidance for the next iteration..."
                value={steerInstruction}
                onChange={(e) => setSteerInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSteer();
                  }
                }}
              />
              <Button
                size="sm"
                disabled={steerSubmitting || steerInstruction.trim().length === 0}
                onClick={() => void handleSteer()}
              >
                {steerSubmitting ? '...' : 'Send'}
              </Button>
            </div>
            {steerStatus && <p className="text-xs text-muted-foreground">{steerStatus}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={stopSubmitting}
              onClick={() => void handleStop(false)}
            >
              {stopSubmitting ? '...' : 'Stop'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={stopSubmitting}
              onClick={() => void handleStop(true)}
            >
              Force
            </Button>
            {stopStatus && <p className="text-xs text-muted-foreground whitespace-nowrap">{stopStatus}</p>}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Live TODO.md panel — renders markdown with task checkboxes */
function TodoPanel({ content }: { content: string }) {
  const rendered = useMemo(() => marked.parse(content), [content]);
  if (!content) {
    return <p className="text-xs text-muted-foreground">No TODO.md available.</p>;
  }
  return (
    <div
      className="overflow-auto h-full text-sm [&_code]:text-xs [&_pre]:overflow-auto [&_li]:leading-relaxed [&_ul]:space-y-0.5"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

/** Collapsible panel for non-TODO docs */
function DocsPanel({
  docs,
  expandedDoc,
  onToggleDoc,
}: {
  docs: Record<string, string>;
  expandedDoc: string | null;
  onToggleDoc: (doc: string | null) => void;
}) {
  const docNames = Object.keys(docs).filter((name) => name !== 'TODO.md');
  if (docNames.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm">Docs</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-1">
        {docNames.map((name) => (
          <DocEntry
            key={name}
            name={name}
            content={docs[name] ?? ''}
            isExpanded={expandedDoc === name}
            onToggle={() => onToggleDoc(expandedDoc === name ? null : name)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DocEntry({
  name,
  content,
  isExpanded,
  onToggle,
}: {
  name: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const rendered = useMemo(() => marked.parse(content), [content]);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium hover:text-primary transition-colors w-full text-left py-1"
        onClick={onToggle}
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#x25B6;</span>
        {name}
      </button>
      {isExpanded && content && (
        <article
          className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs mt-1 [&_code]:text-xs [&_pre]:overflow-auto"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  );
}

// ── Artifact types and helpers (unchanged from previous implementation) ──

interface ArtifactEntry {
  type: string;
  path: string;
  description: string;
  metadata?: { baseline?: string; diff_percentage?: number };
}

interface ManifestPayload {
  iteration: number;
  phase: string;
  summary: string;
  artifacts: ArtifactEntry[];
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function isImageArtifact(artifact: ArtifactEntry): boolean {
  const ext = artifact.path.lastIndexOf('.') >= 0 ? artifact.path.slice(artifact.path.lastIndexOf('.')).toLowerCase() : '';
  return IMAGE_EXTENSIONS.has(ext) || artifact.type === 'screenshot' || artifact.type === 'visual_diff';
}

function artifactUrl(iteration: number, filename: string): string {
  return `/api/artifacts/${iteration}/${encodeURIComponent(filename)}`;
}

function parseManifest(am: ArtifactManifest): ManifestPayload | null {
  const m = am.manifest;
  if (!isRecord(m)) return null;
  return {
    iteration: am.iteration,
    phase: typeof m.phase === 'string' ? m.phase : 'proof',
    summary: typeof m.summary === 'string' ? m.summary : '',
    artifacts: Array.isArray(m.artifacts)
      ? (m.artifacts as unknown[]).filter(isRecord).map((a) => ({
          type: typeof a.type === 'string' ? a.type : 'unknown',
          path: typeof a.path === 'string' ? a.path : '',
          description: typeof a.description === 'string' ? a.description : '',
          metadata: isRecord(a.metadata)
            ? {
                baseline: typeof a.metadata.baseline === 'string' ? a.metadata.baseline : undefined,
                diff_percentage: typeof a.metadata.diff_percentage === 'number' ? a.metadata.diff_percentage : undefined,
              }
            : undefined,
        }))
      : [],
  };
}

function DiffBadge({ percentage }: { percentage: number }) {
  const color = percentage < 5 ? 'bg-green-500/20 text-green-400' : percentage < 20 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400';
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${color}`}>diff: {percentage.toFixed(1)}%</span>;
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <button type="button" className="absolute right-4 top-4 text-white text-2xl font-bold hover:text-gray-300" onClick={onClose}>
        &times;
      </button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function ComparisonSlider({ baselineSrc, currentSrc, label }: { baselineSrc: string; currentSrc: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current) handleMove(e.clientX);
    };
    const onMouseUp = () => {
      dragging.current = false;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleMove]);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div ref={containerRef} className="relative h-64 w-full cursor-col-resize overflow-hidden rounded-md border select-none">
        <img src={currentSrc} alt="Current" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
          <img src={baselineSrc} alt="Baseline" className="h-full w-full object-contain" style={{ minWidth: containerRef.current?.offsetWidth ?? '100%' }} />
        </div>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
          style={{ left: `${sliderPos}%` }}
          onMouseDown={onMouseDown}
        >
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-black shadow">
            &#x2194;
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageArtifactCard({
  artifact,
  iteration,
  allManifests,
}: {
  artifact: ArtifactEntry;
  iteration: number;
  allManifests: ManifestPayload[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [compareIteration, setCompareIteration] = useState<number | null>(null);

  const currentUrl = artifactUrl(iteration, artifact.path);
  const hasBaseline = !!artifact.metadata?.baseline;

  const previousIterations = useMemo(() => {
    return allManifests
      .filter((m) => m.iteration < iteration && m.artifacts.some((a) => a.path === artifact.path))
      .map((m) => m.iteration)
      .sort((a, b) => b - a);
  }, [allManifests, iteration, artifact.path]);

  const baselineUrl = compareIteration !== null
    ? artifactUrl(compareIteration, artifact.path)
    : hasBaseline
      ? artifactUrl(iteration, artifact.metadata!.baseline!)
      : null;

  const showComparison = baselineUrl !== null;

  return (
    <>
      <div className="rounded-md border bg-muted/30 p-2 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">&#x1f4f7;</span>
          <span className="font-medium truncate">{artifact.path}</span>
          {artifact.metadata?.diff_percentage !== undefined && <DiffBadge percentage={artifact.metadata.diff_percentage} />}
          <span className="text-muted-foreground">{artifact.description}</span>
        </div>
        <button type="button" className="block" onClick={() => setExpanded(true)}>
          <img
            src={currentUrl}
            alt={artifact.description || artifact.path}
            className="max-h-40 max-w-full rounded border object-contain hover:opacity-80 transition-opacity cursor-zoom-in"
            loading="lazy"
          />
        </button>

        {(hasBaseline || previousIterations.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${compareMode === 'side-by-side' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                onClick={() => setCompareMode('side-by-side')}
              >
                Side by Side
              </button>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${compareMode === 'slider' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                onClick={() => setCompareMode('slider')}
              >
                Slider
              </button>
              {previousIterations.length > 0 && (
                <select
                  className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground border"
                  value={compareIteration ?? ''}
                  onChange={(e) => setCompareIteration(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{hasBaseline ? 'Baseline' : 'Select comparison...'}</option>
                  {previousIterations.map((iter) => (
                    <option key={iter} value={iter}>iter {iter}</option>
                  ))}
                </select>
              )}
            </div>

            {showComparison && compareMode === 'side-by-side' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    {compareIteration !== null ? `Iter ${compareIteration}` : 'Baseline'}
                  </p>
                  <img src={baselineUrl} alt="Baseline" className="max-h-40 w-full rounded border object-contain" loading="lazy" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current (iter {iteration})</p>
                  <img src={currentUrl} alt="Current" className="max-h-40 w-full rounded border object-contain" loading="lazy" />
                </div>
              </div>
            )}

            {showComparison && compareMode === 'slider' && (
              <ComparisonSlider
                baselineSrc={baselineUrl}
                currentSrc={currentUrl}
                label={`${compareIteration !== null ? `Iter ${compareIteration}` : 'Baseline'} vs Current (iter ${iteration})`}
              />
            )}

            {!showComparison && !hasBaseline && compareIteration === null && (
              <p className="text-xs text-muted-foreground italic">No baseline — first capture</p>
            )}
          </div>
        )}
      </div>

      {expanded && <ImageLightbox src={currentUrl} alt={artifact.description || artifact.path} onClose={() => setExpanded(false)} />}
    </>
  );
}

function CodeArtifactCard({ artifact, iteration }: { artifact: ArtifactEntry; iteration: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadContent = useCallback(async () => {
    if (content !== null) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(artifactUrl(iteration, artifact.path));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setContent(await response.text());
      setExpanded(true);
    } catch {
      setContent('Failed to load artifact content.');
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }, [content, expanded, iteration, artifact.path]);

  const typeIcon = artifact.type === 'test_summary' ? '\u{1f9ea}' : artifact.type === 'api_response' ? '\u{1f310}' : '\u{1f4c4}';

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{typeIcon}</span>
        <button type="button" className="font-medium truncate hover:underline cursor-pointer" onClick={() => void loadContent()}>
          {artifact.path}
        </button>
        <span className="text-muted-foreground">{artifact.description}</span>
        {loading && <span className="text-muted-foreground animate-pulse">loading...</span>}
      </div>
      {expanded && content !== null && (
        <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{content}</pre>
      )}
    </div>
  );
}

function ArtifactGallery({ artifacts }: { artifacts: ArtifactManifest[] }) {
  const manifests = useMemo(() => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null), [artifacts]);

  if (manifests.length === 0) return null;

  return (
    <div className="space-y-3 mt-3">
      <h3 className="text-xs font-semibold">Proof Artifacts</h3>
      {manifests.map((manifest) => (
        <div key={manifest.iteration} className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <PhaseBadge phase={manifest.phase} />
            <span className="font-medium">Iteration {manifest.iteration}</span>
            <span className="text-muted-foreground">
              {manifest.artifacts.length} artifact{manifest.artifacts.length !== 1 ? 's' : ''}
            </span>
          </div>
          {manifest.summary && <p className="text-xs text-muted-foreground italic">{manifest.summary}</p>}
          <div className="space-y-2">
            {manifest.artifacts.map((artifact) =>
              isImageArtifact(artifact) ? (
                <ImageArtifactCard
                  key={`${manifest.iteration}-${artifact.path}`}
                  artifact={artifact}
                  iteration={manifest.iteration}
                  allManifests={manifests}
                />
              ) : (
                <CodeArtifactCard
                  key={`${manifest.iteration}-${artifact.path}`}
                  artifact={artifact}
                  iteration={manifest.iteration}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Log panel — compact log lines + artifact gallery */
function LogPanel({ log, artifacts }: { log: string; artifacts: ArtifactManifest[] }) {
  const logRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom on new log content
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <pre
        ref={logRef}
        className="flex-1 min-h-0 overflow-auto rounded-md bg-muted p-2 text-xs"
      >
        {log || 'No log entries available.'}
      </pre>
      <ArtifactGallery artifacts={artifacts} />
    </div>
  );
}
