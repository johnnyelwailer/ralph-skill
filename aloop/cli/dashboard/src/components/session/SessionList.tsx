import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { SessionCard, type SessionCardSession } from '@/components/session/SessionCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface SessionListSession extends SessionCardSession {
  projectName: string;
}

interface SessionListProps {
  sessions: SessionListSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onSessionContextMenu?: (id: string, x: number, y: number) => void;
}

function matchesFilter(session: SessionListSession, query: string): boolean {
  const q = query.toLowerCase();
  return (
    session.name.toLowerCase().includes(q) ||
    session.projectName.toLowerCase().includes(q) ||
    session.branch.toLowerCase().includes(q) ||
    session.status.toLowerCase().includes(q)
  );
}

export function SessionList({ sessions, selectedSessionId, onSelectSession, onSessionContextMenu }: SessionListProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(
    () => (filter ? sessions.filter((s) => matchesFilter(s, filter)) : sessions),
    [sessions, filter],
  );

  const { projectGroups, olderSessions } = useMemo(() => {
    const now = Date.now();
    const cutoff = 24 * 60 * 60 * 1000;
    const active: SessionListSession[] = [];
    const older: SessionListSession[] = [];

    for (const session of filtered) {
      const lastActivity = session.endedAt || session.startedAt;
      const age = lastActivity ? now - new Date(lastActivity).getTime() : Number.POSITIVE_INFINITY;
      if (session.isActive || session.status === 'running' || age < cutoff) active.push(session);
      else older.push(session);
    }

    const groups = new Map<string, SessionListSession[]>();
    for (const session of active) {
      const key = session.projectName || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(session);
    }

    return { projectGroups: groups, olderSessions: older };
  }, [filtered]);

  const [olderOpen, setOlderOpen] = useState(false);
  const isSelected = (session: SessionListSession) =>
    selectedSessionId === null ? sessions.indexOf(session) === 0 : session.id === selectedSessionId;

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 overflow-hidden">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Filter sessions…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 pl-7 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {Array.from(projectGroups.entries()).map(([project, items]) => (
          <Collapsible key={project} defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider hover:text-muted-foreground">
              <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
              {project}
              <span className="ml-auto text-muted-foreground/40">{items.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-0.5 mb-2">
                {items.map((session) => (
                  <SessionCard key={session.id} session={session} selected={isSelected(session)} onSelectSession={onSelectSession} onContextMenu={onSessionContextMenu ? (x, y) => onSessionContextMenu(session.id, x, y) : undefined} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}

        {olderSessions.length > 0 && (
          <Collapsible open={olderOpen} onOpenChange={setOlderOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-1 py-1 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider hover:text-muted-foreground">
              {olderOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Older
              <span className="ml-auto">{olderSessions.length}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-0.5 mb-2">
                {olderSessions.map((session) => (
                  <SessionCard key={session.id} session={session} selected={isSelected(session)} onSelectSession={onSelectSession} onContextMenu={onSessionContextMenu ? (x, y) => onSessionContextMenu(session.id, x, y) : undefined} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {sessions.length === 0 && <p className="text-xs text-muted-foreground p-2">No sessions.</p>}
        {sessions.length > 0 && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-2">No matching sessions.</p>
        )}
      </div>
    </ScrollArea>
  );
}
