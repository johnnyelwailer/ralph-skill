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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  model: string;
  duration: string;
  message: string;
  raw: string;
  rawObj: Record<string, unknown> | null;
  iteration: number | null;
  dateKey: string;
  isSuccess: boolean;
  isError: boolean;
  commitHash: string;
  resultDetail: string;
  filesChanged: FileChange[];
}

interface FileChange {
  path: string;
  type: 'M' | 'A' | 'D' | 'R';
  additions: number;
  deletions: number;
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

function formatTimeShort(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  let rawObj: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(trimmed);
    if (isRecord(obj)) rawObj = obj;
  } catch {
    // plain text
  }

  if (rawObj) {
    const ts = readString(rawObj, ['timestamp', 'ts', 'time', 'created_at'], '');
    const phase = readString(rawObj, ['phase', 'mode'], '');
    const event = readString(rawObj, ['event', 'type', 'action'], '');
    const provider = readString(rawObj, ['provider'], '');
    const model = readString(rawObj, ['model'], '');
    const duration = readString(rawObj, ['duration', 'elapsed', 'took'], '');
    const message = readString(rawObj, ['message', 'msg', 'detail', 'description', 'text'], event);
    const iterRaw = rawObj.iteration;
    const iteration = typeof iterRaw === 'number' ? iterRaw : (typeof iterRaw === 'string' ? parseInt(iterRaw, 10) || null : null);
    const commitHash = readString(rawObj, ['commit', 'commit_hash', 'sha'], '');
    const isSuccess = event.includes('complete') || event.includes('success') || event.includes('approved');
    const isError = event.includes('error') || event.includes('fail') || event.includes('cooldown');

    let resultDetail = '';
    if (commitHash) resultDetail = commitHash.slice(0, 7);
    else if (isError) resultDetail = readString(rawObj, ['reason', 'error', 'exit_code'], 'error');
    else if (event.includes('verdict')) resultDetail = readString(rawObj, ['verdict'], '');

    // Parse file changes if present
    const filesChanged: FileChange[] = [];
    const files = rawObj.files ?? rawObj.files_changed;
    if (Array.isArray(files)) {
      for (const f of files) {
        if (isRecord(f)) {
          filesChanged.push({
            path: typeof f.path === 'string' ? f.path : typeof f.file === 'string' ? f.file : '?',
            type: (typeof f.status === 'string' ? f.status[0]?.toUpperCase() : 'M') as FileChange['type'],
            additions: typeof f.additions === 'number' ? f.additions : 0,
            deletions: typeof f.deletions === 'number' ? f.deletions : 0,
          });
        }
      }
    }

    return {
      timestamp: ts,
      phase,
      event,
      provider,
      model,
      duration,
      message,
      raw: trimmed,
      rawObj,
      iteration,
      dateKey: formatDateKey(ts),
      isSuccess,
      isError,
      commitHash,
      resultDetail,
      filesChanged,
    };
  }

  return {
    timestamp: '',
    phase: '',
    event: '',
    provider: '',
    model: '',
    duration: '',
    message: trimmed,
    raw: trimmed,
    rawObj: null,
    iteration: null,
    dateKey: 'Log',
    isSuccess: false,
    isError: false,
    commitHash: '',
    resultDetail: '',
    filesChanged: [],
  };
}

// ── Phase colors ──

