import {
  GitCommit, Loader2, Zap,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArtifactViewer } from '@/components/artifacts/ArtifactViewer';
import { renderAnsiToHtml } from '@/lib/ansi';
import { formatTokenCount } from '@/lib/format';
import type { ArtifactEntry, LogEntry, ManifestPayload } from '@/lib/types';
import { extractIterationUsage } from '@/lib/activityLogHelpers';
import { ArtifactComparisonDialog } from './ArtifactComparisonDialog';

export function LogEntryExpandedDetails({
  entry,
  artifacts,
  allManifests,
  hasOutput,
  outputLoading,
  outputText,
  outputRef,
  onLightbox,
  onComparison,
  showComparison,
  onCloseComparison,
}: {
  entry: LogEntry;
  artifacts: ManifestPayload | null;
  allManifests: ManifestPayload[];
  hasOutput: boolean;
  outputLoading: boolean;
  outputText: string | null;
  outputRef: React.RefObject<HTMLDivElement>;
  onLightbox: (src: string) => void;
  onComparison: (artifact: ArtifactEntry, iteration: number) => void;
  showComparison: { artifact: ArtifactEntry; iteration: number } | null;
  onCloseComparison: () => void;
}) {
  return (
    <>
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
            onLightbox={onLightbox}
            onComparison={(artifact, iteration) => onComparison(artifact, iteration)}
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

      {showComparison && (
        <ArtifactComparisonDialog
          artifact={showComparison.artifact}
          currentIteration={showComparison.iteration}
          allManifests={allManifests}
          onClose={onCloseComparison}
        />
      )}
    </>
  );
}
