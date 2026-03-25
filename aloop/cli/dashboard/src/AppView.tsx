import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { toast } from 'sonner';
import {
  Activity, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
  GitBranch, GitCommit, Image, FileText, Menu, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Play, Search, Send, Square, Terminal, Timer, XCircle, Zap, Loader2,
  Heart, AlertTriangle, Pause, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CostDisplay } from '@/components/progress/CostDisplay';
import { ArtifactViewer } from '@/components/artifacts/ArtifactViewer';
import { useCost } from '@/hooks/useCost';
import { parseTodoProgress } from '../../src/lib/parseTodoProgress';
import { ResponsiveLayout, useResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import { LogEntryRow } from '@/components/LogEntryRow';
import { StatusDot } from '@/components/shared/StatusDot';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import { SessionCard } from '@/components/session/SessionCard';
import { SessionContextMenu } from '@/components/session/SessionContextMenu';

// Re-export LogEntryRow for test compatibility
export { LogEntryRow } from '@/components/LogEntryRow';

// ── Lib imports ──
import {
  stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml,
} from '@/lib/ansi';
import {
  isRecord, str, numStr, toSession,
  IMAGE_EXT, isImageArtifact, artifactUrl, parseManifest, parseQACoveragePayload,
  extractIterationUsage,
} from '@/lib/types';
import type {
  DashboardState, SessionSummary, LogEntry, FileChange, ArtifactEntry, ArtifactManifest,
  ManifestPayload, ProviderHealth, IterationUsage, QACoverageViewData,
} from '@/lib/types';
import {
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, extractModelFromOutput, parseDurationSeconds,
  computeAvgDuration,
} from '@/lib/format';
import { SIGNIFICANT_EVENTS, parseLogLine } from '@/lib/log';
import { deriveProviderHealth } from '@/lib/providerHealth';

// Re-exports for test compatibility
export {
  stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml,
  isRecord, str, numStr, toSession,
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, extractModelFromOutput, parseDurationSeconds,
  computeAvgDuration, SIGNIFICANT_EVENTS, parseLogLine, deriveProviderHealth,
  IMAGE_EXT, isImageArtifact, artifactUrl, parseManifest, extractIterationUsage,
};
export type {
  LogEntry, FileChange, ArtifactEntry, ManifestPayload, IterationUsage,
};

interface CostSessionResponse {
  total_usd?: number | string;
  error?: string;
}

const phaseBarColors: Record<string, string> = {
  plan: 'bg-purple-500', build: 'bg-yellow-500', proof: 'bg-amber-500', review: 'bg-cyan-500',
};

const statusColors: Record<string, string> = {
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-600 dark:text-red-400',
  stopping: 'text-orange-600 dark:text-orange-400',
};

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const Icon = status === 'connected' ? Zap : status === 'connecting' ? Loader2 : AlertTriangle;
  const color = status === 'connected' ? 'text-green-500' : status === 'connecting' ? 'text-yellow-500 animate-spin' : 'text-red-500';
  const label = status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting...' : 'Disconnected';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent><p>SSE connection: {label}</p></TooltipContent>
    </Tooltip>
  );
}

// ── Elapsed timer ──

export function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const start = new Date(since).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(formatSecs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <>{elapsed}</>;
}







// ── Sidebar ──

