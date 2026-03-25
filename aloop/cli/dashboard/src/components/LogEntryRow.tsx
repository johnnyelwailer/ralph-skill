import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronRight, Circle,
  FileText, GitCommit, Image, Loader2, Timer, XCircle, Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ArtifactEntry, ManifestPayload } from '../AppView';
import {
  ArtifactComparisonDialog,
  ElapsedTimer,
  artifactUrl,
  extractIterationUsage,
  extractModelFromOutput,
  findBaselineIterations,
  formatDuration,
  formatTimeShort,
  formatTokenCount,
  isImageArtifact,
  renderAnsiToHtml,
} from '../AppView';

// Re-use the same type from AppView via import type — erased at runtime
import type { LogEntry } from '../AppView';

const phaseDotColors: Record<string, string> = {
  plan: 'text-purple-500', build: 'text-yellow-500', proof: 'text-amber-500', review: 'text-cyan-500',
};

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

  const handleToggle = () => { if (hasExpandable) setExpanded(!expanded); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (hasExpandable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setExpanded(!expanded);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`flex items-center gap-1.5 py-1 px-1.5 text-[11px] font-mono rounded transition-colors min-w-0 min-h-[44px] md:min-h-0 w-full text-left ${
          hasExpandable ? 'cursor-pointer hover:bg-accent/30' : 'hover:bg-accent/20'
        } ${expanded ? 'bg-accent/20' : ''}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
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
          <span className="text-muted-foreground/50 shrink-0 whitespace-nowrap flex items-center gap-0.5">
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

        {/* Artifact count badge */}
        {artifacts && artifacts.artifacts.length > 0 && (
          <span className="shrink-0 text-[9px] px-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
            {artifacts.artifacts.length}A
          </span>
        )}

        {/* Expand chevron */}
        {hasExpandable && (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </button>

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
          {artifacts && artifacts.artifacts.length > 0 && (
            <div className="border-l-2 border-amber-500/30 pl-2 py-1 space-y-0.5 mt-1">
              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <Image className="h-3 w-3" /> {artifacts.artifacts.length} artifact{artifacts.artifacts.length !== 1 ? 's' : ''}
              </span>
              {artifacts.summary && <p className="text-muted-foreground italic text-[10px]">{artifacts.summary}</p>}
              {artifacts.artifacts.map((a) => (
                <div key={a.path} className="flex items-center gap-2">
                  {isImageArtifact(a) ? <Image className="h-3 w-3 text-muted-foreground" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {isImageArtifact(a) ? (
                        <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline truncate" onClick={(e) => {
                          e.stopPropagation();
                          if (a.metadata?.baseline || findBaselineIterations(a.path, artifacts.iteration, allManifests).length > 0) {
                            setComparisonArtifact({ artifact: a, iteration: artifacts.iteration });
                          } else {
                            setLightboxSrc(artifactUrl(artifacts.iteration, a.path));
                          }
                        }}>
                          {a.path}
                        </button>
                      ) : <span className="text-foreground/80 truncate">{a.path}</span>}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-lg"><p className="break-all">{a.path}</p></TooltipContent>
                  </Tooltip>
                  {a.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground/60 truncate">{a.description}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg"><p className="break-words">{a.description}</p></TooltipContent>
                    </Tooltip>
                  )}
                  {a.metadata?.diff_percentage !== undefined && (
                    <span className={`shrink-0 text-[9px] px-1 rounded ${a.metadata.diff_percentage < 5 ? 'bg-green-500/20 text-green-500' : a.metadata.diff_percentage < 20 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'}`}>
                      diff: {a.metadata.diff_percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
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
              <div className="ml-2 text-muted-foreground/50 py-1 flex items-center gap-1 text-[11px]"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
            ) : outputText ? (
              <div ref={outputRef} className="border-l-2 border-blue-500/30 pl-2 py-1 mt-1 overflow-auto max-h-48 sm:max-h-64 lg:max-h-[300px] bg-accent/30 rounded-md p-2">
                <div className="prose-dashboard text-[10px] font-mono" dangerouslySetInnerHTML={{ __html: renderAnsiToHtml(outputText) }} />
              </div>
            ) : outputText === '' ? (
              <div className="text-muted-foreground/50 py-1 italic text-[11px] ml-2">No output available</div>
            ) : null
          )}

          {/* Event detail — structured key-value pairs from log entry */}
          {entry.rawObj && (entry.isError || (!entry.filesChanged.length && !artifacts && !hasOutput)) && (
            <div className="border-l-2 border-border pl-2 py-1 space-y-0.5">
              {Object.entries(entry.rawObj)
                .filter(([k]) => !['timestamp', 'ts', 'run_id', 'event', 'type'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 font-mono">
                    <span className="text-muted-foreground/50 shrink-0">{k}:</span>
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
      <button type="button" aria-label="Close" className="absolute right-4 top-4 text-white text-2xl font-bold hover:text-gray-300" onClick={onClose}>&times;</button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