const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
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
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-600 dark:text-red-400',
  stopping: 'text-orange-600 dark:text-orange-400',
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
  const activeSessions = sessions.filter((s) => s.isActive);
  const recentSessions = sessions.filter((s) => !s.isActive);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-r border-border bg-sidebar py-2 px-1 w-10 shrink-0">
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
              title={`${s.name} (${s.status})`}
              onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}
            >
              <StatusDot status={s.isActive && s.status === 'running' ? 'running' : 'stopped'} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const renderSessionCard = (session: SessionSummary) => {
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
          {session.elapsed !== '--' && (
            <span className="text-muted-foreground/60">{session.elapsed}</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col border-r border-border bg-sidebar w-56 shrink-0 animate-slide-in-left">
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
        <div className="p-2">
          {/* Active sessions group */}
          {activeSessions.length > 0 && (
            <div className="mb-2">
              <div className="px-1 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Active</span>
              </div>
              <div className="space-y-0.5">
                {activeSessions.map(renderSessionCard)}
              </div>
            </div>
          )}

          {/* Recent sessions group */}
          {recentSessions.length > 0 && (
            <div>
              <div className="px-1 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Recent</span>
              </div>
              <div className="space-y-0.5">
                {recentSessions.map(renderSessionCard)}
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No sessions found.</p>
          )}
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
        <button
          type="button"
          className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors"
          onClick={onOpenSwitcher}
        >
          <StatusDot status={isRunning ? 'running' : currentState} />
          <span className="text-sm font-semibold truncate max-w-[200px]">{sessionName}</span>
        </button>

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

        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xs">
          <Progress value={progressPercent} className="flex-1 h-1.5" indicatorClassName={phaseBarColor} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
        </div>

        <PhaseBadge phase={currentPhase} />

        {providerName && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {modelName ? `${providerName}/${modelName}` : providerName}
          </span>
        )}

        <span className={`text-xs whitespace-nowrap font-medium ${statusColors[currentState] ?? 'text-muted-foreground'}`}>
          {currentState}
        </span>

        <div className="flex-1" />

        <ConnectionIndicator status={connectionStatus} />

        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onOpenCommand}
        >
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono">Ctrl+K</kbd>
        </button>

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

  // Group by date, newest first
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
    // Reverse groups: newest day first. Entries within each group: newest first.
    for (const group of groups) {
      group.entries.reverse();
    }
    groups.reverse();
    return groups;
  }, [entries]);

  const manifests = useMemo(
    () => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null),
    [artifacts],
  );

  // Build a map of iteration → artifacts for inline display
  const iterationArtifacts = useMemo(() => {
    const map = new Map<number, ManifestPayload>();
    for (const m of manifests) {
      map.set(m.iteration, m);
    }
    return map;
  }, [manifests]);

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
            className="text-[10px] text-blue-500 dark:text-blue-400 hover:opacity-80"
            onClick={() => {
              setAutoScroll(true);
              endRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Scroll to latest
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
              <div className="space-y-0">
                {group.entries.map((entry, i) => (
                  <LogEntryRow
                    key={`${group.dateKey}-${i}`}
                    entry={entry}
                    artifacts={entry.iteration !== null ? iterationArtifacts.get(entry.iteration) ?? null : null}
                  />
                ))}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

function LogEntryRow({ entry, artifacts }: { entry: LogEntry; artifacts: ManifestPayload | null }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const phaseDot = entry.phase ? phaseDotColors[entry.phase.toLowerCase()] ?? 'bg-muted-foreground' : '';
  const hasExpandable = entry.filesChanged.length > 0 || (artifacts && artifacts.artifacts.length > 0) || entry.rawObj;
  const isIteration = entry.event.includes('iteration_complete') || entry.event.includes('iteration_error');

  // Result indicator
  let resultIcon = '';
  if (entry.isSuccess) resultIcon = '\u2713';
  else if (entry.isError) resultIcon = '\u2717';

  return (
    <>
      <div
        className={`flex items-start gap-2 py-0.5 text-[11px] font-mono leading-relaxed rounded px-1 transition-colors group ${
          hasExpandable ? 'cursor-pointer hover:bg-accent/30' : 'hover:bg-accent/20'
        } ${expanded ? 'bg-accent/20' : ''}`}
        onClick={() => hasExpandable && setExpanded(!expanded)}
      >
        {/* Timestamp */}
        <span className="text-muted-foreground/60 whitespace-nowrap shrink-0 w-12">
          {entry.timestamp ? formatTimeShort(entry.timestamp) : ''}
        </span>

        {/* Phase dot */}
        <span className="mt-1.5 shrink-0">
          {phaseDot ? <span className={`inline-block h-1.5 w-1.5 rounded-full ${phaseDot}`} /> : <span className="inline-block h-1.5 w-1.5" />}
        </span>

        {/* Phase label */}
        {entry.phase && (
          <span className="text-muted-foreground shrink-0 w-10">{entry.phase}</span>
        )}

        {/* Provider·model */}
        {entry.provider && (
          <span className="text-muted-foreground/70 shrink-0 whitespace-nowrap max-w-[120px] truncate">
            {entry.model ? `${entry.provider}\u00b7${entry.model}` : entry.provider}
          </span>
        )}

        {/* Result indicator */}
        {resultIcon && (
          <span className={`shrink-0 font-bold ${entry.isSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {resultIcon}
          </span>
        )}

        {/* Result detail (commit hash or error) */}
        {entry.resultDetail && (
          <span className={`shrink-0 whitespace-nowrap ${entry.commitHash ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground/70'}`}>
            {entry.resultDetail}
          </span>
        )}

        {/* Message (only for non-iteration events or if no result detail) */}
        {!isIteration && !entry.resultDetail && entry.message && entry.message !== entry.event && (
          <span className="text-foreground/80 min-w-0 break-words flex-1 truncate">{entry.message}</span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Duration */}
        {entry.duration && (
          <span className="text-muted-foreground/50 shrink-0 whitespace-nowrap">{entry.duration}</span>
        )}

        {/* Expand indicator */}
        {hasExpandable && (
          <span className="text-muted-foreground/40 shrink-0 text-[10px]">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-16 mr-2 mb-2 animate-fade-in">
          {/* File changes */}
          {entry.filesChanged.length > 0 && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              {entry.filesChanged.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                  <span className={`shrink-0 w-3 text-center font-bold ${
                    f.type === 'A' ? 'text-green-500' : f.type === 'D' ? 'text-red-500' : f.type === 'R' ? 'text-blue-500' : 'text-yellow-500'
                  }`}>{f.type}</span>
                  <span className="text-foreground/80 truncate flex-1">{f.path}</span>
                  {(f.additions > 0 || f.deletions > 0) && (
                    <span className="text-muted-foreground/60 shrink-0">
                      {f.additions > 0 && <span className="text-green-500">+{f.additions}</span>}
                      {f.additions > 0 && f.deletions > 0 && ' '}
                      {f.deletions > 0 && <span className="text-red-500">-{f.deletions}</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Artifacts inline */}
          {artifacts && artifacts.artifacts.length > 0 && (
            <div className="border-l-2 border-amber-500/30 pl-2 py-1 space-y-1 mt-1">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                {artifacts.artifacts.length} artifact{artifacts.artifacts.length !== 1 ? 's' : ''}
              </span>
              {artifacts.summary && (
                <p className="text-[10px] text-muted-foreground italic">{artifacts.summary}</p>
              )}
              <div className="space-y-1">
                {artifacts.artifacts.map((artifact) => (
                  <div key={artifact.path} className="flex items-center gap-2 text-[10px]">
                    <span className="shrink-0">{isImageArtifact(artifact) ? '\uD83D\uDCF7' : '\uD83D\uDCC4'}</span>
                    {isImageArtifact(artifact) ? (
                      <button
                        type="button"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxSrc(artifactUrl(artifacts.iteration, artifact.path));
                        }}
                      >
                        {artifact.path}
                      </button>
                    ) : (
                      <span className="text-foreground/80 truncate">{artifact.path}</span>
                    )}
                    <span className="text-muted-foreground/60 truncate">{artifact.description}</span>
                    {artifact.metadata?.diff_percentage !== undefined && (
                      <span className={`shrink-0 text-[9px] px-1 rounded ${
                        artifact.metadata.diff_percentage < 5 ? 'bg-green-500/20 text-green-500' :
                        artifact.metadata.diff_percentage < 20 ? 'bg-yellow-500/20 text-yellow-500' :
                        'bg-red-500/20 text-red-500'
                      }`}>
                        diff: {artifact.metadata.diff_percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON (for debugging/detail) */}
          {!entry.filesChanged.length && !artifacts && entry.rawObj && (
            <div className="border-l-2 border-border pl-2 py-1">
              <pre className="text-[10px] text-muted-foreground/70 font-mono whitespace-pre-wrap max-h-24 overflow-auto">
                {JSON.stringify(entry.rawObj, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="Artifact" onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
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
    <TooltipProvider>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="destructive" size="sm" className="h-8" disabled={stopSubmitting} onClick={() => onStop(false)}>
                  {stopSubmitting ? '...' : 'Stop'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Gracefully stop after current iteration (SIGTERM)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive" disabled={stopSubmitting} onClick={() => onStop(true)}>
                  Force
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Kill immediately without cleanup (SIGKILL)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </footer>
    </TooltipProvider>
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
                Stop session (graceful)
              </CommandItem>
              <CommandItem onSelect={() => { onClose(); onStop(true); }}>
                Force stop session (SIGKILL)
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
          reconnectDelay = 1000;
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
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
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
      <div className="flex flex-1 min-h-0">
        <Sidebar
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={selectSession}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="flex flex-col flex-1 min-w-0">
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

          <main className="flex-1 min-h-0 p-3">
            <div className="grid grid-cols-2 gap-3 h-full" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Card className="flex flex-col min-h-0 min-w-0 overflow-hidden">
                <CardHeader className="py-2 px-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
                  <DocsPanel docs={state?.docs ?? {}} />
                </CardContent>
              </Card>

              <Card className="flex flex-col min-h-0 min-w-0 overflow-hidden">
                <CardHeader className="py-2 px-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
                  <ActivityPanel log={state?.log ?? ''} artifacts={state?.artifacts ?? []} />
                </CardContent>
              </Card>
            </div>
          </main>

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

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        sessions={sessions}
        onSelectSession={(id) => { selectSession(id); }}
        onStop={(force) => void handleStop(force)}
      />

      <Toaster />
    </div>
  );
}
