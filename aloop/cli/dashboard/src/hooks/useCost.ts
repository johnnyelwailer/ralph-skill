import { useEffect, useMemo, useRef, useState } from 'react';

interface CostAggregateResponse {
  total_usd?: number | string;
  error?: string;
}

interface UseCostOptions {
  log: string;
  meta: Record<string, unknown> | null;
}

export interface UseCostResult {
  sessionCost: number;
  totalCost: number | null;
  budgetCap: number | null;
  budgetUsedPercent: number | null;
  isLoading: boolean;
  error: string | null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractIterationCost(raw: unknown): number {
  if (typeof raw !== 'string' || !raw.trim()) return 0;

  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.event !== 'iteration_complete') return 0;
    const cost = toNumber(obj.cost_usd);
    return cost && cost > 0 ? cost : 0;
  } catch {
    return 0;
  }
}

function sumSessionCost(log: string): number {
  if (!log.trim()) return 0;

  let total = 0;
  for (const line of log.split('\n')) total += extractIterationCost(line);
  return total;
}

export function useCost({ log, meta }: UseCostOptions): UseCostResult {
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const sessionCost = useMemo(() => sumSessionCost(log), [log]);

  const budgetCap = useMemo(() => {
    const parsed = toNumber(meta?.budget_cap_usd);
    return parsed !== null && parsed > 0 ? parsed : null;
  }, [meta]);

  const pollIntervalMinutes = useMemo(() => {
    const parsed = toNumber(meta?.cost_poll_interval_minutes);
    return parsed !== null && parsed > 0 ? parsed : 5;
  }, [meta]);

  const budgetUsedPercent = useMemo(() => {
    if (budgetCap === null || totalCost === null) return null;
    return (totalCost / budgetCap) * 100;
  }, [budgetCap, totalCost]);

  useEffect(() => {
    let cancelled = false;

    const fetchAggregateCost = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);

      try {
        const response = await fetch('/api/cost/aggregate');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json() as CostAggregateResponse;
        if (payload.error === 'opencode_unavailable') {
          if (!cancelled) {
            setTotalCost(null);
            setError('opencode_unavailable');
          }
          return;
        }

        const parsedTotal = toNumber(payload.total_usd);
        if (parsedTotal === null) throw new Error('Invalid /api/cost/aggregate response');

        if (!cancelled) {
          setTotalCost(parsedTotal);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch aggregate cost');
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchAggregateCost();
    const intervalMs = pollIntervalMinutes * 60 * 1000;
    const intervalId = window.setInterval(() => {
      void fetchAggregateCost();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMinutes]);

  return { sessionCost, totalCost, budgetCap, budgetUsedPercent, isLoading, error };
}
