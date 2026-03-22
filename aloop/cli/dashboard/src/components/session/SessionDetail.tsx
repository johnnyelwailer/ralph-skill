import { type ReactNode } from 'react';
import { Activity } from 'lucide-react';
import { PhaseBadge, StatusDot, statusColors } from '@/components/session/helpers';
import { Progress } from '@/components/ui/progress';
import { phaseBarColors } from '@/components/session/helpers';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

interface SessionDetailProps {
  sessionName: string;
  isRunning: boolean;
  currentState: string;
  currentPhase: string;
  currentIteration: string;
  progressPercent: number;
  maxIterations: number | null;
  tasksTotal: number;
  onOpenSwitcher?: () => void;
  /** Extra content rendered inside the hover card, after the default fields */
  extraHoverContent?: ReactNode;
}

export function SessionDetail({
  sessionName, isRunning, currentState, currentPhase, currentIteration,
  progressPercent, maxIterations, tasksTotal, onOpenSwitcher, extraHoverContent,
}: SessionDetailProps) {
  const phaseBarColor = phaseBarColors[currentPhase.toLowerCase()] ?? 'bg-muted-foreground';

  return (
    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="flex items-center gap-2 min-w-0 hover:text-primary transition-colors" onClick={onOpenSwitcher}>
            <StatusDot status={isRunning ? 'running' : currentState} />
            <span className="text-sm font-semibold truncate max-w-[120px] sm:max-w-[180px] md:max-w-[200px]">{sessionName}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent><p>{sessionName}</p></TooltipContent>
      </Tooltip>

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
            {extraHoverContent}
          </div>
        </HoverCardContent>
      </HoverCard>

      <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 max-w-xs">
        <Progress value={progressPercent} className="flex-1 h-1.5" indicatorClassName={phaseBarColor} />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
      </div>

      <PhaseBadge phase={currentPhase} />
      <span className={`text-xs whitespace-nowrap font-medium hidden sm:inline ${statusColors[currentState] ?? 'text-muted-foreground'}`}>{currentState}</span>
    </div>
  );
}
