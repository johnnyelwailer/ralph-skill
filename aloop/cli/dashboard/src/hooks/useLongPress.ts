import * as React from 'react';

export interface UseLongPressOptions {
  onLongPress: (event: React.PointerEvent<HTMLElement>) => void;
  threshold?: number;
}

export function useLongPress({ onLongPress, threshold = 500 }: UseLongPressOptions) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onLongPress(event);
    }, threshold);
  }, [clearTimer, onLongPress, threshold]);

  const onPointerUp = React.useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerLeave = React.useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = React.useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
  };
}
