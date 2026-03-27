import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { toast } from 'sonner';
import {
  Activity, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
  GitBranch, GitCommit, FileText, Menu, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Play, Search, Send, Square, Terminal, Timer, XCircle, Zap, Loader2,
  Heart, AlertTriangle, ExternalLink,
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
import { HealthPanel } from '@/components/health/ProviderHealth';
import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import { StatusDot, ConnectionIndicator } from '@/components/shared/StatusDot';
import { SessionCard } from '@/components/session/SessionCard';
import { SteerInput } from '@/components/session/SteerInput';
import {
  ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations,
} from '@/components/session/ActivityLog';
export {
  ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations,
} from '@/components/session/ActivityLog';
import {
  isRecord, str, numStr, SIGNIFICANT_EVENTS, parseLogLine,
  phaseDotColors, extractIterationUsage, IMAGE_EXT, isImageArtifact, artifactUrl,
  parseManifest, extractModelFromOutput,
} from '@/lib/activityLogHelpers';
export {
  isRecord, str, numStr, SIGNIFICANT_EVENTS, parseLogLine,
  phaseDotColors, extractIterationUsage, IMAGE_EXT, isImageArtifact, artifactUrl,
  parseManifest, extractModelFromOutput,
} from '@/lib/activityLogHelpers';
import { useCost } from '@/hooks/useCost';
import { parseTodoProgress } from '../../src/lib/parseTodoProgress';
import { ResponsiveLayout, useResponsiveLayout } from '@/components/layout/ResponsiveLayout';

import { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';
export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';

import {
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, parseDurationSeconds,
} from './lib/format';
export {
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, parseDurationSeconds,
} from './lib/format';

// ── Types ──

import type {
  SessionStatus, ArtifactManifest, DashboardState, SessionSummary,
  FileChange, LogEntry, ArtifactEntry, ManifestPayload,
  QACoverageFeature, QACoverageViewData, CostSessionResponse,
  ConnectionStatus, IterationUsage,
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



// ── Phase colors ──

const phaseBarColors: Record<string, string> = {
  plan: 'bg-purple-500', build: 'bg-yellow-500', proof: 'bg-amber-500', review: 'bg-cyan-500',
};

const statusColors: Record<string, string> = {
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-600 dark:text-red-400',
  stopping: 'text-orange-600 dark:text-orange-400',
};

// ── Average iteration duration from log ──



function parseQACoveragePayload(payload: unknown): QACoverageViewData {
  if (!isRecord(payload)) return { percentage: null, available: false, features: [] };
  const available = typeof payload.available === 'boolean' ? payload.available : true;
  const percentValue = typeof payload.coverage_percent === 'number'
    ? payload.coverage_percent
    : (typeof payload.percentage === 'number' ? payload.percentage : null);
  const features = Array.isArray(payload.features)
    ? payload.features
      .filter((f): f is Record<string, unknown> => isRecord(f))
      .map((f): QACoverageFeature => {
        const rawStatus = typeof f.status === 'string' ? f.status.toUpperCase() : 'UNTESTED';
        const status: QACoverageFeature['status'] = rawStatus === 'PASS' || rawStatus === 'FAIL' ? rawStatus : 'UNTESTED';
        return {
          feature: typeof f.feature === 'string' ? f.feature : '',
          component: typeof f.component === 'string' ? f.component : '',
          last_tested: typeof f.last_tested === 'string' ? f.last_tested : '',
          commit: typeof f.commit === 'string' ? f.commit : '',
          status,
          criteria_met: typeof f.criteria_met === 'string' ? f.criteria_met : '',
          notes: typeof f.notes === 'string' ? f.notes : '',
        };
      })
    : [];

  return { percentage: percentValue, available, features };
}

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

  const isSelected = (s: SessionSummary) =>
    selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId;

  const displaySessionCost = (s: SessionSummary): number | null =>
    s.isActive ? sessionCost : (sessionCosts[s.id] ?? null);

  const renderCard = (s: SessionSummary) => {
    const cardCost = displaySessionCost(s);
    return (
      <SessionCard
        key={s.id}
        session={s}
        cardCost={cardCost}
        isSelected={isSelected(s)}
        costUnavailable={costUnavailable}
        suppressClick={suppressClickSessionId === s.id}
        onSelect={() => onSelectSession(s.id === 'current' ? null : s.id)}
        onOpenContextMenu={(x, y) => {
          setSuppressClickSessionId(s.id);
          setContextMenuPos({ x, y });
          setContextMenuSessionId(s.id);
        }}
        onClearSuppressClick={() => setSuppressClickSessionId(null)}
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
        <div
          role="menu"
          className="fixed z-50 min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
            onClick={() => {
              const selectId = contextMenuSessionId === 'current' ? null : contextMenuSessionId;
              onSelectSession(selectId);
              onStopSession?.(selectId, false);
              setContextMenuSessionId(null);
            }}
          >
            <Square className="h-3.5 w-3.5" /> Stop after iteration
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left text-destructive hover:bg-accent"
            onClick={() => {
              const selectId = contextMenuSessionId === 'current' ? null : contextMenuSessionId;
              onSelectSession(selectId);
              onStopSession?.(selectId, true);
              setContextMenuSessionId(null);
            }}
          >
            <Zap className="h-3.5 w-3.5" /> Kill immediately
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
            onClick={() => {
              onCopySessionId?.(contextMenuSessionId);
              setContextMenuSessionId(null);
            }}
          >
            <GitCommit className="h-3.5 w-3.5" /> Copy session ID
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Header ──

function Header({
  sessionName, isRunning, currentState, currentPhase, currentIteration,
  providerName, modelName, tasksCompleted, tasksTotal, progressPercent,
  updatedAt, loading, loadError, connectionStatus, onOpenCommand, onOpenSwitcher,
  stuckCount, startedAt, avgDuration, maxIterations, onToggleMobileMenu,
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
        <button type="button" aria-label="Toggle sidebar" className="inline-flex items-center justify-center sm:hidden p-1 min-h-[44px] min-w-[44px] rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggleMobileMenu}>
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
                    className="w-full cursor-pointer text-left text-[11px] px-3 py-1.5"
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
          {/* Mobile panel toggle */}
          <div className="lg:hidden flex border-b border-border shrink-0">
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'docs' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActivePanel('docs')}
            >
              <FileText className="h-3.5 w-3.5 inline mr-1" />Documents
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${activePanel === 'activity' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
          <SteerInput steerInstruction={steerInstruction} setSteerInstruction={setSteerInstruction} onSteer={() => void handleSteer()} steerSubmitting={steerSubmitting} onStop={(f) => void handleStop(f)} stopSubmitting={stopSubmitting} onResume={() => void handleResume()} resumeSubmitting={resumeSubmitting} isRunning={isRunning} />
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
