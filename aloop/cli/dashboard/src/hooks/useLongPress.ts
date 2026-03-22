import { useCallback, useEffect, useRef } from 'react';
import type { TouchEventHandler } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  thresholdMs?: number;
  moveTolerancePx?: number;
}

interface TouchHandlers<T extends HTMLElement> {
  onTouchStart: TouchEventHandler<T>;
  onTouchEnd: TouchEventHandler<T>;
  onTouchMove: TouchEventHandler<T>;
  onTouchCancel: TouchEventHandler<T>;
}

export interface UseLongPressResult<T extends HTMLElement> {
  handlers: TouchHandlers<T>;
  consumeLongPress: () => boolean;
}

function firstTouchPoint(
  touchList: unknown,
  changedTouches: unknown,
): { x: number; y: number } | null {
  const fromList = (value: unknown): Touch | null => {
    if (!value) return null;
    const maybeTouchList = value as { item?: (index: number) => Touch | null };
    if (typeof maybeTouchList.item === 'function') {
      return maybeTouchList.item(0);
    }
    const maybeArray = value as { 0?: Touch };
    return maybeArray[0] ?? null;
  };
  const touch = fromList(touchList) ?? fromList(changedTouches);
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

export function useLongPress<T extends HTMLElement>({
  onLongPress,
  thresholdMs = 500,
  moveTolerancePx = 8,
}: UseLongPressOptions): UseLongPressResult<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelLongPress = useCallback(() => {
    clearTimer();
    startPointRef.current = null;
  }, [clearTimer]);

  const onTouchStart = useCallback<TouchEventHandler<T>>((event) => {
    const point = firstTouchPoint(event.touches, event.changedTouches);
    if (!point) {
      cancelLongPress();
      return;
    }

    startPointRef.current = point;
    longPressTriggeredRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, thresholdMs);
  }, [cancelLongPress, clearTimer, onLongPress, thresholdMs]);

  const onTouchMove = useCallback<TouchEventHandler<T>>((event) => {
    if (!startPointRef.current) {
      cancelLongPress();
      return;
    }
    const point = firstTouchPoint(event.touches, event.changedTouches);
    if (!point) {
      cancelLongPress();
      return;
    }
    const dx = point.x - startPointRef.current.x;
    const dy = point.y - startPointRef.current.y;
    if (Math.hypot(dx, dy) > moveTolerancePx) {
      cancelLongPress();
    }
  }, [cancelLongPress, moveTolerancePx]);

  const onTouchEnd = useCallback<TouchEventHandler<T>>(() => {
    clearTimer();
    startPointRef.current = null;
  }, [clearTimer]);

  const onTouchCancel = useCallback<TouchEventHandler<T>>(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  const consumeLongPress = useCallback(() => {
    if (!longPressTriggeredRef.current) {
      return false;
    }
    longPressTriggeredRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    handlers: { onTouchStart, onTouchEnd, onTouchMove, onTouchCancel },
    consumeLongPress,
  };
}
