import { useCallback, useRef } from 'react';
import type { MouseEventHandler, TouchEventHandler } from 'react';

interface LongPressPoint {
  clientX: number;
  clientY: number;
}

interface UseLongPressOptions<T extends HTMLElement> {
  onLongPress: (point: LongPressPoint, target: T) => void;
  delayMs?: number;
  moveThresholdPx?: number;
}

interface LongPressHandlers<T> {
  onTouchStart: TouchEventHandler<T>;
  onTouchMove: TouchEventHandler<T>;
  onTouchEnd: TouchEventHandler<T>;
  onTouchCancel: TouchEventHandler<T>;
  onClickCapture: MouseEventHandler<T>;
}

/**
 * Long-press detector for touch devices.
 * Cancels when the finger moves beyond `moveThresholdPx`.
 */
export function useLongPress<T extends HTMLElement>({
  onLongPress,
  delayMs = 500,
  moveThresholdPx = 10,
}: UseLongPressOptions<T>): LongPressHandlers<T> {
  const timeoutRef = useRef<number | null>(null);
  const startRef = useRef<LongPressPoint | null>(null);
  const suppressClickRef = useRef(false);

  const clearPress = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onTouchStart = useCallback<TouchEventHandler<T>>((event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const point = { clientX: touch.clientX, clientY: touch.clientY };
    startRef.current = point;
    const target = event.currentTarget;
    timeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      onLongPress(point, target);
      clearPress();
    }, delayMs);
  }, [clearPress, delayMs, onLongPress]);

  const onTouchMove = useCallback<TouchEventHandler<T>>((event) => {
    if (event.touches.length !== 1 || !startRef.current) return;
    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - startRef.current.clientX);
    const deltaY = Math.abs(touch.clientY - startRef.current.clientY);
    if (deltaX > moveThresholdPx || deltaY > moveThresholdPx) {
      clearPress();
    }
  }, [clearPress, moveThresholdPx]);

  const onTouchEnd = useCallback<TouchEventHandler<T>>(() => {
    clearPress();
  }, [clearPress]);

  const onTouchCancel = useCallback<TouchEventHandler<T>>(() => {
    clearPress();
  }, [clearPress]);

  const onClickCapture = useCallback<MouseEventHandler<T>>((event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onClickCapture,
  };
}
