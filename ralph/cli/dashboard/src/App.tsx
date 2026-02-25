import { useEffect, useMemo, useState } from 'react';
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
  updatedAt: string;
  status: SessionStatus | null;
  log: string;
  docs: Record<string, string>;
}

interface SessionSummary {
  id: string;
  name: string;
  status: string;
  elapsed: string;
  iterations: string;
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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;

    async function loadInitialState() {
      try {
        const response = await fetch('/api/state', { signal: controller.signal });
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

    eventSource = new EventSource('/events');
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
  }, [selectedDoc]);

  const sessions = useMemo<SessionSummary[]>(() => {
    if (!state || !isRecord(state.status)) {
      return [
        {
          id: 'current',
          name: state?.workdir ?? 'Current workspace',
          status: 'unknown',
          elapsed: '--',
          iterations: '--',
        },
      ];
    }

    const source = state.status;
    return [
      {
        id: readString(source, ['session_id', 'id'], 'current'),
        name: readString(source, ['branch', 'name', 'session_name'], state.workdir),
        status: readString(source, ['state', 'status'], 'unknown'),
        elapsed: readString(source, ['elapsed', 'elapsed_time'], '--'),
        iterations: readNumberLike(source, ['iteration', 'iterations'], '--'),
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
            {sessions.map((session) => (
              <div key={session.id} className="rounded-md border p-3">
                <p className="font-medium">{session.name}</p>
                <p className="text-sm text-muted-foreground">
                  {session.status} • {session.elapsed} • iter {session.iterations}
                </p>
              </div>
            ))}
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {docNames.map((name) => (
          <Button key={name} size="sm" variant={name === selectedDoc ? 'default' : 'outline'} onClick={() => onSelectDoc(name)}>
            {name}
          </Button>
        ))}
      </div>
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{content || 'No document content available.'}</pre>
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
