import { GitBranch } from 'lucide-react';
import { PhaseBadge, StatusDot, relativeTime } from '@/components/session/helpers';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SessionCardSession {
  id: string;
  name: string;
  status: string;
  phase: string;
  iterations: string;
  isActive: boolean;
  branch: string;
  startedAt: string;
  endedAt: string;
  pid: string;
  provider: string;
  workDir: string;
  stuckCount: number;
}

interface SessionCardProps {
  session: SessionCardSession;
  selected: boolean;
  onSelectSession: (id: string | null) => void;
}

export function SessionCard({ session, selected, onSelectSession }: SessionCardProps) {
  const status = session.isActive && session.status === 'running' ? 'running' : session.status;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`w-full overflow-hidden rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${selected ? 'bg-accent' : ''}`}
          onClick={() => onSelectSession(session.id === 'current' ? null : session.id)}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <StatusDot status={status} />
            <span className="truncate font-medium flex-1">{session.name}</span>
            <span className="text-muted-foreground/50 text-[10px] shrink-0">{relativeTime(session.endedAt || session.startedAt)}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 ml-4 text-[10px] text-muted-foreground/60 overflow-hidden">
            {session.branch && <GitBranch className="h-2.5 w-2.5 shrink-0" />}
            {session.branch && <span className="truncate">{session.branch}</span>}
            {session.phase && <span className="shrink-0">·</span>}
            {session.phase && <PhaseBadge phase={session.phase} small />}
            {session.iterations && session.iterations !== '--' && <span className="shrink-0">iter {session.iterations}</span>}
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
          {session.startedAt && <p>Started: {new Date(session.startedAt).toLocaleString()}</p>}
          {session.endedAt && <p>Ended: {new Date(session.endedAt).toLocaleString()}</p>}
          {session.workDir && <p className="break-all">Dir: {session.workDir}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
