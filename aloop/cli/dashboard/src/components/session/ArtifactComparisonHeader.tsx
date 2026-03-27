import type { ArtifactEntry } from '@/lib/types';
import type { ComparisonMode } from './ArtifactComparisonDialog';

type ArtifactComparisonHeaderProps = {
  artifact: ArtifactEntry;
  mode: ComparisonMode;
  setMode: (mode: ComparisonMode) => void;
  hasBaseline: boolean;
  baselineIters: number[];
  selectedBaseline: number | null;
  setSelectedBaseline: (iter: number | null) => void;
  onClose: () => void;
};

export function ArtifactComparisonHeader({
  artifact, mode, setMode, hasBaseline, baselineIters, selectedBaseline, setSelectedBaseline, onClose,
}: ArtifactComparisonHeaderProps) {
  return (
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
  );
}
