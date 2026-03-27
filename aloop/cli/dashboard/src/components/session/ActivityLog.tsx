import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
  GitCommit, Loader2, Timer, XCircle, Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArtifactViewer } from '@/components/artifacts/ArtifactViewer';
import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
import { renderAnsiToHtml } from '@/lib/ansi';
import { formatTimeShort, formatDuration, formatDateKey, formatTokenCount } from '@/lib/format';
import type {
  ArtifactManifest, ArtifactEntry, FileChange, LogEntry, ManifestPayload, IterationUsage,
} from '@/lib/types';
import {
  phaseDotColors, extractIterationUsage, extractModelFromOutput,
  artifactUrl, parseManifest, parseLogLine,
} from '@/lib/activityLogHelpers';

// ── Activity Panel ──

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
                  isCurrentIteration={entry.iteration !== null && entry.iteration === currentIteration}
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

export function LogEntryRow({ entry, artifacts, isCurrentIteration, allManifests }: { entry: LogEntry; artifacts: ManifestPayload | null; isCurrentIteration: boolean; allManifests: ManifestPayload[] }) {
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [comparisonArtifact, setComparisonArtifact] = useState<{ artifact: ArtifactEntry; iteration: number } | null>(null);
  const [outputText, setOutputText] = useState<string | null>(null);
  const [outputLoading, setOutputLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const phaseColor = phaseDotColors[entry.phase?.toLowerCase()] ?? 'text-muted-foreground';
  const isRunningEntry = entry.event === 'iteration_running';
  const hasOutput = entry.iteration !== null && (entry.event.includes('complete') || entry.event.includes('error'));
  const hasExpandable = !isRunningEntry && (entry.filesChanged.length > 0 || (artifacts && artifacts.artifacts.length > 0) || hasOutput || entry.rawObj);

  const loadOutput = useCallback(async () => {
    if (outputText !== null || outputLoading || entry.iteration === null) return;
    setOutputLoading(true);
    try {
      const res = await fetch(`/api/artifacts/${entry.iteration}/output.txt`);
      if (res.ok) {
        setOutputText(await res.text());
      } else {
        setOutputText('');
      }
    } catch {
      setOutputText('');
    } finally {
      setOutputLoading(false);
    }
  }, [entry.iteration, outputText, outputLoading]);

  // Auto-load output when expanded
  useEffect(() => {
    if (expanded && hasOutput) loadOutput();
  }, [expanded, hasOutput, loadOutput]);

  // Scroll output to bottom when it loads (summary is usually at the end)
  useEffect(() => {
    if (outputText && outputRef.current) {
      requestAnimationFrame(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      });
    }
  }, [outputText]);

  return (
    <>
      <div
        className={`flex items-center gap-1.5 py-1 px-1.5 text-[11px] font-mono rounded transition-colors min-w-0 ${
          hasExpandable ? 'cursor-pointer hover:bg-accent/30' : 'hover:bg-accent/20'
        } ${expanded ? 'bg-accent/20' : ''}`}
        onClick={() => hasExpandable && setExpanded(!expanded)}
      >
        {/* Timestamp */}
        <span className="text-muted-foreground/60 shrink-0 w-11 text-right">{entry.timestamp ? formatTimeShort(entry.timestamp) : ''}</span>

        {/* Phase dot — centered with items-center on parent */}
        {isRunningEntry ? (
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`absolute inline-flex h-full w-full animate-pulse-dot rounded-full ${phaseColor === 'text-muted-foreground' ? 'bg-green-400' : ''}`} style={phaseColor !== 'text-muted-foreground' ? { backgroundColor: 'currentColor' } : undefined} />
            <Circle className={`relative h-2.5 w-2.5 fill-current ${phaseColor}`} />
          </span>
        ) : (
          <Circle className={`h-2.5 w-2.5 shrink-0 fill-current ${phaseColor}`} />
        )}

        {/* Phase label */}
        {entry.phase && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground shrink-0 w-12 truncate">{entry.phase}</span>
            </TooltipTrigger>
            <TooltipContent><p>{entry.phase}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Provider·model */}
        {entry.provider && (() => {
          const model = entry.model && entry.model !== 'opencode-default'
            ? entry.model
            : extractModelFromOutput(artifacts?.outputHeader);
          const label = model ? `${entry.provider}\u00b7${model}` : entry.provider;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground/70 shrink-0 max-w-[140px] truncate">{label}</span>
              </TooltipTrigger>
              <TooltipContent><p>{label}</p></TooltipContent>
            </Tooltip>
          );
        })()}

        {/* Result icon */}
        {entry.isSuccess && (
          <Tooltip>
            <TooltipTrigger asChild><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" /></TooltipTrigger>
            <TooltipContent><p>Success</p></TooltipContent>
          </Tooltip>
        )}
        {entry.isError && (
          <Tooltip>
            <TooltipTrigger asChild><XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" /></TooltipTrigger>
            <TooltipContent><p>{entry.resultDetail || 'Error'}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Result detail */}
        {entry.resultDetail && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`min-w-0 truncate ${entry.commitHash ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-muted-foreground/70'}`}>
                {entry.resultDetail}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg"><p className="break-all">{entry.resultDetail}</p></TooltipContent>
          </Tooltip>
        )}

        {/* Message for non-iteration events (skip for running entry — timer is enough) */}
        {!isRunningEntry && !entry.resultDetail && entry.message && entry.message !== entry.event && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-foreground/70 min-w-0 truncate flex-1">{entry.message}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg"><p className="break-words">{entry.message}</p></TooltipContent>
          </Tooltip>
        )}

        <span className="flex-1 min-w-0" />

        {/* Duration — right-aligned */}
        {entry.duration && (
          <span className="text-muted-foreground shrink-0 whitespace-nowrap flex items-center gap-0.5">
            <Timer className="h-3 w-3" />{formatDuration(entry.duration)}
          </span>
        )}
        {/* Elapsed timer for running entry — right-aligned */}
        {isRunningEntry && (
          <span className="text-green-600 dark:text-green-400 shrink-0 whitespace-nowrap flex items-center gap-0.5 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            <ElapsedTimer since={entry.timestamp} />
          </span>
        )}

        {/* Collapsed artifact count indicator */}
        {!expanded && artifacts && artifacts.artifacts.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400 text-[10px] shrink-0">{artifacts.artifacts.length}A</span>
        )}

        {/* Expand chevron */}
        {hasExpandable && (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-14 mr-2 mb-1.5 animate-fade-in text-[11px] overflow-hidden min-w-0">
          {/* File changes */}
          {entry.filesChanged.length > 0 && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                <GitCommit className="h-3 w-3" />
                <span className="font-medium">{entry.commitHash && `${entry.commitHash.slice(0, 7)} — `}{entry.filesChanged.length} files</span>
              </div>
              {entry.filesChanged.map((f, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 font-mono">
                      <span className={`shrink-0 w-3 text-center font-bold ${
                        f.type === 'A' ? 'text-green-500' : f.type === 'D' ? 'text-red-500' : f.type === 'R' ? 'text-blue-500' : 'text-yellow-500'
                      }`}>{f.type}</span>
                      <span className="text-foreground/80 truncate flex-1">{f.path}</span>
                      {(f.additions > 0 || f.deletions > 0) && (
                        <span className="text-muted-foreground/60 shrink-0">
                          {f.additions > 0 && <span className="text-green-500">+{f.additions}</span>}
                          {f.additions > 0 && f.deletions > 0 && ' '}
                          {f.deletions > 0 && <span className="text-red-500">-{f.deletions}</span>}
                        </span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent><p>{f.path}</p></TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Artifacts */}
          {artifacts && (
            <ArtifactViewer
              manifest={artifacts}
              allManifests={allManifests}
              onLightbox={setLightboxSrc}
              onComparison={(artifact, iteration) => setComparisonArtifact({ artifact, iteration })}
            />
          )}

          {/* Token/cost usage row — shown only when usage data exists */}
          {(() => {
            const usage = extractIterationUsage(entry.rawObj);
            if (!usage) return null;
            return (
              <div className="border-l-2 border-emerald-500/30 pl-2 py-1 mt-1 flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                <Zap className="h-3 w-3 text-emerald-500 shrink-0" />
                <span>in: <span className="text-foreground/80">{formatTokenCount(usage.tokens_input)}</span></span>
                <span>out: <span className="text-foreground/80">{formatTokenCount(usage.tokens_output)}</span></span>
                {usage.tokens_cache_read > 0 && (
                  <span>cache: <span className="text-foreground/80">{formatTokenCount(usage.tokens_cache_read)}</span></span>
                )}
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">${usage.cost_usd.toFixed(4)}</span>
              </div>
            );
          })()}

          {/* Provider output — rendered inline */}
          {hasOutput && (
            outputLoading ? (
              <div className="ml-2 text-muted-foreground py-1 flex items-center gap-1 text-[11px]"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
            ) : outputText ? (
              <div ref={outputRef} className="border-l-2 border-blue-500/30 pl-2 py-1 mt-1 overflow-auto max-h-48 sm:max-h-64 lg:max-h-[300px] bg-accent/30 rounded-md p-2">
                <div className="prose-dashboard text-[10px] font-mono" dangerouslySetInnerHTML={{ __html: renderAnsiToHtml(outputText) }} />
              </div>
            ) : outputText === '' ? (
              <div className="text-muted-foreground py-1 italic text-[11px] ml-2">No output available</div>
            ) : null
          )}

          {/* Event detail — structured key-value pairs from log entry */}
          {entry.rawObj && (entry.isError || (!entry.filesChanged.length && !artifacts && !hasOutput)) && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              {Object.entries(entry.rawObj)
                .filter(([k]) => !['timestamp', 'ts', 'run_id', 'event', 'type'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 font-mono">
                    <span className="text-muted-foreground shrink-0">{k}:</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground/70 truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg"><p className="break-all font-mono text-xs">{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</p></TooltipContent>
                    </Tooltip>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="Artifact" onClose={() => setLightboxSrc(null)} />}
      {comparisonArtifact && (
        <ArtifactComparisonDialog
          artifact={comparisonArtifact.artifact}
          currentIteration={comparisonArtifact.iteration}
          allManifests={allManifests}
          onClose={() => setComparisonArtifact(null)}
        />
      )}
    </>
  );
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <button type="button" className="absolute right-4 top-4 text-white text-2xl font-bold hover:text-gray-300" onClick={onClose}>&times;</button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ── Artifact Comparison ──

/** Find iterations (older than current) that have the same artifact path — for history scrubbing */
export function findBaselineIterations(artifactPath: string, currentIteration: number, allManifests: ManifestPayload[]): number[] {
  return allManifests
    .filter((m) => m.iteration < currentIteration && m.artifacts.some((a) => a.path === artifactPath))
    .map((m) => m.iteration)
    .sort((a, b) => b - a); // newest first
}

type ComparisonMode = 'side-by-side' | 'slider' | 'diff-overlay';

export function ArtifactComparisonDialog({
  artifact, currentIteration, allManifests, onClose,
}: {
  artifact: ArtifactEntry;
  currentIteration: number;
  allManifests: ManifestPayload[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ComparisonMode>('side-by-side');
  const [sliderPos, setSliderPos] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Available baseline iterations for this artifact
  const baselineIters = useMemo(
    () => findBaselineIterations(artifact.path, currentIteration, allManifests),
    [artifact.path, currentIteration, allManifests],
  );

  // If artifact has explicit baseline path, use it; otherwise use same path from older iteration
  const baselinePath = artifact.metadata?.baseline ?? artifact.path;
  const [selectedBaseline, setSelectedBaseline] = useState<number | null>(
    baselineIters.length > 0 ? baselineIters[0] : null,
  );

  const currentSrc = artifactUrl(currentIteration, artifact.path);
  const baselineSrc = selectedBaseline !== null ? artifactUrl(selectedBaseline, baselinePath) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Slider drag handling
  const updateSliderFromEvent = useCallback((clientX: number) => {
    const container = sliderContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) updateSliderFromEvent(e.clientX); };
    const onUp = () => { draggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [updateSliderFromEvent]);

  const hasBaseline = baselineSrc !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-[95vw] max-h-[95vh] w-[1200px] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium truncate">{artifact.path}</span>
            {artifact.metadata?.diff_percentage !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${artifact.metadata.diff_percentage < 5 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : artifact.metadata.diff_percentage < 20 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                diff: {artifact.metadata.diff_percentage.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mode tabs */}
            {hasBaseline && (
              <div className="flex rounded-md border border-border text-xs" role="tablist" aria-label="Comparison mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'side-by-side'}
                  className={`px-2 py-1 rounded-l-md transition-colors ${mode === 'side-by-side' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('side-by-side')}
                >Side by Side</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'slider'}
                  className={`px-2 py-1 border-l border-border transition-colors ${mode === 'slider' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('slider')}
                >Slider</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'diff-overlay'}
                  className={`px-2 py-1 rounded-r-md border-l border-border transition-colors ${mode === 'diff-overlay' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('diff-overlay')}
                >Diff Overlay</button>
              </div>
            )}
            {/* History scrubbing dropdown */}
            {baselineIters.length > 0 && (
              <select
                className="text-xs bg-background border border-border rounded px-1.5 py-1 text-foreground"
                value={selectedBaseline ?? ''}
                onChange={(e) => setSelectedBaseline(e.target.value ? Number(e.target.value) : null)}
                aria-label="Compare against iteration"
              >
                {baselineIters.map((iter) => (
                  <option key={iter} value={iter}>iter {iter}{iter === baselineIters[baselineIters.length - 1] ? ' (initial)' : iter === baselineIters[0] ? ' (baseline)' : ''}</option>
                ))}
              </select>
            )}
            <button type="button" className="text-muted-foreground hover:text-foreground text-lg font-bold px-1" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!hasBaseline ? (
            /* No baseline — show current only with label */
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground italic">No baseline — first capture</span>
              <img src={currentSrc} alt={artifact.description || artifact.path} className="max-h-[80vh] max-w-full object-contain rounded" />
            </div>
          ) : mode === 'side-by-side' ? (
            /* Side by side mode */
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="flex flex-col items-center gap-1 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0">Baseline (iter {selectedBaseline})</span>
                <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center">
                  <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="max-w-full object-contain rounded" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0">Current (iter {currentIteration})</span>
                <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center">
                  <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="max-w-full object-contain rounded" />
                </div>
              </div>
            </div>
          ) : mode === 'slider' ? (
            /* Slider mode */
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Baseline (iter {selectedBaseline})</span>
                <span>|</span>
                <span>Current (iter {currentIteration})</span>
              </div>
              <div
                ref={sliderContainerRef}
                className="relative w-full max-w-[900px] cursor-col-resize select-none overflow-hidden rounded border border-border"
                onMouseDown={(e) => { draggingRef.current = true; updateSliderFromEvent(e.clientX); }}
                role="slider"
                aria-label="Image comparison slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(sliderPos)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setSliderPos((p) => Math.max(0, p - 2));
                  else if (e.key === 'ArrowRight') setSliderPos((p) => Math.min(100, p + 2));
                }}
              >
                {/* Current image (full, behind) */}
                <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="w-full block" draggable={false} />
                {/* Baseline image (clipped from left) */}
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                  <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="w-full block" style={{ width: sliderContainerRef.current ? `${sliderContainerRef.current.offsetWidth}px` : '100%' }} draggable={false} />
                </div>
                {/* Divider line */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos}%` }}>
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
                    <span className="text-[10px] text-gray-500 select-none">&harr;</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Diff overlay mode */
            <div className="flex flex-col items-center gap-3" aria-label="Diff overlay comparison">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Overlay: baseline + current</span>
                <label className="inline-flex items-center gap-2">
                  <span>Current opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    aria-label="Overlay opacity"
                  />
                  <span className="w-10 text-right">{overlayOpacity}%</span>
                </label>
              </div>
              <div className="relative w-full max-w-[900px] overflow-hidden rounded border border-border">
                <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="w-full block" draggable={false} />
                <img
                  src={currentSrc}
                  alt={`Current iter ${currentIteration}`}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ opacity: overlayOpacity / 100 }}
                  draggable={false}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Baseline (iter {selectedBaseline})</span>
                <span>|</span>
                <span>Current (iter {currentIteration})</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
