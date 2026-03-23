import { Circle, Pause, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ProviderHealth {
  name: string;
  status: 'healthy' | 'cooldown' | 'failed' | 'unknown';
  lastEvent: string;
  reason?: string;
  consecutiveFailures?: number;
  cooldownUntil?: string;
}

function relativeTime(ts: string): string {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch { return ''; }
}

function cooldownLabel(cooldownUntil: string): string {
  const remaining = Math.max(0, Math.floor((new Date(cooldownUntil).getTime() - Date.now()) / 1000));
  if (remaining <= 0) return 'cooldown ending…';
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return `cooldown for ${h > 0 ? `${h}h ` : ''}${m}min`;
}

export function HealthPanel({ providers }: { providers: ProviderHealth[] }) {
  if (providers.length === 0) {
    return <p className="text-xs text-muted-foreground p-3">No provider data yet.</p>;
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {providers.map((p) => (
          <Tooltip key={p.name}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent/30 cursor-default">
                {p.status === 'healthy' && <Circle className="h-3 w-3 text-green-500 fill-green-500" />}
                {p.status === 'cooldown' && <Pause className="h-3 w-3 text-orange-500" />}
                {p.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                {p.status === 'unknown' && <Circle className="h-3 w-3 text-muted-foreground" />}
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground ml-auto">
                  {p.status === 'cooldown' && p.cooldownUntil
                    ? cooldownLabel(p.cooldownUntil)
                    : p.status === 'unknown' ? 'no activity' : p.status}
                </span>
                <span className="text-muted-foreground text-[10px]">{relativeTime(p.lastEvent)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                <p>Provider: {p.name}</p>
                <p>Status: {p.status}</p>
                {p.reason && <p>Reason: {p.reason}</p>}
                {p.consecutiveFailures && <p>Failures: {p.consecutiveFailures}</p>}
                {p.cooldownUntil && (
                  <p>
                    Cooldown until: {new Date(p.cooldownUntil).toLocaleTimeString()}{' '}
                    ({cooldownLabel(p.cooldownUntil)})
                  </p>
                )}
                {p.lastEvent && <p>Last event: {new Date(p.lastEvent).toLocaleString()}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </ScrollArea>
  );
}
