import { Zap, Loader2, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConnectionStatus } from '@/lib/types';

const STATUS_DOT_CONFIG: Record<string, { color: string; label: string }> = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-muted-foreground/50', label: 'Stopped' },
  exited: { color: 'bg-muted-foreground/50', label: 'Exited' },
  unhealthy: { color: 'bg-red-500', label: 'Unhealthy' },
  error: { color: 'bg-red-500', label: 'Error' },
  stuck: { color: 'bg-orange-500', label: 'Stuck' },
  unknown: { color: 'bg-muted-foreground/30', label: 'Unknown' },
};

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
      <TooltipTrigger asChild>
        <span className="inline-flex">
          {dot}
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
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
