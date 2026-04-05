import React from 'react';
import { Zap, Loader2, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

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
