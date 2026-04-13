import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  artifactUrl,
  findBaselineIterations,
  type ArtifactEntry,
  type ManifestPayload,
} from '../../AppView';

type ComparisonMode = 'side-by-side' | 'slider' | 'diff-overlay';

export interface ComparisonWidgetProps {
  artifact: ArtifactEntry;
  currentIteration: number;
  allManifests: ManifestPayload[];
  onClose: () => void;
}

export function ComparisonWidget({
  artifact,
  currentIteration,
  allManifests,
  onClose,
}: ComparisonWidgetProps) {
  const [mode, setMode] = useState<ComparisonMode>('side-by-side');
  const [sliderPos, setSliderPos] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Sync scrolling refs
  const scrollRef1 = useRef<HTMLDivElement>(null);
  const scrollRef2 = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

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
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [updateSliderFromEvent]);

  // Synchronized scrolling implementation
  const handleScroll = useCallback((source: React.RefObject<HTMLDivElement>, target: React.RefObject<HTMLDivElement>) => {
    if (isSyncingRef.current) return;
    if (!source.current || !target.current) return;

    isSyncingRef.current = true;
    target.current.scrollTop = source.current.scrollTop;
    target.current.scrollLeft = source.current.scrollLeft;
    
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  const hasBaseline = baselineSrc !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-[95vw] max-h-[95vh] w-[1200px] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium truncate">{artifact.path}</span>
            {artifact.metadata?.diff_percentage !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                artifact.metadata.diff_percentage < 5 
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                  : artifact.metadata.diff_percentage < 20 
                    ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' 
                    : 'bg-red-500/20 text-red-600 dark:text-red-400'
              }`}>
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
                  className={`px-3 py-1.5 rounded-l-md transition-colors ${mode === 'side-by-side' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('side-by-side')}
                >Side by Side</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'slider'}
                  className={`px-3 py-1.5 border-l border-border transition-colors ${mode === 'slider' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('slider')}
                >Slider</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'diff-overlay'}
                  className={`px-3 py-1.5 rounded-r-md border-l border-border transition-colors ${mode === 'diff-overlay' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('diff-overlay')}
                >Diff Overlay</button>
              </div>
            )}
            {/* History scrubbing dropdown */}
            {baselineIters.length > 0 && (
              <select
                className="text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground focus:ring-1 focus:ring-ring outline-none"
                value={selectedBaseline ?? ''}
                onChange={(e) => setSelectedBaseline(e.target.value ? Number(e.target.value) : null)}
                aria-label="Compare against iteration"
              >
                {baselineIters.map((iter) => (
                  <option key={iter} value={iter}>
                    iter {iter}
                    {iter === baselineIters[baselineIters.length - 1] ? ' (initial)' : iter === baselineIters[0] ? ' (baseline)' : ''}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors hover:bg-accent" onClick={onClose} aria-label="Close dialog">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-4 bg-muted/5">
          {!hasBaseline ? (
            /* No baseline — show current only with label */
            <div className="flex flex-col items-center justify-center gap-4 h-full">
              <span className="text-sm text-muted-foreground italic bg-muted/20 px-4 py-2 rounded-full border border-border">No baseline — first capture</span>
              <div className="flex-1 min-h-0 overflow-auto border border-border rounded shadow-sm bg-background p-2">
                <img src={currentSrc} alt={artifact.description || artifact.path} className="max-h-full max-w-full object-contain mx-auto" />
              </div>
            </div>
          ) : mode === 'side-by-side' ? (
            /* Side by side mode */
            <div className="flex flex-col md:grid md:grid-cols-2 gap-4 h-full">
              <div className="flex flex-col items-center gap-2 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0 uppercase tracking-wider">Baseline (iter {selectedBaseline})</span>
                <ScrollArea 
                  className="flex-1 w-full border border-border rounded bg-background shadow-inner"
                  viewportRef={scrollRef1}
                  onScroll={() => handleScroll(scrollRef1, scrollRef2)}
                >
                  <div className="flex items-start justify-center min-w-full min-h-full p-2">
                    <img src={baselineSrc!} alt={`Baseline iter ${selectedBaseline}`} className="max-w-none object-contain rounded" />
                  </div>
                </ScrollArea>
              </div>
              <div className="flex flex-col items-center gap-2 min-h-0">
                <span className="text-xs text-muted-foreground font-medium shrink-0 uppercase tracking-wider">Current (iter {currentIteration})</span>
                <ScrollArea 
                  className="flex-1 w-full border border-border rounded bg-background shadow-inner"
                  viewportRef={scrollRef2}
                  onScroll={() => handleScroll(scrollRef2, scrollRef1)}
                >
                  <div className="flex items-start justify-center min-w-full min-h-full p-2">
                    <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="max-w-none object-contain rounded" />
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : mode === 'slider' ? (
            /* Slider mode */
            <div className="flex flex-col items-center gap-4 h-full">
              <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium bg-muted/20 px-3 py-1 rounded-full border border-border">
                <span>Baseline (iter {selectedBaseline})</span>
                <span className="w-px h-3 bg-border" />
                <span>Current (iter {currentIteration})</span>
              </div>
              <div
                ref={sliderContainerRef}
                className="relative w-full max-w-[1000px] flex-1 min-h-0 cursor-col-resize select-none overflow-hidden rounded border border-border bg-background shadow-sm"
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
                <div className="absolute inset-0 flex items-center justify-center p-2">
                  <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="max-w-full max-h-full object-contain" draggable={false} />
                </div>
                {/* Baseline image (clipped from left) */}
                <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                  <div className="absolute inset-0 flex items-center justify-center p-2" style={{ width: sliderContainerRef.current ? `${sliderContainerRef.current.offsetWidth}px` : '100%' }}>
                    <img src={baselineSrc!} alt={`Baseline iter ${selectedBaseline}`} className="max-w-full max-h-full object-contain" draggable={false} />
                  </div>
                </div>
                {/* Divider line */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_15px_rgba(0,0,0,0.6)] pointer-events-none z-10" style={{ left: `${sliderPos}%` }}>
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-2xl flex items-center justify-center border border-gray-300">
                    <span className="text-[14px] text-gray-700 font-bold select-none">&harr;</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Diff overlay mode */
            <div className="flex flex-col items-center gap-4 h-full" aria-label="Diff overlay comparison">
              <div className="flex flex-wrap items-center justify-center gap-8 text-xs text-muted-foreground p-3 border border-border rounded-xl bg-background shadow-sm w-full max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">Baseline (iter {selectedBaseline})</span>
                  <span className="text-muted-foreground/40 font-bold">+</span>
                  <span className="font-semibold text-foreground">Current (iter {currentIteration})</span>
                </div>
                <label className="inline-flex items-center gap-4 flex-1 max-w-xs">
                  <span className="font-medium shrink-0">Current opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    aria-label="Overlay opacity"
                  />
                  <span className="w-10 font-mono text-right text-foreground font-bold">{overlayOpacity}%</span>
                </label>
              </div>
              <div className="relative w-full max-w-[1000px] flex-1 min-h-0 overflow-hidden rounded border border-border bg-background shadow-sm p-2 flex items-center justify-center">
                <img src={baselineSrc!} alt={`Baseline iter ${selectedBaseline}`} className="max-w-full max-h-full object-contain" draggable={false} />
                <img
                  src={currentSrc}
                  alt={`Current iter ${currentIteration}`}
                  className="absolute inset-0 w-full h-full object-contain p-2 transition-opacity duration-75"
                  style={{ opacity: overlayOpacity / 100 }}
                  draggable={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
