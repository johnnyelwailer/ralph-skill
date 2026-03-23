import { useState, useEffect } from 'react';
import {
  Activity, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
  Menu, Search, XCircle, Zap, Loader2, AlertTriangle,
} from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CostDisplay } from '@/components/progress/CostDisplay';

// ── Types ──

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface QACoverageFeature {
  feature: string;
  component: string;
  last_tested: string;
  commit: string;
  status: 'PASS' | 'FAIL' | 'UNTESTED';
  criteria_met: string;
  notes: string;
}

interface QACoverageViewData {
  percentage: number | null;
  available: boolean;
  features: QACoverageFeature[];
}

// ── Constants ──

const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
};

const phaseBarColors: Record<string, string> = {
  plan: 'bg-purple-500', build: 'bg-yellow-500', proof: 'bg-amber-500', review: 'bg-cyan-500',
};

const statusColors: Record<string, string> = {
  running: 'text-green-600 dark:text-green-400',
  exited: 'text-muted-foreground',
  stopped: 'text-red-600 dark:text-red-400',
  stopping: 'text-orange-600 dark:text-orange-400',
};

const STATUS_DOT_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-muted-foreground/50', label: 'Stopped' },
  exited: { color: 'bg-muted-foreground/50', label: 'Exited' },
  unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
  error: { color: 'bg-red-500', label: 'Error' },
  stuck: { color: 'bg-orange-500', label: 'Stuck' },
  unknown: { color: 'bg-muted-foreground/30', label: 'Unknown' },
};

// ── Private helpers ──

function formatTime(ts: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
}

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

// ── Sub-components ──

export function PhaseBadge({ phase, small }: { phase: string; small?: boolean }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  const size = small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs';
  return <span className={`inline-block rounded border font-medium ${colors} ${size}`}>{phase}</span>;
}

export function StatusDot({ status, className = '' }: { status: string; className?: string }) {
  const config = STATUS_DOT_CONFIG[status] ?? STATUS_DOT_CONFIG.unknown;
  const label = config.label;

  const dot = status === 'running' ? (
    <span className={`relative flex h-2.5 w-2.5 shrink-0 ${className}`}>
      <span className={`absolute inline-flex h-full w-full animate-pulse-dot rounded-full ${config.color}/70`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.color}`} />
    </span>
  ) : (
    <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${config.color} ${className}`} />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{dot}</span></TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  );
}

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
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

export function Header({
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
        <button type="button" aria-label="Toggle sidebar" className="inline-flex items-center justify-center md:hidden p-1 min-h-[44px] min-w-[44px] rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggleMobileMenu}>
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
