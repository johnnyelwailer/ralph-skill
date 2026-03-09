import { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const navItems = ['Progress', 'Docs', 'Log', 'Steer', 'Stop'] as const;
type NavItem = (typeof navItems)[number];
type SessionStatus = Record<string, unknown>;

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
            {activeView === 'Log' && <LogView log={state?.log ?? ''} />}
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

function LogView({ log }: { log: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{log || 'No log entries available.'}</pre>
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
