import { useEffect, useMemo, useState } from 'react';
import type { ArtifactEntry, ManifestPayload } from '@/lib/types';
import { findBaselineIterations, artifactUrl } from '@/lib/activityLogHelpers';
import { ArtifactComparisonHeader } from './ArtifactComparisonHeader';
import { SideBySideView } from './SideBySideView';
import { SliderView } from './SliderView';
import { DiffOverlayView } from './DiffOverlayView';

export type ComparisonMode = 'side-by-side' | 'slider' | 'diff-overlay';

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

  const baselineIters = useMemo(
    () => findBaselineIterations(artifact.path, currentIteration, allManifests),
    [artifact.path, currentIteration, allManifests],
  );

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

  const hasBaseline = baselineSrc !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl max-w-[95vw] max-h-[95vh] w-[1200px] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <ArtifactComparisonHeader
          artifact={artifact}
          mode={mode}
          setMode={setMode}
          hasBaseline={hasBaseline}
          baselineIters={baselineIters}
          selectedBaseline={selectedBaseline}
          setSelectedBaseline={setSelectedBaseline}
          onClose={onClose}
        />
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!hasBaseline ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground italic">No baseline — first capture</span>
              <img src={currentSrc} alt={artifact.description || artifact.path} className="max-h-[80vh] max-w-full object-contain rounded" />
            </div>
          ) : mode === 'side-by-side' ? (
            <SideBySideView
              baselineSrc={baselineSrc}
              currentSrc={currentSrc}
              selectedBaseline={selectedBaseline!}
              currentIteration={currentIteration}
            />
          ) : mode === 'slider' ? (
            <SliderView
              baselineSrc={baselineSrc}
              currentSrc={currentSrc}
              selectedBaseline={selectedBaseline!}
              currentIteration={currentIteration}
              sliderPos={sliderPos}
              setSliderPos={setSliderPos}
            />
          ) : (
            <DiffOverlayView
              baselineSrc={baselineSrc}
              currentSrc={currentSrc}
              selectedBaseline={selectedBaseline!}
              currentIteration={currentIteration}
            />
          )}
        </div>
      </div>
    </div>
  );
}
