type SideBySideViewProps = {
  baselineSrc: string;
  currentSrc: string;
  selectedBaseline: number;
  currentIteration: number;
};

export function SideBySideView({ baselineSrc, currentSrc, selectedBaseline, currentIteration }: SideBySideViewProps) {
  return (
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
  );
}