export function Sidebar({
  sessions, selectedSessionId, onSelectSession, collapsed, onToggle, sessionCost, onStopSession, onCopySessionId, isDesktop,
}: {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
  sessionCost: number;
  onStopSession?: (id: string | null, force: boolean) => void;
  onCopySessionId?: (id: string) => void;
  isDesktop?: boolean;
}) {
  // Group by project
  const { projectGroups, olderSessions } = useMemo(() => {
    const now = Date.now();
    const cutoff = 24 * 60 * 60 * 1000; // 24h
    const active: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const s of sessions) {
      const lastActivity = s.endedAt || s.startedAt;
      const age = lastActivity ? now - new Date(lastActivity).getTime() : Infinity;
      if (s.isActive || s.status === 'running' || age < cutoff) {
        active.push(s);
      } else {
        older.push(s);
      }
    }

    const groups = new Map<string, SessionSummary[]>();
    for (const s of active) {
      const key = s.projectName || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return { projectGroups: groups, olderSessions: older };
  }, [sessions]);

  const [olderOpen, setOlderOpen] = useState(false);
  const [sessionCosts, setSessionCosts] = useState<Record<string, number | null>>({});
  const [costUnavailable, setCostUnavailable] = useState(false);
  const [contextMenuSessionId, setContextMenuSessionId] = useState<string | null>(null);
  const [suppressClickSessionId, setSuppressClickSessionId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    const targets = sessions
      .map((s) => s.id)
      .filter((id) => id && id !== 'current')
      .slice(0, 20);
    if (targets.length === 0) return;

    const loadSessionCosts = async () => {
      const entries = await Promise.all(targets.map(async (id) => {
        try {
          const response = await fetch(`/api/cost/session/${encodeURIComponent(id)}`);
          if (!response.ok) return [id, null] as const;
          const payload = await response.json() as CostSessionResponse;
          if (payload.error === 'opencode_unavailable') {
            if (!cancelled) setCostUnavailable(true);
            return [id, null] as const;
          }
          const value = typeof payload.total_usd === 'number'
            ? payload.total_usd
            : typeof payload.total_usd === 'string'
              ? Number.parseFloat(payload.total_usd)
              : NaN;
          return [id, Number.isFinite(value) ? value : null] as const;
        } catch {
          return [id, null] as const;
        }
      }));

      if (!cancelled) {
        setSessionCosts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    };

    void loadSessionCosts();
    return () => { cancelled = true; };
  }, [sessions]);

  useEffect(() => {
    if (!contextMenuSessionId) return;
    const close = () => setContextMenuSessionId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenuSessionId]);

  if (collapsed) {
    return (
      <aside className="flex flex-col items-center border-r border-border bg-sidebar py-2 px-1 w-10 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
              <button type="button" aria-label="Expand sidebar" className="p-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center" onClick={onToggle}>
                <PanelLeftOpen className="h-4 w-4" />
              </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Expand sidebar (Ctrl+B)</p></TooltipContent>
        </Tooltip>
        <div className="mt-3 space-y-2">
          {sessions.slice(0, 8).map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button type="button" className="block min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center" onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}>
                  <StatusDot status={s.isActive && s.status === 'running' ? 'running' : s.status} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>{s.name} ({s.status})</p></TooltipContent>
            </Tooltip>
          ))}
        </div>
      </aside>
    );
  }

  const displaySessionCost = (s: SessionSummary): number | null =>
    s.isActive ? sessionCost : (sessionCosts[s.id] ?? null);

  const renderCard = (s: SessionSummary) => {
    const selectId = s.id === 'current' ? null : s.id;
    const cardCost = displaySessionCost(s);
    const selected = selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId;
    return (
      <SessionCard
        key={s.id}
        session={s}
        selected={selected}
        cardCost={cardCost}
        costUnavailable={costUnavailable}
        suppressClick={suppressClickSessionId === s.id}
        onSelect={() => onSelectSession(selectId)}
        onOpenMenu={(x, y) => {
          setSuppressClickSessionId(s.id);
          setContextMenuPos({ x, y });
          setContextMenuSessionId(s.id);
        }}
        onSuppressClickClear={() => setSuppressClickSessionId(null)}
      />
    );
  };

  return (
    <aside className="flex flex-col border-r border-border bg-sidebar w-64 shrink-0 animate-slide-in-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
        {!isDesktop && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Collapse sidebar" className="p-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center" onClick={onToggle}>
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Collapse (Ctrl+B)</p></TooltipContent>
          </Tooltip>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 overflow-hidden">
          {Array.from(projectGroups.entries()).map(([project, items]) => (
            <Collapsible key={project} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 min-h-[44px] md:min-h-0 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                {project}
                <span className="ml-auto text-muted-foreground/40">{items.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{items.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {olderSessions.length > 0 && (
            <Collapsible open={olderOpen} onOpenChange={setOlderOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 min-h-[44px] md:min-h-0 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider hover:text-muted-foreground">
                {olderOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Older
                <span className="ml-auto">{olderSessions.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{olderSessions.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {sessions.length === 0 && <p className="text-xs text-muted-foreground p-2">No sessions.</p>}
        </div>
      </ScrollArea>
      {contextMenuSessionId && (
        <SessionContextMenu
          sessionId={contextMenuSessionId}
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onStop={(id, force) => {
            const selectId = id === 'current' ? null : id;
            onSelectSession(selectId);
            onStopSession?.(selectId, force);
          }}
          onCopyId={(id) => onCopySessionId?.(id)}
          onClose={() => setContextMenuSessionId(null)}
        />
      )}
    </aside>
  );
}

// ── Header ──

function Header({
  sessionName, isRunning, currentState, currentPhase, currentIteration,
  providerName, modelName, tasksCompleted, tasksTotal, progressPercent,
  updatedAt, loading, loadError, connectionStatus, onOpenCommand, onOpenSwitcher,
  stuckCount, startedAt, avgDuration, maxIterations, onToggleMobileMenu, mobileMenuButtonRef,
  selectedSessionId, qaCoverageRefreshKey,
  sessionCost, totalCost, budgetCap, budgetUsedPercent,
  costError, costLoading, budgetWarnings, budgetPauseThreshold,
}: {
  sessionName: string; isRunning: boolean; currentState: string; currentPhase: string;
  currentIteration: string; providerName: string; modelName: string;
  tasksCompleted: number; tasksTotal: number; progressPercent: number;
  updatedAt: string; loading: boolean; loadError: string | null;
  connectionStatus: ConnectionStatus; onOpenCommand: () => void; onOpenSwitcher: () => void;
  stuckCount: number; startedAt: string; avgDuration: string; maxIterations: number | null;
  onToggleMobileMenu: () => void;
  mobileMenuButtonRef: { current: HTMLButtonElement | null };
  selectedSessionId: string | null;
  qaCoverageRefreshKey: string;
  sessionCost: number;
  totalCost: number | null;
  budgetCap: number | null;
  budgetUsedPercent: number | null;
  costError: string | null;
  costLoading: boolean;
  budgetWarnings: number[];
  budgetPauseThreshold: number | null;
}) {
  const phaseBarColor = phaseBarColors[currentPhase.toLowerCase()] ?? 'bg-muted-foreground';
  return (
    <header className="border-b border-border px-3 py-2 md:px-4 md:py-2.5 shrink-0">
      <h1 className="sr-only">Aloop Dashboard</h1>
      <div className="flex items-center gap-2 sm:gap-4" data-testid="session-header-grid">
        <button ref={mobileMenuButtonRef} type="button" aria-label="Toggle sidebar" className="inline-flex items-center justify-center md:hidden p-1 min-h-[44px] min-w-[44px] rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggleMobileMenu}>
          <Menu className="h-5 w-5" />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="flex items-center gap-2 min-w-0 min-h-[44px] md:min-h-0 hover:text-primary transition-colors" onClick={onOpenSwitcher}>
              <StatusDot status={isRunning ? 'running' : currentState} />
              <span className="text-sm font-semibold truncate max-w-[120px] sm:max-w-[180px] md:max-w-[200px]">{sessionName}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent><p>{sessionName}</p></TooltipContent>
        </Tooltip>

        {/* Iteration info — hidden on mobile, tap session name for details */}
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className="text-xs text-muted-foreground cursor-help whitespace-nowrap hidden sm:flex items-center gap-1">
              <Activity className="h-3 w-3" />
              iter {currentIteration}{maxIterations ? `/${maxIterations}` : '/\u221E'}{tasksTotal > 0 ? ` \u00B7 ${tasksTotal} todos` : ''}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-56 text-xs">
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Phase:</span> {currentPhase || 'none'}</p>
              <p><span className="text-muted-foreground">Status:</span> {currentState}</p>
              <p><span className="text-muted-foreground">Provider:</span> {providerName || 'none'}</p>
              <p><span className="text-muted-foreground">TODOs:</span> {tasksCompleted}/{tasksTotal} ({progressPercent}%)</p>
              <p><span className="text-muted-foreground">Stuck:</span> <span className={stuckCount > 0 ? 'text-red-500 font-medium' : ''}>{stuckCount}</span></p>
              {startedAt && <p><span className="text-muted-foreground">Elapsed:</span> <ElapsedTimer since={startedAt} /></p>}
              {avgDuration && <p><span className="text-muted-foreground">Avg iter:</span> {avgDuration}</p>}
              <p><span className="text-muted-foreground">Session cost:</span> ${sessionCost.toFixed(4)}</p>
            </div>
          </HoverCardContent>
        </HoverCard>

        {startedAt && (
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <ElapsedTimer since={startedAt} />
          </span>
        )}
        {(avgDuration || sessionCost > 0) && (
          <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap hidden lg:inline">
            {avgDuration ? `~${avgDuration}/iter` : ''}{avgDuration && sessionCost > 0 ? ' · ' : ''}{sessionCost > 0 ? `$${sessionCost.toFixed(4)} session` : ''}
          </span>
        )}

        <div className="hidden xl:block">
          <CostDisplay
            totalCost={totalCost}
            budgetCap={budgetCap}
            budgetUsedPercent={budgetUsedPercent}
            error={costError}
            isLoading={costLoading}
            budgetWarnings={budgetWarnings}
            budgetPauseThreshold={budgetPauseThreshold}
            sessionCost={sessionCost}
            className="min-w-[220px]"
          />
        </div>

        {/* Progress bar — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 max-w-xs" data-testid="header-progress">
          <Progress value={progressPercent} className="flex-1 h-1.5" indicatorClassName={phaseBarColor} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
        </div>

        <PhaseBadge phase={currentPhase} />
        <QACoverageBadge sessionId={selectedSessionId} refreshKey={qaCoverageRefreshKey} />
        {providerName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground whitespace-nowrap truncate max-w-[160px] hidden lg:inline" data-testid="header-provider-model">{modelName ? `${providerName}/${modelName}` : providerName}</span>
            </TooltipTrigger>
            <TooltipContent><p>{modelName ? `${providerName}/${modelName}` : providerName}</p></TooltipContent>
          </Tooltip>
        )}
        {/* Status label — hidden on mobile (StatusDot already shows it) */}
        <span className={`text-xs whitespace-nowrap font-medium hidden sm:inline ${statusColors[currentState] ?? 'text-muted-foreground'}`} data-testid="header-status">{currentState}</span>

        <div className="flex-1" />
        <ConnectionIndicator status={connectionStatus} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:block" onClick={onOpenCommand}>
              <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono flex items-center gap-1"><Search className="h-3 w-3" /> <span className="hidden lg:inline">K</span></kbd>
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Command palette (Ctrl+K)</p></TooltipContent>
        </Tooltip>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline" data-testid="header-updated-at">
          {loading ? 'Loading...' : updatedAt ? formatTime(updatedAt) : ''}{loadError && !loading ? ' \u2022 err' : ''}
        </span>
      </div>
    </header>
  );
}

export function QACoverageBadge({ sessionId, refreshKey }: { sessionId: string | null; refreshKey: string }) {
  const [coverage, setCoverage] = useState<QACoverageViewData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadCoverage() {
      try {
        const sp = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
        const response = await fetch(`/api/qa-coverage${sp}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setCoverage(parseQACoveragePayload(payload));
      } catch {
        if (!cancelled) setCoverage({ percentage: null, available: false, features: [] });
      }
    }

    loadCoverage().catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, refreshKey]);

  // Still loading — hide until first fetch completes
  if (coverage === null) return null;

  const percentage = coverage.available ? coverage.percentage : null;
  const tone = percentage === null
    ? 'border-border bg-muted/40 text-muted-foreground'
    : percentage >= 80
      ? 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400'
      : percentage >= 50
        ? 'border-yellow-500/40 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
        : 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 min-h-[44px] md:min-h-0 text-[11px] font-medium transition-colors hover:opacity-90 ${tone}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        <span>QA {percentage === null ? 'N/A' : `${percentage}%`}</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[min(560px,92vw)] rounded-md border border-border bg-popover shadow-lg">
          <ScrollArea className="max-h-80">
            <div className="p-3 text-xs space-y-2">
              {coverage.features.length === 0 ? (
                <p className="text-muted-foreground">No feature rows found in QA coverage table.</p>
              ) : (
                coverage.features.map((feature, index) => {
                  const statusTone = feature.status === 'PASS'
                    ? 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400'
                    : feature.status === 'FAIL'
                      ? 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'border-border bg-muted/40 text-muted-foreground';
                  const StatusIcon = feature.status === 'PASS' ? CheckCircle2 : feature.status === 'FAIL' ? XCircle : Circle;
                  return (
                    <div key={`${feature.feature}-${feature.component}-${index}`} className="rounded-md border border-border/70 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{feature.feature || 'Unnamed feature'}</p>
                          {feature.component && <p className="text-[11px] text-muted-foreground truncate">{feature.component}</p>}
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusTone}`}>
                          <StatusIcon className="h-3 w-3" />
                          {feature.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ── Docs Panel ──

function DocsPanel({ docs, providerHealth, activityCollapsed, repoUrl }: { docs: Record<string, string>; providerHealth: ProviderHealth[]; activityCollapsed?: boolean; repoUrl?: string | null }) {
  const docOrder = ['TODO.md', 'SPEC.md', 'RESEARCH.md', 'REVIEW_LOG.md', 'STEERING.md'];
  const tabLabels: Record<string, string> = { 'TODO.md': 'TODO', 'SPEC.md': 'SPEC', 'RESEARCH.md': 'RESEARCH', 'REVIEW_LOG.md': 'REVIEW LOG', 'STEERING.md': 'STEERING' };

  const availableDocs = docOrder.filter((n) => docs[n] != null && docs[n] !== '');
  const extraDocs = Object.keys(docs).filter((n) => !docOrder.includes(n) && docs[n] != null && docs[n] !== '');
  const allDocs = [...availableDocs, ...extraDocs];

  const MAX_VISIBLE_TABS = 4;
  const visibleTabs = allDocs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = allDocs.slice(MAX_VISIBLE_TABS);

  // Always add Health as a special tab
  const defaultTab = allDocs.includes('TODO.md') ? 'TODO.md' : allDocs[0] ?? '_health';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const validTabs = [...allDocs, '_health'];
    if (!validTabs.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, allDocs, defaultTab]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
      <div className="flex items-center shrink-0">
        <TabsList className="h-auto md:h-8 bg-muted/50 flex-nowrap sm:flex-wrap justify-start flex-1 overflow-x-auto whitespace-nowrap">
          {visibleTabs.map((n) => (
            <TabsTrigger key={n} value={n} className="text-[10px] sm:text-[11px] px-2 py-1 md:h-6 data-[state=active]:bg-background">
              {tabLabels[n] ?? n.replace(/\.md$/i, '')}
            </TabsTrigger>
          ))}
          <TabsTrigger value="_health" className="text-[10px] sm:text-[11px] px-2 py-1 md:h-6 data-[state=active]:bg-background">
            <Heart className="h-3 w-3 mr-1" /> Health
          </TabsTrigger>
          {overflowTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="px-2 py-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label="Open overflow document tabs"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px] p-1">
                {overflowTabs.map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onSelect={() => setActiveTab(n)}
                    className={`w-full cursor-pointer text-left text-[11px] px-3 py-1.5${activeTab === n ? ' bg-accent' : ''}`}
                  >
                    {tabLabels[n] ?? n.replace(/\.md$/i, '')}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TabsList>
        {repoUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={repoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open repo on GitHub" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-6 md:w-6 rounded-sm text-muted-foreground hover:text-foreground hover:bg-background transition-colors ml-1 shrink-0">
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent><p>Open repo on GitHub</p></TooltipContent>
          </Tooltip>
        )}
      </div>
      {allDocs.map((n) => (
        <TabsContent key={n} value={n} className="flex-1 min-h-0 mt-0">
          <DocContent content={docs[n] ?? ''} name={n} wide={activityCollapsed} />
        </TabsContent>
      ))}
      <TabsContent value="_health" className="flex-1 min-h-0 mt-0">
        <HealthPanel providers={providerHealth} />
      </TabsContent>
    </Tabs>
  );
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

export function DocContent({ content, name, wide }: { content: string; name: string; wide?: boolean }) {
  const isSpec = /spec/i.test(name);
  const { rendered, toc } = useMemo(() => {
    if (!content) return { rendered: '', toc: [] as Array<{ level: number; text: string; id: string }> };
    const headings: Array<{ level: number; text: string; id: string }> = [];
    const renderer = new marked.Renderer();
    renderer.heading = ({ tokens, depth }: { tokens: { raw: string }[]; depth: number }) => {
      const text = tokens.map((t) => t.raw).join('');
      const id = slugify(text);
      headings.push({ level: depth, text, id });
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    };
    const html = marked.parse(content, { gfm: true, breaks: true, renderer }) as string;
    return { rendered: html, toc: headings };
  }, [content]);
  if (!content) return <p className="text-xs text-muted-foreground p-3">No content for {name}.</p>;
  const minLevel = toc.length > 0 ? Math.min(...toc.map((h) => h.level)) : 1;
  const hasToc = isSpec && toc.length > 0;
  const tocNav = hasToc ? (
    <nav className="space-y-0.5 text-[11px]">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Table of Contents</span>
      {toc.map((h) => (
        <a key={h.id} href={`#${h.id}`} className="block text-muted-foreground hover:text-foreground transition-colors truncate" style={{ paddingLeft: `${(h.level - minLevel) * 12}px` }}>
          {h.text}
        </a>
      ))}
    </nav>
  ) : null;

  // Wide mode: TOC as sticky sidebar, doc as main content
  if (wide && hasToc) {
    return (
      <div className="grid h-full" style={{ gridTemplateColumns: 'minmax(160px, 220px) 1fr' }}>
        <div className="border-r border-border overflow-y-auto p-3 pr-2">
          {tocNav}
        </div>
        <ScrollArea className="h-full">
          <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
        </ScrollArea>
      </div>
    );
  }

  // Normal mode: collapsible TOC above doc
  return (
    <ScrollArea className="h-full">
      {hasToc && (
        <div className="p-3 pb-0">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors font-medium uppercase tracking-wider">
              <ChevronRight className="h-3 w-3 collapsible-chevron" /> Table of Contents
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 mb-2 border-l-2 border-border pl-2">
                {tocNav}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      <div className="prose-dashboard p-3 pr-4" dangerouslySetInnerHTML={{ __html: rendered }} />
    </ScrollArea>
  );
}

export function HealthPanel({ providers }: { providers: ProviderHealth[] }) {
  if (providers.length === 0) {
    return <p className="text-xs text-muted-foreground p-3">No provider data yet.</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {providers.map((p) => (
          <Tooltip key={p.name}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent/30 cursor-default">
                {p.status === 'healthy' && <Circle className="h-3 w-3 text-green-500 fill-green-500" />}
                {p.status === 'cooldown' && <Pause className="h-3 w-3 text-orange-500" />}
                {p.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                {p.status === 'unknown' && <Circle className="h-3 w-3 text-muted-foreground" />}
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground ml-auto">
                  {p.status === 'cooldown' && p.cooldownUntil ? (() => {
                    const remaining = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000));
                    if (remaining <= 0) return 'cooldown ending…';
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    return `cooldown for ${h > 0 ? `${h}h ` : ''}${m}min`;
                  })() : p.status === 'unknown' ? 'no activity' : p.status}
                </span>
                <span className="text-muted-foreground text-[10px]">{relativeTime(p.lastEvent)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                <p>Provider: {p.name}</p>
                <p>Status: {p.status}</p>
                {p.reason && <p>Reason: {p.reason}</p>}
                {p.consecutiveFailures && <p>Failures: {p.consecutiveFailures}</p>}
                {p.cooldownUntil && <p>Cooldown until: {new Date(p.cooldownUntil).toLocaleTimeString()} ({(() => { const r = Math.max(0, Math.floor((new Date(p.cooldownUntil).getTime() - Date.now()) / 1000)); const h = Math.floor(r / 3600); const m = Math.floor((r % 3600) / 60); return r <= 0 ? 'ending' : `${h > 0 ? `${h}h ` : ''}${m}min left`; })()})</p>}
                {p.lastEvent && <p>Last event: {new Date(p.lastEvent).toLocaleString()}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </ScrollArea>
  );
}

// ── Activity Panel ──

export function ActivityPanel({ log, artifacts, currentIteration, currentPhase, currentProvider, isRunning, iterationStartedAt }: { log: string; artifacts: ArtifactManifest[]; currentIteration: number | null; currentPhase: string; currentProvider: string; isRunning: boolean; iterationStartedAt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    if (!log) return [];
    const all = log.split('\n').map(parseLogLine).filter((e): e is LogEntry => e !== null);
    // Show all structured (JSON) log entries — plain text lines (stderr noise) are excluded
    return all.filter((e) => e.rawObj !== null);
  }, [log]);

  // Deduplicate session_start — keep only first
  const deduped = useMemo(() => {
    let seenStart = false;
    return entries.filter((e) => {
      if (e.event === 'session_start') {
        if (seenStart) return false;
        seenStart = true;
      }
      return true;
    });
  }, [entries]);

  // Add synthetic "in progress" entry for currently running iteration
  const withCurrent = useMemo(() => {
    if (!isRunning || currentIteration === null) return deduped;
    // Check if the current iteration already has a complete/error entry from THIS run
    // (iteration numbers reset on resume, so old runs may have the same iteration number)
    const hasResult = deduped.some((e) => e.iteration === currentIteration && (e.isSuccess || e.isError) && (!iterationStartedAt || e.timestamp >= iterationStartedAt));
    if (hasResult) return deduped;
    // Add a synthetic running entry — use real iteration start time, fall back to last log entry time
    const lastEntryTime = deduped.length > 0 ? deduped[deduped.length - 1].timestamp : '';
    const ts = iterationStartedAt || lastEntryTime || new Date().toISOString();
    const syntheticEntry: LogEntry = {
      timestamp: ts, phase: currentPhase, event: 'iteration_running', provider: currentProvider, model: '',
      duration: '', message: 'Running...', raw: '', rawObj: null, iteration: currentIteration,
      dateKey: formatDateKey(ts), isSuccess: false, isError: false, commitHash: '', resultDetail: '',
      filesChanged: [], isSignificant: true,
    };
    return [...deduped, syntheticEntry];
  }, [deduped, isRunning, currentIteration, currentPhase, currentProvider, iterationStartedAt]);

  // Group by date, newest first
  const grouped = useMemo(() => {
    const groups: Array<{ dateKey: string; entries: LogEntry[] }> = [];
    let current: { dateKey: string; entries: LogEntry[] } | null = null;
    for (const entry of withCurrent) {
      if (!current || current.dateKey !== entry.dateKey) {
        current = { dateKey: entry.dateKey, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    for (const g of groups) g.entries.reverse();
    groups.reverse();
    return groups;
  }, [withCurrent]);

  const manifests = useMemo(() => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null), [artifacts]);
  const iterArtifacts = useMemo(() => {
    const map = new Map<number, ManifestPayload>();
    for (const m of manifests) map.set(m.iteration, m);
    return map;
  }, [manifests]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-1.5 shrink-0">
        <span className="text-[10px] text-muted-foreground">{deduped.length} events</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" ref={containerRef}>
        <div ref={topRef} />
        {grouped.map((group) => (
          <div key={group.dateKey} className="mb-2">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm pb-1 mb-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" /> {group.dateKey}
              </span>
            </div>
            <div>
              {group.entries.map((entry) => (
                <LogEntryRow
                  key={`${entry.timestamp}-${entry.event}-${entry.iteration ?? 'x'}`}
                  entry={entry}
                  artifacts={entry.iteration !== null ? iterArtifacts.get(entry.iteration) ?? null : null}
                  isCurrentIteration={entry.iteration !== null && entry.iteration === currentIteration}
                  allManifests={manifests}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



// ── Artifact Comparison ──

/** Find iterations (older than current) that have the same artifact path — for history scrubbing */
export function findBaselineIterations(artifactPath: string, currentIteration: number, allManifests: ManifestPayload[]): number[] {
  return allManifests
    .filter((m) => m.iteration < currentIteration && m.artifacts.some((a) => a.path === artifactPath))
    .map((m) => m.iteration)
    .sort((a, b) => b - a); // newest first
}

type ComparisonMode = 'side-by-side' | 'slider' | 'diff-overlay';

export function ArtifactComparisonDialog({
  artifact, currentIteration, allManifests, onClose,
}: {
  artifact: ArtifactEntry;
  currentIteration: number;
  allManifests: ManifestPayload[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ComparisonMode>('side-by-side');
  const [sliderPos, setSliderPos] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Available baseline iterations for this artifact
  const baselineIters = useMemo(
    () => findBaselineIterations(artifact.path, currentIteration, allManifests),
    [artifact.path, currentIteration, allManifests],
  );

  // If artifact has explicit baseline path, use it; otherwise use same path from older iteration
  const baselinePath = artifact.metadata?.baseline ?? artifact.path;
  const [selectedBaseline, setSelectedBaseline] = useState<number | null>(
    baselineIters.length > 0 ? baselineIters[0] : null,
  );

  const currentSrc = artifactUrl(currentIteration, artifact.path);
  const baselineSrc = selectedBaseline !== null ? artifactUrl(selectedBaseline, baselinePath) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Slider drag handling
  const updateSliderFromEvent = useCallback((clientX: number) => {
    const container = sliderContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) updateSliderFromEvent(e.clientX); };
    const onUp = () => { draggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [updateSliderFromEvent]);

  const hasBaseline = baselineSrc !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-[95vw] max-h-[95vh] w-[1200px] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium truncate">{artifact.path}</span>
            {artifact.metadata?.diff_percentage !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${artifact.metadata.diff_percentage < 5 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : artifact.metadata.diff_percentage < 20 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                diff: {artifact.metadata.diff_percentage.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mode tabs */}
            {hasBaseline && (
              <div className="flex rounded-md border border-border text-xs" role="tablist" aria-label="Comparison mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'side-by-side'}
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 rounded-l-md transition-colors ${mode === 'side-by-side' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('side-by-side')}
                >Side by Side</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'slider'}
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 border-l border-border transition-colors ${mode === 'slider' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('slider')}
                >Slider</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'diff-overlay'}
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 rounded-r-md border-l border-border transition-colors ${mode === 'diff-overlay' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('diff-overlay')}
                >Diff Overlay</button>
              </div>
            )}
            {/* History scrubbing dropdown */}
            {baselineIters.length > 0 && (
              <select
                className="text-xs bg-background border border-border rounded px-1.5 py-1 text-foreground"
                value={selectedBaseline ?? ''}
                onChange={(e) => setSelectedBaseline(e.target.value ? Number(e.target.value) : null)}
                aria-label="Compare against iteration"
              >
                {baselineIters.map((iter) => (
                  <option key={iter} value={iter}>iter {iter}{iter === baselineIters[baselineIters.length - 1] ? ' (initial)' : iter === baselineIters[0] ? ' (baseline)' : ''}</option>
                ))}
              </select>
            )}
            <button type="button" className="text-muted-foreground hover:text-foreground text-lg font-bold px-1" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!hasBaseline ? (
            /* No baseline — show current only with label */
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground italic">No baseline — first capture</span>
              <img src={currentSrc} alt={artifact.description || artifact.path} className="max-h-[80vh] max-w-full object-contain rounded" />
            </div>
          ) : mode === 'side-by-side' ? (
            /* Side by side mode */
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="flex flex-col items-center gap-1 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0">Baseline (iter {selectedBaseline})</span>
                <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center">
                  <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="max-w-full object-contain rounded" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0">Current (iter {currentIteration})</span>
                <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center">
                  <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="max-w-full object-contain rounded" />
                </div>
              </div>
            </div>
          ) : mode === 'slider' ? (
            /* Slider mode */
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Baseline (iter {selectedBaseline})</span>
                <span>|</span>
                <span>Current (iter {currentIteration})</span>
              </div>
              <div
                ref={sliderContainerRef}
                className="relative w-full max-w-[900px] cursor-col-resize select-none overflow-hidden rounded border border-border"
                onMouseDown={(e) => { draggingRef.current = true; updateSliderFromEvent(e.clientX); }}
                role="slider"
                aria-label="Image comparison slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderPos)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setSliderPos((p) => Math.max(0, p - 2));
                  else if (e.key === 'ArrowRight') setSliderPos((p) => Math.min(100, p + 2));
                }}
              >
                {/* Current image (full, behind) */}
                <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="w-full block" draggable={false} />
                {/* Baseline image (clipped from left) */}
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                  <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="w-full block" style={{ width: sliderContainerRef.current ? `${sliderContainerRef.current.offsetWidth}px` : '100%' }} draggable={false} />
                </div>
                {/* Divider line */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos}%` }}>
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
                    <span className="text-[10px] text-gray-500 select-none">&harr;</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Diff overlay mode */
            <div className="flex flex-col items-center gap-3" aria-label="Diff overlay comparison">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Overlay: baseline + current</span>
                <label className="inline-flex items-center gap-2">
                  <span>Current opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    aria-label="Overlay opacity"
                  />
                  <span className="w-10 text-right">{overlayOpacity}%</span>
                </label>
              </div>
              <div className="relative w-full max-w-[900px] overflow-hidden rounded border border-border">
                <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="w-full block" draggable={false} />
                <img
                  src={currentSrc}
                  alt={`Current iter ${currentIteration}`}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ opacity: overlayOpacity / 100 }}
                  draggable={false}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Baseline (iter {selectedBaseline})</span>
                <span>|</span>
                <span>Current (iter {currentIteration})</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Footer ──

function Footer({
  steerInstruction, setSteerInstruction, onSteer, steerSubmitting, onStop, stopSubmitting, onResume, resumeSubmitting, isRunning,
}: {
  steerInstruction: string; setSteerInstruction: (v: string) => void;
  onSteer: () => void; steerSubmitting: boolean;
  onStop: (force: boolean) => void; stopSubmitting: boolean;
  onResume: () => void; resumeSubmitting: boolean;
  isRunning: boolean;
}) {
  return (
    <footer className="border-t border-border px-3 py-2 md:px-4 shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Textarea
          className="min-h-[44px] md:min-h-[32px] h-auto md:h-8 resize-none text-xs flex-1 min-w-0"
          placeholder="Steer..."
          value={steerInstruction}
          onChange={(e) => setSteerInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSteer(); } }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" className="h-8 shrink-0 px-2 sm:px-3" aria-label="Send steering instruction" disabled={steerSubmitting || !steerInstruction.trim()} onClick={onSteer}>
              <Send className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">{steerSubmitting ? '...' : 'Send'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Send steering instruction (Enter)</p></TooltipContent>
        </Tooltip>
        {isRunning ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 shrink-0 px-2 sm:px-3" aria-label="Stop loop options" disabled={stopSubmitting}>
                <Square className="h-3 w-3" /><span className="hidden sm:inline ml-1">{stopSubmitting ? '...' : 'Stop'}</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStop(false)} aria-label="Stop after current iteration (SIGTERM)">
                  <Square className="h-3.5 w-3.5 mr-2" /> Stop after iteration
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGTERM</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onStop(true)} aria-label="Kill immediately without cleanup (SIGKILL)">
                  <Zap className="h-3.5 w-3.5 mr-2" /> Kill immediately
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGKILL</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" className="h-8 shrink-0 px-2 sm:px-3" disabled={resumeSubmitting} onClick={onResume}>
                <Play className="h-3 w-3" /><span className="hidden sm:inline ml-1">{resumeSubmitting ? '...' : 'Resume'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Resume loop from where it left off</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}

// ── Command Palette ──

function CommandPalette({ open, onClose, sessions, onSelectSession, onStop }: {
  open: boolean; onClose: () => void; sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void; onStop: (force: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const rafId = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(rafId);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 animate-fade-in" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div className="w-full max-w-md rounded-lg border bg-popover shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput ref={inputRef} autoFocus placeholder="Type a command..." />
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

  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileSidebarRef = useRef<HTMLDivElement | null>(null);
  const previousMobileMenuOpenRef = useRef(false);

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

  useEffect(() => {
    if (sidebarOpen) {
      previousMobileMenuOpenRef.current = true;
      const firstFocusable = mobileSidebarRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
      return;
    }
    if (previousMobileMenuOpenRef.current) {
      previousMobileMenuOpenRef.current = false;
      mobileMenuButtonRef.current?.focus();
    }
  }, [sidebarOpen]);

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

  const handleStopSession = useCallback((id: string | null, force: boolean) => {
    selectSession(id);
    void handleStop(force);
  }, [handleStop, selectSession]);

  const handleCopySessionId = useCallback(async (id: string) => {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
      await navigator.clipboard.writeText(id);
      toast.success(`Copied session ID: ${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

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

  const docsPanel = (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'docs' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <DocsPanel docs={state?.docs ?? {}} providerHealth={providerHealth} activityCollapsed={activityCollapsed} repoUrl={state?.repoUrl} />
      </CardContent>
    </Card>
  );

  const activityPanel = activityCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={`shrink-0 flex-col items-center gap-1 px-1 py-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground transition-colors hidden lg:flex ${activePanel !== 'activity' ? 'hidden lg:flex' : 'flex'}`} onClick={() => setActivityCollapsed(false)}>
          <PanelLeftOpen className="h-4 w-4" />
          <span className="text-[9px] uppercase tracking-wider font-medium [writing-mode:vertical-lr]">Activity</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="left"><p>Show activity panel</p></TooltipContent>
    </Tooltip>
  ) : (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'activity' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> Activity</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Collapse activity panel" className="text-muted-foreground hover:text-foreground transition-colors hidden lg:block min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center" onClick={() => setActivityCollapsed(true)}>
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Collapse activity panel</p></TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <ActivityPanel log={state?.log ?? ''} artifacts={state?.artifacts ?? []} currentIteration={isRunning ? currentIterationNum : null} currentPhase={currentPhase} currentProvider={providerName} isRunning={isRunning} iterationStartedAt={iterationStartedAt} />
      </CardContent>
    </Card>
  );

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
            <div ref={mobileSidebarRef} className="relative h-full w-64 max-w-[80vw] bg-background animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
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
          <Header sessionName={sessionName} isRunning={isRunning} currentState={currentState} currentPhase={currentPhase} currentIteration={currentIteration} providerName={providerName} modelName={modelName} tasksCompleted={tasksCompleted} tasksTotal={tasksTotal} progressPercent={progressPercent} updatedAt={state?.updatedAt ?? ''} loading={loading} loadError={loadError} connectionStatus={connectionStatus} onOpenCommand={() => setCommandOpen(true)} onOpenSwitcher={openSidebar} startedAt={startedAt} avgDuration={avgDuration} maxIterations={maxIterations} stuckCount={stuckCount} onToggleMobileMenu={toggleSidebar} mobileMenuButtonRef={mobileMenuButtonRef} selectedSessionId={selectedSessionId} qaCoverageRefreshKey={qaCoverageRefreshKey} sessionCost={sessionCost} totalCost={totalCost} budgetCap={budgetCap} budgetUsedPercent={budgetUsedPercent} costError={costError} costLoading={costLoading} budgetWarnings={budgetWarnings} budgetPauseThreshold={budgetPauseThreshold} />
          {/* Mobile panel toggle */}
          <div className="lg:hidden flex border-b border-border shrink-0">
            <button
              type="button"
              className={`flex-1 py-1.5 min-h-[44px] text-xs font-medium text-center transition-colors ${activePanel === 'docs' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActivePanel('docs')}
            >
              <FileText className="h-3.5 w-3.5 inline mr-1" />Documents
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 min-h-[44px] text-xs font-medium text-center transition-colors ${activePanel === 'activity' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActivePanel('activity')}
            >
              <Activity className="h-3.5 w-3.5 inline mr-1" />Activity
            </button>
          </div>
          <main className="flex-1 min-h-0 p-2 md:p-3">
            <div className="flex gap-3 h-full">
              {docsPanel}
              {activityPanel}
            </div>
          </main>
          <Footer steerInstruction={steerInstruction} setSteerInstruction={setSteerInstruction} onSteer={() => void handleSteer()} steerSubmitting={steerSubmitting} onStop={(f) => void handleStop(f)} stopSubmitting={stopSubmitting} onResume={() => void handleResume()} resumeSubmitting={resumeSubmitting} isRunning={isRunning} />
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
