import { GitCommit, Square, Zap } from 'lucide-react';

export interface SidebarContextMenuProps {
  sessionId: string;
  position: { x: number; y: number };
  onSelectSession: (id: string | null) => void;
  onStopSession?: (id: string | null, force: boolean) => void;
  onCopySessionId?: (id: string) => void;
  onClose: () => void;
}

export function SidebarContextMenu({
  sessionId, position, onSelectSession, onStopSession, onCopySessionId, onClose,
}: SidebarContextMenuProps) {
  const selectId = sessionId === 'current' ? null : sessionId;

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
        onClick={() => {
          onSelectSession(selectId);
          onStopSession?.(selectId, false);
          onClose();
        }}
      >
        <Square className="h-3.5 w-3.5" /> Stop after iteration
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left text-destructive hover:bg-accent"
        onClick={() => {
          onSelectSession(selectId);
          onStopSession?.(selectId, true);
          onClose();
        }}
      >
        <Zap className="h-3.5 w-3.5" /> Kill immediately
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
        onClick={() => {
          onCopySessionId?.(sessionId);
          onClose();
        }}
      >
        <GitCommit className="h-3.5 w-3.5" /> Copy session ID
      </button>
    </div>
  );
}
