import { PanelLeftOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusDot } from '@/components/shared/StatusDot';
import type { SessionSummary } from '@/lib/types';

export interface CollapsedSidebarProps {
  sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void;
  onToggle: () => void;
}

export function CollapsedSidebar({ sessions, onSelectSession, onToggle }: CollapsedSidebarProps) {
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
