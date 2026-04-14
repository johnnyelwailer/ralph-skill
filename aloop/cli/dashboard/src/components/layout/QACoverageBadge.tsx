import { useState, useEffect } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// ── Types ──

interface QACoverageFeature {
  feature: string;
  component: string;
  last_tested: string;
  commit: string;
  status: 'PASS' | 'FAIL' | 'UNTESTED';
  criteria_met: string;
  notes: string;
}

interface QACoverageViewData {
  percentage: number | null;
  available: boolean;
  features: QACoverageFeature[];
}

// ── Helpers ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseQACoveragePayload(payload: unknown): QACoverageViewData {
  if (!isRecord(payload)) return { percentage: null, available: false, features: [] };
  const available = typeof payload.available === 'boolean' ? payload.available : true;
  const percentValue = typeof payload.coverage_percent === 'number'
    ? payload.coverage_percent
    : (typeof payload.percentage === 'number' ? payload.percentage : null);
  const features = Array.isArray(payload.features)
    ? payload.features
      .filter((f): f is Record<string, unknown> => isRecord(f))
      .map((f): QACoverageFeature => {
        const rawStatus = typeof f.status === 'string' ? f.status.toUpperCase() : 'UNTESTED';
        const status: QACoverageFeature['status'] = rawStatus === 'PASS' || rawStatus === 'FAIL' ? rawStatus : 'UNTESTED';
        return {
          feature: typeof f.feature === 'string' ? f.feature : '',
          component: typeof f.component === 'string' ? f.component : '',
          last_tested: typeof f.last_tested === 'string' ? f.last_tested : '',
          commit: typeof f.commit === 'string' ? f.commit : '',
          status,
          criteria_met: typeof f.criteria_met === 'string' ? f.criteria_met : '',
          notes: typeof f.notes === 'string' ? f.notes : '',
        };
      })
    : [];
  return { percentage: percentValue, available, features };
}

// ── Component ──

export function QACoverageBadge({ sessionId, refreshKey }: { sessionId: string | null; refreshKey: string }) {
  const [coverage, setCoverage] = useState<QACoverageViewData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadCoverage() {
      try {
        const sp = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
        const response = await fetch(`/api/qa-coverage${sp}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setCoverage(parseQACoveragePayload(payload));
      } catch {
        if (!cancelled) setCoverage({ percentage: null, available: false, features: [] });
      }
    }

    loadCoverage().catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId, refreshKey]);

  if (coverage === null) return null;

  const percentage = coverage.available ? coverage.percentage : null;
  const tone = percentage === null
    ? 'border-border bg-muted/40 text-muted-foreground'
    : percentage >= 80
      ? 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400'
      : percentage >= 50
        ? 'border-yellow-500/40 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
        : 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 min-h-[44px] md:min-h-0 text-[11px] font-medium transition-colors hover:opacity-90 ${tone}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        <span>QA {percentage === null ? 'N/A' : `${percentage}%`}</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[min(560px,92vw)] rounded-md border border-border bg-popover shadow-lg">
          <ScrollArea className="max-h-80">
            <div className="p-3 text-xs space-y-2">
              {coverage.features.length === 0 ? (
                <p className="text-muted-foreground">No feature rows found in QA coverage table.</p>
              ) : (
                coverage.features.map((feature, index) => {
                  const statusTone = feature.status === 'PASS'
                    ? 'border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-400'
                    : feature.status === 'FAIL'
                      ? 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'border-border bg-muted/40 text-muted-foreground';
                  const StatusIcon = feature.status === 'PASS' ? CheckCircle2 : feature.status === 'FAIL' ? XCircle : Circle;
                  return (
                    <div key={`${feature.feature}-${feature.component}-${index}`} className="rounded-md border border-border/70 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{feature.feature || 'Unnamed feature'}</p>
                          {feature.component && <p className="text-[11px] text-muted-foreground truncate">{feature.component}</p>}
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusTone}`}>
                          <StatusIcon className="h-3 w-3" />
                          {feature.status}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
