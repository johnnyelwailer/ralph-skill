import { useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { formatDateKey } from '@/lib/format';
import type { ArtifactManifest, LogEntry, ManifestPayload } from '@/lib/types';
import { parseManifest, parseLogLine } from '@/lib/activityLogHelpers';
import { LogEntryRow } from './LogEntryRow';

export function ActivityPanel({ log, artifacts, currentIteration, currentPhase, currentProvider, isRunning, iterationStartedAt }: { log: string; artifacts: ArtifactManifest[]; currentIteration: number | null; currentPhase: string; currentProvider: string; isRunning: boolean; iterationStartedAt?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    if (!log) return [];
    const all = log.split('\n').map(parseLogLine).filter((e): e is LogEntry => e !== null);
    // Show all structured (JSON) log entries — plain text lines (stderr noise) are excluded
    return all.filter((e) => e.rawObj !== null);
  }, [log]);

  // Deduplicate session_start — keep only first
  const deduped = useMemo(() => {
    let seenStart = false;
    return entries.filter((e) => {
      if (e.event === 'session_start') {
        if (seenStart) return false;
        seenStart = true;
      }
      return true;
    });
  }, [entries]);

  // Add synthetic "in progress" entry for currently running iteration
  const withCurrent = useMemo(() => {
    if (!isRunning || currentIteration === null) return deduped;
    // Check if the current iteration already has a complete/error entry from THIS run
    // (iteration numbers reset on resume, so old runs may have the same iteration number)
    const hasResult = deduped.some((e) => e.iteration === currentIteration && (e.isSuccess || e.isError) && (!iterationStartedAt || e.timestamp >= iterationStartedAt));
    if (hasResult) return deduped;
    // Add a synthetic running entry — use real iteration start time, fall back to last log entry time
    const lastEntryTime = deduped.length > 0 ? deduped[deduped.length - 1].timestamp : '';
    const ts = iterationStartedAt || lastEntryTime || new Date().toISOString();
    const syntheticEntry: LogEntry = {
      timestamp: ts, phase: currentPhase, event: 'iteration_running', provider: currentProvider, model: '',
      duration: '', message: 'Running...', raw: '', rawObj: null, iteration: currentIteration,
      dateKey: formatDateKey(ts), isSuccess: false, isError: false, commitHash: '', resultDetail: '',
      filesChanged: [], isSignificant: true,
    };
    return [...deduped, syntheticEntry];
  }, [deduped, isRunning, currentIteration, currentPhase, currentProvider, iterationStartedAt]);

  // Group by date, newest first
  const grouped = useMemo(() => {
    const groups: Array<{ dateKey: string; entries: LogEntry[] }> = [];
    let current: { dateKey: string; entries: LogEntry[] } | null = null;
    for (const entry of withCurrent) {
      if (!current || current.dateKey !== entry.dateKey) {
        current = { dateKey: entry.dateKey, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    for (const g of groups) g.entries.reverse();
    groups.reverse();
    return groups;
  }, [withCurrent]);

  const manifests = useMemo(() => artifacts.map(parseManifest).filter((m): m is ManifestPayload => m !== null), [artifacts]);
  const iterArtifacts = useMemo(() => {
    const map = new Map<number, ManifestPayload>();
    for (const m of manifests) map.set(m.iteration, m);
    return map;
  }, [manifests]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-1.5 shrink-0">
        <span className="text-[10px] text-muted-foreground">{deduped.length} events</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" ref={containerRef}>
        <div ref={topRef} />
        {grouped.map((group) => (
          <div key={group.dateKey} className="mb-2">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm pb-1 mb-0.5">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" /> {group.dateKey}
              </span>
            </div>
            <div>
              {group.entries.map((entry) => (
                <LogEntryRow
                  key={`${entry.timestamp}-${entry.event}-${entry.iteration ?? 'x'}`}
                  entry={entry}
                  artifacts={entry.iteration !== null ? iterArtifacts.get(entry.iteration) ?? null : null}
                  allManifests={manifests}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
