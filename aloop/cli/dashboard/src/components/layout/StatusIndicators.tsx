import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Loader2, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ── Types ──

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

// ── Constants ──

export const phaseColors: Record<string, string> = {
  plan: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
  build: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  proof: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  review: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
};

const STATUS_DOT_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-muted-foreground/50', label: 'Stopped' },
  exited: { color: 'bg-muted-foreground/50', label: 'Exited' },
  unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
  error: { color: 'bg-red-500', label: 'Error' },
  stuck: { color: 'bg-orange-500', label: 'Stuck' },
  unknown: { color: 'bg-muted-foreground/30', label: 'Unknown' },
};

// ── Helpers ──

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── Components ──

export function PhaseBadge({ phase, small }: { phase: string; small?: boolean }) {
  if (!phase) return null;
  const colors = phaseColors[phase.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  const size = small ? 'px-1 py-0 text-[10px]' : 'px-1.5 py-0.5 text-xs';
  return <span className={`inline-block rounded border font-medium ${colors} ${size}`}>{phase}</span>;
}

export function StatusDot({ status, className = '' }: { status: string; className?: string }) {
  const config = STATUS_DOT_CONFIG[status] ?? STATUS_DOT_CONFIG.unknown;
  const label = config.label;

  const dot = status === 'running' ? (
    <span className={`relative flex h-2.5 w-2.5 shrink-0 ${className}`}>
      <span className={`absolute inline-flex h-full w-full animate-pulse-dot rounded-full ${config.color}/70`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${config.color}`} />
    </span>
  ) : (
    <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${config.color} ${className}`} />
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{dot}</span></TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  );
}

export function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const Icon = status === 'connected' ? Zap : status === 'connecting' ? Loader2 : AlertTriangle;
  const color = status === 'connected' ? 'text-green-500' : status === 'connecting' ? 'text-yellow-500 animate-spin' : 'text-red-500';
  const label = status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting...' : 'Disconnected';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <Icon className={`h-3 w-3 ${color}`} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent><p>SSE connection: {label}</p></TooltipContent>
    </Tooltip>
  );
}

export function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const start = new Date(since).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(formatSecs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <>{elapsed}</>;
}

