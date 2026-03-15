import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { parseTodoProgress } from '../../src/lib/parseTodoProgress';

// ── Types ──

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

interface LogEntry {
  timestamp: string;
  phase: string;
  event: string;
  provider: string;
  duration: string;
  message: string;
  raw: string;
  iteration: number | null;
  dateKey: string;
}

// ── Helpers ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return fallback;
}

function readNumberLike(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
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

function formatTime(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function formatDateKey(ts: string): string {
  if (!ts) return 'Unknown';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const obj = JSON.parse(trimmed);
    if (isRecord(obj)) {
      const ts = readString(obj, ['timestamp', 'ts', 'time', 'created_at'], '');
      const phase = readString(obj, ['phase', 'mode'], '');
      const event = readString(obj, ['event', 'type', 'action', 'msg', 'message'], '');
      const provider = readString(obj, ['provider', 'model'], '');
      const duration = readString(obj, ['duration', 'elapsed', 'took'], '');
      const message = readString(obj, ['message', 'msg', 'detail', 'description', 'text'], event);
      const iterRaw = obj.iteration;
      const iteration = typeof iterRaw === 'number' ? iterRaw : null;

      return {
        timestamp: ts,
        phase,
        event,
        provider,
        duration,
        message,
        raw: trimmed,
        iteration,
        dateKey: formatDateKey(ts),
      };
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return {
    timestamp: '',
    phase: '',
    event: '',
    provider: '',
    duration: '',
    message: trimmed,
    raw: trimmed,
    iteration: null,
    dateKey: 'Log',
  };
}

// ── Phase colors ──

const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const phaseBarColors: Record<string, string> = {
  plan: 'bg-purple-500',
  build: 'bg-yellow-500',
  proof: 'bg-amber-500',
  review: 'bg-cyan-500',
};

const phaseDotColors: Record<string, string> = {
  plan: 'bg-purple-400',
  build: 'bg-yellow-400',
  proof: 'bg-amber-400',
  review: 'bg-cyan-400',
};

const statusColors: Record<string, string> = {
  running: 'text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-400',
  stopping: 'text-orange-400',
};

function PhaseBadge({ phase, small }: { phase: string; small?: boolean }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  const size = small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs';
  return (
    <span className={`inline-block rounded border font-medium ${colors} ${size}`}>
      {phase}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
    );
  }
  const color = status === 'stopped' || status === 'exited' ? 'bg-muted-foreground' : 'bg-orange-400';
  return <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

// ── Connection status ──

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse-dot',
    disconnected: 'bg-red-500',
  };
  const labels: Record<ConnectionStatus, string> = {
    connected: 'Live',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${colors[status]}`} />
      <span className="text-[10px] text-muted-foreground">{labels[status]}</span>
    </div>
  );
}

// ── Artifact helpers ──

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

// ── Sidebar ──

function Sidebar({
  sessions,
  selectedSessionId,
  onSelectSession,
  collapsed,
  onToggle,
}: {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-r border-border bg-card/50 py-2 px-1 w-10 shrink-0">
        <button
          type="button"
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          onClick={onToggle}
          title="Expand sidebar (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
        <div className="mt-3 space-y-2">
          {sessions.slice(0, 8).map((s) => (
            <button
              key={s.id}
              type="button"
              className="block"
              title={s.name}
              onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}
            >
              <StatusDot status={s.isActive && s.status === 'running' ? 'running' : 'stopped'} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-r border-border bg-card/50 w-56 shrink-0 animate-slide-in-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
        <button
          type="button"
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          onClick={onToggle}
          title="Collapse sidebar (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {sessions.map((session) => {
            const isSelected = selectedSessionId === null
              ? session.id === 'current' || sessions.indexOf(session) === 0
              : session.id === selectedSessionId;
            return (
              <button
                key={session.id}
                type="button"
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                  isSelected ? 'bg-accent' : ''
                }`}
                onClick={() => onSelectSession(session.id === 'current' ? null : session.id)}
              >
                <div className="flex items-center gap-1.5">
                  {session.isActive && session.status === 'running' ? (
                    <StatusDot status="running" />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${session.isActive ? 'bg-muted-foreground' : 'bg-muted-foreground/40'}`} />
                  )}
                  <span className="truncate font-medium">{session.name}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 ml-3.5">
                  {session.phase && <PhaseBadge phase={session.phase} small />}
                  <span className="text-muted-foreground">iter {session.iterations}</span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Header ──

function Header({
  sessionName,
  isRunning,
  currentState,
  currentPhase,
  currentIteration,
  providerName,
  modelName,
  tasksCompleted,
  tasksTotal,
  progressPercent,
  updatedAt,
  loading,
  loadError,
  connectionStatus,
  onOpenCommand,
  onOpenSwitcher,
}: {
  sessionName: string;
  isRunning: boolean;
  currentState: string;
  currentPhase: string;
  currentIteration: string;
  providerName: string;
  modelName: string;
  tasksCompleted: number;
  tasksTotal: number;
  progressPercent: number;
  updatedAt: string;
  loading: boolean;
  loadError: string | null;
  connectionStatus: ConnectionStatus;
  onOpenCommand: () => void;
  onOpenSwitcher: () => void;
}) {
  const phaseBarColor = phaseBarColors[currentPhase.toLowerCase()] ?? 'bg-muted-foreground';

  return (
    <header className="border-b border-border px-4 py-2.5 shrink-0">
      <div className="flex items-center gap-4">
        {/* Session name */}
        <button
          type="button"
          className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
          onClick={onOpenSwitcher}
        >
          <StatusDot status={isRunning ? 'running' : currentState} />
          <span className="text-sm font-semibold truncate max-w-[200px]">{sessionName}</span>
        </button>

        {/* Iteration */}
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className="text-xs text-muted-foreground cursor-help whitespace-nowrap">
              iter {currentIteration}{tasksTotal > 0 ? ` / ${tasksTotal} tasks` : ''}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-52 text-xs">
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Phase:</span> {currentPhase || 'none'}</p>
              <p><span className="text-muted-foreground">Status:</span> {currentState}</p>
              <p><span className="text-muted-foreground">Provider:</span> {providerName || 'none'}</p>
              <p><span className="text-muted-foreground">Tasks:</span> {tasksCompleted}/{tasksTotal} ({progressPercent}%)</p>
            </div>
          </HoverCardContent>
        </HoverCard>

        {/* Progress bar */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xs">
          <Progress value={progressPercent} className="flex-1 h-1.5" indicatorClassName={phaseBarColor} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
        </div>

        {/* Phase badge */}
        <PhaseBadge phase={currentPhase} />

        {/* Provider */}
        {providerName && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {modelName ? `${providerName}/${modelName}` : providerName}
          </span>
        )}

        {/* Status */}
        <span className={`text-xs whitespace-nowrap font-medium ${statusColors[currentState] ?? 'text-muted-foreground'}`}>
          {currentState}
        </span>

        <div className="flex-1" />

        {/* Connection */}
        <ConnectionIndicator status={connectionStatus} />

        {/* Ctrl+K hint */}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onOpenCommand}
        >
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono">Ctrl+K</kbd>
        </button>

        {/* Updated at */}
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {loading ? 'Loading...' : updatedAt ? formatTime(updatedAt) : ''}
          {loadError && !loading ? ' \u2022 err' : ''}
        </span>
      </div>
    </header>
  );
}

// ── Docs Panel (Tabbed) ──

function DocsPanel({ docs }: { docs: Record<string, string> }) {
  const docOrder = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
  const tabLabels: Record<string, string> = {
    'TODO.md': 'TODO',
    'SPEC.md': 'SPEC',
    'RESEARCH.md': 'RESEARCH',
    'REVIEW_LOG.md': 'REVIEW LOG',
    'STEERING.md': 'STEERING',
  };

  const availableDocs = docOrder.filter((name) => docs[name] !== undefined);
  // Also include any docs not in the standard order
  const extraDocs = Object.keys(docs).filter((name) => !docOrder.includes(name));
  const allDocs = [...availableDocs, ...extraDocs];

  const defaultTab = allDocs.includes('TODO.md') ? 'TODO.md' : allDocs[0] ?? '';

  if (allDocs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        No documents available.
      </div>
    );
  }

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col h-full">
      <TabsList className="h-8 bg-muted/50 shrink-0 flex-wrap justify-start">
        {allDocs.map((name) => (
          <TabsTrigger key={name} value={name} className="text-[11px] px-2 py-1 h-6 data-[state=active]:bg-background">
            {tabLabels[name] ?? name.replace(/\.md$/i, '')}
          </TabsTrigger>
        ))}
      </TabsList>
      {allDocs.map((name) => (
        <TabsContent key={name} value={name} className="flex-1 min-h-0 mt-0">
          <DocContent content={docs[name] ?? ''} name={name} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DocContent({ content, name }: { content: string; name: string }) {
  const rendered = useMemo(() => {
    if (!content) return '';
    return marked.parse(content, { gfm: true, breaks: true }) as string;
  }, [content]);

  if (!content) {
    return <p className="text-xs text-muted-foreground p-3">No content for {name}.</p>;
  }

  return (
    <ScrollArea className="h-full">
      <div
        className="prose-dashboard p-3 pr-4"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </ScrollArea>
  );
}

// ── Activity Panel ──

function ActivityPanel({ log, artifacts }: { log: string; artifacts: ArtifactManifest[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const entries = useMemo(() => {
    if (!log) return [];
    return log.split('\n').map(parseLogLine).filter((e): e is LogEntry => e !== null);
  }, [log]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Array<{ dateKey: string; entries: LogEntry[] }> = [];
    let current: { dateKey: string; entries: LogEntry[] } | null = null;
    for (const entry of entries) {
      if (!current || current.dateKey !== entry.dateKey) {
        current = { dateKey: entry.dateKey, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    return groups;
  }, [entries]);

  const manifests = useMemo(
    () => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null),
    [artifacts],
  );

  // Auto-scroll on new entries
  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const viewport = el.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    const isAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-1.5 shrink-0">
        <span className="text-[10px] text-muted-foreground">{entries.length} entries</span>
        {!autoScroll && (
          <button
            type="button"
            className="text-[10px] text-blue-400 hover:text-blue-300"
            onClick={() => {
              setAutoScroll(true);
              endRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Scroll to bottom
          </button>
        )}
      </div>
      <ScrollArea className="flex-1 min-h-0" ref={containerRef} onScrollCapture={handleScroll}>
        <div className="space-y-3 pr-3">
          {grouped.map((group) => (
            <div key={group.dateKey}>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm pb-1 mb-1">
                <span className="text-[10px] text-muted-foreground font-medium">{group.dateKey}</span>
              </div>
              <div className="space-y-0.5">
                {group.entries.map((entry, i) => (
                  <LogEntryRow key={`${group.dateKey}-${i}`} entry={entry} />
                ))}
              </div>
            </div>
          ))}

          {/* Inline artifacts */}
          {manifests.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Proof Artifacts</span>
              {manifests.map((manifest) => (
                <ArtifactSection key={manifest.iteration} manifest={manifest} allManifests={manifests} />
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const phaseDot = entry.phase ? phaseDotColors[entry.phase.toLowerCase()] ?? 'bg-muted-foreground' : '';

  return (
    <div className="flex items-start gap-2 py-0.5 text-[11px] font-mono leading-relaxed hover:bg-accent/30 rounded px-1 transition-colors group">
      {/* Timestamp */}
      <span className="text-muted-foreground/60 whitespace-nowrap shrink-0 w-16">
        {entry.timestamp ? formatTime(entry.timestamp) : ''}
      </span>

      {/* Phase dot */}
      <span className="mt-1.5 shrink-0">
        {phaseDot ? <span className={`inline-block h-1.5 w-1.5 rounded-full ${phaseDot}`} /> : <span className="inline-block h-1.5 w-1.5" />}
      </span>

      {/* Event type */}
      {entry.event && entry.event !== entry.message && (
        <span className="text-muted-foreground shrink-0 whitespace-nowrap">{entry.event}</span>
      )}

      {/* Message */}
      <span className="text-foreground/80 min-w-0 break-words flex-1">{entry.message}</span>

      {/* Provider */}
      {entry.provider && (
        <span className="text-muted-foreground/50 shrink-0 hidden group-hover:inline">{entry.provider}</span>
      )}

      {/* Duration */}
      {entry.duration && (
        <span className="text-muted-foreground/50 shrink-0 whitespace-nowrap">{entry.duration}</span>
      )}
    </div>
  );
}

// ── Artifact Components ──

function ArtifactSection({ manifest, allManifests }: { manifest: ManifestPayload; allManifests: ManifestPayload[] }) {
  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 text-xs">
        <PhaseBadge phase={manifest.phase} small />
        <span className="font-medium">Iteration {manifest.iteration}</span>
        <span className="text-muted-foreground">
          {manifest.artifacts.length} artifact{manifest.artifacts.length !== 1 ? 's' : ''}
        </span>
      </div>
      {manifest.summary && <p className="text-[11px] text-muted-foreground italic">{manifest.summary}</p>}
      <div className="space-y-2">
        {manifest.artifacts.map((artifact) =>
          isImageArtifact(artifact) ? (
            <ImageArtifactCard
              key={`${manifest.iteration}-${artifact.path}`}
              artifact={artifact}
              iteration={manifest.iteration}
              allManifests={allManifests}
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
  );
}

function DiffBadge({ percentage }: { percentage: number }) {
  const color = percentage < 5 ? 'bg-green-500/20 text-green-400' : percentage < 20 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400';
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>diff: {percentage.toFixed(1)}%</span>;
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
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

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { if (dragging.current) handleMove(e.clientX); };
    const onMouseUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleMove]);

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div ref={containerRef} className="relative h-48 w-full cursor-col-resize overflow-hidden rounded-md border select-none">
        <img src={currentSrc} alt="Current" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
          <img src={baselineSrc} alt="Baseline" className="h-full w-full object-contain" style={{ minWidth: containerRef.current?.offsetWidth ?? '100%' }} />
        </div>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
          style={{ left: `${sliderPos}%` }}
          onMouseDown={() => { dragging.current = true; }}
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
      <div className="rounded-md border bg-muted/20 p-2 space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-medium truncate">{artifact.path}</span>
          {artifact.metadata?.diff_percentage !== undefined && <DiffBadge percentage={artifact.metadata.diff_percentage} />}
          <span className="text-muted-foreground truncate">{artifact.description}</span>
        </div>
        <button type="button" className="block" onClick={() => setExpanded(true)}>
          <img
            src={currentUrl}
            alt={artifact.description || artifact.path}
            className="max-h-32 max-w-full rounded border object-contain hover:opacity-80 transition-opacity cursor-zoom-in"
            loading="lazy"
          />
        </button>

        {(hasBaseline || previousIterations.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] ${compareMode === 'side-by-side' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                onClick={() => setCompareMode('side-by-side')}
              >
                Side by Side
              </button>
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-[10px] ${compareMode === 'slider' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                onClick={() => setCompareMode('slider')}
              >
                Slider
              </button>
              {previousIterations.length > 0 && (
                <select
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground border"
                  value={compareIteration ?? ''}
                  onChange={(e) => setCompareIteration(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{hasBaseline ? 'Baseline' : 'Select...'}</option>
                  {previousIterations.map((iter) => (
                    <option key={iter} value={iter}>iter {iter}</option>
                  ))}
                </select>
              )}
            </div>
            {showComparison && compareMode === 'side-by-side' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">{compareIteration !== null ? `Iter ${compareIteration}` : 'Baseline'}</p>
                  <img src={baselineUrl} alt="Baseline" className="max-h-32 w-full rounded border object-contain" loading="lazy" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Current (iter {iteration})</p>
                  <img src={currentUrl} alt="Current" className="max-h-32 w-full rounded border object-contain" loading="lazy" />
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

  return (
    <div className="rounded-md border bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <button type="button" className="font-medium truncate hover:underline cursor-pointer" onClick={() => void loadContent()}>
          {artifact.path}
        </button>
        <span className="text-muted-foreground truncate">{artifact.description}</span>
        {loading && <span className="text-muted-foreground animate-pulse">loading...</span>}
      </div>
      {expanded && content !== null && (
        <ScrollArea className="max-h-40">
          <pre className="rounded bg-muted p-2 text-[11px] font-mono whitespace-pre-wrap pr-3">{content}</pre>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Footer ──

function Footer({
  steerInstruction,
  setSteerInstruction,
  onSteer,
  steerSubmitting,
  onStop,
  stopSubmitting,
}: {
  steerInstruction: string;
  setSteerInstruction: (v: string) => void;
  onSteer: () => void;
  steerSubmitting: boolean;
  onStop: (force: boolean) => void;
  stopSubmitting: boolean;
}) {
  return (
    <footer className="border-t border-border px-4 py-2 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex-1 flex gap-2">
          <Textarea
            className="min-h-[32px] h-8 resize-none text-xs flex-1"
            placeholder="Steer: enter guidance for the next iteration..."
            value={steerInstruction}
            onChange={(e) => setSteerInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSteer();
              }
            }}
          />
          <Button
            size="sm"
            className="h-8"
            disabled={steerSubmitting || steerInstruction.trim().length === 0}
            onClick={onSteer}
          >
            {steerSubmitting ? '...' : 'Send'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" className="h-8" disabled={stopSubmitting} onClick={() => onStop(false)}>
            {stopSubmitting ? '...' : 'Stop'}
          </Button>
          <Button variant="outline" size="sm" className="h-8" disabled={stopSubmitting} onClick={() => onStop(true)}>
            Force
          </Button>
        </div>
      </div>
    </footer>
  );
}

// ── Command Palette ──

function CommandPalette({
  open,
  onClose,
  sessions,
  onSelectSession,
  onStop,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void;
  onStop: (force: boolean) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-popover shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { onClose(); onStop(false); }}>
                Stop session
              </CommandItem>
              <CommandItem onSelect={() => { onClose(); onStop(true); }}>
                Force stop session
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Sessions">
              {sessions.map((session) => (
                <CommandItem
                  key={session.id}
                  onSelect={() => {
                    onClose();
                    onSelectSession(session.id === 'current' ? null : session.id);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {session.isActive && session.status === 'running' && <StatusDot status="running" />}
                    <span>Switch to: {session.name}</span>
                    {session.phase && <PhaseBadge phase={session.phase} small />}
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

export function App() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [steerInstruction, setSteerInstruction] = useState('');
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const prevPhaseRef = useRef<string>('');

  // Ctrl+B sidebar toggle, Ctrl+K command palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectSession = useCallback((id: string | null) => {
    setSelectedSessionId(id);
    setLoading(true);
    setLoadError(null);
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('session', id);
    } else {
      url.searchParams.delete('session');
    }
    window.history.replaceState(null, '', url.toString());
  }, []);

  // SSE + initial fetch with auto-reconnect
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const sessionParam = selectedSessionId ? `?session=${encodeURIComponent(selectedSessionId)}` : '';

    async function loadInitialState() {
      try {
        const response = await fetch(`/api/state${sessionParam}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

    function connectSSE() {
      if (cancelled) return;
      setConnectionStatus('connecting');

      eventSource = new EventSource(`/events${sessionParam}`);

      eventSource.addEventListener('state', (event) => {
        try {
          const messageEvent = event as MessageEvent<string>;
          const payload = JSON.parse(messageEvent.data) as DashboardState;
          setState(payload);
          setLoadError(null);
          setConnectionStatus('connected');
          reconnectDelay = 1000; // reset backoff on success
        } catch (error) {
          setLoadError((error as Error).message);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        setConnectionStatus('connected');
      });

      eventSource.onopen = () => {
        setConnectionStatus('connected');
        reconnectDelay = 1000;
      };

      eventSource.onerror = () => {
        setConnectionStatus('disconnected');
        eventSource?.close();
        eventSource = null;

        if (!cancelled) {
          reconnectTimer = setTimeout(() => {
            connectSSE();
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000); // exponential backoff, max 30s
        }
      };
    }

    loadInitialState().catch(() => undefined);
    connectSSE();

    return () => {
      cancelled = true;
      controller.abort();
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [selectedSessionId]);

  // Sessions list
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

  // Extract status fields
  const statusRecord = isRecord(state?.status) ? state.status : null;
  const currentPhase = statusRecord ? readString(statusRecord, ['mode', 'phase'], '') : '';
  const currentState = statusRecord ? readString(statusRecord, ['state', 'status'], 'unknown') : 'unknown';
  const currentIteration = statusRecord ? readNumberLike(statusRecord, ['iteration', 'iterations'], '--') : '--';
  const providerName = statusRecord ? readString(statusRecord, ['provider', 'current_provider'], '') : '';
  const modelName = statusRecord ? readString(statusRecord, ['model', 'current_model'], '') : '';
  const isRunning = currentState === 'running';

  // Toast on phase transitions
  useEffect(() => {
    if (currentPhase && prevPhaseRef.current && currentPhase !== prevPhaseRef.current) {
      toast(`Phase: ${prevPhaseRef.current} \u2192 ${currentPhase}`, {
        description: `Iteration ${currentIteration}`,
      });
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, currentIteration]);

  // Parse TODO.md for progress
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

  // Handlers
  const handleSteer = useCallback(async () => {
    if (steerInstruction.trim().length === 0 || steerSubmitting) return;
    setSteerSubmitting(true);
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
      toast.success('Steering instruction queued.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSteerSubmitting(false);
    }
  }, [steerInstruction, steerSubmitting]);

  const handleStop = useCallback(async (force: boolean) => {
    if (stopSubmitting) return;
    setStopSubmitting(true);
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
      toast.info(`Stop requested (${payload.signal ?? 'SIGTERM'}).`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStopSubmitting(false);
    }
  }, [stopSubmitting]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Grid layout: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={selectSession}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <Header
            sessionName={sessionName}
            isRunning={isRunning}
            currentState={currentState}
            currentPhase={currentPhase}
            currentIteration={currentIteration}
            providerName={providerName}
            modelName={modelName}
            tasksCompleted={tasksCompleted}
            tasksTotal={tasksTotal}
            progressPercent={progressPercent}
            updatedAt={state?.updatedAt ?? ''}
            loading={loading}
            loadError={loadError}
            connectionStatus={connectionStatus}
            onOpenCommand={() => setCommandOpen(true)}
            onOpenSwitcher={() => setSidebarCollapsed(false)}
          />

          {/* Content: docs + activity side by side */}
          <main className="flex-1 min-h-0 p-3">
            <div className="grid grid-cols-2 gap-3 h-full" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {/* Docs Panel */}
              <Card className="flex flex-col min-h-0 overflow-hidden">
                <CardHeader className="py-2 px-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 px-3 pb-2">
                  <DocsPanel docs={state?.docs ?? {}} />
                </CardContent>
              </Card>

              {/* Activity Panel */}
              <Card className="flex flex-col min-h-0 overflow-hidden">
                <CardHeader className="py-2 px-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 px-3 pb-2">
                  <ActivityPanel log={state?.log ?? ''} artifacts={state?.artifacts ?? []} />
                </CardContent>
              </Card>
            </div>
          </main>

          {/* Footer */}
          <Footer
            steerInstruction={steerInstruction}
            setSteerInstruction={setSteerInstruction}
            onSteer={() => void handleSteer()}
            steerSubmitting={steerSubmitting}
            onStop={(force) => void handleStop(force)}
            stopSubmitting={stopSubmitting}
          />
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        sessions={sessions}
        onSelectSession={(id) => { selectSession(id); }}
        onStop={(force) => void handleStop(force)}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
