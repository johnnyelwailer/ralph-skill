import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEventHandler } from 'react';

export interface LongPressEvent {
  clientX: number;
  clientY: number;
  pointerType: string;
  target: EventTarget | null;
}

export interface UseLongPressOptions {
  delay?: number;
  disabled?: boolean;
  moveTolerance?: number;
  onCancel?: () => void;
  onLongPress: (event: LongPressEvent) => void;
}

interface PointerStart {
  clientX: number;
  clientY: number;
  pointerType: string;
  target: EventTarget | null;
}

export interface LongPressBind<T extends Element = HTMLElement> {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
  onPointerLeave: PointerEventHandler<T>;
}

export interface UseLongPressResult<T extends Element = HTMLElement> {
  bind: LongPressBind<T>;
  cancel: () => void;
  isPressing: boolean;
}

/**
 * Detect long-press via pointer events with movement and scroll cancellation.
 * Works for touch, pen, and mouse inputs.
 */
export function useLongPress<T extends Element = HTMLElement>({
  delay = 450,
  disabled = false,
  moveTolerance = 10,
  onCancel,
  onLongPress,
}: UseLongPressOptions): UseLongPressResult<T> {
  const [isPressing, setIsPressing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const startRef = useRef<PointerStart | null>(null);
  const longPressFiredRef = useRef(false);
  const scrollListenerActiveRef = useRef(false);
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const onLongPressRef = useRef(onLongPress);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const removeScrollListener = useCallback(() => {
    if (!scrollListenerActiveRef.current) return;
    if (scrollHandlerRef.current) {
      window.removeEventListener('scroll', scrollHandlerRef.current, true);
    }
    scrollHandlerRef.current = null;
    scrollListenerActiveRef.current = false;
  }, []);

  const addScrollListener = useCallback(
    (onScroll: () => void) => {
    if (scrollListenerActiveRef.current) return;
      scrollHandlerRef.current = onScroll;
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    scrollListenerActiveRef.current = true;
    },
    [],
  );

  const stopPress = useCallback(
    (cancelled: boolean) => {
      const wasPressing = startRef.current !== null;
      clearTimer();
      removeScrollListener();
      startRef.current = null;
      setIsPressing(false);

      if (cancelled && wasPressing && !longPressFiredRef.current) {
        onCancelRef.current?.();
      }
    },
    [clearTimer, removeScrollListener],
  );

  const cancel = useCallback(() => {
    stopPress(true);
  }, [stopPress]);

  useEffect(
    () => () => {
      clearTimer();
      removeScrollListener();
    },
    [clearTimer, removeScrollListener],
  );

  const bind = useMemo<LongPressBind<T>>(
    () => ({
      onPointerDown: (event) => {
        if (disabled) return;
        if (!event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        longPressFiredRef.current = false;
        startRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          pointerType: event.pointerType,
          target: event.target,
        };
        setIsPressing(true);
        addScrollListener(() => stopPress(true));
        clearTimer();
        timeoutRef.current = window.setTimeout(() => {
          if (!startRef.current) return;
          longPressFiredRef.current = true;
          onLongPressRef.current(startRef.current);
          stopPress(false);
        }, delay);
      },
      onPointerMove: (event) => {
        if (!startRef.current) return;
        const deltaX = Math.abs(event.clientX - startRef.current.clientX);
        const deltaY = Math.abs(event.clientY - startRef.current.clientY);
        if (deltaX > moveTolerance || deltaY > moveTolerance) {
          stopPress(true);
        }
      },
      onPointerUp: () => {
        stopPress(true);
      },
      onPointerCancel: () => {
        stopPress(true);
      },
      onPointerLeave: () => {
        stopPress(true);
      },
    }),
    [addScrollListener, clearTimer, delay, disabled, moveTolerance, stopPress],
  );

  return { bind, cancel, isPressing };
}
