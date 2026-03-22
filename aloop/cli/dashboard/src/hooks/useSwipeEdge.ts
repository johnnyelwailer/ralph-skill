import { useEffect, useRef } from 'react';

interface UseSwipeEdgeOptions {
  /** Which edge of the screen the swipe starts from */
  edge: 'left' | 'right';
  /** Called when swipe gesture completes */
  onSwipe: () => void;
  /** Max distance in px from edge to start the gesture (default: 30) */
  edgeThresholdPx?: number;
  /** Minimum horizontal distance in px to trigger (default: 60) */
  swipeDistancePx?: number;
  /** Whether the hook is active (default: true) */
  enabled?: boolean;
}

/**
 * Detects swipe gestures starting from a screen edge.
 * Attaches passive touch listeners to `document` so it works
 * regardless of which element the touch lands on.
 */
export function useSwipeEdge({
  edge,
  onSwipe,
  edgeThresholdPx = 30,
  swipeDistancePx = 60,
  enabled = true,
}: UseSwipeEdgeOptions): void {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() => {
    if (!enabled) return;

    let startX: number | null = null;
    let startY: number | null = null;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;

      const x = touch.clientX;
      const inEdgeZone =
        edge === 'left'
          ? x <= edgeThresholdPx
          : x >= window.innerWidth - edgeThresholdPx;

      if (inEdgeZone) {
        startX = x;
        startY = touch.clientY;
      } else {
        startX = null;
        startY = null;
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      if (startX === null || startY === null) return;

      const touch = e.changedTouches[0];
      if (!touch) { startX = null; startY = null; return; }

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Only trigger if horizontal movement exceeds threshold
      // and horizontal movement is dominant (not a vertical scroll)
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const isHorizontalDominant = absDx > absDy;
      const meetsDistance = absDx >= swipeDistancePx;
      const correctDirection = edge === 'left' ? dx > 0 : dx < 0;

      if (isHorizontalDominant && meetsDistance && correctDirection) {
        onSwipeRef.current();
      }

      startX = null;
      startY = null;
    }

    function handleTouchCancel() {
      startX = null;
      startY = null;
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [edge, edgeThresholdPx, swipeDistancePx, enabled]);
}
