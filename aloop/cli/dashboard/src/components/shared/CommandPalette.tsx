import { Square, Zap } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { StatusDot } from '@/components/shared/StatusDot';
import { PhaseBadge } from '@/components/shared/PhaseBadge';
import type { SessionSummary } from '@/lib/types';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  onSelectSession: (id: string | null) => void;
  onStop: (force: boolean) => void;
}

export function CommandPalette({ open, onClose, sessions, onSelectSession, onStop }: CommandPaletteProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 animate-fade-in" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div className="w-full max-w-md rounded-lg border bg-popover shadow-lg" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput autoFocus placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { onClose(); onStop(false); }}>
                <Square className="h-4 w-4 mr-2" /> Stop session (graceful)
              </CommandItem>
              <CommandItem onSelect={() => { onClose(); onStop(true); }}>
                <Zap className="h-4 w-4 mr-2" /> Force stop (SIGKILL)
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Sessions">
              {sessions.map((s) => (
                <CommandItem key={s.id} onSelect={() => { onClose(); onSelectSession(s.id === 'current' ? null : s.id); }}>
                  <div className="flex items-center gap-2">
                    {s.isActive && s.status === 'running' && <StatusDot status="running" />}
                    <span>{s.name}</span>
                    {s.phase && <PhaseBadge phase={s.phase} small />}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
