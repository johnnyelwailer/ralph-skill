import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type * as React from 'react';
import { useLongPress } from './useLongPress';

describe('useLongPress', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('calls onLongPress after threshold', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, threshold: 500 }));
    const event = { pointerType: 'touch', button: 0 } as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onPointerDown(event);
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledWith(event);
  });

  it('cancels timer on pointer up/leave/cancel', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, threshold: 500 }));
    const event = { pointerType: 'touch', button: 0 } as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onPointerDown(event);
      result.current.onPointerUp();
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      result.current.onPointerDown(event);
      result.current.onPointerLeave();
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      result.current.onPointerDown(event);
      result.current.onPointerCancel();
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores non-primary mouse button', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress, threshold: 500 }));
    const event = { pointerType: 'mouse', button: 2 } as React.PointerEvent<HTMLElement>;

    act(() => {
      result.current.onPointerDown(event);
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
