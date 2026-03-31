import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { artifactUrl } from '@/lib/types';
import type { ArtifactEntry, ManifestPayload } from '@/lib/types';

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
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 rounded-l-md transition-colors ${mode === 'side-by-side' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('side-by-side')}
                >Side by Side</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'slider'}
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 border-l border-border transition-colors ${mode === 'slider' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('slider')}
                >Slider</button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'diff-overlay'}
                  className={`px-2 py-1 min-h-[44px] md:min-h-0 rounded-r-md border-l border-border transition-colors ${mode === 'diff-overlay' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
            <button type="button" aria-label="Close" className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground text-lg font-bold px-1" onClick={onClose}>&times;</button>
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
