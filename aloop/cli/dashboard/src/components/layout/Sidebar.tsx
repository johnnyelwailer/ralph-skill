import { useEffect, useMemo, useState } from 'react';
import { GitCommit, PanelLeftClose, PanelLeftOpen, Square, Zap } from 'lucide-react';
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
  sessionCost?: number;
  onStopSession?: (id: string | null, force: boolean) => void;
  onCopySessionId?: (id: string) => void;
}

const asSessionListSession = (session: SidebarSession): SessionListSession => ({
  ...session,
});

export function Sidebar({
  sessions, selectedSessionId, onSelectSession, collapsed, onToggle,
  onStopSession, onCopySessionId,
}: SidebarProps) {
  const listSessions = useMemo(() => sessions.map(asSessionListSession), [sessions]);

  const [contextMenuSessionId, setContextMenuSessionId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!contextMenuSessionId) return;
    const close = () => setContextMenuSessionId(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenuSessionId]);

  const handleSessionContextMenu = (id: string, x: number, y: number) => {
    setContextMenuPos({ x, y });
    setContextMenuSessionId(id);
  };

  if (collapsed) {
    return (
      <aside className="flex flex-col items-center border-r border-border bg-sidebar py-2 px-1 w-10 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Expand sidebar"
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={onToggle}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Expand sidebar (Ctrl+B)</p></TooltipContent>
        </Tooltip>
        <div className="mt-3 space-y-2">
          {sessions.slice(0, 8).map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="block"
                  onClick={() => onSelectSession(s.id === 'current' ? null : s.id)}
                >
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
            <button
              type="button"
              aria-label="Collapse sidebar"
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              onClick={onToggle}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Collapse (Ctrl+B)</p></TooltipContent>
        </Tooltip>
      </div>
      <SessionList
        sessions={listSessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={onSelectSession}
        onSessionContextMenu={(onStopSession || onCopySessionId) ? handleSessionContextMenu : undefined}
      />
      {contextMenuSessionId && (
        <div
          role="menu"
          className="fixed z-50 min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent"
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
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left text-destructive hover:bg-accent"
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
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent"
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
