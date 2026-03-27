import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronRight, Circle,
  Loader2, Timer, XCircle,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ElapsedTimer } from '@/components/shared/ElapsedTimer';
import type { ArtifactEntry, LogEntry, ManifestPayload } from '@/lib/types';
import { phaseDotColors, extractModelFromOutput } from '@/lib/activityLogHelpers';
import { formatTimeShort, formatDuration } from '@/lib/format';
import { ImageLightbox } from './ImageLightbox';
import { LogEntryExpandedDetails } from './LogEntryExpandedDetails';

export function LogEntryRow({ entry, artifacts, allManifests }: { entry: LogEntry; artifacts: ManifestPayload | null; allManifests: ManifestPayload[] }) {
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

      {expanded && (
        <LogEntryExpandedDetails
          entry={entry}
          artifacts={artifacts}
          allManifests={allManifests}
          hasOutput={hasOutput}
          outputLoading={outputLoading}
          outputText={outputText}
          outputRef={outputRef}
          onLightbox={setLightboxSrc}
          onComparison={(artifact, iteration) => setComparisonArtifact({ artifact, iteration })}
          showComparison={comparisonArtifact}
          onCloseComparison={() => setComparisonArtifact(null)}
        />
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="Artifact" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
