import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitCommit, PanelLeftClose, PanelLeftOpen, Square, Zap } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SessionCard } from '@/components/session/SessionCard';
import { StatusDot } from '@/components/shared/StatusDot';
import type { CostSessionResponse, SessionSummary } from '@/lib/types';

export interface SidebarProps {
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
  sessionCost: number;
  onStopSession?: (id: string | null, force: boolean) => void;
  onCopySessionId?: (id: string) => void;
  isDesktop?: boolean;
}

export function Sidebar({
  sessions, selectedSessionId, onSelectSession, collapsed, onToggle, sessionCost, onStopSession, onCopySessionId, isDesktop,
}: SidebarProps) {
  // Group by project
  const { projectGroups, olderSessions } = useMemo(() => {
    const now = Date.now();
    const cutoff = 24 * 60 * 60 * 1000; // 24h
    const active: SessionSummary[] = [];
    const older: SessionSummary[] = [];

    for (const s of sessions) {
      const lastActivity = s.endedAt || s.startedAt;
      const age = lastActivity ? now - new Date(lastActivity).getTime() : Infinity;
      if (s.isActive || s.status === 'running' || age < cutoff) {
        active.push(s);
      } else {
        older.push(s);
      }
    }

    const groups = new Map<string, SessionSummary[]>();
    for (const s of active) {
      const key = s.projectName || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return { projectGroups: groups, olderSessions: older };
  }, [sessions]);

  const [olderOpen, setOlderOpen] = useState(false);
  const [sessionCosts, setSessionCosts] = useState<Record<string, number | null>>({});
  const [costUnavailable, setCostUnavailable] = useState(false);
  const [contextMenuSessionId, setContextMenuSessionId] = useState<string | null>(null);
  const [suppressClickSessionId, setSuppressClickSessionId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    const targets = sessions
      .map((s) => s.id)
      .filter((id) => id && id !== 'current')
      .slice(0, 20);
    if (targets.length === 0) return;

    const loadSessionCosts = async () => {
      const entries = await Promise.all(targets.map(async (id) => {
        try {
          const response = await fetch(`/api/cost/session/${encodeURIComponent(id)}`);
          if (!response.ok) return [id, null] as const;
          const payload = await response.json() as CostSessionResponse;
          if (payload.error === 'opencode_unavailable') {
            if (!cancelled) setCostUnavailable(true);
            return [id, null] as const;
          }
          const value = typeof payload.total_usd === 'number'
            ? payload.total_usd
            : typeof payload.total_usd === 'string'
              ? Number.parseFloat(payload.total_usd)
              : NaN;
          return [id, Number.isFinite(value) ? value : null] as const;
        } catch {
          return [id, null] as const;
        }
      }));

      if (!cancelled) {
        setSessionCosts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    };

    void loadSessionCosts();
    return () => { cancelled = true; };
  }, [sessions]);

  useEffect(() => {
    if (!contextMenuSessionId) return;
    const close = () => setContextMenuSessionId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenuSessionId]);

  if (collapsed) {
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

  const isSelected = (s: SessionSummary) =>
    selectedSessionId === null ? sessions.indexOf(s) === 0 : s.id === selectedSessionId;

  const displaySessionCost = (s: SessionSummary): number | null =>
    s.isActive ? sessionCost : (sessionCosts[s.id] ?? null);

  const renderCard = (s: SessionSummary) => {
    const cardCost = displaySessionCost(s);
    return (
      <SessionCard
        key={s.id}
        session={s}
        cardCost={cardCost}
        isSelected={isSelected(s)}
        costUnavailable={costUnavailable}
        suppressClick={suppressClickSessionId === s.id}
        onSelect={() => onSelectSession(s.id === 'current' ? null : s.id)}
        onOpenContextMenu={(x, y) => {
          setSuppressClickSessionId(s.id);
          setContextMenuPos({ x, y });
          setContextMenuSessionId(s.id);
        }}
        onClearSuppressClick={() => setSuppressClickSessionId(null)}
      />
    );
  };

  return (
    <aside className="flex flex-col border-r border-border bg-sidebar w-64 shrink-0 animate-slide-in-left">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</span>
        {!isDesktop && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="Collapse sidebar" className="p-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center" onClick={onToggle}>
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent><p>Collapse (Ctrl+B)</p></TooltipContent>
          </Tooltip>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 overflow-hidden">
          {Array.from(projectGroups.entries()).map(([project, items]) => (
            <Collapsible key={project} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 min-h-[44px] md:min-h-0 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground">
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
                {project}
                <span className="ml-auto text-muted-foreground/40">{items.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{items.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {olderSessions.length > 0 && (
            <Collapsible open={olderOpen} onOpenChange={setOlderOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 min-h-[44px] md:min-h-0 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider hover:text-muted-foreground">
                {olderOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Older
                <span className="ml-auto">{olderSessions.length}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-0.5 mb-2">{olderSessions.map(renderCard)}</div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {sessions.length === 0 && <p className="text-xs text-muted-foreground p-2">No sessions.</p>}
        </div>
      </ScrollArea>
      {contextMenuSessionId && (
        <div
          role="menu"
          className="fixed z-50 min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
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
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left text-destructive hover:bg-accent"
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
            className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
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
