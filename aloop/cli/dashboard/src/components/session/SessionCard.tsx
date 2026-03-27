import { GitBranch } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import { StatusDot } from '@/components/shared/StatusDot';
import { useLongPress } from '@/hooks/useLongPress';
import { relativeTime } from '@/lib/format';
import type { SessionSummary } from '@/lib/types';

export interface SessionCardProps {
  session: SessionSummary;
  cardCost: number | null;
  isSelected: boolean;
  costUnavailable: boolean;
  suppressClick: boolean;
  onSelect: () => void;
  onOpenContextMenu: (x: number, y: number) => void;
  onClearSuppressClick: () => void;
}

export function SessionCard({
  session,
  cardCost,
  isSelected,
  costUnavailable,
  suppressClick,
  onSelect,
  onOpenContextMenu,
  onClearSuppressClick,
}: SessionCardProps) {
  const openMenu = (x: number, y: number) => {
    onOpenContextMenu(x, y);
  };

  const longPressBind = useLongPress({
    threshold: 500,
    onLongPress: (event) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenu(rect.left + 24, rect.top + 24);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    },
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`w-full overflow-hidden rounded-md px-2 py-1.5 min-h-[44px] md:min-h-0 text-left text-xs transition-colors hover:bg-accent ${isSelected ? 'bg-accent' : ''}`}
          onClick={(event) => {
            if (suppressClick) {
              event.preventDefault();
              onClearSuppressClick();
              return;
            }
            onSelect();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            openMenu(event.clientX, event.clientY);
          }}
          {...longPressBind}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <StatusDot status={session.isActive && session.status === 'running' ? 'running' : session.status} />
            <span className="truncate font-medium flex-1">{session.name}</span>
            <span className="text-muted-foreground text-[10px] shrink-0">{relativeTime(session.endedAt || session.startedAt)}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 ml-4 text-[10px] text-muted-foreground/60 overflow-hidden">
            {session.branch && <GitBranch className="h-2.5 w-2.5 shrink-0" />}
            {session.branch && <span className="truncate">{session.branch}</span>}
            {session.phase && <span className="shrink-0">·</span>}
            {session.phase && <PhaseBadge phase={session.phase} small />}
            {session.iterations && session.iterations !== '--' && <span className="shrink-0">iter {session.iterations}</span>}
            {session.elapsed && session.elapsed !== '--' && <span className="shrink-0">· {session.elapsed}</span>}
            {typeof cardCost === 'number' && <span className="shrink-0">· ${cardCost.toFixed(4)}</span>}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-lg">
        <div className="space-y-0.5 text-xs">
          <p className="font-medium">{session.id}</p>
          {session.pid && <p>PID: {session.pid}</p>}
          <p>Status: {session.status}</p>
          {session.stuckCount > 0 && <p className="text-red-500">Stuck: {session.stuckCount}</p>}
          <p>Provider: {session.provider}</p>
          <p>Iterations: {session.iterations}</p>
          {session.elapsed && session.elapsed !== '--' && <p>Duration: {session.elapsed}</p>}
          {costUnavailable && typeof cardCost !== 'number' && <p>Cost: unavailable</p>}
          {typeof cardCost === 'number' && <p>Cost: ${cardCost.toFixed(4)}</p>}
          {session.startedAt && <p>Started: {new Date(session.startedAt).toLocaleString()}</p>}
          {session.endedAt && <p>Ended: {new Date(session.endedAt).toLocaleString()}</p>}
          {session.workDir && <p className="break-all">Dir: {session.workDir}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
