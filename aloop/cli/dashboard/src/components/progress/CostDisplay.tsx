import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface CostDisplayProps {
  totalCost: number | null;
  budgetCap: number | null;
  budgetUsedPercent: number | null;
  error?: string | null;
  isLoading?: boolean;
  budgetWarnings?: number[];
  budgetPauseThreshold?: number | null;
  sessionCost?: number;
  className?: string;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function indicatorClass(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export function CostDisplay({
  totalCost,
  budgetCap,
  budgetUsedPercent,
  error,
  isLoading = false,
  budgetWarnings,
  budgetPauseThreshold,
  sessionCost = 0,
  className,
}: CostDisplayProps) {
  if (error === 'opencode_unavailable') {
    if (sessionCost > 0) {
      const fallbackPercent = budgetCap && budgetCap > 0 ? Math.max(0, Math.min(100, (sessionCost / budgetCap) * 100)) : null;
      return (
        <div className={cn('rounded-md border border-border px-3 py-2', className)}>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Session Spend</div>
          <div className="text-sm font-semibold tabular-nums">
            {formatUsd(sessionCost)}{budgetCap ? ` / ${formatUsd(budgetCap)}` : ''}
          </div>
          {fallbackPercent !== null && (
            <Progress value={fallbackPercent} className="mt-2 h-2" indicatorClassName={indicatorClass(fallbackPercent)} />
          )}
        </div>
      );
    }
    return (
      <div className={cn('rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground', className)}>
        Cost data unavailable
      </div>
    );
  }

  const resolvedTotal = totalCost ?? 0;

  if (budgetCap === null) {
    return (
      <div className={cn('rounded-md border border-border px-3 py-2', className)}>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Spend</div>
        <div className="text-sm font-semibold tabular-nums">{isLoading && totalCost === null ? 'Loading...' : formatUsd(resolvedTotal)}</div>
      </div>
    );
  }

  const percent = budgetUsedPercent ?? 0;
  const progressValue = Math.max(0, Math.min(100, percent));
  const warningLabel = Array.isArray(budgetWarnings) && budgetWarnings.length > 0
    ? `Warnings: ${budgetWarnings.join('% / ')}%`
    : null;

  return (
    <div className={cn('rounded-md border border-border px-3 py-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Spend</div>
        <div className="text-xs text-muted-foreground tabular-nums">{percent.toFixed(1)}%</div>
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {isLoading && totalCost === null ? 'Loading...' : `${formatUsd(resolvedTotal)} / ${formatUsd(budgetCap)}`}
      </div>
      <Progress value={progressValue} className="mt-2 h-2" indicatorClassName={indicatorClass(percent)} />
      {(warningLabel || typeof budgetPauseThreshold === 'number') && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {warningLabel}
          {warningLabel && typeof budgetPauseThreshold === 'number' ? ' · ' : ''}
          {typeof budgetPauseThreshold === 'number' ? `Pause: ${budgetPauseThreshold}%` : ''}
        </div>
      )}
    </div>
  );
}
