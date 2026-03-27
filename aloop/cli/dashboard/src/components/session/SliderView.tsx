import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type SliderViewProps = {
  baselineSrc: string;
  currentSrc: string;
  selectedBaseline: number;
  currentIteration: number;
  sliderPos: number;
  setSliderPos: Dispatch<SetStateAction<number>>;
};

export function SliderView({ baselineSrc, currentSrc, selectedBaseline, currentIteration, sliderPos, setSliderPos }: SliderViewProps) {
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateSliderFromEvent = useCallback((clientX: number) => {
    const container = sliderContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, [setSliderPos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) updateSliderFromEvent(e.clientX); };
    const onUp = () => { draggingRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [updateSliderFromEvent]);

  return (
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
        <img src={currentSrc} alt={`Current iter ${currentIteration}`} className="w-full block" draggable={false} />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
          <img src={baselineSrc} alt={`Baseline iter ${selectedBaseline}`} className="w-full block" style={{ width: sliderContainerRef.current ? `${sliderContainerRef.current.offsetWidth}px` : '100%' }} draggable={false} />
        </div>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos}%` }}>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center">
            <span className="text-[10px] text-gray-500 select-none">&harr;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
