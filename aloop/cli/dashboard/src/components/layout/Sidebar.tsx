import { useMemo } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { StatusDot } from '@/components/session/helpers';
import { SessionList, type SessionListSession } from '@/components/session/SessionList';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SidebarSession {
  id: string;
  name: string;
  projectName: string;
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

interface SidebarProps {
  sessions: SidebarSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const asSessionListSession = (session: SidebarSession): SessionListSession => ({
  ...session,
});

export function Sidebar({ sessions, selectedSessionId, onSelectSession, collapsed, onToggle }: SidebarProps) {
  const listSessions = useMemo(() => sessions.map(asSessionListSession), [sessions]);

  if (collapsed) {
    return (
      <aside className="flex flex-col items-center border-r border-border bg-sidebar py-2 px-1 w-10 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggle}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Expand sidebar (Ctrl+B)</p></TooltipContent>
        </Tooltip>
        <div className="mt-3 space-y-2">
          {sessions.slice(0, 8).map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button type="button" className="block" onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}>
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

  return (
    <aside className="flex flex-col border-r border-border bg-sidebar w-64 shrink-0 animate-slide-in-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" onClick={onToggle}>
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Collapse (Ctrl+B)</p></TooltipContent>
        </Tooltip>
      </div>
      <SessionList sessions={listSessions} selectedSessionId={selectedSessionId} onSelectSession={onSelectSession} />
    </aside>
  );
}
