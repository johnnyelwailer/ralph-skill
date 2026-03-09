import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const navItems = ['Progress', 'Docs', 'Log', 'Steer', 'Stop'] as const;
type NavItem = (typeof navItems)[number];
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

const phaseColors: Record<string, string> = {
  plan: 'bg-blue-500/20 text-blue-400',
  build: 'bg-amber-500/20 text-amber-400',
  proof: 'bg-purple-500/20 text-purple-400',
  review: 'bg-green-500/20 text-green-400',
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

export function App() {
  const [activeView, setActiveView] = useState<NavItem>('Progress');
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState('TODO.md');
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerStatus, setSteerStatus] = useState<string | null>(null);
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopStatus, setStopStatus] = useState<string | null>(null);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    setLoading(true);
    setLoadError(null);
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
        if (cancelled) {
          return;
        }
        setState(nextState);
        if (nextState.docs[selectedDoc] === undefined) {
          const firstDoc = Object.keys(nextState.docs)[0];
          if (firstDoc) {
            setSelectedDoc(firstDoc);
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadError((error as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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
  }, [selectedDoc, selectedSessionId]);

  const sessions = useMemo<SessionSummary[]>(() => {
    if (!state) {
      return [
        {
          id: 'current',
          name: 'Current workspace',
          status: 'unknown',
          phase: '',
          elapsed: '--',
          iterations: '--',
          isActive: false,
        },
      ];
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
    if (combined.length > 0) {
      return combined;
    }

    if (isRecord(state.status)) {
      return [toSessionSummary(state.status, state.workdir, true)];
    }

    return [
      {
        id: 'current',
        name: state.workdir,
        status: 'unknown',
        phase: '',
        elapsed: '--',
        iterations: '--',
        isActive: false,
      },
    ];
  }, [state]);

  const statusRecord = isRecord(state?.status) ? state.status : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Aloop Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          {loading ? 'Loading state...' : `Updated ${state?.updatedAt ?? 'n/a'}`}
          {loadError ? ` • ${loadError}` : ''}
        </p>
      </header>
      <main className="grid min-h-[calc(100vh-73px)] grid-cols-1 gap-4 p-4 md:grid-cols-[1.1fr_180px_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>Active and recent loop sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.map((session) => {
              const isSelected = selectedSessionId === null
                ? session.id === 'current' || sessions.indexOf(session) === 0
                : session.id === selectedSessionId;
              const isRunning = session.isActive && session.status === 'running';
              return (
                <button
                  key={session.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                    isSelected ? 'ring-2 ring-primary border-primary' : ''
                  } ${!session.isActive ? 'opacity-60' : ''}`}
                  onClick={() => selectSession(session.id === 'current' ? null : session.id)}
                >
                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                      </span>
                    )}
                    <p className="font-medium truncate">{session.name}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <PhaseBadge phase={session.phase} />
                    <span>{session.status}</span>
                    <span>{session.elapsed}</span>
                    <span>iter {session.iterations}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Views</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {navItems.map((item) => (
              <Button
                key={item}
                variant={activeView === item ? 'default' : 'ghost'}
                className="justify-start"
                onClick={() => setActiveView(item)}
              >
                {item}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{activeView}</CardTitle>
            <CardDescription>Live panel content for the selected dashboard section.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeView === 'Progress' && <ProgressView status={statusRecord} />}
            {activeView === 'Docs' && (
              <DocsView docs={state?.docs ?? {}} selectedDoc={selectedDoc} onSelectDoc={setSelectedDoc} />
            )}
            {activeView === 'Log' && <LogView log={state?.log ?? ''} artifacts={state?.artifacts ?? []} />}
            {activeView === 'Steer' && (
              <SteerView
                instruction={steerInstruction}
                onInstructionChange={setSteerInstruction}
                status={steerStatus}
                submitting={steerSubmitting}
                onSubmit={async () => {
                  if (steerInstruction.trim().length === 0 || steerSubmitting) {
                    return;
                  }
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
                }}
              />
            )}
            {activeView === 'Stop' && (
              <StopView
                status={stopStatus}
                submitting={stopSubmitting}
                onStop={async (force) => {
                  if (stopSubmitting) {
                    return;
                  }
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
                }}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ProgressView({ status }: { status: SessionStatus | null }) {
  const stateValue = status ? readString(status, ['state', 'status'], 'unknown') : 'unknown';
  const iterationValue = status ? readNumberLike(status, ['iteration', 'iterations'], '--') : '--';
  const phaseValue = status ? readString(status, ['mode', 'phase'], 'n/a') : 'n/a';
  return (
    <Tabs defaultValue="timeline">
      <TabsList>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="space-y-2">
        <p className="text-sm">State: {stateValue}</p>
        <p className="text-sm text-muted-foreground">Iteration: {iterationValue}</p>
      </TabsContent>
      <TabsContent value="summary" className="space-y-2">
        <p className="text-sm">Phase: {phaseValue}</p>
        <p className="text-sm">Status: {stateValue}</p>
      </TabsContent>
    </Tabs>
  );
}

function DocsView({
  docs,
  selectedDoc,
  onSelectDoc,
}: {
  docs: Record<string, string>;
  selectedDoc: string;
  onSelectDoc: (doc: string) => void;
}) {
  const docNames = Object.keys(docs);
  const content = docs[selectedDoc] ?? '';
  const renderedContent = useMemo(() => marked.parse(content), [content]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {docNames.map((name) => (
          <Button key={name} size="sm" variant={name === selectedDoc ? 'default' : 'outline'} onClick={() => onSelectDoc(name)}>
            {name}
          </Button>
        ))}
      </div>
      {content ? (
        <article
          className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-sm [&_code]:text-xs [&_pre]:overflow-auto"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      ) : (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">No document content available.</pre>
      )}
    </div>
  );
}

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

  // Find previous iterations that have the same artifact filename for history scrubbing
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
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Proof Artifacts</h3>
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

function LogView({ log, artifacts }: { log: string; artifacts: ArtifactManifest[] }) {
  return (
    <div className="space-y-4">
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{log || 'No log entries available.'}</pre>
      <ArtifactGallery artifacts={artifacts} />
    </div>
  );
}

function SteerView({
  instruction,
  onInstructionChange,
  onSubmit,
  status,
  submitting,
}: {
  instruction: string;
  onInstructionChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  status: string | null;
  submitting: boolean;
}) {
  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Enter steering guidance to write STEERING.md..."
        value={instruction}
        onChange={(event) => onInstructionChange(event.target.value)}
      />
      <Button disabled={submitting || instruction.trim().length === 0} onClick={() => void onSubmit()}>
        {submitting ? 'Submitting...' : 'Submit steering instruction'}
      </Button>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </div>
  );
}

function StopView({
  onStop,
  status,
  submitting,
}: {
  onStop: (force: boolean) => Promise<void>;
  status: string | null;
  submitting: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">Stop the selected running session with a graceful shutdown request.</p>
      <div className="flex gap-2">
        <Button variant="destructive" disabled={submitting} onClick={() => void onStop(false)}>
          {submitting ? 'Stopping...' : 'Stop session'}
        </Button>
        <Button variant="outline" disabled={submitting} onClick={() => void onStop(true)}>
          Force stop
        </Button>
      </div>
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </div>
  );
}
