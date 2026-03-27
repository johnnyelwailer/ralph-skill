import { ChevronDown, Play, Send, Square, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface SteerInputProps {
  steerInstruction: string;
  setSteerInstruction: (v: string) => void;
  onSteer: () => void;
  steerSubmitting: boolean;
  onStop: (force: boolean) => void;
  stopSubmitting: boolean;
  onResume: () => void;
  resumeSubmitting: boolean;
  isRunning: boolean;
}

export function SteerInput({
  steerInstruction,
  setSteerInstruction,
  onSteer,
  steerSubmitting,
  onStop,
  stopSubmitting,
  onResume,
  resumeSubmitting,
  isRunning,
}: SteerInputProps) {
  return (
    <footer className="border-t border-border px-3 py-2 md:px-4 shrink-0">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <Textarea
          className="min-h-[44px] md:min-h-[32px] h-auto md:h-8 resize-none text-xs flex-1 min-w-0"
          placeholder="Steer..."
          value={steerInstruction}
          onChange={(e) => setSteerInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSteer(); } }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" className="h-8 shrink-0 px-2 sm:px-3" aria-label="Send steering instruction" disabled={steerSubmitting || !steerInstruction.trim()} onClick={onSteer}>
              <Send className="h-3.5 w-3.5" /><span className="hidden sm:inline ml-1">{steerSubmitting ? '...' : 'Send'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Send steering instruction (Enter)</p></TooltipContent>
        </Tooltip>
        {isRunning ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 shrink-0 px-2 sm:px-3" aria-label="Stop loop options" disabled={stopSubmitting}>
                <Square className="h-3 w-3" /><span className="hidden sm:inline ml-1">{stopSubmitting ? '...' : 'Stop'}</span>
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStop(false)} aria-label="Stop after current iteration (SIGTERM)">
                  <Square className="h-3.5 w-3.5 mr-2" /> Stop after iteration
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGTERM</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onStop(true)} aria-label="Kill immediately without cleanup (SIGKILL)">
                  <Zap className="h-3.5 w-3.5 mr-2" /> Kill immediately
                  <span className="ml-auto text-[10px] text-muted-foreground">SIGKILL</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" className="h-8 shrink-0 px-2 sm:px-3" disabled={resumeSubmitting} onClick={onResume}>
                <Play className="h-3 w-3" /><span className="hidden sm:inline ml-1">{resumeSubmitting ? '...' : 'Resume'}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Resume loop from where it left off</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}
