import {
  Activity, Clock, Menu, Search,
} from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CostDisplay } from '@/components/progress/CostDisplay';
import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import { QACoverageBadge } from '@/components/shared/QACoverageBadge';
import { StatusDot, ConnectionIndicator } from '@/components/shared/StatusDot';
import type { ConnectionStatus } from '@/lib/types';
import { formatTime } from '@/lib/format';

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

// ── Header ──

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
