import { GitCommit, Square, Zap } from 'lucide-react';

export interface SessionContextMenuProps {
  sessionId: string;
  x: number;
  y: number;
  onStop: (id: string, force: boolean) => void;
  onCopyId: (id: string) => void;
  onClose: () => void;
}

export function SessionContextMenu({
  sessionId, x, y, onStop, onCopyId, onClose,
}: SessionContextMenuProps) {
  return (
    <div
      role="menu"
      className="fixed z-50 min-w-[170px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
        onClick={() => { onStop(sessionId, false); onClose(); }}
      >
        <Square className="h-3.5 w-3.5" /> Stop after iteration
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left text-destructive hover:bg-accent"
        onClick={() => { onStop(sessionId, true); onClose(); }}
      >
        <Zap className="h-3.5 w-3.5" /> Kill immediately
      </button>
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 min-h-[44px] md:min-h-0 text-sm text-left hover:bg-accent"
        onClick={() => { onCopyId(sessionId); onClose(); }}
      >
        <GitCommit className="h-3.5 w-3.5" /> Copy session ID
      </button>
    </div>
  );
}
