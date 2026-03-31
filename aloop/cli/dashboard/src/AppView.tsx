import { useCallback, useEffect, useRef } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Sidebar } from '@/components/layout/Sidebar';
export { Sidebar } from '@/components/layout/Sidebar';
import { Header, QACoverageBadge } from '@/components/layout/Header';
export { QACoverageBadge } from '@/components/layout/Header';
import { SessionDetail } from '@/components/session/SessionDetail';
export { slugify, DocContent } from '@/components/session/SessionDetail';
export {
  ActivityPanel, LogEntryRow, ArtifactComparisonDialog, findBaselineIterations,
} from '@/components/session/ActivityLog';
import { ResponsiveLayout, useResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import { useDashboardState } from '@/hooks/useDashboardState';

export {
  isRecord, str, numStr, SIGNIFICANT_EVENTS, parseLogLine,
  phaseDotColors, extractIterationUsage, IMAGE_EXT, isImageArtifact, artifactUrl,
  parseManifest, extractModelFromOutput,
} from '@/lib/activityLogHelpers';
export { useCost } from '@/hooks/useCost';
export { stripAnsi, rgbStr, parseAnsiSegments, renderAnsiToHtml } from './lib/ansi';
export {
  formatTime, formatTimeShort, formatSecs, formatDuration, formatDateKey,
  relativeTime, formatTokenCount, parseDurationSeconds,
} from './lib/format';
export { deriveProviderHealth } from './lib/deriveProviderHealth';
export { toSession } from './lib/sessionHelpers';
export { computeAvgDuration } from './lib/logHelpers';
export type {
  SessionStatus, ArtifactManifest, DashboardState, SessionSummary,
  FileChange, LogEntry, ArtifactEntry, ManifestPayload,
  QACoverageFeature, QACoverageViewData, CostSessionResponse,
  ConnectionStatus, IterationUsage,
} from './lib/types';

function AppInner() {
  const s = useDashboardState();
  const { isDesktop, isMobile, sidebarOpen, toggleSidebar, openSidebar, closeSidebar } = useResponsiveLayout();
  const touchXRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!isMobile) toggleSidebar(); }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); s.setCommandOpen((p) => !p); }
      if (e.key === 'Escape' && sidebarOpen) { e.preventDefault(); closeSidebar(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleSidebar, isMobile, s, sidebarOpen, closeSidebar]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isMobile) touchXRef.current = e.touches[0]?.clientX ?? null;
  }, [isMobile]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || touchXRef.current === null) return;
    const sx = touchXRef.current; touchXRef.current = null;
    if (sx <= 20 && (e.changedTouches[0]?.clientX ?? 0) - sx >= 50) openSidebar();
  }, [isMobile, openSidebar]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex flex-1 min-h-0">
        <div className="hidden sm:flex">
          <Sidebar sessions={s.sessions} selectedSessionId={s.selectedSessionId} onSelectSession={s.selectSession} collapsed={isDesktop ? false : !sidebarOpen} onToggle={toggleSidebar} sessionCost={s.sessionCost} isDesktop={isDesktop} />
        </div>
        {!isDesktop && sidebarOpen && (
          <div className="fixed inset-0 z-40 animate-fade-in" onClick={closeSidebar}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative h-full w-64 max-w-[80vw] bg-background animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
              <Sidebar sessions={s.sessions} selectedSessionId={s.selectedSessionId} onSelectSession={(id) => { s.selectSession(id); closeSidebar(); }} collapsed={false} onToggle={closeSidebar} sessionCost={s.sessionCost} />
            </div>
          </div>
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <Header sessionName={s.currentSessionName} isRunning={s.isRunning} currentState={s.currentState} currentPhase={s.currentPhase} currentIteration={s.currentIteration} providerName={s.providerName} modelName={s.modelName} tasksCompleted={s.tasksCompleted} tasksTotal={s.tasksTotal} progressPercent={s.progressPercent} updatedAt={s.state?.updatedAt ?? ''} loading={s.loading} loadError={s.loadError} connectionStatus={s.connectionStatus} onOpenCommand={() => s.setCommandOpen(true)} onOpenSwitcher={openSidebar} startedAt={s.startedAt} avgDuration={s.avgDuration} maxIterations={s.maxIterations} stuckCount={s.stuckCount} onToggleMobileMenu={toggleSidebar} selectedSessionId={s.selectedSessionId} qaCoverageRefreshKey={s.qaCoverageRefreshKey} sessionCost={s.sessionCost} totalCost={s.totalCost} budgetCap={s.budgetCap} budgetUsedPercent={s.budgetUsedPercent} costError={s.costError} costLoading={s.costLoading} budgetWarnings={s.budgetWarnings} budgetPauseThreshold={s.budgetPauseThreshold} />
          <SessionDetail docs={s.state?.docs ?? {}} log={s.state?.log ?? ''} artifacts={s.state?.artifacts ?? []} repoUrl={s.state?.repoUrl} providerHealth={s.providerHealth} activePanel={s.activePanel} setActivePanel={s.setActivePanel} activityCollapsed={s.activityCollapsed} setActivityCollapsed={s.setActivityCollapsed} currentIterationNum={s.currentIterationNum} currentPhase={s.currentPhase} currentProvider={s.providerName} isRunning={s.isRunning} iterationStartedAt={s.iterationStartedAt} steerInstruction={s.steerInstruction} setSteerInstruction={s.setSteerInstruction} onSteer={() => void s.handleSteer()} steerSubmitting={s.steerSubmitting} onStop={(f) => void s.handleStop(f)} stopSubmitting={s.stopSubmitting} onResume={() => void s.handleResume()} resumeSubmitting={s.resumeSubmitting} />
        </div>
      </div>
      <CommandPalette open={s.commandOpen} onClose={() => s.setCommandOpen(false)} sessions={s.sessions} onSelectSession={s.selectSession} onStop={(f) => void s.handleStop(f)} />
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
