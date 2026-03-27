import { useState } from 'react';

type DiffOverlayViewProps = {
  baselineSrc: string;
  currentSrc: string;
  selectedBaseline: number;
  currentIteration: number;
};

export function DiffOverlayView({ baselineSrc, currentSrc, selectedBaseline, currentIteration }: DiffOverlayViewProps) {
  const [overlayOpacity, setOverlayOpacity] = useState(50);

  return (
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
  );
}
