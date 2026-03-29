import {
  Activity, FileText, PanelLeftClose,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProviderHealth } from '@/components/health/ProviderHealth';
import { DocsPanel } from '@/components/layout/DocsPanel';
import { ActivityPanel } from '@/components/session/ActivityPanel';
import { SteerInput } from '@/components/session/SteerInput';
import type { ArtifactManifest } from '@/lib/types';

export interface MainPanelProps {
  docs: Record<string, string>;
  log: string;
  artifacts: ArtifactManifest[];
  repoUrl?: string | null;
  providerHealth: ProviderHealth[];
  activePanel: 'docs' | 'activity';
  setActivePanel: (v: 'docs' | 'activity') => void;
  activityCollapsed: boolean;
  setActivityCollapsed: (v: boolean) => void;
  currentIterationNum: number | null;
  currentPhase: string;
  currentProvider: string;
  isRunning: boolean;
  iterationStartedAt: string;
  steerInstruction: string;
  setSteerInstruction: (v: string) => void;
  onSteer: () => void;
  steerSubmitting: boolean;
  onStop: (force: boolean) => void;
  stopSubmitting: boolean;
  onResume: () => void;
  resumeSubmitting: boolean;
}

export function MainPanel({
  docs,
  log,
  artifacts,
  repoUrl,
  providerHealth,
  activePanel,
  setActivePanel,
  activityCollapsed,
  setActivityCollapsed,
  currentIterationNum,
  currentPhase,
  currentProvider,
  isRunning,
  iterationStartedAt,
  steerInstruction,
  setSteerInstruction,
  onSteer,
  steerSubmitting,
  onStop,
  stopSubmitting,
  onResume,
  resumeSubmitting,
}: MainPanelProps) {
  const docsPanel = (
    <Card className={`flex flex-col min-h-0 min-w-0 overflow-hidden flex-1 ${activePanel !== 'docs' ? 'hidden lg:flex' : ''}`}>
      <CardHeader className="py-2 px-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documents</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 min-w-0 px-3 pb-2">
        <DocsPanel docs={docs} providerHealth={providerHealth} activityCollapsed={activityCollapsed} repoUrl={repoUrl} />
      </CardContent>
    </Card>
  );

  const activityPanel = activityCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Show activity panel" className={`shrink-0 flex-col items-center gap-1 px-1 py-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground transition-colors hidden lg:flex ${activePanel !== 'activity' ? 'hidden lg:flex' : 'flex'}`} onClick={() => setActivityCollapsed(false)}>
          <Activity className="h-4 w-4" />
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
        <ActivityPanel
          log={log}
          artifacts={artifacts}
          currentIteration={isRunning ? currentIterationNum : null}
          currentPhase={currentPhase}
          currentProvider={currentProvider}
          isRunning={isRunning}
          iterationStartedAt={iterationStartedAt}
        />
      </CardContent>
    </Card>
  );

  return (
    <>
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
      <SteerInput
        steerInstruction={steerInstruction}
        setSteerInstruction={setSteerInstruction}
        onSteer={onSteer}
        steerSubmitting={steerSubmitting}
        onStop={onStop}
        stopSubmitting={stopSubmitting}
        onResume={onResume}
        resumeSubmitting={resumeSubmitting}
        isRunning={isRunning}
      />
    </>
  );
}